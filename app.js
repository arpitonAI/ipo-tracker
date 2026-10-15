'use strict';
const K='ipoTracker.v1';
let db=load();function load(){try{return JSON.parse(localStorage.getItem(K))||{accounts:[],ipos:[],apps:[]}}catch(e){return{accounts:[],ipos:[],apps:[]}}}
function save(){localStorage.setItem(K,JSON.stringify(db))}
const $=s=>document.querySelector(s),id=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const inr=n=>'₹'+Math.round(+n||0).toLocaleString('en-IN');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fd=d=>d?new Date(d+'T00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'}):'—';
const today=()=>new Date().toISOString().slice(0,10);
const CATS=['Retail','sHNI','bHNI','Employee','Shareholder'],MAND=['Pending','Accepted','Rejected'],ALLOT=['Awaiting','Allotted','Not allotted'];
const acc=i=>db.accounts.find(a=>a.id===i)||{name:'(deleted)'},ipo=i=>db.ipos.find(a=>a.id===i)||{name:'(deleted)',lot:0,hi:0};
const amt=a=>{const p=ipo(a.ipo);return (+a.lots||0)*(+p.lot||0)*(+p.hi||0)};
const pnl=a=>{if(a.allot!=='Allotted')return 0;const p=ipo(a.ipo),px=+a.sell||+a.listp||0;return px?(px-(+p.hi||0))*(+a.shares||0):0};
const blocked=a=>a.mandate==='Accepted'&&(a.allot==='Awaiting'||(a.allot==='Not allotted'&&a.refund!=='yes'))?amt(a):0;
let tab='dash',flt={acct:'',cat:'',st:''};
function go(t){tab=t;document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));
$('#title').textContent={dash:'Dashboard',ipos:'IPOs',apps:'Applications',accts:'Accounts',data:'Backup & Export'}[t];render()}
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
if(tab==='dash'){const L=fApps(),tp=L.reduce((s,a)=>s+pnl(a),0);
const active=db.ipos.filter(p=>p.close>=t&&p.open<=t),up=db.ipos.filter(p=>p.allotd&&p.allotd>=t).sort((a,b)=>a.allotd.localeCompare(b.allotd));
v.innerHTML=filters()+`<div class="grid"><div class="card stat">Blocked<b>${inr(L.reduce((s,a)=>s+blocked(a),0))}</b></div>
<div class="card stat">Total P&amp;L<b class="${tp>=0?'pos':'neg'}">${inr(tp)}</b></div><div class="card stat">Applications<b>${L.length}</b></div>
<div class="card stat">Allotted<b>${L.filter(a=>a.allot==='Allotted').length}</b></div></div>
<div class="card"><b>Open now</b>${active.map(p=>`<div class="row"><span>${esc(p.name)} <span class="badge">${esc(p.type)}</span></span><span class="mut">closes ${fd(p.close)}</span></div>`).join('')||'<div class=mut>None</div>'}</div>
<div class="card"><b>Upcoming allotments</b>${up.map(p=>`<div class="row"><span>${esc(p.name)}</span><span class="mut">${fd(p.allotd)} · ${db.apps.filter(a=>a.ipo===p.id).length} apps</span></div>`).join('')||'<div class=mut>None</div>'}</div>
<div class="card"><b>Hit rate by account</b><table>${rate(L,'acct',k=>acc(k).name)}</table></div>
<div class="card"><b>Hit rate by category</b><table>${rate(L,'cat',k=>k)}</table></div>`;bindF();return}
if(tab==='accts'){v.innerHTML=`<button class="pri" id="add">+ Add account</button>`+db.accounts.map(a=>`<div class="card"><div class="row"><b>${esc(a.name)}</b><span class="mut">PAN …${esc(a.pan)}</span></div>
<div class="mut">${esc(a.broker)}${a.upi?' · '+esc(a.upi):''}</div><div class="btns"><button data-e="${a.id}">Edit</button><button class="del" data-d="${a.id}">Delete</button></div></div>`).join('');
$('#add').onclick=()=>accForm();v.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>accForm(b.dataset.e));
v.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>{const n=db.apps.filter(x=>x.acct===b.dataset.d).length;if(confirm(`Delete account${n?` and its ${n} applications`:''}?`)){db.accounts=db.accounts.filter(x=>x.id!==b.dataset.d);db.apps=db.apps.filter(x=>x.acct!==b.dataset.d);save();render()}});return}
if(tab==='ipos'){const s=[...db.ipos].sort((a,b)=>(b.open||'').localeCompare(a.open||''));
v.innerHTML=`<button class="pri" id="add">+ Add IPO</button>`+s.map(p=>`<div class="card"><div class="row"><b>${esc(p.name)}</b><span class="badge">${esc(p.type)}</span></div>
<div class="mut">${fd(p.open)} – ${fd(p.close)} · Allot ${fd(p.allotd)} · List ${fd(p.listd)}</div><div class="mut">₹${esc(p.lo)}–${esc(p.hi)} · Lot ${esc(p.lot)} (${inr(p.lot*p.hi)})</div>
<div class="btns"><button class="pri" data-a="${p.id}">+ Apply</button><button data-e="${p.id}">Edit</button><button class="del" data-d="${p.id}">Delete</button></div></div>`).join('');
$('#add').onclick=()=>ipoForm();v.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>ipoForm(b.dataset.e));v.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>appForm(null,b.dataset.a));
v.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>{if(confirm('Delete IPO and its applications?')){db.ipos=db.ipos.filter(x=>x.id!==b.dataset.d);db.apps=db.apps.filter(x=>x.ipo!==b.dataset.d);save();render()}});return}
if(tab==='apps'){const L=fApps().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
v.innerHTML=filters()+`<button class="pri" id="add">+ Add application</button>`+L.map(a=>{const p=pnl(a);return `<div class="card"><div class="row"><b>${esc(ipo(a.ipo).name)}</b><span class="badge">${esc(a.cat)}</span></div>
<div class="mut">${esc(acc(a.acct).name)} · ${a.lots} lot(s) · ${inr(amt(a))} · ${fd(a.date)}</div>
<div class="row"><span>UPI: ${esc(a.mandate)} · ${esc(a.allot)}${a.allot==='Allotted'?` (${a.shares} sh)`:''}${a.allot==='Not allotted'?` · Refund ${a.refund==='yes'?'✓':'✗'}`:''}</span>${a.allot==='Allotted'?`<b class="${p>=0?'pos':'neg'}">${inr(p)}</b>`:''}</div>
<div class="btns"><button data-e="${a.id}">Edit</button><button class="del" data-d="${a.id}">Delete</button></div></div>`}).join('');
bindF();$('#add').onclick=()=>appForm();v.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>appForm(b.dataset.e));
v.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>{if(confirm('Delete application?')){db.apps=db.apps.filter(x=>x.id!==b.dataset.d);save();render()}});return}
if(tab==='data'){v.innerHTML=`<div class="card"><p>Your data lives only on this device. Back up regularly.</p><div class="btns"><button class="pri" id="ej">Export JSON backup</button><button id="ec">Export CSV</button>
<button id="ij">Import JSON</button></div><input type="file" id="fi" accept=".json,application/json" hidden></div><div class="card mut">${db.accounts.length} accounts · ${db.ipos.length} IPOs · ${db.apps.length} applications</div>`;
$('#ej').onclick=()=>dl('ipo-tracker-backup-'+t+'.json',JSON.stringify(db,null,1),'application/json');
$('#ec').onclick=()=>{const h=['IPO','Type','Account','PAN4','Category','Lots','Amount','Applied','Mandate','Allotment','Shares','Refund','ListingPrice','SellPrice','PnL'];
const r=db.apps.map(a=>{const p=ipo(a.ipo),c=acc(a.acct);return[p.name,p.type,c.name,c.pan,a.cat,a.lots,amt(a),a.date,a.mandate,a.allot,a.shares,a.refund,a.listp,a.sell,pnl(a)]});
dl('ipo-applications-'+t+'.csv',[h,...r].map(x=>x.map(y=>'"'+String(y??'').replace(/"/g,'""')+'"').join(',')).join('\n'),'text/csv')};
$('#ij').onclick=()=>$('#fi').click();$('#fi').onchange=e=>{const f=e.target.files[0];if(!f)return;f.text().then(s=>{try{const d=JSON.parse(s);if(!Array.isArray(d.accounts)||!Array.isArray(d.ipos)||!Array.isArray(d.apps))throw 0;
if(confirm('Replace all current data with this backup?')){db=d;save();render()}}catch(_){alert('Invalid backup file')}})}}}
function dl(n,s,t){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([s],{type:t}));a.download=n;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function form(title,fields,obj,onSave,extra){const f=$('#frm');f.innerHTML=`<h2>${title}</h2>`+fields.map(([k,l,ty,opt])=>`<label>${l}</label>`+(ty==='sel'?`<select name="${k}">${opt.map(o=>Array.isArray(o)?o:[o,o]).map(([v,t])=>`<option value="${esc(v)}"${obj[k]===v?' selected':''}>${esc(t)}</option>`).join('')}</select>`
:`<input name="${k}" type="${ty||'text'}" ${ty==='number'?'step="any" inputmode="decimal"':''} value="${esc(obj[k])}" ${opt||''}>`)).join('')+`<p id="hint" class="mut"></p><div class="btns"><button value="cancel" formnovalidate>Cancel</button><button class="pri" value="ok">Save</button></div>`;
const d=$('#dlg');if(extra)extra(f);f.onsubmit=e=>{if(e.submitter&&e.submitter.value==='cancel')return;const o={};new FormData(f).forEach((v,k)=>o[k]=v.trim());onSave(o);save();render()};d.showModal()}
function accForm(i){const a=db.accounts.find(x=>x.id===i)||{};form(i?'Edit account':'Add account',[['name','Name','text','required'],['pan','PAN last 4','text','maxlength=4 required'],['broker','Broker / Demat','text','required'],['upi','UPI ID (optional)']],a,o=>{o.pan=o.pan.toUpperCase();i?Object.assign(a,o):db.accounts.push({id:id(),...o})})}
function ipoForm(i){const p=db.ipos.find(x=>x.id===i)||{type:'Mainboard'};form(i?'Edit IPO':'Add IPO',[['name','IPO name','text','required'],['type','Type','sel',['Mainboard','SME']],['open','Open date','date','required'],['close','Close date','date','required'],['allotd','Allotment date','date'],['listd','Listing date','date'],['lo','Price band low (₹)','number'],['hi','Price band high (₹)','number','required min=0'],['lot','Lot size (shares)','number','required min=1']],p,o=>{i?Object.assign(p,o):db.ipos.push({id:id(),...o})})}
function appForm(i,ipoId){if(!db.accounts.length||!db.ipos.length){alert('Add at least one account and one IPO first.');return}
const a=db.apps.find(x=>x.id===i)||{ipo:ipoId||db.ipos[0].id,acct:db.accounts[0].id,cat:'Retail',lots:1,date:today(),mandate:'Pending',allot:'Awaiting',refund:'no'};
form(i?'Edit application':'Add application',[['ipo','IPO','sel',db.ipos.map(p=>[p.id,p.name])],['acct','Account','sel',db.accounts.map(c=>[c.id,c.name+' (…'+c.pan+')'])],['cat','Category','sel',CATS],['lots','Lots','number','required min=1'],['date','Applied date','date'],['mandate','UPI mandate','sel',MAND],['allot','Allotment','sel',ALLOT],['shares','Shares allotted','number','min=0'],['refund','Refund received','sel',[['no','No'],['yes','Yes']]],['listp','Listing price (₹)','number'],['sell','Sell price (₹)','number']],a,
o=>{if(o.allot==='Allotted'&&!o.shares)o.shares=ipo(o.ipo).lot;i?Object.assign(a,o):db.apps.push({id:id(),...o})},
f=>{const h=()=>{const p=ipo(f.ipo.value);$('#hint').textContent='Amount: '+inr((+f.lots.value||0)*(+p.lot||0)*(+p.hi||0))};f.oninput=h;h()})}
if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('service-worker.js');
go('dash');
