// Cloud sync (Firebase Auth + Firestore). Loaded only when firebase-config.js has a real config.
const V='13.0.0',U=`https://www.gstatic.com/firebasejs/${V}/`;
const [{initializeApp},A,F]=await Promise.all([import(U+'firebase-app.js'),import(U+'firebase-auth.js'),import(U+'firebase-firestore.js')]);
const app=initializeApp(window.FIREBASE_CONFIG),auth=A.getAuth(app);
const fs=F.initializeFirestore(app,{localCache:F.persistentLocalCache({tabManager:F.persistentMultipleTabManager()})});
if(window.FIREBASE_EMULATOR){A.connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});F.connectFirestoreEmulator(fs,'127.0.0.1',8080)}
const COLS={accounts:'accounts',ipos:'ipos',apps:'applications',prefs:'prefs'};
let user=null,uref=null,key=null,vault=null,rsaEnc=null,resEnc=null,err='',unsubs=[],timer=null;
let last={},raw={},firstServer={};
const reset=()=>{last={accounts:{},ipos:{},apps:{},prefs:{}};raw={};firstServer={}};reset();
const sj=o=>JSON.stringify(Object.keys(o).sort().reduce((r,k)=>(r[k]=o[k],r),{}));
const clean=o=>JSON.parse(JSON.stringify(o));
const persist=()=>localStorage.setItem(K,JSON.stringify(db));
let rt=null;const rerender=()=>{clearTimeout(rt);rt=setTimeout(()=>{try{render()}catch(_){}},150)};
function indicator(){const e=document.getElementById('sync');if(!e)return;
e.textContent=!user?'':(navigator.onLine?'☁️':'☁️⏸')+(key||!vault?'':' 🔒');e.title=user?('Signed in as '+(user.email||'')):'';}
const changed=()=>{indicator();if(typeof tab!=='undefined'&&tab==='data')rerender()};
addEventListener('online',changed);addEventListener('offline',changed);

async function onSnap(k,snap){let ch=false;const ids=new Set();
for(const d of snap.docs){ids.add(d.id);if(d.metadata.hasPendingWrites)continue;const data=d.data();raw[d.id]=data;
const i=db[k].findIndex(x=>x.id===d.id),prev=i>=0?db[k][i]:null;
const o=k==='accounts'?await decAccount(key,data,prev):data;o.id=d.id;const s=sj(o);
if(last[k][d.id]===s&&prev)continue;last[k][d.id]=s;if(prev&&sj(prev)===s)continue;
if(i>=0)db[k][i]=o;else db[k].push(o);ch=true}
if(!snap.metadata.fromCache){
for(const id of Object.keys(last[k]))if(!ids.has(id)){delete last[k][id];db[k]=db[k].filter(x=>x.id!==id);ch=true}
if(!firstServer[k]){firstServer[k]=true;queue()}} // first server snapshot: upload local-only items (migration)
if(ch){persist();rerender()}}

async function push(){if(!user)return;
for(const k in COLS){if(!firstServer[k])continue;const col=F.collection(uref,COLS[k]),ids=new Set();
for(const o of db[k]){ids.add(o.id);const s=sj(o);if(last[k][o.id]===s)continue;last[k][o.id]=s;
let p,merge=false;if(k==='accounts'){p=await encAccount(key,o);merge=!p.sensEnc}else p=clean(o);
F.setDoc(F.doc(col,o.id),p,{merge}).catch(e=>{err=e.message;changed()})}
for(const id of Object.keys(last[k]))if(!ids.has(id)){delete last[k][id];F.deleteDoc(F.doc(col,id)).catch(()=>{})}}}
function queue(){clearTimeout(timer);timer=setTimeout(push,400)}

