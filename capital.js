'use strict';
/* Bulk apply + capital tracking. Loaded before app.js; only uses app globals at runtime. */
const LOTOPTS=[1,2,3,4,5,10];
const unitPx=(p,cat)=>Math.max(0,(+p.hi||0)-(cat==='Employee'?(+p.empDisc||0):0));
const lotAmt=(p,cat,lots)=>(+lots||0)*(+p.lot||0)*unitPx(p,cat);
const tied=a=>a.allot==='Allotted'&&a.sold!=='yes'?(+a.shares||0)*unitPx(ipo(a.ipo),a.cat):0;
const pref=k=>((db.prefs||[]).find(x=>x.id==='main')||{})[k];
function setPref(k,v){db.prefs=db.prefs||[];let m=db.prefs.find(x=>x.id==='main');if(!m){m={id:'main'};db.prefs.push(m)}m[k]=v;save()}
/* Category limits for one IPO. Mainboard (SEBI ICDR): Retail & Shareholder ≤ ₹2L; sHNI = lowest lots > ₹2L up to ≤ ₹10L;
   bHNI = lowest lots > ₹10L; Employee ≤ ₹5L at the (discounted) employee price. SME uses catRules. */
function limits(p,cat){const L=(+p.lot||0)*(+p.hi||0);if(!L)return{min:1,max:null};
const r=catRules(p.type,p.lot,p.hi)||{};
if(cat==='Employee'){const le=(+p.lot||0)*unitPx(p,'Employee');return{min:1,max:p.type==='SME'?null:Math.max(1,Math.floor(5e5/le)),cap:5e5}}
if(r[cat])return{min:r[cat][0],max:r[cat][1],cap:cat==='Retail'||cat==='Shareholder'?2e5:cat==='sHNI'?1e6:null};
return{min:1,max:null}}
const defLots=(p,cat)=>limits(p,cat).min;
function lotWarn(p,cat,n){const l=limits(p,cat);if(n<l.min)return`${cat} needs at least ${l.min} lots`;if(l.max!=null&&n>l.max)return`${cat} max ${l.max} lots${l.cap?' ('+inr(l.cap)+')':''}`;return''}
/* per-account usage: blocked in pending applications + tied in unsold allotted shares (optionally excluding one IPO) */
function acctUse(acctId,exceptIpo){return db.apps.filter(a=>a.acct===acctId&&a.ipo!==exceptIpo).reduce((s,a)=>s+blocked(a)+tied(a),0)}
function capitalCards(){const bl=db.apps.reduce((s,a)=>s+blocked(a),0),td=db.apps.reduce((s,a)=>s+tied(a),0),pool=+pref('pool')||0,av=pool-bl-td;
const per={};db.apps.forEach(a=>{const b=blocked(a);if(b)per[a.ipo]=(per[a.ipo]||0)+b});
const tiedPer={};db.apps.forEach(a=>{const t=tied(a);if(t)tiedPer[a.ipo]=(tiedPer[a.ipo]||0)+t});
return`<button class="pri big" id="bulk">➕ Apply to IPO (all accounts)</button>
<div class="card"><div class="row"><b>💰 Capital</b><button id="pool">${pool?'Pool '+inr(pool)+' ✏️':'Set capital pool'}</button></div>
<div class="grid"><div class="stat">Blocked<b>${inr(bl)}</b></div><div class="stat">In allotted shares<b>${inr(td)}</b></div>
${pool?`<div class="stat">Available<b class="${av>=0?'pos':'neg'}">${inr(av)}</b></div><div class="stat">bHNI @ ₹10L<b>${Math.max(0,Math.floor(av/1e6))} acct${Math.floor(av/1e6)===1?'':'s'}</b></div>`:''}</div>
${Object.keys(per).length?`<div class="mut" style="margin-top:6px">Blocked per IPO</div>`+Object.entries(per).sort((a,b)=>b[1]-a[1]).map(([i,v])=>`<div class="row"><span>${esc(ipo(i).name)}</span><b>${inr(v)}</b></div>`).join(''):''}
${Object.keys(tiedPer).length?`<div class="mut" style="margin-top:6px">Held shares (until marked sold)</div>`+Object.entries(tiedPer).map(([i,v])=>`<div class="row"><span>${esc(ipo(i).name)}</span><b>${inr(v)}</b></div>`).join(''):''}</div>`}
function bindCapital(){const b=$('#bulk');if(b)b.onclick=()=>openApply();const p=$('#pool');if(p)p.onclick=()=>{const v=prompt('Total capital pool (₹), blank to clear',pref('pool')||'');if(v===null)return;
setPref('pool',String(v).replace(/[^0-9.]/g,''));render()}}
function markSold(aid){const a=db.apps.find(x=>x.id===aid);if(!a)return;const v=prompt(`Sell price per share for ${a.shares} shares (₹)`,a.sell||a.listp||'');if(v===null||!+v)return;
a.sell=String(+v);a.sold='yes';save();toast('Marked sold · capital freed');render()}
/* ---- Bulk apply screen ---- */
let AP={ipo:'',rows:{}};
function openApply(ipoId){AP={ipo:ipoId||'',rows:{}};if(ipoId)initRows();go('apply')}
function apIpo(){return AP.ipo?ipo(AP.ipo):null}
function initRows(){const p=apIpo();AP.rows={};db.accounts.forEach(c=>{const ex=db.apps.find(a=>a.ipo===AP.ipo&&a.acct===c.id);
const cat=ex?ex.cat:(c.lastCat||'bHNI');AP.rows[c.id]={on:!!ex,cat,lots:ex?+ex.lots:defLots(p,cat),ex:!!ex}})}
function renderApply(v){if(!db.accounts.length){v.innerHTML='<div class="card">Add your accounts first (Accounts tab).</div>';return}
const opts=[...(live?live.ipos.filter(x=>liveStatus(x)!=='closed'&&!db.ipos.some(p=>p.liveId===x.id)).map(x=>['live:'+x.id,'🔴 '+x.name+' ('+liveStatus(x)+')']):[]),
...[...db.ipos].sort((a,b)=>(b.open||'').localeCompare(a.open||'')).map(p=>[p.id,p.name])];
const p=apIpo();let html=`<div class="card"><label>IPO</label><select id="api"><option value="">Choose IPO…</option>${opts.map(([k,l])=>`<option value="${esc(k)}"${k===AP.ipo?' selected':''}>${esc(l)}</option>`).join('')}</select>
${p?`<div class="mut">₹${esc(p.hi)} upper · lot ${esc(p.lot)} (${inr(p.lot*p.hi)})${+p.empDisc?' · emp. discount ₹'+esc(p.empDisc):''}</div><div class="mut">${ruleTxt(catRules(p.type,p.lot,p.hi))}</div>
<div class="btns"><button id="apall">Select all</button><button id="apnone">Clear</button></div>`:''}</div>`;
if(p){const cats=p.type==='SME'?['Retail','sHNI','bHNI','Employee','Shareholder']:CATS;
html+=db.accounts.map(c=>{const r=AP.rows[c.id],a=lotAmt(p,r.cat,r.lots),w=lotWarn(p,r.cat,r.lots),bal=c.balance!==undefined&&c.balance!==''?+c.balance:null,used=acctUse(c.id,AP.ipo),
free=bal==null?null:bal-used,over=r.on&&free!=null&&a>free;const lo=[...new Set([...LOTOPTS,defLots(p,r.cat),r.lots])].sort((x,y)=>x-y);
return`<div class="card aprow${r.on?' on':''}"><label class="chk"><input type="checkbox" data-c="${c.id}"${r.on?' checked':''}> <b>${esc(c.name)}</b>${r.ex?' <span class="badge">applied</span>':''}</label>
<div class="apgrid"><select data-cat="${c.id}">${cats.map(k=>`<option${k===r.cat?' selected':''}>${k}</option>`).join('')}</select>
<div class="step"><button data-m="${c.id}">−</button><select data-l="${c.id}">${lo.map(n=>`<option value="${n}"${n===r.lots?' selected':''}>${n} lot${n>1?'s':''}</option>`).join('')}<option value="c">Custom…</option></select><button data-p="${c.id}">+</button></div></div>
<div class="row"><b>${inr(a)}</b>${bal!=null?`<span class="mut ${over?'neg':''}">Free ${inr(free)} of ${inr(bal)}${used?' · in use '+inr(used):''}</span>`:used?`<span class="mut">In use ${inr(used)}</span>`:''}</div>
${w?`<div class="neg mut">⚠️ ${esc(w)}</div>`:''}${over?'<div class="neg mut">⚠️ Over this account\'s free balance</div>':''}</div>`}).join('');
const sel=db.accounts.filter(c=>AP.rows[c.id].on),tot=sel.reduce((s,c)=>s+lotAmt(p,AP.rows[c.id].cat,AP.rows[c.id].lots),0),pool=+pref('pool')||0,
av=pool?pool-db.apps.filter(a=>a.ipo!==AP.ipo).reduce((s,a)=>s+blocked(a)+tied(a),0):null;
html+=`<div class="apfoot"><div><b>${sel.length}</b> account${sel.length===1?'':'s'} · <b>${inr(tot)}</b>${av!=null?`<div class="mut ${tot>av?'neg':''}">Pool free ${inr(av)}</div>`:''}</div><button class="pri" id="apsave"${sel.length?'':' disabled'}>Save</button></div>`}
v.innerHTML=html;
$('#api').onchange=e=>{let k=e.target.value;if(k.startsWith('live:')){k=linkLive(k.slice(5));save()}AP.ipo=k;if(k)initRows();render()};
if(!p)return;const R=id=>AP.rows[id],re=()=>{const y=scrollY;render();scrollTo(0,y)};
$('#apall').onclick=()=>{db.accounts.forEach(c=>R(c.id).on=true);re()};$('#apnone').onclick=()=>{db.accounts.forEach(c=>R(c.id).on=false);re()};
v.querySelectorAll('[data-c]').forEach(e=>e.onchange=()=>{R(e.dataset.c).on=e.checked;re()});
v.querySelectorAll('[data-cat]').forEach(e=>e.onchange=()=>{const r=R(e.dataset.cat);r.cat=e.value;r.lots=defLots(p,r.cat);r.on=true;re()});
v.querySelectorAll('[data-l]').forEach(e=>e.onchange=()=>{const r=R(e.dataset.l);let n=e.value;if(n==='c'){n=prompt('Number of lots',r.lots);if(!n||!(+n>0)){re();return}}r.lots=Math.floor(+n);r.on=true;re()});
v.querySelectorAll('[data-m]').forEach(e=>e.onclick=()=>{const r=R(e.dataset.m);r.lots=Math.max(1,r.lots-1);r.on=true;re()});
v.querySelectorAll('[data-p]').forEach(e=>e.onclick=()=>{const r=R(e.dataset.p);r.lots++;r.on=true;re()});
$('#apsave').onclick=()=>{const sel=db.accounts.filter(c=>R(c.id).on),bad=sel.filter(c=>lotWarn(p,R(c.id).cat,R(c.id).lots));
if(bad.length&&!confirm(`${bad.length} application(s) are outside category limits. Save anyway?`))return;let n=0,u=0;
sel.forEach(c=>{const r=R(c.id),ex=db.apps.find(a=>a.ipo===AP.ipo&&a.acct===c.id);c.lastCat=r.cat;
if(ex){if(ex.cat!==r.cat||+ex.lots!==r.lots){ex.cat=r.cat;ex.lots=String(r.lots);u++}}
else{db.apps.push({id:id(),ipo:AP.ipo,acct:c.id,cat:r.cat,lots:String(r.lots),date:today(),mandate:'Pending',allot:'Awaiting',refund:'no'});n++}});
save();toast(`${n} added · ${u} updated`);go('apps')}}
