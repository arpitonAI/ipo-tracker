'use strict';
/* Bulk apply + capital tracking. Loaded before app.js; only uses app globals at runtime. */
const cmpN=(a,b)=>String(a||'').localeCompare(String(b||''),'en',{sensitivity:'base',numeric:true});
const accs=()=>[...db.accounts].sort((a,b)=>cmpN(a.name,b.name));
const LOTOPTS=[1,2,3,4,5,10];
const unitPx=(p,cat)=>Math.max(0,(+p.hi||0)-(cat==='Employee'?(+p.empDisc||0):0));
const lotAmt=(p,cat,lots)=>(+lots||0)*(+p.lot||0)*unitPx(p,cat);
const tied=a=>a.allot==='Allotted'&&a.sold!=='yes'?(+a.shares||0)*issuePx(ipo(a.ipo),a.cat):0;
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
return`<div class="btns"><button class="pri big2" id="bulk">➕ Apply to IPO</button><button class="pri big2" id="allotb">🎯 Enter allotment</button></div>
<div class="card"><div class="row"><b>💰 Capital</b><button id="pool">${pool?'Pool '+inr(pool)+' ✏️':'Set capital pool'}</button></div>
<div class="grid"><div class="stat">Blocked<b>${inr(bl)}</b></div><div class="stat">In allotted shares<b>${inr(td)}</b></div>
${pool?`<div class="stat">Available<b class="${av>=0?'pos':'neg'}">${inr(av)}</b></div><div class="stat">bHNI @ ₹10L<b>${Math.max(0,Math.floor(av/1e6))} acct${Math.floor(av/1e6)===1?'':'s'}</b></div>`:''}</div>
${Object.keys(per).length?`<div class="mut" style="margin-top:6px">Blocked per IPO</div>`+Object.entries(per).sort((a,b)=>b[1]-a[1]).map(([i,v])=>`<div class="row"><span>${esc(ipo(i).name)}</span><b>${inr(v)}</b></div>`).join(''):''}
${Object.keys(tiedPer).length?`<div class="mut" style="margin-top:6px">Held shares (until marked sold)</div>`+Object.entries(tiedPer).map(([i,v])=>`<div class="row"><span>${esc(ipo(i).name)}</span><b>${inr(v)}</b></div>`).join(''):''}</div>`}
function bindCapital(){const b=$('#bulk');if(b)b.onclick=()=>openApply();const ab=$('#allotb');if(ab)ab.onclick=()=>openAllot();const p=$('#pool');if(p)p.onclick=()=>{const v=prompt('Total capital pool (₹), blank to clear',pref('pool')||'');if(v===null)return;
setPref('pool',String(v).replace(/[^0-9.]/g,''));render()}}
function markSold(aid){const a=db.apps.find(x=>x.id===aid);if(!a)return;const v=prompt(`Sell price per share for ${a.shares} shares (₹)`,a.sell||a.listp||'');if(v===null||!+v)return;
a.sell=String(+v);a.sold='yes';save();toast('Marked sold · capital freed');render()}
/* ---- Bulk apply screen ---- */
let AP={ipo:'',rows:{},mode:'grid'};
function openApply(ipoId){AP={ipo:ipoId||'',rows:{},mode:AP.mode||'grid'};if(ipoId){initRows();gridInit()}go('apply')}
function apIpo(){return AP.ipo?ipo(AP.ipo):null}
function initRows(){const p=apIpo();AP.rows={};accs().forEach(c=>{const ex=db.apps.find(a=>a.ipo===AP.ipo&&a.acct===c.id);
const cat=ex?ex.cat:(c.lastCat||'bHNI');AP.rows[c.id]={on:!!ex,cat,lots:ex?+ex.lots:defLots(p,cat),ex:!!ex}})}
function renderApply(v){if(!db.accounts.length){v.innerHTML='<div class="card">Add your accounts first (Accounts tab).</div>';return}
const opts=[...(live?live.ipos.filter(x=>liveStatus(x)!=='closed'&&!db.ipos.some(p=>p.liveId===x.id)).map(x=>['live:'+x.id,'🔴 '+x.name+' ('+liveStatus(x)+')']):[]),
...[...db.ipos].sort((a,b)=>(b.open||'').localeCompare(a.open||'')).map(p=>[p.id,p.name])];
const p=apIpo();let html=`<div class="card"><label>IPO</label><select id="api"><option value="">Choose IPO…</option>${opts.map(([k,l])=>`<option value="${esc(k)}"${k===AP.ipo?' selected':''}>${esc(l)}</option>`).join('')}</select>
${p?`<div class="mut">₹${esc(p.hi)} upper · lot ${esc(p.lot)} (${inr(p.lot*p.hi)})${+p.empDisc?' · emp. discount ₹'+esc(p.empDisc):''}</div><div class="mut">${ruleTxt(catRules(p.type,p.lot,p.hi))}</div>
<div class="fchips"><button class="${AP.mode==='grid'?'pri':''}" data-mode="grid">▦ Tick grid</button><button class="${AP.mode==='cards'?'pri':''}" data-mode="cards">☰ Cards</button></div>${AP.mode==='cards'?'<div class="btns"><button id="apall">Select all</button><button id="apnone">Clear</button></div>':''}`:''}</div>`;
if(p&&AP.mode==='grid'){renderGrid(v,p,html);$('#api').onchange=e=>{let k=e.target.value;if(k.startsWith('live:')){k=linkLive(k.slice(5));save()}AP.ipo=k;if(k){initRows();gridInit()}render()};v.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{AP.mode=b.dataset.mode;if(AP.mode==='cards')initRows();else gridInit();render()});return}
if(p){const cats=p.type==='SME'?['Retail','sHNI','bHNI','Employee','Shareholder']:CATS;
html+=accs().map(c=>{const r=AP.rows[c.id],a=lotAmt(p,r.cat,r.lots),w=lotWarn(p,r.cat,r.lots),bal=c.balance!==undefined&&c.balance!==''?+c.balance:null,used=acctUse(c.id,AP.ipo),
free=bal==null?null:bal-used,over=r.on&&free!=null&&a>free;const lo=[...new Set([...LOTOPTS,defLots(p,r.cat),r.lots])].sort((x,y)=>x-y);
return`<div class="card aprow${r.on?' on':''}"><label class="chk"><input type="checkbox" data-c="${c.id}"${r.on?' checked':''}> <b>${esc(c.name)}</b>${r.ex?' <span class="badge">applied</span>':''}</label>
<div class="apgrid"><select data-cat="${c.id}">${cats.map(k=>`<option${k===r.cat?' selected':''}>${k}</option>`).join('')}</select>
<div class="step"><button data-m="${c.id}">−</button><select data-l="${c.id}">${lo.map(n=>`<option value="${n}"${n===r.lots?' selected':''}>${n} lot${n>1?'s':''}</option>`).join('')}<option value="c">Custom…</option></select><button data-p="${c.id}">+</button></div></div>
<div class="row"><b>${inr(a)}</b>${bal!=null?`<span class="mut ${over?'neg':''}">Free ${inr(free)} of ${inr(bal)}${used?' · in use '+inr(used):''}</span>`:used?`<span class="mut">In use ${inr(used)}</span>`:''}</div>
${w?`<div class="neg mut">⚠️ ${esc(w)}</div>`:''}${over?'<div class="neg mut">⚠️ Over this account\'s free balance</div>':''}</div>`}).join('');
const sel=accs().filter(c=>AP.rows[c.id].on),tot=sel.reduce((s,c)=>s+lotAmt(p,AP.rows[c.id].cat,AP.rows[c.id].lots),0),pool=+pref('pool')||0,
av=pool?pool-db.apps.filter(a=>a.ipo!==AP.ipo).reduce((s,a)=>s+blocked(a)+tied(a),0):null;
html+=`<div class="apfoot"><div><b>${sel.length}</b> account${sel.length===1?'':'s'} · <b>${inr(tot)}</b>${av!=null?`<div class="mut ${tot>av?'neg':''}">Pool free ${inr(av)}</div>`:''}</div><button class="pri" id="apsave"${sel.length?'':' disabled'}>Save</button></div>`}
v.innerHTML=html;
$('#api').onchange=e=>{let k=e.target.value;if(k.startsWith('live:')){k=linkLive(k.slice(5));save()}AP.ipo=k;if(k){initRows();gridInit()}render()};
if(!p)return;v.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{AP.mode=b.dataset.mode;if(AP.mode==='cards')initRows();else gridInit();render()});const R=id=>AP.rows[id],re=()=>{const y=scrollY;render();scrollTo(0,y)};
$('#apall').onclick=()=>{accs().forEach(c=>R(c.id).on=true);re()};$('#apnone').onclick=()=>{accs().forEach(c=>R(c.id).on=false);re()};
v.querySelectorAll('[data-c]').forEach(e=>e.onchange=()=>{R(e.dataset.c).on=e.checked;re()});
v.querySelectorAll('[data-cat]').forEach(e=>e.onchange=()=>{const r=R(e.dataset.cat);r.cat=e.value;r.lots=defLots(p,r.cat);r.on=true;re()});
v.querySelectorAll('[data-l]').forEach(e=>e.onchange=()=>{const r=R(e.dataset.l);let n=e.value;if(n==='c'){n=prompt('Number of lots',r.lots);if(!n||!(+n>0)){re();return}}r.lots=Math.floor(+n);r.on=true;re()});
v.querySelectorAll('[data-m]').forEach(e=>e.onclick=()=>{const r=R(e.dataset.m);r.lots=Math.max(1,r.lots-1);r.on=true;re()});
v.querySelectorAll('[data-p]').forEach(e=>e.onclick=()=>{const r=R(e.dataset.p);r.lots++;r.on=true;re()});
$('#apsave').onclick=()=>{const sel=accs().filter(c=>R(c.id).on),bad=sel.filter(c=>lotWarn(p,R(c.id).cat,R(c.id).lots));
if(bad.length&&!confirm(`${bad.length} application(s) are outside category limits. Save anyway?`))return;let n=0,u=0;
sel.forEach(c=>{const r=R(c.id),ex=db.apps.find(a=>a.ipo===AP.ipo&&a.acct===c.id);c.lastCat=r.cat;
if(ex){if(ex.cat!==r.cat||+ex.lots!==r.lots){ex.cat=r.cat;ex.lots=String(r.lots);u++}}
else{db.apps.push({id:id(),ipo:AP.ipo,acct:c.id,cat:r.cat,lots:String(r.lots),date:today(),mandate:'Pending',allot:'Awaiting',refund:'no'});n++}});
save();toast(`${n} added · ${u} updated`);go('apps')}}
/* ---- Bulk allotment entry ---- */
const issuePx=(p,cat)=>Math.max(0,(+p.finalPx||+p.hi||0)-(cat==='Employee'?(+p.empDisc||0):0));
const appliedSh=a=>(+a.lots||0)*(+ipo(a.ipo).lot||0);
let AL={ipo:'',v:{}};
function openAllot(ipoId){AL={ipo:ipoId||'',v:{}};if(ipoId)initAllot();go('allot')}
function initAllot(){AL.v={};db.apps.filter(a=>a.ipo===AL.ipo).forEach(a=>AL.v[a.id]=a.allot==='Allotted'?String(+a.shares||0):a.allot==='Not allotted'?'0':'')}
function alCalc(a){const s=AL.v[a.id],p=ipo(a.ipo),max=appliedSh(a),ap=amt(a);if(s===''||s==null)return{pend:true,ap,max};
const n=Number(s),bad=!Number.isInteger(n)||n<0||n>max;const deb=bad?0:n*issuePx(p,a.cat);return{n,bad,ap,max,deb,rel:bad?0:ap-deb}}
function alFoot(L){let sh=0,deb=0,rel=0,k=0,bad=0;L.forEach(a=>{const c=alCalc(a);if(c.pend)return;if(c.bad){bad++;return}sh+=c.n;deb+=c.deb;rel+=c.rel;if(c.n>0)k++});
return`<div><b>${k}</b> of ${L.length} allotted · ${sh} sh<div class="mut">Debited <b>${inr(deb)}</b> · Released <b>${inr(rel)}</b></div>${bad?`<div class="neg mut">${bad} invalid</div>`:''}</div><button class="pri" id="alsave"${bad?' disabled':''}>Save</button>`}
function renderAllot(v){const ips=[...db.ipos].filter(p=>db.apps.some(a=>a.ipo===p.id)).sort((a,b)=>(b.close||'').localeCompare(a.close||''));
const p=AL.ipo?ipo(AL.ipo):null,L=p?db.apps.filter(a=>a.ipo===AL.ipo).sort((a,b)=>cmpN(acc(a.acct).name,acc(b.acct).name)):[];
let h=`<div class="card"><label>IPO</label><select id="ali"><option value="">Choose IPO…</option>${ips.map(q=>`<option value="${q.id}"${q.id===AL.ipo?' selected':''}>${esc(q.name)}</option>`).join('')}</select>
${p?`<div class="mut">Lot ${esc(p.lot)} · issue price ₹${esc(issuePx(p,''))}${+p.finalPx?' (final)':' (upper band)'}${+p.empDisc?' · emp. ₹'+esc(issuePx(p,'Employee')):''}</div><div class="mut">Enter shares allotted. Blank = pending.</div>`:''}</div>`;
if(p)h+=L.map(a=>{const c=alCalc(a),lot=+p.lot||0;return`<div class="card alrow" data-row="${a.id}"><div class="row"><b>${esc(acc(a.acct).name)}</b><span class="badge">${esc(a.cat)}</span></div>
<div class="mut">${a.lots} lot(s) · ${c.max} sh · applied ${inr(c.ap)}</div>
<div class="alin"><input type="number" inputmode="numeric" min="0" max="${c.max}" step="1" placeholder="Shares" data-sh="${a.id}" value="${esc(AL.v[a.id])}"><button data-q="${a.id}" data-n="0">0</button><button data-q="${a.id}" data-n="${lot}">1 lot</button></div>
<div class="mut" data-out="${a.id}">${alOut(c)}</div></div>`}).join('')+`<div class="apfoot" id="alf">${alFoot(L)}</div>`;
v.innerHTML=h;$('#ali').onchange=e=>{AL.ipo=e.target.value;if(AL.ipo)initAllot();render()};if(!p)return;
const upd=id=>{const a=db.apps.find(x=>x.id===id);v.querySelector(`[data-out="${id}"]`).innerHTML=alOut(alCalc(a));$('#alf').innerHTML=alFoot(L);bindS()};
v.querySelectorAll('[data-sh]').forEach(e=>e.oninput=()=>{AL.v[e.dataset.sh]=e.value.trim();upd(e.dataset.sh)});
v.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>{AL.v[b.dataset.q]=b.dataset.n;v.querySelector(`[data-sh="${b.dataset.q}"]`).value=b.dataset.n;upd(b.dataset.q)});
const bindS=()=>{$('#alsave').onclick=()=>{let n=0;L.forEach(a=>{const c=alCalc(a);if(c.bad)return;
if(c.pend){if(a.allot!=='Awaiting'){a.allot='Awaiting';a.shares='';a.allotSrc='';n++}return}
const st=c.n>0?'Allotted':'Not allotted';if(a.allot!==st||String(+a.shares||0)!==String(c.n)||a.allotSrc!=='manual'){a.allot=st;a.shares=String(c.n);a.allotSrc='manual';if(a.mandate==='Pending')a.mandate='Accepted';n++}});
save();toast(n+' application'+(n===1?'':'s')+' updated');go('dash')}};bindS()}
function alOut(c){return c.pend?'Pending':c.bad?`<span class="neg">⚠️ Enter 0–${c.max} whole shares</span>`:`Debited <b>${inr(c.deb)}</b> · Released <b>${inr(c.rel)}</b>`}
/* ---- Applications by IPO ---- */
const CATORD=['bHNI','sHNI','Retail','Shareholder','Employee'],CATCLR={bHNI:'#7c3aed',sHNI:'#2563eb',Retail:'#059669',Shareholder:'#d97706',Employee:'#db2777'};
const XS=new Set(JSON.parse(sessionStorage.getItem('ipoTracker.x')||'[]'));const xsave=()=>sessionStorage.setItem('ipoTracker.x',JSON.stringify([...XS]));
const chip=c=>`<span class="chip" style="background:${CATCLR[c]||'#64748b'}">${esc(c)}</span>`;
function ipoStatus(p,L){const t=today();if(p.open&&p.open>t)return'Upcoming';if(!p.close||p.close>=t)return'Open';
if(L.some(a=>a.allot==='Awaiting'))return'Closed · awaiting allotment';return p.listd&&p.listd<=t?'Listed':'Allotted'}
function ipoSumCard(p,pre,inner){const L=db.apps.filter(a=>a.ipo===p.id);if(!L.length)return'';const k=pre+p.id;
const cats=[...new Set(L.map(a=>a.cat))].sort((a,b)=>(CATORD.indexOf(a)+99)%99-(CATORD.indexOf(b)+99)%99||a.localeCompare(b));
const bl=L.reduce((s,a)=>s+blocked(a),0),ap=L.reduce((s,a)=>s+amt(a),0),known=L.filter(a=>a.allot!=='Awaiting'),got=L.filter(a=>a.allot==='Allotted');
const line=cats.map(c=>L.filter(a=>a.cat===c).length+' '+c).join(' + ')+' = '+L.length+' application'+(L.length>1?'s':'');
const used=new Set(L.map(a=>a.acct)),miss=accs().filter(c=>!used.has(c.id));
const ban=(id,head,body)=>`<div class="ban${XS.has(id)?' open':''}" data-x="${esc(id)}"><div class="banh">${head}<span class="car">▸</span></div><div class="banb">${body}</div></div>`;
return(inner?'<div class="ipos">':`<div class="card ipos"><div class="row"><b>${esc(p.name)}</b><span class="badge">${esc(ipoStatus(p,L))}</span></div>
<div class="mut">${fd(p.open)} – ${fd(p.close)}${p.allotd?' · Allot '+fd(p.allotd):''}${p.listd?' · List '+fd(p.listd):''}</div>
`)+`<div class="sumline">${esc(line)}</div><div class="mut">Applied <b>${inr(ap)}</b>${bl?` · Blocked <b>${inr(bl)}</b>`:''}${known.length?` · Allotted <b>${got.length}</b> of ${L.length}${known.length<L.length?` (${L.length-known.length} pending)`:''}`:''}</div>
${cats.map(c=>{const C=L.filter(a=>a.cat===c).sort((a,b)=>cmpN(acc(a.acct).name,acc(b.acct).name)),sub=C.reduce((s,a)=>s+amt(a),0),g=C.filter(a=>a.allot==='Allotted').length;
return ban(k+'|'+c,`${chip(c)}<span class="bant"><b>${C.length}</b> · ${inr(sub)}${g?` · ✅ ${g}`:''}</span>`,C.map(a=>`<div class="per"><div class="row"><span>${esc(acc(a.acct).name)}</span><b>${inr(amt(a))}</b></div>
<div class="mut">${a.lots} lot${+a.lots>1?'s':''} · ${appliedSh(a)} sh · ${a.allot==='Allotted'?`✅ ${+a.shares||0} sh allotted`:a.allot==='Not allotted'?'❌ Not allotted':'⏳ Awaiting'}</div></div>`).join(''))}).join('')}
${pre==='d:'?'':ban(k+'|acc',`<span class="bant">👥 Accounts used <b>${used.size}</b> of ${db.accounts.length}</span>`,miss.length?`<div class="mut">Not applied:</div>`+miss.map(c=>`<div class="per">${esc(c.name)}</div>`).join(''):'<div class="mut">All accounts applied</div>')}</div>`}
function ipoSection(){const t=today(),P=db.ipos.filter(p=>db.apps.some(a=>a.ipo===p.id));
const act=p=>(!p.close||p.close>=t)||db.apps.some(a=>a.ipo===p.id&&a.allot==='Awaiting');
const A=P.filter(act).sort((a,b)=>(a.close||'9').localeCompare(b.close||'9')),Z=P.filter(p=>!act(p)).sort((a,b)=>(b.close||'').localeCompare(a.close||''));
if(!P.length)return'';return`<h3 class="sec">Applications by IPO</h3>${A.map(p=>ipoSumCard(p,'d:')).join('')||'<div class="card mut">No active IPOs</div>'}
${Z.length?`<div class="ban card${XS.has('past')?' open':''}" data-x="past"><div class="banh"><b>Past IPOs (${Z.length})</b><span class="car">▸</span></div><div class="banb">${Z.map(p=>ipoSumCard(p,'d:')).join('')}</div></div>`:''}`}
function bindBan(v){v.querySelectorAll('[data-x]').forEach(e=>{e.querySelector('.banh').onclick=ev=>{ev.stopPropagation();const k=e.dataset.x;e.classList.toggle('open');e.classList.contains('open')?XS.add(k):XS.delete(k);xsave()}})}
/* ---- Who applied tab ---- */
function whoIpos(){const t=today(),P=db.ipos.filter(p=>db.apps.some(a=>a.ipo===p.id));const act=p=>(!p.close||p.close>=t)||db.apps.some(a=>a.ipo===p.id&&a.allot==='Awaiting');
return[...P.filter(act).sort((a,b)=>(b.open||'').localeCompare(a.open||'')),...P.filter(p=>!act(p)).sort((a,b)=>(b.close||'').localeCompare(a.close||''))]}
const catsOf=L=>[...new Set(L.map(a=>a.cat))].sort((a,b)=>(CATORD.indexOf(a)+99)%99-(CATORD.indexOf(b)+99)%99||a.localeCompare(b));
const WX=new Set();let whoPast=false;
function whoCard(p){const L=db.apps.filter(a=>a.ipo===p.id),cats=catsOf(L),ppl=cats.flatMap(c=>L.filter(a=>a.cat===c).map(a=>[acc(a.acct).name,c]).sort((x,y)=>cmpN(x[0],y[0]))),
N=8,open=WX.has(p.id),show=open?ppl:ppl.slice(0,N);
return`<div class="kcard" data-k="${p.id}"><b class="kt">${esc(p.name.replace(/\s+(ltd|limited)\.?$/i,''))}</b><div class="ks">${esc(cats.map(c=>L.filter(a=>a.cat===c).length+' '+c).join(' + '))}</div>
${show.map(([n,c])=>`<div class="kp"><span>${esc(n)}</span><i class="kc" style="background:${CATCLR[c]||'#64748b'}">${esc(c)}</i></div>`).join('')}
${ppl.length>N?`<button class="kmore" data-kx="${p.id}">${open?'Show less':'… +'+(ppl.length-N)}</button>`:''}</div>`}
function renderWho(v){const P=whoIpos();if(!P.length){v.innerHTML='<div class="card mut">No applications yet.</div>';return}
let sel=sessionStorage.getItem('ipoTracker.who');
if(!sel||!P.some(p=>p.id===sel)){const t=today(),act=p=>(!p.close||p.close>=t)||db.apps.some(a=>a.ipo===p.id&&a.allot==='Awaiting'),A=P.filter(act),Z=P.filter(p=>!act(p));
v.innerHTML=`<div class="kgrid">${A.map(whoCard).join('')}</div>${A.length?'':'<div class="card mut">No active IPOs</div>'}
${Z.length?`<button class="kpast" id="kpast">${whoPast?'Hide':'Show'} past IPOs (${Z.length})</button>${whoPast?`<div class="kgrid">${Z.map(whoCard).join('')}</div>`:''}`:''}`;
v.querySelectorAll('[data-k]').forEach(e=>e.onclick=()=>{sessionStorage.setItem('ipoTracker.who',e.dataset.k);render();scrollTo(0,0)});
v.querySelectorAll('[data-kx]').forEach(b=>b.onclick=ev=>{ev.stopPropagation();const k=b.dataset.kx;WX.has(k)?WX.delete(k):WX.add(k);render()});
const kp=$('#kpast');if(kp)kp.onclick=()=>{whoPast=!whoPast;render()};return}const p=ipo(sel),L=db.apps.filter(a=>a.ipo===sel);
const cats=[...new Set(L.map(a=>a.cat))].sort((a,b)=>(CATORD.indexOf(a)+99)%99-(CATORD.indexOf(b)+99)%99||a.localeCompare(b));
const used=new Set(L.map(a=>a.acct)),miss=accs().filter(c=>!used.has(c.id)).sort((a,b)=>cmpN(a.name,b.name));
v.innerHTML=`<div class="chips"><button class="ipochip" data-w="">◀ All</button>${P.map(q=>`<button class="ipochip${q.id===sel?' on':''}" data-w="${q.id}">${esc(q.name.replace(/\s+(ltd|limited)\.?$/i,''))}</button>`).join('')}</div>
<div class="card"><div class="sumline">${esc(cats.map(c=>L.filter(a=>a.cat===c).length+' '+c).join(' + ')+' = '+L.length)}</div><div class="mut">${esc(p.name)}</div></div>
${cats.map(c=>`<div class="whoh">${esc(c)} · ${L.filter(a=>a.cat===c).length}</div><div class="card whol">${L.filter(a=>a.cat===c).sort((x,y)=>cmpN(acc(x.acct).name,acc(y.acct).name)).map(a=>`<div class="whor" data-app="${a.id}"><span>${esc(acc(a.acct).name)}</span>${chip(c)}</div>`).join('')}</div>`).join('')}
${miss.length?`<div class="whoh mut">Not applied · ${miss.length}</div><div class="card whol mut">${miss.map(c=>`<div class="whor"><span>${esc(c.name)}</span></div>`).join('')}</div>`:''}`;
v.querySelectorAll('[data-w]').forEach(b=>b.onclick=()=>{b.dataset.w?sessionStorage.setItem('ipoTracker.who',b.dataset.w):sessionStorage.removeItem('ipoTracker.who');render()});
v.querySelectorAll('[data-app]').forEach(e=>e.onclick=()=>appForm(e.dataset.app));const on=v.querySelector('.ipochip.on');if(on)on.scrollIntoView({inline:'center',block:'nearest'})}
/* ---- Tick grid (default Apply view) ---- */
const EXCL=['bHNI','sHNI','Retail'],GSHORT={bHNI:'bHNI',sHNI:'sHNI',Retail:'Ret',Shareholder:'Shr',Employee:'Emp'};
function gridInit(){AP.g={};AP.emp=AP.emp||false;accs().forEach(c=>AP.g[c.id]={});
db.apps.filter(a=>a.ipo===AP.ipo).forEach(a=>{(AP.g[a.acct]=AP.g[a.acct]||{})[a.cat]=+a.lots||1})}
function gridCols(p){const emp=AP.emp||+p.empDisc>0||p.empQuota==='yes'||db.apps.some(a=>a.ipo===AP.ipo&&a.cat==='Employee');return['bHNI','sHNI','Retail','Shareholder',...(emp?['Employee']:[])]}
function gridSum(p){const cnt={};let tot=0,n=0;Object.entries(AP.g).forEach(([id,r])=>Object.entries(r).forEach(([c,l])=>{cnt[c]=(cnt[c]||0)+1;n++;tot+=lotAmt(p,c,l)}));
const line=CATORD.filter(c=>cnt[c]).map(c=>cnt[c]+' '+c).join(' + ');return`<div class="gsum"><b>${line?esc(line)+' = '+n:'Nothing ticked'}</b><div class="mut">${inr(tot)} blocked</div></div><button class="pri" id="gsave">Save</button>`}
function renderGrid(v,p,head){const cols=gridCols(p);
v.innerHTML=head+`<table class="tgrid"><thead><tr><th class="gn">Account</th>${cols.map(c=>`<th>${GSHORT[c]}<div class="gl">${defLots(p,c)}L</div></th>`).join('')}</tr></thead><tbody>
${accs().map(c=>{const r=AP.g[c.id]||{};return`<tr><td class="gn" title="${esc(c.name)}">${esc(c.name)}</td>${cols.map(k=>{const on=r[k]!=null,nd=on&&r[k]!==defLots(p,k);
return`<td class="gc${on?' on':''}" data-gc="${c.id}|${k}"><input type="checkbox"${on?' checked':''} data-gt="${c.id}|${k}" aria-label="${esc(c.name)} ${k}">${nd?`<span class="lb">${r[k]}</span>`:''}</td>`}).join('')}</tr>`}).join('')}</tbody></table>
${gridCols(p).includes('Employee')?'':'<button id="gemp" class="mut small">+ Employee column</button>'}<div class="apfoot" id="gfoot">${gridSum(p)}</div>`;
document.documentElement.style.setProperty('--hh',($('header').offsetHeight||56)+'px');
const foot=()=>{$('#gfoot').innerHTML=gridSum(p);$('#gsave').onclick=()=>gridSave(p)};foot();
const ge=$('#gemp');if(ge)ge.onclick=()=>{AP.emp=true;render()};
v.querySelectorAll('[data-gt]').forEach(e=>e.onchange=()=>{const[id,k]=e.dataset.gt.split('|'),r=AP.g[id]=AP.g[id]||{};
if(e.checked){r[k]=defLots(p,k);if(EXCL.includes(k))EXCL.filter(x=>x!==k&&r[x]!=null).forEach(x=>{delete r[x];const o=v.querySelector(`[data-gt="${id}|${x}"]`);if(o){o.checked=false;o.parentNode.classList.remove('on');const b=o.parentNode.querySelector('.lb');if(b)b.remove()}
toast(`${acc(id).name}: ${x} removed – only one of bHNI/sHNI/Retail per PAN`)})}else{delete r[k];const b=e.parentNode.querySelector('.lb');if(b)b.remove()}
e.parentNode.classList.toggle('on',e.checked);foot()});
v.querySelectorAll('[data-gc]').forEach(td=>td.onclick=ev=>{if(ev.target.tagName==='INPUT')return;const[id,k]=td.dataset.gc.split('|'),r=AP.g[id]||{};
if(r[k]==null){const cb=td.querySelector('input');cb.checked=true;cb.dispatchEvent(new Event('change'));return}
const n=prompt(`${acc(id).name} · ${k}: lots`,r[k]);if(n===null)return;const x=Math.floor(+n);if(!(x>0))return;r[k]=x;const w=lotWarn(p,k,x);if(w)toast('⚠️ '+w);
let b=td.querySelector('.lb');if(x===defLots(p,k)){if(b)b.remove()}else{if(!b){b=document.createElement('span');b.className='lb';td.appendChild(b)}b.textContent=x}foot()})}
function gridSave(p){const ex=db.apps.filter(a=>a.ipo===AP.ipo),want=[];Object.entries(AP.g).forEach(([id,r])=>Object.entries(r).forEach(([c,l])=>want.push({acct:id,cat:c,lots:l})));
const del=ex.filter(a=>!want.some(w=>w.acct===a.acct&&w.cat===a.cat));
if(del.length&&!confirm('Remove these applications?\n'+del.map(a=>'• '+acc(a.acct).name+' · '+a.cat).join('\n')))return;
let n=0,u=0;const bad=want.filter(w=>lotWarn(p,w.cat,w.lots)).length;if(bad&&!confirm(bad+' application(s) are outside category limits. Save anyway?'))return;
want.forEach(w=>{const a=ex.find(x=>x.acct===w.acct&&x.cat===w.cat);if(a){if(+a.lots!==w.lots){a.lots=String(w.lots);u++}}
else{db.apps.push({id:id(),ipo:AP.ipo,acct:w.acct,cat:w.cat,lots:String(w.lots),date:today(),mandate:'Pending',allot:'Awaiting',refund:'no'});n++}
if(EXCL.includes(w.cat)){const c=db.accounts.find(x=>x.id===w.acct);if(c)c.lastCat=w.cat}});
const dids=new Set(del.map(a=>a.id));db.apps=db.apps.filter(a=>!dids.has(a.id));
save();toast(`${n} added · ${u} updated · ${del.length} removed`);go('dash')}
