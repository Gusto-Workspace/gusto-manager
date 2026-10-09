const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{EventEmitter}=require('node:events'),sharp=require('sharp');
const {parseWebsiteUrl}=require('../services/design-lab/existing-website.service');
const {fetchPublicResource}=require('../services/design-lab/portfolio-capture.service');
const {createStructuralResourcePolicy,STRUCTURAL_RESOURCE_LIMITS}=require('../services/design-lab/structural-resource-policy');
const {waitForMainPaint,assertPaintedBatch}=require('../services/design-lab/structural-paint.service');
const {isVideoResourceDOM,installVideoCaptureDOM,visibleVideoDOM,restoreVideoDOM,verifyVideoDOM}=require('../services/design-lab/structural-video.service');
const publicLookup=async()=>[{address:'93.184.215.14',family:4}];
test('URL saisie toujours bornée ; requête de contenu longue uniquement avec limite interne bornée, SSRF inchangée',async()=>{
 const url='https://public.test/data?query='+ 'a'.repeat(3100);
 assert.throws(()=>parseWebsiteUrl(url));assert.throws(()=>parseWebsiteUrl(url,{maxLength:Infinity}));
 const r=await fetchPublicResource(url,{maxUrlLength:16384,lookup:publicLookup,request:async()=>({status:200,headers:{},body:Buffer.from('{}')})});assert.equal(r.url,url);
 await assert.rejects(fetchPublicResource('https://public.test/q?x='+'a'.repeat(16384),{maxUrlLength:16384}));
 await assert.rejects(fetchPublicResource(url,{maxUrlLength:16384,lookup:async()=>[{address:'127.0.0.1',family:4}]}),/non publique/);
});
test('transport : Origin et langue du navigateur conservés ; aucune réponse CORS inventée',async t=>{
 let headers;t.mock.method(require('node:https'),'get',(_url,options,callback)=>{
  headers=options.headers;const req=new EventEmitter();queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=200;res.headers={};callback(res);res.emit('data',Buffer.from('ok'));res.emit('end');});return req;
 });
 const r=await fetchPublicResource('https://public.test/data',{lookup:publicLookup,origin:'https://site.test',acceptLanguage:'fr-FR,fr;q=0.9'});
 assert.equal(headers.Origin,'https://site.test');assert.equal(headers['Accept-Language'],'fr-FR,fr;q=0.9');assert.equal(r.headers['access-control-allow-origin'],undefined);
});
test('vidéo : Range bornée ; CDN ignorant Range interrompu après le préfixe, sans télécharger 40 Mo',async t=>{
 let transferred=0,destroyed=false,range,status=200,headers={'content-length':'40305381','content-type':'video/mp4'};
 t.mock.method(require('node:https'),'get',(_url,options,callback)=>{
  range=options.headers.Range;const req=new EventEmitter();queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=status;res.headers=headers;res.destroy=error=>{destroyed=true;if(error)res.emit('error',error);};callback(res);
   for(let i=0;i<1000&&!destroyed;i++){transferred+=65536;res.emit('data',Buffer.alloc(65536));}
  });return req;
 });
 const p=createStructuralResourcePolicy();const r=await p.videoRange('https://public.test/video.mp4','bytes=0-',fetchPublicResource,{lookup:publicLookup});
 assert.equal(range,'bytes=0-2097151');assert.equal(r.status,206);assert.equal(r.headers['content-range'],'bytes 0-2097151/40305381');
 assert.equal(r.body.length,2097152);assert.equal(transferred,2097152);assert.equal(p.stats.mediaBytes,transferred);assert.ok(destroyed);
 await assert.rejects(p.videoRange('https://public.test/video.mp4','bytes=40000000-',fetchPublicResource,{lookup:publicLookup}),e=>e.code==='structural_video_range_unsupported');
 destroyed=false;headers={'content-type':'video/mp4'};
 await assert.rejects(p.videoRange('https://public.test/unknown.mp4','bytes=0-',fetchPublicResource,{lookup:publicLookup}),e=>e.code==='structural_video_range_unsupported');assert.ok(destroyed);
 destroyed=false;status=206;headers={'content-type':'video/mp4','content-length':'1048576','content-range':'bytes 0-1048575/40305381'};
 await assert.rejects(p.videoRange('https://public.test/oversized-part.mp4','bytes=0-1048575',fetchPublicResource,{lookup:publicLookup}),/Ressource trop volumineuse|structural_media_budget_exceeded/);assert.ok(destroyed);
});
test('vidéo : budget par source et budgets globaux actifs, cache par plage et protection contre nombreux médias',async()=>{
 const p=createStructuralResourcePolicy();let calls=0;
 const fetch=async(url,o)=>{calls++;const n=o.byteRange.end-o.byteRange.start+1;o.accountBytes(n);return {url,status:206,headers:{},body:Buffer.alloc(n)};};
 await p.videoRange('https://public.test/a.mp4','bytes=0-1048575',fetch,{});await p.videoRange('https://public.test/a.mp4','bytes=0-1048575',fetch,{});assert.equal(calls,1);
 for(let i=1;i<7;i++)await p.videoRange('https://public.test/a.mp4',`bytes=${i*1048576}-${(i+1)*1048576-1}`,fetch,{});
 await p.videoRange('https://public.test/a.mp4','bytes=0-1048575',fetch,{});assert.equal(calls,7);
 await assert.rejects(p.videoRange('https://public.test/a.mp4','bytes=7340032-',fetch,{}),e=>e.limitKind==='videoRepresentative');
 const tiny=createStructuralResourcePolicy({...STRUCTURAL_RESOURCE_LIMITS,mediaTotal:1048576});await tiny.videoRange('https://public.test/b.mp4','bytes=0-524287',fetch,{});
 await assert.rejects(tiny.videoRange('https://public.test/c.mp4','bytes=0-',fetch,{}),e=>e.limitKind==='mediaTotal');
 const noStream=createStructuralResourcePolicy();const buffered=async(url,o)=>({url,status:206,headers:{},body:Buffer.alloc(o.byteRange.end-o.byteRange.start+1)});
 for(let i=0;i<7;i++)await noStream.videoRange('https://public.test/d.mp4',`bytes=${i*1048576}-${(i+1)*1048576-1}`,buffered,{});
 assert.equal(noStream.stats.mediaBytes,7*1048576);assert.equal(noStream.videoBytes.get('https://public.test/d.mp4'),7*1048576);
 await assert.rejects(noStream.videoRange('https://public.test/d.mp4','bytes=7340032-',buffered,{}),e=>e.limitKind==='videoRepresentative');
 assert.equal(STRUCTURAL_RESOURCE_LIMITS.total,208*1048576);assert.equal(STRUCTURAL_RESOURCE_LIMITS.image,32*1048576);
});
test('pixels : blanc uniforme refusé ; blanc minimaliste avec petit texte visible accepté',async()=>{
 const white=await sharp({create:{width:1440,height:900,channels:3,background:'white'}}).png().toBuffer();
 await assert.rejects(assertPaintedBatch([white,white]),e=>e.code==='structural_empty_visual_capture');
 const sparse=await sharp(white).composite([{input:Buffer.from('<svg width="1440" height="900"><text x="30" y="60" font-size="16" fill="#444">A</text></svg>')}]).png().toBuffer();
 assert.equal((await assertPaintedBatch([white,sparse]))[1].nonUniform,true);
 const colour=await sharp({create:{width:1440,height:900,channels:3,background:'teal'}}).png().toBuffer();assert.equal((await assertPaintedBatch([white,colour])).length,2);
});
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('Chromium : reveal attendu sans styles forcés ; contenu caché refusé ; espace blanc narratif permis', {skip:!fs.existsSync(chrome)},async()=>{
 const browser=await require('playwright-core').chromium.launch({executablePath:chrome,headless:true});try{const p=await browser.newPage();await p.route('**/*',r=>r.abort());
  await p.setContent('<main style="opacity:0;transition:opacity .3s"><h1>Actual content</h1></main><script>setTimeout(()=>document.querySelector("main").style.opacity=1,180)</script>');
  const proof=await waitForMainPaint(p,Date.now()+2000,{requireContent:true});assert.ok(proof.waitedMs>=100);assert.ok(proof.painted>0);assert.equal(await p.locator('main').getAttribute('style'),'opacity: 1; transition: opacity 0.3s;');
  await p.setContent('<main style="opacity:0"><h1>Hidden</h1></main>');await assert.rejects(waitForMainPaint(p,Date.now()+150,{requireContent:true}),e=>e.code==='structural_main_content_invisible');
  await p.setContent('<main style="height:900px;background:white"></main>');assert.equal((await waitForMainPaint(p,Date.now()+200)).painted,0);
  await p.setContent('<main>Minimal text</main>');assert.ok((await waitForMainPaint(p,Date.now()+200,{requireContent:true})).painted>0);
  await p.setContent('<video><source src="https://public.test/stream.ogg"></video><audio src="https://public.test/audio"></audio>');
  assert.equal(await p.evaluate(isVideoResourceDOM,'https://public.test/stream.ogg'),true);
  assert.equal(await p.evaluate(isVideoResourceDOM,'https://public.test/audio'),false);
 }finally{await browser.close();}
});
test('Chromium : poster réel, frame présentée, pause sans déplacement, intégrité et restauration', {skip:!fs.existsSync(chrome)},async()=>{
 const browser=await require('playwright-core').chromium.launch({executablePath:chrome,headless:true});try{const p=await browser.newPage();await p.route('**/*',r=>r.abort());
  await p.evaluate(installVideoCaptureDOM);
  const poster='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="teal"/></svg>').toString('base64');
  await p.setContent(`<video style="width:320px;height:180px" poster="${poster}"></video>`);let proof=await p.evaluate(visibleVideoDOM);assert.equal(proof[0].mechanism,'native_poster');assert.equal((await p.evaluate(verifyVideoDOM,proof)).valid,true);
  await p.evaluate(()=>{const v=document.querySelector('video');v.preload='none';v.src='https://public.test/deliberate-poster.mp4';});
  await p.waitForFunction(()=>document.querySelector('video').networkState===1,{},{timeout:2000});
  assert.equal((await p.evaluate(visibleVideoDOM))[0].mechanism,'native_poster');
  await p.evaluate(()=>{const v=document.querySelector('video');v.preload='auto';v.src='https://public.test/unresolved.mp4';});
  await assert.rejects(p.evaluate(visibleVideoDOM),/visible_video_unresolved_despite_poster/);
  await p.evaluate(()=>{const v=document.querySelector('video'),fresh=document.createElement('video');fresh.width=320;fresh.height=180;v.replaceWith(fresh);});
  await p.evaluate(async()=>{const video=document.querySelector('video');video.removeAttribute('poster');video.muted=true;video.autoplay=true;
   const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const ctx=canvas.getContext('2d');ctx.fillStyle='teal';ctx.fillRect(0,0,320,180);ctx.fillStyle='red';ctx.fillRect(10,20,70,90);
   const stream=canvas.captureStream(12),recorder=new MediaRecorder(stream,{mimeType:'video/webm'}),chunks=[];
   let frame=0;const redraw=setInterval(()=>{ctx.fillStyle=++frame%2?'blue':'yellow';ctx.fillRect(150,0,20,20);},50);
   // A 300ms wall timer could stop the encoder before it emitted a playable
   // chunk under contention. Await observed encoded data, then retain every
   // frame/pixel/integrity assertion below. This changes only the fixture.
   let timer;const encoded=new Promise((resolve,reject)=>{
    recorder.ondataavailable=e=>{chunks.push(e.data);if(frame>=4&&chunks.reduce((n,c)=>n+c.size,0)>1024)resolve();};
    recorder.onerror=e=>reject(e.error||Error('fixture encoding failed'));
    timer=setTimeout(()=>reject(Error('fixture produced no encoded frames')),5000);
   });
   const stopped=new Promise(resolve=>{recorder.onstop=()=>resolve();});
   try {recorder.start(50);await encoded;recorder.stop();await stopped;}
   finally {clearTimeout(timer);clearInterval(redraw);if(recorder.state!=='inactive')recorder.stop();stream.getTracks().forEach(t=>t.stop());}
   const blob=new Blob(chunks,{type:'video/webm'});video.src=URL.createObjectURL(blob);video.load();await video.play().catch(error=>{error.message+=JSON.stringify({blobBytes:blob.size,currentSrc:video.currentSrc,readyState:video.readyState,mediaError:video.error?.code});throw error;});
  });
  await p.waitForFunction(()=>window.__gustoVideoCapture.records.get(document.querySelector('video'))?.frozen,{},{timeout:5000}).catch(async error=>{
    error.message+=JSON.stringify(await p.evaluate(()=>{const v=document.querySelector('video'),r=window.__gustoVideoCapture.records.get(v);return {record:r,paused:v.paused,readyState:v.readyState,currentTime:v.currentTime,currentSrc:v.currentSrc};}));throw error;
  });proof=await p.evaluate(visibleVideoDOM);
  assert.equal(proof[0].mechanism,'decoded_frame_paused');assert.ok(proof[0].presentedFrames>0);assert.equal(proof[0].paused,true);
  const pausedTime=proof[0].currentTime;
  await p.evaluate(()=>{const r=window.__gustoVideoCapture.records.get(document.querySelector('video'));r.frozen=false;r.presentedFrames=null;});
  proof=await p.evaluate(visibleVideoDOM);assert.ok(proof[0].presentedFrames>0);assert.equal(proof[0].paused,true);assert.ok(Math.abs(proof[0].currentTime-pausedTime)<=.001);
  assert.equal((await p.evaluate(verifyVideoDOM,proof)).valid,true);await p.evaluate(()=>document.querySelector('video').style.width='400px');assert.equal((await p.evaluate(verifyVideoDOM,proof)).valid,false);
  const source=await p.locator('video').getAttribute('src');
  await p.evaluate(({poster,source})=>{document.querySelector('video').style.display='none';const v=document.createElement('video');v.poster=poster;v.src=source;v.preload='auto';v.width=320;v.height=180;document.body.append(v);},{poster,source});
  await p.waitForFunction(()=>document.querySelector('video:last-child').readyState>=2,{},{timeout:5000});
  proof=await p.evaluate(visibleVideoDOM);assert.equal(proof[0].mechanism,'decoded_frame_paused');assert.ok(proof[0].readyState>=2);assert.equal((await p.evaluate(verifyVideoDOM,proof)).valid,true);
  const painted=await p.locator('video:last-child').screenshot(),pixel=[...await sharp(painted).extract({left:20,top:40,width:1,height:1}).removeAlpha().raw().toBuffer()];assert.ok(pixel[0]>240&&pixel[1]<10&&pixel[2]<10,'frame rouge réellement peinte, pas le poster teal');
  const restored=await p.evaluate(restoreVideoDOM);assert.equal(restored.restored,true);assert.equal(await p.evaluate(()=>window.__gustoVideoCapture),undefined);
 }finally{await browser.close();}
});
