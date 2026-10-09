const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const {createStructuralResourcePolicy,STRUCTURAL_RESOURCE_LIMITS}=require('../services/design-lab/structural-resource-policy');
const {inspectCaptureImagesDOM}=require('../services/design-lab/capture-image-visibility');
const {waitForPortfolioImages,fetchPublicResource}=require('../services/design-lab/portfolio-capture.service');
const {installVideoCaptureDOM,visibleVideoDOM}=require('../services/design-lab/structural-video.service');
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const timeout=()=>Object.assign(new Error('The operation was aborted'),{name:'AbortError',code:'ABORT_ERR',cause:{name:'TimeoutError'}});
const response=url=>({url,status:200,headers:{},body:Buffer.alloc(64)});
test('transport : un seul recovery de timeout image, cache partagé et premier échec conservé',async()=>{
  const p=createStructuralResourcePolicy();let calls=0;const url='https://public.test/photo.webp';
  const fetch=async(value,o)=>{calls++;if(calls===1){o.accountBytes(16);throw timeout();}return response(value);};
  const [a,b]=await Promise.all([p.fetch(url,'image',fetch,{deadline:Date.now()+25000}),p.fetch(url,'image',fetch,{deadline:Date.now()+25000})]);
  assert.equal(a,b);assert.equal(calls,2);assert.equal(p.stats.uniqueRequests,2);assert.equal(p.stats.imageBytes,80);
  assert.equal(p.recoveries.length,1);assert.equal(p.recoveries[0].error.code,'ABORT_ERR');assert.equal(p.recoveries[0].outcome,'completed');
  await p.fetch(url,'image',fetch,{});assert.equal(calls,2);assert.equal(p.failures.has(url),false);
});
test('transport : ressource cassée, annulation volontaire, budget et fin de capture ne sont jamais retriés',async()=>{
  for(const error of [Object.assign(new Error('404'),{networkStatus:404}),Object.assign(new Error('cancelled'),{name:'AbortError',code:'ABORT_ERR'}),Object.assign(new Error('bytes'),{code:'structural_media_budget_exceeded'})]){
    const p=createStructuralResourcePolicy();let calls=0;await assert.rejects(p.fetch('https://public.test/bad.webp','image',async()=>{calls++;throw error;},{deadline:Date.now()+25000}),e=>e===error);assert.equal(calls,1);
  }
  const p=createStructuralResourcePolicy();let calls=0;
  await assert.rejects(p.fetch('https://public.test/late.webp','image',async()=>{calls++;throw timeout();},{deadline:Date.now()+25000,captureDeadline:()=>Date.now()+2000}));assert.equal(calls,1);
});
test('transport : deuxième timeout terminal, plafond requêtes et octets inchangés',async()=>{
  const p=createStructuralResourcePolicy();let calls=0;const fetch=async()=>{calls++;throw timeout();};
  await assert.rejects(p.fetch('https://public.test/bad.webp','image',fetch,{deadline:Date.now()+25000}));
  await assert.rejects(p.fetch('https://public.test/bad.webp','image',fetch,{}));assert.equal(calls,2);
  const tiny=createStructuralResourcePolicy({...STRUCTURAL_RESOURCE_LIMITS,requests:1});calls=0;
  await assert.rejects(tiny.fetch('https://public.test/bad.webp','image',fetch,{deadline:Date.now()+25000}));assert.equal(calls,1);
});
test('transport : dépendance JS d’initialisation récupérable, conservée dans le même cache borné',async()=>{
  const p=createStructuralResourcePolicy();let calls=0;
  await p.fetch('https://public.test/player.js','script',async url=>{calls++;if(calls===1)throw timeout();return response(url);},{deadline:Date.now()+25000});
  assert.equal(calls,2);assert.equal(p.recoveries[0].outcome,'completed');
});
test('transport : GET de navigation initial non livré, un seul recovery de timeout certifié dans la même promesse',async()=>{
  const p=createStructuralResourcePolicy();let calls=0;
  const url='https://public.test/';
  const download=async value=>{calls++;if(calls===1)throw Object.assign(timeout(),{
    transportProof:{responseStarted:false,signalAborted:true,abortReason:'TimeoutError'},redirectsObserved:0});return response(value);};
  const options={navigation:true,allowExternalNavigation:false,deadline:Date.now()+25000};
  const [a,b]=await Promise.all([p.fetch(url,'document',download,options),p.fetch(url,'document',download,options)]);
  assert.equal(a,b);assert.equal(calls,2);assert.equal(p.stats.uniqueRequests,2);
  assert.equal(p.recoveries.length,1);assert.equal(p.recoveries[0].outcome,'completed');
});
test('transport : navigation non certifiée, redirigée, déjà répondue ou sous-frame ne déclenche aucun recovery',async()=>{
  for(const evidence of [{},{redirectsObserved:1,transportProof:{responseStarted:false,signalAborted:true,abortReason:'TimeoutError'}},
    {redirectsObserved:0,transportProof:{responseStarted:true,signalAborted:true,abortReason:'TimeoutError'}},
    {redirectsObserved:0,transportProof:{responseStarted:false,signalAborted:false,abortReason:null}}]){
    const p=createStructuralResourcePolicy();let calls=0;
    await assert.rejects(p.fetch('https://public.test/','document',async()=>{calls++;throw Object.assign(timeout(),evidence);},{navigation:true,deadline:Date.now()+25000}));assert.equal(calls,1);
  }
  const p=createStructuralResourcePolicy();let calls=0;
  await assert.rejects(p.fetch('https://public.test/','document',async()=>{calls++;throw Object.assign(timeout(),{
    redirectsObserved:0,transportProof:{responseStarted:false,signalAborted:true,abortReason:'TimeoutError'}});},
    {navigation:true,allowExternalNavigation:true,deadline:Date.now()+25000}));assert.equal(calls,1);
});
test('transport épinglé : abort horodaté du signal local avant headers, erreur et cause natives conservées',async()=>{
  const https=require('node:https'),{EventEmitter}=require('node:events'),original=https.get;
  let nativeError,signal;
  https.get=(_url,settings)=>{
    const request=new EventEmitter();signal=settings.signal;
    signal.addEventListener('abort',()=>{nativeError=Object.assign(new Error('The operation was aborted'),{
      name:'AbortError',code:'ABORT_ERR',cause:signal.reason});request.emit('error',nativeError);},{once:true});
    setImmediate(()=>{const socket=new EventEmitter();request.emit('socket',socket);socket.emit('connect');socket.emit('secureConnect');});
    return request;
  };
  // Keep the event loop alive; AbortSignal.timeout uses an unref'd timer.
  const keepAlive=setTimeout(()=>{},1000);
  try {
    await assert.rejects(fetchPublicResource('https://public.test/',{navigation:true,rootHostname:'public.test',
      lookup:async()=>({address:'8.8.8.8',family:4}),deadline:Date.now()+45}),error=>{
      assert.equal(error,nativeError);assert.equal(error.cause,signal.reason);assert.equal(error.cause.name,'TimeoutError');
      assert.equal(error.transportProof.stage,'awaiting_headers');assert.equal(error.transportProof.responseStarted,false);
      assert.equal(error.transportProof.signalAborted,true);assert.equal(error.transportProof.abortReason,'TimeoutError');
      assert.ok(error.transportProof.timeoutMs<=45);assert.equal(error.redirectsObserved,0);return true;
    });
  }finally{clearTimeout(keepAlive);https.get=original;}
});
test('transport : navigation conserve les plafonds de temps, requêtes et le second échec terminal',async()=>{
  const error=()=>Object.assign(timeout(),{redirectsObserved:0,transportProof:{responseStarted:false,signalAborted:true,abortReason:'TimeoutError'}});
  for(const [limits,options,expected]of [[STRUCTURAL_RESOURCE_LIMITS,{deadline:Date.now()+1000},1],
    [{...STRUCTURAL_RESOURCE_LIMITS,requests:1},{deadline:Date.now()+25000},1],
    [STRUCTURAL_RESOURCE_LIMITS,{deadline:Date.now()+25000},2]]){
    const p=createStructuralResourcePolicy(limits);let calls=0;
    const fetch=async()=>{calls++;throw error();};
    await assert.rejects(p.fetch('https://public.test/','document',fetch,{navigation:true,...options}));
    await assert.rejects(p.fetch('https://public.test/','document',fetch,{navigation:true,...options}));
    assert.equal(calls,expected);assert.equal(p.stats.uniqueRequests,expected);
  }
});
test('diagnostic transport : socket keep-alive réutilisée sans accumulation de listeners',async()=>{
  const https=require('node:https'),{EventEmitter}=require('node:events'),original=https.get;
  const socket=new EventEmitter();let count=0;
  https.get=(_url,settings)=>{
    const request=new EventEmitter();request.reusedSocket=count++>0;
    settings.signal.addEventListener('abort',()=>{
      request.emit('error',Object.assign(new Error('The operation was aborted'),{name:'AbortError',code:'ABORT_ERR',cause:settings.signal.reason}));
      request.emit('close');
    },{once:true});setImmediate(()=>request.emit('socket',socket));return request;
  };
  const keepAlive=setTimeout(()=>{},1000);
  try {for(let i=0;i<4;i++){
    await assert.rejects(fetchPublicResource('https://public.test/',{lookup:async()=>({address:'8.8.8.8',family:4}),deadline:Date.now()+30}));
    assert.equal(socket.listenerCount('connect'),0);assert.equal(socket.listenerCount('secureConnect'),0);
  }}finally{clearTimeout(keepAlive);https.get=original;}
});
test('attente : seuls transferts existants, dépendances de load/branche image encore inconnue, jamais nouveau téléchargement',async()=>{
  const p=createStructuralResourcePolicy();let release,calls=0;
  const download=p.fetch('https://public.test/actually-selected.webp','image',async url=>{calls++;await new Promise(r=>{release=r;});return response(url);},{});
  await new Promise(r=>setImmediate(r));
  assert.equal(p.pendingFor(['https://public.test/fallback-src.webp']).length,0);
  assert.equal(p.pendingFor(['https://public.test/fallback-src.webp'],false,true).length,1);
  assert.equal(p.pendingFor([''],true).length,1);assert.equal(calls,1);
  release();await download;assert.equal(p.pendingFor([''],true,true).length,0);
});
test('Chromium : source enfant sélectionnable sans currentSrc reste un média à attendre, pas une omission', {skip:!fs.existsSync(chrome)},async()=>{
  const browser=await require('playwright-core').chromium.launch({executablePath:chrome,headless:true});try{
    const page=await browser.newPage();await page.route('**/*',r=>r.abort());
    const rows=await page.evaluate(new Function(`document.body.innerHTML='<video preload="none" style="width:320px;height:180px"><source src="https://public.test/hero.mp4" type="video/mp4"></video>';return (${inspectCaptureImagesDOM.toString()})({visibleOnly:true,diagnostics:true});`));
    assert.equal(rows.length,1);assert.equal(rows[0].url,'https://public.test/hero.mp4');assert.equal(rows[0].pending,true);assert.equal(rows[0].readyState,0);
    const empty=await page.evaluate(new Function(`document.body.innerHTML='<video style="width:320px;height:180px"></video>';return (${inspectCaptureImagesDOM.toString()})({visibleOnly:true,diagnostics:true});`));
    assert.equal(empty.length,1);assert.equal(empty[0].kind,'video_pending_source');assert.equal(empty[0].pending,true);
  }finally{await browser.close();}
});
test('Chromium : vidéo vide en initialisation attendue puis véritable poster peint ; attente de 5 s inchangée', {skip:!fs.existsSync(chrome)},async()=>{
  const browser=await require('playwright-core').chromium.launch({executablePath:chrome,headless:true});try{
    const p=await browser.newPage();await p.evaluate(installVideoCaptureDOM);
    await p.setContent('<video preload="none" style="width:320px;height:180px"></video>');
    const poster='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="teal"/></svg>').toString('base64');
    await p.evaluate(value=>setTimeout(()=>document.querySelector('video').poster=value,250),poster);
    const started=Date.now(),result=await waitForPortfolioImages(p,Date.now()+5000,{visibleOnly:true});
    assert.ok(Date.now()-started>=200);assert.equal(result.pending,0);assert.equal(result.failed,0);
    assert.equal((await p.evaluate(visibleVideoDOM))[0].mechanism,'native_poster');
    const bytes=await p.locator('video').screenshot(),pixel=[...await require('sharp')(bytes).extract({left:160,top:90,width:1,height:1}).removeAlpha().raw().toBuffer()];
    assert.deepEqual(pixel,[0,128,128]);
  }finally{await browser.close();}
});
