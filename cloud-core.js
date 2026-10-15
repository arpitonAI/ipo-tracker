'use strict';
/* Sync-passcode vault + account field encryption (no Firebase here; testable in Node).
   PBKDF2-SHA256 (310k) → AES-256-GCM. Sensitive account fields never leave the phone in plaintext. */
const SENS=['pan','panFull','demat'],ITER=310000,VERIFY='ipo-tracker-vault-ok';
async function deriveKey(pass,salt,iter){const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveKey']);
return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:ub64(salt),iterations:iter||ITER},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
async function aesEnc(key,str){const iv=crypto.getRandomValues(new Uint8Array(12));
return{iv:b64(iv),ct:b64(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(str)))}}
async function aesDec(key,o){return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:ub64(o.iv)},key,ub64(o.ct)))}
async function makeVault(pass){const salt=b64(crypto.getRandomValues(new Uint8Array(16))),key=await deriveKey(pass,salt,ITER);
return{vault:{v:1,kdf:'PBKDF2-SHA256',iter:ITER,salt,verifier:await aesEnc(key,VERIFY)},key}}
async function openVault(pass,vault){try{const key=await deriveKey(pass,vault.salt,vault.iter);return(await aesDec(key,vault.verifier))===VERIFY?key:null}catch(_){return null}}
const hasSens=a=>SENS.some(k=>a[k]&&a[k]!=='🔒');
/* local account → Firestore payload. Without a key, sensitive fields are simply left out (merge keeps the cloud copy). */
async function encAccount(key,a){const o={};for(const k in a)if(!SENS.includes(k)&&k!=='panLocked'&&a[k]!==undefined)o[k]=a[k];
if(key&&!a.panLocked){const s={};SENS.forEach(k=>s[k]=a[k]||'');o.sensEnc=await aesEnc(key,JSON.stringify(s))}return o}
/* Firestore doc → local account. Locked if there is encrypted data but no (right) key. */
async function decAccount(key,d,localPrev){const o={...d};delete o.sensEnc;
if(d.sensEnc&&key){try{Object.assign(o,JSON.parse(await aesDec(key,d.sensEnc)));return o}catch(_){}}
if(d.sensEnc){o.pan='🔒';o.panFull='';o.demat='';o.panLocked=true;return o}
if(localPrev)SENS.forEach(k=>{if(localPrev[k])o[k]=localPrev[k]});return o}
/* Backup tab card */
function renderCloud(el){const C=window.Cloud;if(!el)return;
if(!C){el.innerHTML=`<div class="card"><b>☁️ Cloud sync</b><p class="mut">${window.CLOUD_OFF?'Not set up yet. Your data stays on this phone.':'Loading…'}</p></div>`;return}
const s=C.state();if(!s.user){el.innerHTML=`<div class="card"><b>☁️ Cloud sync</b><p class="mut">Sign in to keep your accounts, applications and results on every phone you use.</p>
<div class="btns"><button class="pri" id="gsi">Sign in with Google</button></div>${s.err?`<p class="neg">${esc(s.err)}</p>`:''}</div>`;$('#gsi').onclick=()=>C.signIn();return}
const lock=!s.vault?`<p class="mut">Set a <b>sync passcode</b> to lock PANs and demat IDs before they go to the cloud. It can't be recovered, so note it safely. You'll enter it once on each phone.</p>`
:!s.unlocked?`<p class="mut">🔒 PANs are locked on this phone. Enter your sync passcode to unlock.</p>`:`<p class="mut">🔓 PANs unlocked on this phone (stored encrypted in the cloud).</p>`;
el.innerHTML=`<div class="card"><b>☁️ Signed in as ${esc(s.user.email||s.user.name)}</b><div class="mut">${s.online?'Synced in real time':'Offline – changes will sync when back online'}</div>${lock}
${s.unlocked?'':`<input type="password" id="spc" autocomplete="${s.vault?'current-password':'new-password'}" placeholder="${s.vault?'Sync passcode':'New sync passcode (min 8 chars)'}">${s.vault?'':'<input type="password" id="spc2" autocomplete="new-password" placeholder="Repeat passcode">'}`}
<div class="btns">${s.unlocked?'<button id="fgt">Forget passcode on this phone</button>':`<button class="pri" id="spb">${s.vault?'Unlock':'Set passcode'}</button>`}<button id="gso">Sign out</button></div>${s.err?`<p class="neg">${esc(s.err)}</p>`:''}</div>`;
$('#gso').onclick=()=>{if(confirm('Sign out? Data stays on this phone.'))C.signOut()};
const f=$('#fgt');if(f)f.onclick=()=>C.forget();
const b=$('#spb');if(b)b.onclick=async()=>{const p=$('#spc').value;if(!s.vault&&(p.length<8||p!==$('#spc2').value))return alert(p.length<8?'Use at least 8 characters':'Passcodes do not match');
b.disabled=true;b.textContent='Working…';const ok=await C.passcode(p);if(!ok){alert('Wrong passcode');b.disabled=false;b.textContent='Unlock'}}}