async function afterUnlock(){ // re-decode locked accounts, encrypt any plaintext-only ones, sync RSA key + results
for(const a of db.accounts){const d=raw[a.id];if(d&&d.sensEnc&&a.panLocked){Object.assign(a,await decAccount(key,d));delete a.panLocked}
if(!d||!d.sensEnc)delete last.accounts[a.id]}
persist();queue();
const kb=await keyBackup();
if(rsaEnc&&!kb){try{await restoreKey(JSON.parse(await aesDec(key,rsaEnc)));loadResults(true)}catch(_){}}
else if(kb&&!rsaEnc)Cloud.keyChanged();
applyCloudResults();rerender();changed()}
async function applyCloudResults(){if(!key||!resEnc)return;try{const d=JSON.parse(await aesDec(key,resEnc));
if(!R.updated||(d.updated||'')>=R.updated){R.updated=d.updated||R.updated;const n=applyResults(d.results||[]);if(n){toast(n+' result'+(n>1?'s':'')+' updated');rerender()}}}catch(_){}}

function start(){uref=F.doc(fs,'users',user.uid);
unsubs.push(F.onSnapshot(uref,async s=>{const d=s.data()||{};vault=d.vault||null;
if(!s.exists()&&!s.metadata.fromCache)F.setDoc(uref,{email:user.email||'',created:F.serverTimestamp()},{merge:true});
if(vault&&!key){key=(await kget('sync:'+user.uid))||null;if(key)afterUnlock()}changed()},e=>{err=e.message;changed()}));
unsubs.push(F.onSnapshot(F.doc(uref,'settings','keys'),s=>{rsaEnc=(s.data()||{}).rsaEnc||null}));
unsubs.push(F.onSnapshot(F.doc(uref,'settings','results'),s=>{resEnc=(s.data()||{}).enc||null;applyCloudResults()}));
for(const k in COLS)unsubs.push(F.onSnapshot(F.collection(uref,COLS[k]),{includeMetadataChanges:true},s=>onSnap(k,s),e=>{err=e.message;changed()}))}
function stop(){unsubs.forEach(u=>u());unsubs=[];reset();key=vault=rsaEnc=resEnc=null;uref=null}

window.Cloud={
state:()=>({user:user&&{email:user.email,name:user.displayName},vault:!!vault,unlocked:!!(key&&vault),online:navigator.onLine,err}),
dirty:queue,
async signIn(){err='';const p=new A.GoogleAuthProvider();p.setCustomParameters({prompt:'select_account'});
try{await A.signInWithPopup(auth,p)}catch(e){const c=e.code||'';
if(c==='auth/popup-closed-by-user'||c==='auth/cancelled-popup-request')return;
const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
if(standalone||/popup-blocked|operation-not-supported|web-storage-unsupported/.test(c)){try{await A.signInWithRedirect(auth,p)}catch(e2){err=e2.message}}else err=e.message;changed()}},
async signOut(){await A.signOut(auth)},
async passcode(p){err='';let k;
if(vault)k=await openVault(p,vault);
else{const m=await makeVault(p);await F.setDoc(uref,{vault:m.vault},{merge:true});vault=m.vault;k=m.key}
if(!k)return false;key=k;await kput('sync:'+user.uid,k);await afterUnlock();return true},
async forget(){if(!confirm('Forget the passcode on this phone? PANs will show locked until you enter it again.'))return;
const d=await idb();d.transaction('k','readwrite').objectStore('k').delete('sync:'+user.uid);key=null;
for(const a of db.accounts)if(raw[a.id]&&raw[a.id].sensEnc)Object.assign(a,await decAccount(null,raw[a.id]));persist();rerender();changed()},
async keyChanged(){const kb=await keyBackup();if(!user||!key||!kb)return;rsaEnc=await aesEnc(key,JSON.stringify(kb));
F.setDoc(F.doc(uref,'settings','keys'),{rsaEnc},{merge:true}).catch(()=>{})},
async results(d){if(!user||!key)return;F.setDoc(F.doc(uref,'settings','results'),{enc:await aesEnc(key,JSON.stringify(d)),updated:d.updated||''}).catch(()=>{})}};
if(window.FIREBASE_EMULATOR)Cloud._test=(sub,email)=>A.signInWithCredential(auth,A.GoogleAuthProvider.credential(JSON.stringify({sub,email,email_verified:true})));
A.getRedirectResult(auth).catch(e=>{err=e.message;changed()});
A.onAuthStateChanged(auth,u=>{stop();user=u;if(u)start();changed();rerender()});
