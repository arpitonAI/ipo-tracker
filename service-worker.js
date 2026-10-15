const C='ipo-v5',F=['./','index.html','app.js','results.js','cloud-core.js','cloud.js','firebase-config.js','styles.css','manifest.webmanifest','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(F)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);
if(u.origin!==location.origin){if(u.hostname==='www.gstatic.com'&&u.pathname.startsWith('/firebasejs/'))e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(x=>{if(x.ok){const c=x.clone();caches.open(C).then(y=>y.put(e.request,c))}return x})));return}
if(u.pathname.includes('/__/'))return;
if(e.request.url.includes('/data/results.enc.json')){e.respondWith(fetch(e.request,{cache:'no-store'}));return}
if(e.request.url.includes('/data/ipos.json')){e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(C).then(x=>x.put('data/ipos.json',c));return r}).catch(()=>caches.match('data/ipos.json')));return}e.respondWith(fetch(e.request).then(r=>{if(r.ok){const c=r.clone();caches.open(C).then(x=>x.put(e.request,c))}return r}).catch(()=>caches.match(e.request,{ignoreSearch:true})))});
