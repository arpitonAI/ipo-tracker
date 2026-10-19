'use strict';
/* Private allotment results: RSA-OAEP-2048/SHA-256 wraps a random AES-256-GCM key.
   Private key lives only on this device (IndexedDB, non-exportable) + an exportable copy for JSON backup. */
const R={unmatched:[],updated:'',msg:''};
const b64=u=>btoa(String.fromCharCode(...new Uint8Array(u))),ub64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const RSA={name:'RSA-OAEP',hash:'SHA-256'};
function idb(){return new Promise((ok,no)=>{const q=indexedDB.open('ipoTrackerKeys',1);q.onupgradeneeded=()=>q.result.createObjectStore('k');q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)})}
async function kget(n){const d=await idb();return new Promise(ok=>{const q=d.transaction('k').objectStore('k').get(n);q.onsuccess=()=>ok(q.result);q.onerror=()=>ok(null)})}
async function kput(n,v){const d=await idb();return new Promise((ok,no)=>{const t=d.transaction('k','readwrite');t.objectStore('k').put(v,n);t.oncomplete=ok;t.onerror=()=>no(t.error)})}
async function storeKey(pkcs8,spki){const priv=await crypto.subtle.importKey('pkcs8',ub64(pkcs8),RSA,false,['decrypt']);
await kput('priv',priv);await kput('backup',{pkcs8,spki})}
async function genKey(){const kp=await crypto.subtle.generateKey({...RSA,modulusLength:2048,publicExponent:new Uint8Array([1,0,1])},true,['encrypt','decrypt']);
await storeKey(b64(await crypto.subtle.exportKey('pkcs8',kp.privateKey)),b64(await crypto.subtle.exportKey('spki',kp.publicKey)))}
const keyBackup=()=>kget('backup').catch(()=>null);
async function restoreKey(k){if(k&&k.pkcs8&&k.spki)await storeKey(k.pkcs8,k.spki)}
async function decryptResults(enc,priv){const raw=await crypto.subtle.decrypt(RSA,priv,ub64(enc.wrappedKey));
const aes=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);
const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:ub64(enc.iv)},aes,ub64(enc.ciphertext));return JSON.parse(new TextDecoder().decode(pt))}
const normN=s=>String(s||'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9 ]/g,' ').replace(/\b(ltd|limited|pvt|private|the|ipo|sme|india)\b/g,' ').replace(/\s+/g,' ').trim();
const normA=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
const rKey=e=>normA(e.account)+'|'+(e.symbol||normN(e.ipo));
function ipoMatch(p,e){if(e.symbol&&p.liveId&&String(p.liveId).toUpperCase()===String(e.symbol).toUpperCase())return true;
const a=normN(p.name),b=normN(e.ipo);return!!a&&!!b&&(a===b||a.startsWith(b+' ')||b.startsWith(a+' '))}
function applyResults(list){let n=0;const un=[];
list.forEach(e=>{const st=e.status==='allotted'?'Allotted':e.status==='not_allotted'?'Not allotted':null;if(!st)return;
const k=rKey(e);let apps=db.apps.filter(a=>a.resKey===k);
if(!apps.length)apps=db.apps.filter(a=>normA(acc(a.acct).name)===normA(e.account)&&ipoMatch(ipo(a.ipo),e));
if(!apps.length){un.push(e);return}
apps.forEach(a=>{if(a.allotSrc==='manual'||(a.allot!=='Awaiting'&&a.allotSrc!=='auto'))return;
const sh=st==='Allotted'?String(e.shares||ipo(a.ipo).lot||''):'0';if(a.allot===st&&String(a.shares)===sh)return;
a.allot=st;a.shares=sh;a.allotSrc='auto';if(a.mandate==='Pending')a.mandate='Accepted';n++})});
R.unmatched=un;if(n)save();return n}
function toast(m){let t=document.getElementById('toast');if(!t){t=document.createElement('div');t.id='toast';document.body.appendChild(t)}
t.textContent=m;t.className='show';clearTimeout(t._h);t._h=setTimeout(()=>t.className='',3500)}
async function loadResults(quiet){try{const priv=await kget('priv');if(!priv){R.msg='Set up private results in the Backup tab to receive allotment results automatically.';return}
const r=await fetch('data/results.enc.json?t='+Date.now(),{cache:'no-store'});if(!r.ok){R.msg='No private results published yet.';return}
const enc=await r.json();if(!enc||!enc.ciphertext){R.msg='No private results published yet.';return}
const d=await decryptResults(enc,priv);if(window.Cloud)Cloud.results(d);R.updated=d.updated||enc.updated||'';R.msg='';
const n=applyResults(d.results||[]);if(n)toast(n+' result'+(n>1?'s':'')+' updated');if(n||!quiet)render()}
catch(e){R.msg='Could not unlock the published results (key mismatch?). If you reinstalled, import your JSON backup to restore your key.'}}
const fdt=s=>{try{return new Date(s).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}catch(_){return s}};
function resNote(){return R.updated?`<div class="mut">🔒 Results updated ${esc(fdt(R.updated))}</div>`:R.msg?`<div class="mut">🔒 ${esc(R.msg)}</div>`:''}
async function renderResults(el){const k=await keyBackup();
el.innerHTML=`<div class="card"><b>Private results setup</b>${k?`<p class="mut">Your key is ready. Send the public key to Tech Help once. It can only lock results, never unlock them.</p>
<div class="btns"><button class="pri" id="cpk">Copy public key</button><button id="rck">Check for results</button></div>`:`<p class="mut">Creates a private key on this phone so allotment results can be published encrypted. Only this phone (or your JSON backup) can unlock them.</p><div class="btns"><button class="pri" id="gk">Set up private results</button></div>`}
${resNote()}<p class="mut">⚠️ Your JSON backup now contains this private key and your full PANs. Keep it private.</p></div>
${R.unmatched.length?`<div class="card"><b>Unmatched results</b>${R.unmatched.map((e,i)=>`<div class="row"><span>${esc(e.account)} · ${esc(e.ipo)} · ${e.status==='allotted'?'✅ '+esc(e.shares)+' sh':'❌'}</span></div>
<select data-u="${i}"><option value="">Assign to application…</option>${[...db.apps].sort((x,y)=>cmpN(acc(x.acct).name,acc(y.acct).name)).map(a=>`<option value="${a.id}">${esc(acc(a.acct).name)} · ${esc(ipo(a.ipo).name)}</option>`).join('')}</select>`).join('')}</div>`:''}`;
const g=el.querySelector('#gk');if(g)g.onclick=async()=>{g.disabled=true;try{await genKey();if(window.Cloud)Cloud.keyChanged();toast('Private key created');renderResults(el)}catch(_){alert('Could not create key on this browser')}};
const c=el.querySelector('#cpk');if(c)c.onclick=async()=>{try{await navigator.clipboard.writeText(k.spki);toast('Public key copied – paste it to Tech Help')}catch(_){prompt('Copy this public key:',k.spki)}};
const ck=el.querySelector('#rck');if(ck)ck.onclick=()=>loadResults(false).then(()=>{toast(R.msg||'Results checked');renderResults(el)});
el.querySelectorAll('[data-u]').forEach(s=>s.onchange=()=>{const e=R.unmatched[+s.dataset.u],a=db.apps.find(x=>x.id===s.value);if(!e||!a)return;
a.resKey=rKey(e);a.allotSrc='auto';applyResults([e]);save();R.unmatched=R.unmatched.filter(x=>x!==e);toast('Result assigned');render()})}
