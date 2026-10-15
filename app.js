'use strict';
const K='ipoTracker.v1';
let db=load();function load(){try{return JSON.parse(localStorage.getItem(K))||{accounts:[],ipos:[],apps:[]}}catch(e){return{accounts:[],ipos:[],apps:[]}}}
if(!Array.isArray(db.prefs))db.prefs=[];
function save(){localStorage.setItem(K,JSON.stringify(db));if(window.Cloud)Cloud.dirty()}
const $=s=>document.querySelector(s),id=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const inr=n=>'₹'+Math.round(+n||0).toLocaleString('en-IN');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fd=d=>d?new Date(d+'T00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'}):'—';
const today=()=>new Date().toISOString().slice(0,10);
const CATS=['Retail','sHNI','bHNI','Employee','Shareholder'],MAND=['Pending','Accepted','Rejected'],ALLOT=['Awaiting','Allotted','Not allotted'];
const acc=i=>db.accounts.find(a=>a.id===i)||{name:'(deleted)'},ipo=i=>db.ipos.find(a=>a.id===i)||{name:'(deleted)',lot:0,hi:0};
const amt=a=>lotAmt(ipo(a.ipo),a.cat,a.lots);
const pnl=a=>{if(a.allot!=='Allotted')return 0;const p=ipo(a.ipo),px=+a.sell||+a.listp||0;return px?(px-issuePx(p,a.cat))*(+a.shares||0):0};
// Blocked = pending/accepted applications awaiting allotment. On allotment the unallotted part is released and
// the allotted shares move to tied(); on Not allotted everything is released.
const blocked=a=>a.mandate!=='Rejected'&&a.allot==='Awaiting'?amt(a):0;
let live=null;try{live=JSON.parse(localStorage.getItem('ipoTracker.live'))}catch(e){}
function loadLive(){return fetch('data/ipos.json?t='+Date.now(),{cache:'no-store'}).then(r=>{if(!r.ok)throw 0;return r.json()}).then(j=>{live=j;localStorage.setItem('ipoTracker.live',JSON.stringify(j));syncLinked();render()}).catch(()=>{})}
function liveStatus(x){const t=today();return x.open&&x.open>t?'upcoming':x.close&&x.close<t?'closed':'open'}
function syncLinked(){if(!live)return;let ch=0;db.ipos.forEach(p=>{const x=p.liveId&&live.ipos.find(y=>y.id===p.liveId);if(!x)return;
const m={name:x.name,type:x.type,open:x.open||p.open,close:x.close||p.close,listd:x.listing||p.listd,lo:x.priceLow??p.lo,hi:x.priceHigh??p.hi,lot:x.lot??p.lot,registrar:x.registrar||p.registrar,allotd:x.allotment||p.allotd};
for(const k in m)if(m[k]!=null&&String(p[k]??'')!==String(m[k])){p[k]=String(m[k]);ch=1}});if(ch)save()}
function linkLive(lid){let p=db.ipos.find(q=>q.liveId===lid);if(p)return p.id;const x=live.ipos.find(y=>y.id===lid);
p={id:id(),liveId:lid,name:x.name,type:x.type,open:x.open||'',close:x.close||'',allotd:'',listd:x.listing||'',lo:String(x.priceLow??''),hi:String(x.priceHigh??''),lot:String(x.lot??''),registrar:x.registrar||''};db.ipos.push(p);return p.id}
// Category lot limits (approx. SEBI rules): Mainboard Retail <=2L, sHNI >2L-10L, bHNI >10L, Employee <=5L.
// SME (2025 rules): individual/Retail = 2 lots, HNI >= 3 lots.
function catRules(type,lot,hi){const L=(+lot||0)*(+hi||0);if(!L)return null;const f=v=>Math.floor(v/L),sme=type==='SME';
const r=sme?{Retail:[2,2],sHNI:[3,Math.max(3,f(1e6))],bHNI:[Math.max(3,f(1e6))+1,null]}
:{Retail:[1,Math.max(1,f(2e5))],sHNI:[f(2e5)+1,f(1e6)],bHNI:[f(1e6)+1,null],Employee:[1,Math.max(1,f(5e5))],Shareholder:[1,Math.max(1,f(2e5))]};return r}
const ruleTxt=r=>r?Object.entries(r).map(([k,[a,b]])=>`${k}: ${a}${b==null?'+':a===b?'':'–'+b} lot${b===1?'':'s'}`).join(' · '):'';
const ist=s=>s?new Date(s).toLocaleString(undefined,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—';
const SUBK=[['qib','QIB'],['nii','NII'],['shni','sHNI'],['bhni','bHNI'],['retail','Retail'],['employee','Emp'],['total','Total']];
let lf='open';
const RTA=[[/kfin|karvy/i,'KFin Technologies','https://ipostatus.kfintech.com/'],[/mufg|link\s*intime/i,'MUFG Intime (Link Intime)','https://in.mpms.mufg.com/Initial_Offer/public-issues.html'],
[/bigshare/i,'Bigshare Services','https://ipo.bigshareonline.com/IPO_Status.html'],[/cameo/i,'Cameo Corporate','https://ipostatus1.cameoindia.com/'],[/skyline/i,'Skyline Financial','https://www.skylinerta.com/ipo.php'],
[/purva/i,'Purva Sharegistry','https://www.purvashare.com/investor-service/ipo-query'],[/mas services/i,'MAS Services','https://www.masserv.com/opt.asp'],[/maashitla/i,'Maashitla Securities','https://maashitla.com/allotment-status/public-issues']];
const BSE_ALLOT='https://www.bseindia.com/investors/appli_check.aspx';
const rta=n=>{const r=n&&RTA.find(([rx])=>rx.test(n));return r?{name:r[1],url:r[2]}:{name:n||'Unknown registrar',url:BSE_ALLOT}};
const maskPan=p=>p&&p.length===10?p.slice(0,2)+'XXXXX'+p.slice(7):'';
function addWorkDays(d,n){const x=new Date(d+'T00:00');while(n>0){x.setDate(x.getDate()+1);if(x.getDay()%6)n--}return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')}
const estAllot=p=>p.allotd||(p.close?addWorkDays(p.close,1):'');
async function checkAllot(aid){const a=db.apps.find(x=>x.id===aid),p=ipo(a.ipo),c=acc(a.acct),r=rta(p.registrar);let msg='';
if(c.panFull){try{await navigator.clipboard.writeText(c.panFull);msg='PAN copied. '}catch(e){msg='Copy failed – PAN: '+c.panFull+'. '}}
window.open(r.url,'_blank','noopener');setTimeout(()=>quickAllot(aid,msg+'Search for "'+p.name+'" on '+r.name+', solve the captcha, then record the result:'),400)}
function quickAllot(aid,msg){const a=db.apps.find(x=>x.id===aid),p=ipo(a.ipo),f=$('#frm');
f.innerHTML=`<h2>Allotment result</h2><p class="mut">${esc(msg)}</p><label>Shares allotted (number of shares, not lots)</label><input name="sh" type="number" inputmode="numeric" value="${esc(a.shares||p.lot||'')}">
<div class="btns"><button value="ok" class="pri" data-r="Allotted">✅ Allotted</button><button value="ok" data-r="Not allotted">❌ Not allotted</button><button value="cancel">Later</button></div>`;
f.onsubmit=e=>{const b=e.submitter;if(!b||!b.dataset.r)return;a.allot=b.dataset.r;a.allotSrc='manual';a.shares=a.allot==='Allotted'?(f.sh.value||p.lot):'0';if(a.mandate==='Pending')a.mandate='Accepted';save();render()};$('#dlg').showModal()}
let tab='dash',flt={acct:'',cat:'',st:''};
function go(t){tab=t;document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));
$('#title').textContent={live:'Live IPOs',dash:'Dashboard',ipos:'IPOs',apps:'Applications',accts:'Accounts',data:'Backup & Export',apply:'Apply to IPO',allot:'Enter allotment'}[t];render()}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>go(b.dataset.t));
function filters(){const o=(v,l,s)=>`<option value="${esc(v)}"${s===v?' selected':''}>${esc(l)}</option>`;
return `<div class="filters"><select id="fa">${o('','All accounts',flt.acct)}${db.accounts.map(a=>o(a.id,a.name,flt.acct)).join('')}</select>
<select id="fc">${o('','All categories',flt.cat)}${CATS.map(c=>o(c,c,flt.cat)).join('')}</select>
<select id="fs">${o('','All statuses',flt.st)}${ALLOT.map(c=>o(c,c,flt.st)).join('')}</select></div>`}
function bindF(){['fa','fc','fs'].forEach((k,i)=>{const e=$('#'+k);if(e)e.onchange=()=>{flt[['acct','cat','st'][i]]=e.value;render()}})}
const fApps=()=>db.apps.filter(a=>(!flt.acct||a.acct===flt.acct)&&(!flt.cat||a.cat===flt.cat)&&(!flt.st||a.allot===flt.st));
function rate(list,key,name){const g={};list.filter(a=>a.allot!=='Awaiting'&&a.mandate!=='Rejected').forEach(a=>{const k=a[key];g[k]=g[k]||[0,0];g[k][1]++;if(a.allot==='Allotted')g[k][0]++});
return Object.entries(g).map(([k,[h,n]])=>`<tr><td>${esc(name(k))}</td><td>${h}/${n}</td><td>${Math.round(h*100/n)}%</td></tr>`).join('')||'<tr><td colspan=3 class=mut>No results yet</td></tr>'}
function render(){const v=$('#view'),t=today();
if(tab==='apply'){renderApply(v);return}if(tab==='allot'){renderAllot(v);return}
if(tab==='dash'){const L=fApps(),tp=L.reduce((s,a)=>s+pnl(a),0);
const active=db.ipos.filter(p=>p.close>=t&&p.open<=t),up=db.ipos.filter(p=>p.allotd&&p.allotd>=t).sort((a,b)=>a.allotd.localeCompare(b.allotd));
v.innerHTML=capitalCards()+ipoSection()+filters()+`<div class="grid"><div class="card stat">Total P&amp;L<b class="${tp>=0?'pos':'neg'}">${inr(tp)}</b></div><div class="card stat">Applications<b>${L.length}</b></div>
<div class="card stat">Allotted<b>${L.filter(a=>a.allot==='Allotted').length}</b></div><div class="card stat">Blocked (filtered)<b>${inr(L.reduce((s,a)=>s+blocked(a),0))}</b></div></div>
<div class="card"><b>Open now</b>${active.map(p=>`<div class="row"><span>${esc(p.name)} <span class="badge">${esc(p.type)}</span></span><span class="mut">closes ${fd(p.close)}</span></div>`).join('')||'<div class=mut>None</div>'}</div>
${resNote()}<div class="card"><b>Upcoming allotments</b>${up.map(p=>`<div class="row"><span>${esc(p.name)}</span><span class="mut">${fd(p.allotd)} · ${db.apps.filter(a=>a.ipo===p.id).length} apps</span></div>`).join('')||'<div class=mut>None</div>'}</div>
<div class="card"><b>Hit rate by account</b><table>${rate(L,'acct',k=>acc(k).name)}</table></div>
<div class="card"><b>Hit rate by category</b><table>${rate(L,'cat',k=>k)}</table></div>`;bindF();bindCapital();bindBan(v);return}
if(tab==='live'){if(!live){v.innerHTML='<div class=card>Loading live IPO data… (needs internet the first time)</div>';return}
const L=live.ipos.filter(x=>liveStatus(x)===lf),cnt=k=>live.ipos.filter(x=>liveStatus(x)===k).length;
v.innerHTML=`<div class="btns">${['open','upcoming','closed'].map(k=>`<button class="${lf===k?'pri':''}" data-f="${k}">${k[0].toUpperCase()+k.slice(1)} (${cnt(k)})</button>`).join('')}</div>
<div class="mut" style="margin-bottom:8px">Data checked ${ist(live.generated)} (your time) · Source: NSE</div>`+(L.map(x=>{const r=catRules(x.type,x.lot,x.priceHigh),sb=x.subscription||{};
return `<div class="card"><div class="row"><b>${esc(x.name)}</b><span class="badge">${esc(x.type)}</span></div>
<div class="mut">${fd(x.open)} – ${fd(x.close)}${x.listing?' · List '+fd(x.listing):''}</div>
<div>₹${esc(x.priceLow??'?')}–${esc(x.priceHigh??'?')} · Lot ${esc(x.lot??'?')}${x.lot&&x.priceHigh?' ('+inr(x.lot*x.priceHigh)+')':''}</div>
${r?`<div class="mut">${ruleTxt(r)}</div>`:''}<div class="mut">Registrar: ${esc(rta(x.registrar).name)} · Allotment ${x.allotment?fd(x.allotment):'~'+fd(estAllot({close:x.close}))+' (est.)'}${x.sources?' · '+esc(x.sources.join('+')):''}</div>
${Object.keys(sb).length?`<table><tr>${SUBK.filter(([k])=>k in sb).map(([k,l])=>`<th>${l}</th>`).join('')}</tr><tr>${SUBK.filter(([k])=>k in sb).map(([k])=>`<td>${sb[k]}x</td>`).join('')}</tr></table>
<div class="mut">Subscription as of ${ist(x.subscriptionUpdated)}${x.type==='SME'?' · category split not published by NSE for SME':''}</div>`:'<div class="mut">No subscription data yet</div>'}
${`<div class="btns"><button class="pri" data-bl="${esc(x.id)}">➕ Apply (all accounts)</button><button data-l="${esc(x.id)}">+ Single</button></div>`}</div>`}).join('')||'<div class="card mut">None</div>')+`<div class="mut">NSE-listed issues only (BSE-only SME IPOs not included). Upcoming IPOs appear once NSE lists them.</div>`;
v.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{lf=b.dataset.f;render()});
v.querySelectorAll('[data-l]').forEach(b=>b.onclick=()=>appForm(null,null,b.dataset.l));v.querySelectorAll('[data-bl]').forEach(b=>b.onclick=()=>{const k=linkLive(b.dataset.bl);save();openApply(k)});return}
if(tab==='accts'){v.innerHTML=`<button class="pri" id="add">+ Add account</button>`+db.accounts.map(a=>`<div class="card"><div class="row"><b>${esc(a.name)}</b><span class="mut">PAN ${a.panLocked?'🔒 locked':a.panFull?esc(maskPan(a.panFull)):'…'+esc(a.pan)}</span></div>
<div class="mut">${esc(a.broker)}${a.demat&&!a.panLocked?' · DP …'+esc(String(a.demat).slice(-4)):''}${a.upi?' · '+esc(a.upi):''}</div><div class="btns"><button data-e="${a.id}">Edit</button><button class="del" data-d="${a.id}">Delete</button></div></div>`).join('');
$('#add').onclick=()=>accForm();v.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>accForm(b.dataset.e));
v.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>{const n=db.apps.filter(x=>x.acct===b.dataset.d).length;if(confirm(`Delete account${n?` and its ${n} applications`:''}?`)){db.accounts=db.accounts.filter(x=>x.id!==b.dataset.d);db.apps=db.apps.filter(x=>x.acct!==b.dataset.d);save();render()}});return}
if(tab==='ipos'){const s=[...db.ipos].sort((a,b)=>(b.open||'').localeCompare(a.open||''));
v.innerHTML=`<button class="pri" id="add">+ Add IPO</button>`+s.map(p=>`<div class="card"><div class="row"><b>${esc(p.name)}</b><span class="badge">${esc(p.type)}</span></div>
<div class="mut">${fd(p.open)} – ${fd(p.close)} · Allot ${fd(p.allotd)} · List ${fd(p.listd)}</div><div class="mut">₹${esc(p.lo)}–${esc(p.hi)} · Lot ${esc(p.lot)} (${inr(p.lot*p.hi)})</div>
${ipoSumCard(p,'i:',true)}<div class="btns"><button class="pri" data-ba="${p.id}">➕ Apply (all)</button><button data-a="${p.id}">+ Single</button>${db.apps.some(x=>x.ipo===p.id)?`<button data-al="${p.id}">🎯 Allotment</button>`:''}<button data-e="${p.id}">Edit</button><button class="del" data-d="${p.id}">Delete</button></div></div>`).join('');
$('#add').onclick=()=>ipoForm();v.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>ipoForm(b.dataset.e));v.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>appForm(null,b.dataset.a));v.querySelectorAll('[data-ba]').forEach(b=>b.onclick=()=>openApply(b.dataset.ba));v.querySelectorAll('[data-al]').forEach(b=>b.onclick=()=>openAllot(b.dataset.al));bindBan(v);
v.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>{if(confirm('Delete IPO and its applications?')){db.ipos=db.ipos.filter(x=>x.id!==b.dataset.d);db.apps=db.apps.filter(x=>x.ipo!==b.dataset.d);save();render()}});return}
if(tab==='apps'){const L=fApps().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
v.innerHTML=filters()+`<div class="btns"><button class="pri" id="bulk">➕ Apply to IPO</button><button class="pri" id="allotb">🎯 Enter allotment</button><button id="add">+ Single application</button></div>`+L.map(a=>{const p=pnl(a);return `<div class="card"><div class="row"><b>${esc(ipo(a.ipo).name)}</b><span class="badge">${esc(a.cat)}</span></div>
<div class="mut">${esc(acc(a.acct).name)} · ${a.lots} lot(s) · ${inr(amt(a))} · ${fd(a.date)}</div>
<div class="row"><span>UPI: ${esc(a.mandate)} · ${esc(a.allot)}${a.allot==='Allotted'?` (${a.shares} sh)${a.sold==='yes'?' · sold @₹'+esc(a.sell):''}`:''}${a.allot==='Not allotted'?` · Refund ${a.refund==='yes'?'✓':'✗'}`:''}</span>${a.allot==='Allotted'?`<b class="${p>=0?'pos':'neg'}">${inr(p)}</b>`:''}</div>
<div class="btns">${a.allot==='Awaiting'?`<button class="pri" data-k="${a.id}">🔍 Check allotment</button>`:''}${a.allot==='Allotted'&&a.sold!=='yes'?`<button data-sold="${a.id}">💰 Mark sold</button>`:''}<button data-e="${a.id}">Edit</button><button class="del" data-d="${a.id}">Delete</button></div>
${a.allot==='Awaiting'?`<div class="mut">${esc(rta(ipo(a.ipo).registrar).name)} · allotment ${ipo(a.ipo).allotd?fd(ipo(a.ipo).allotd):'~'+fd(estAllot(ipo(a.ipo)))+' (est.)'}</div>`:''}</div>`}).join('');
bindF();v.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>checkAllot(b.dataset.k));$('#add').onclick=()=>appForm();$('#bulk').onclick=()=>openApply();$('#allotb').onclick=()=>openAllot();v.querySelectorAll('[data-sold]').forEach(b=>b.onclick=()=>markSold(b.dataset.sold));v.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>appForm(b.dataset.e));
v.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>{if(confirm('Delete application?')){db.apps=db.apps.filter(x=>x.id!==b.dataset.d);save();render()}});return}
if(tab==='data'){v.innerHTML=`<div class="card"><p>Your data lives only on this device. Back up regularly.</p><div class="btns"><button class="pri" id="ej">Export JSON backup</button><button id="ec">Export CSV</button>
<button id="ij">Import JSON</button></div><input type="file" id="fi" accept=".json,application/json" hidden></div><div id="cloudbox"></div><div id="resbox"></div><div class="card mut">${db.accounts.length} accounts · ${db.ipos.length} IPOs · ${db.apps.length} applications</div>`;
renderCloud($('#cloudbox'));renderResults($('#resbox'));$('#ej').onclick=async()=>{const k=await keyBackup();dl('ipo-tracker-backup-'+t+'.json',JSON.stringify(k?{...db,resultsKey:k}:db,null,1),'application/json')};
$('#ec').onclick=()=>{const h=['IPO','Type','Account','PAN4','Category','Lots','Amount','Applied','Mandate','Allotment','Shares','Refund','ListingPrice','SellPrice','PnL'];
const r=db.apps.map(a=>{const p=ipo(a.ipo),c=acc(a.acct);return[p.name,p.type,c.name,c.pan,a.cat,a.lots,amt(a),a.date,a.mandate,a.allot,a.shares,a.refund,a.listp,a.sell,pnl(a)]});
dl('ipo-applications-'+t+'.csv',[h,...r].map(x=>x.map(y=>'"'+String(y??'').replace(/"/g,'""')+'"').join(',')).join('\n'),'text/csv')};
$('#ij').onclick=()=>$('#fi').click();$('#fi').onchange=e=>{const f=e.target.files[0];if(!f)return;f.text().then(s=>{try{const d=JSON.parse(s);if(!Array.isArray(d.accounts)||!Array.isArray(d.ipos)||!Array.isArray(d.apps))throw 0;
if(confirm('Replace all current data with this backup?')){if(!Array.isArray(d.prefs))d.prefs=[];const k=d.resultsKey;delete d.resultsKey;db=d;save();restoreKey(k).catch(()=>{}).then(()=>{render();loadResults(true)})}}catch(_){alert('Invalid backup file')}})}}}
function dl(n,s,t){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([s],{type:t}));a.download=n;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function form(title,fields,obj,onSave,extra){const f=$('#frm');f.innerHTML=`<h2>${title}</h2>`+fields.map(([k,l,ty,opt])=>`<label>${l}</label>`+(ty==='sel'?`<select name="${k}">${opt.map(o=>Array.isArray(o)?o:[o,o]).map(([v,t])=>`<option value="${esc(v)}"${obj[k]===v?' selected':''}>${esc(t)}</option>`).join('')}</select>`
:`<input name="${k}" type="${ty||'text'}" ${ty==='number'?'step="any" inputmode="decimal"':''} value="${esc(obj[k])}" ${opt||''}>`)).join('')+`<p id="hint" class="mut"></p><div class="btns"><button value="cancel" formnovalidate>Cancel</button><button class="pri" value="ok">Save</button></div>`;
const d=$('#dlg');if(extra)extra(f);f.onsubmit=e=>{if(e.submitter&&e.submitter.value==='cancel')return;const o={};new FormData(f).forEach((v,k)=>o[k]=v.trim());onSave(o);save();render()};d.showModal()}
function accForm(i){const a=db.accounts.find(x=>x.id===i)||{};form(i?'Edit account':'Add account',[['name','Name','text','required'],['pan','PAN last 4','text','maxlength=4 required'],['panFull','Full PAN (optional, stays on this phone only – used to copy for allotment checks)','text','maxlength=10 pattern="[A-Za-z]{5}[0-9]{4}[A-Za-z]" autocomplete="off"'],['broker','Broker / Demat','text','required'],['demat','Demat / DP ID (optional, encrypted before cloud sync)','text','autocomplete="off"'],['upi','UPI ID (optional)'],['balance','Free balance in bank for IPOs (₹, optional)','number','min=0']],a,o=>{o.panFull=(o.panFull||'').toUpperCase();if(o.panFull)o.pan=o.panFull.slice(6);o.pan=o.pan.toUpperCase();i?Object.assign(a,o):db.accounts.push({id:id(),...o})})}
function ipoForm(i){const p=db.ipos.find(x=>x.id===i)||{type:'Mainboard'};form(i?'Edit IPO':'Add IPO',[['name','IPO name','text','required'],['type','Type','sel',['Mainboard','SME']],['open','Open date','date','required'],['close','Close date','date','required'],['allotd','Allotment date','date'],['listd','Listing date','date'],['lo','Price band low (₹)','number'],['hi','Price band high (₹)','number','required min=0'],['lot','Lot size (shares)','number','required min=1'],['finalPx','Final issue price (₹, optional – defaults to upper band)','number','min=0 step=0.01'],['empDisc','Employee discount per share (₹, optional)','number','min=0'],['registrar','Registrar','sel',[['','Unknown'],...RTA.map(r=>[r[1],r[1]])]]],p,o=>{i?Object.assign(p,o):db.ipos.push({id:id(),...o})})}
function appForm(i,ipoId,liveId){const opts=[...(live?live.ipos.filter(x=>!db.ipos.some(p=>p.liveId===x.id)).map(x=>['live:'+x.id,'🔴 '+x.name+' ('+liveStatus(x)+')']):[]),...db.ipos.map(p=>[p.id,p.name])];
if(!db.accounts.length||!opts.length){alert(db.accounts.length?'No IPOs available yet.':'Add an account first (Accounts tab).');return}
if(liveId){const p=db.ipos.find(q=>q.liveId===liveId);ipoId=p?p.id:'live:'+liveId}
const a=db.apps.find(x=>x.id===i)||{ipo:ipoId||opts[0][0],acct:db.accounts[0].id,cat:'Retail',lots:1,date:today(),mandate:'Pending',allot:'Awaiting',refund:'no'};
form(i?'Edit application':'Add application',[['ipo','IPO','sel',opts],['acct','Account','sel',db.accounts.map(c=>[c.id,c.name+' (…'+c.pan+')'])],['cat','Category','sel',CATS],['lots','Lots','number','required min=1'],['date','Applied date','date'],['mandate','UPI mandate','sel',MAND],['allot','Allotment','sel',ALLOT],['shares','Shares allotted (number of shares, not lots)','number','min=0 step=1'],['refund','Refund received','sel',[['no','No'],['yes','Yes']]],['listp','Listing price (₹)','number'],['sell','Sell price (₹)','number'],['sold','Sold','sel',[['no','No'],['yes','Yes']]]],a,
o=>{if(o.ipo.startsWith('live:'))o.ipo=linkLive(o.ipo.slice(5));if(o.allot==='Allotted'&&!o.shares)o.shares=ipo(o.ipo).lot;if(o.allot==='Not allotted')o.shares='0';if(i&&(o.allot!==a.allot||String(o.shares)!==String(a.shares)))o.allotSrc=o.allot==='Awaiting'?'':'manual';i?Object.assign(a,o):db.apps.push({id:id(),...o})},
f=>{const h=()=>{const v=f.ipo.value,x=v.startsWith('live:')?live.ipos.find(y=>y.id===v.slice(5)):null,p=x?{type:x.type,lot:x.lot,hi:x.priceHigh}:ipo(v);
const n=+f.lots.value||0,r=catRules(p.type,p.lot,p.hi),c=r&&r[f.cat.value];let w='';if(c&&n&&(n<c[0]||(c[1]!=null&&n>c[1])))w=` ⚠️ ${f.cat.value} needs ${c[0]}${c[1]==null?'+':'–'+c[1]} lots`;
$('#hint').textContent=`Lot ${p.lot||'?'} × ₹${p.hi||'?'} · Amount: ${inr(n*(+p.lot||0)*(+p.hi||0))}`+w+(r?`\n${ruleTxt(r)}`:'');$('#hint').style.whiteSpace='pre-line'};
f.oninput=h;f.onchange=h;h()})}
if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('service-worker.js');
db.ipos.forEach(p=>{if(!('liveId'in p))p.liveId=null});
const cfgOk=window.FIREBASE_CONFIG&&!/REPLACE/.test(FIREBASE_CONFIG.apiKey+FIREBASE_CONFIG.projectId);
if(cfgOk)import('./cloud.js').catch(()=>{window.CLOUD_OFF=true});else window.CLOUD_OFF=true;go('dash');loadLive();loadResults(true);document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadResults(true)});setInterval(()=>{if(tab==='live'&&!document.hidden)loadLive()},5*60*1000);
