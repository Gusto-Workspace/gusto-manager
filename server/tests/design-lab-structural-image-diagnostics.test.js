const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createResourceDiagnostics}=require('../services/design-lab/structural-resource-diagnostics');
const {waitForPortfolioImages}=require('../services/design-lab/portfolio-capture.service');
test('diagnostic frame : propriétaire caché puis peint, aucun attribut/style ni décision modifié',async t=>{
  const fs=require('node:fs'),chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if(!fs.existsSync(chrome)){t.skip('Chromium unavailable');return;}
  const browser=await require('playwright-core').chromium.launch({executablePath:chrome,headless:true});
  try{
    const p=await browser.newPage({viewport:{width:1440,height:900}});
    await p.setContent('<iframe aria-label="Chat widget" src="about:blank" style="position:fixed;display:none;width:164px;height:56px;right:20px;bottom:20px;border:0"></iframe>');
    const {inspectResourceFrameOwnerDOM}=require('../services/design-lab/structural-resource-diagnostics');
    const before=await p.content(),hidden=await p.locator('iframe').evaluate(inspectResourceFrameOwnerDOM);
    assert.equal(hidden.geometry.width,0);assert.equal(hidden.display,'none');assert.equal(await p.content(),before);
    await p.locator('iframe').evaluate(n=>n.style.display='block');
    const painted=await p.locator('iframe').evaluate(inspectResourceFrameOwnerDOM);
    assert.equal(painted.geometry.width,164);assert.equal(painted.geometry.height,56);
    assert.equal(painted.certified,undefined,'diagnostic de géométrie, jamais certification inventée');
  }finally{await browser.close();}
});
test('diagnostics réseau passifs : transport, cache, erreur HTTP, CORS et abort restent distincts',()=>{
  const page=new EventEmitter();let clock=10;const d=createResourceDiagnostics(page,{now:()=>clock});
  const req=url=>({url:()=>url,resourceType:()=> 'image',method:()=> 'GET',failure:()=>({errorText:'net::ERR_FAILED'})});
  const image=req('https://public.test/image.jpg');page.emit('request',image);d.begin(image,{});d.transportStarted(image,image.url());clock=20;
  d.transportCompleted(image,{status:200,url:image.url(),headers:{},body:Buffer.alloc(12)});d.fulfilled(image,{status:200},false);page.emit('requestfinished',image);
  const cached=req(image.url());page.emit('request',cached);d.fulfilled(cached,{status:200},true);page.emit('requestfinished',cached);
  assert.deepEqual(d.snapshot(image.url()).map(r=>[r.browserState,r.transportState,r.resourceCacheHit]),[['completed','completed',false],['completed','resource_cache',true]]);
  const bad=req('https://public.test/missing.jpg'),error=Object.assign(new Error('Page inaccessible.'),{networkStatus:404});page.emit('request',bad);d.transportFailed(bad,error);d.failed(bad,error);page.emit('requestfailed',bad);
  assert.equal(d.snapshot(bad.url())[0].transportError.status,404);
  const cors=req('https://public.test/cors.jpg');page.emit('request',cors);d.fulfilled(cors,{status:200},false);page.emit('console',{type:()=> 'error',text:()=> `CORS policy blocked ${cors.url()}`});page.emit('requestfailed',cors);
  assert.equal(d.snapshot(cors.url())[0].corsError,true);assert.equal(d.snapshot(cors.url())[0].status,200);
  const stopped=req('https://public.test/video.mp4');page.emit('request',stopped);d.aborted(stopped,'representative_video_already_certified');
  assert.equal(d.snapshot(stopped.url())[0].abortReason,'representative_video_already_certified');
  assert.equal(d.snapshotAll().truncated,false);
});
test('gate : mêmes comptes et sortie anticipée explicitée pour une ressource terminée sans dimensions',async()=>{
  const row={url:'https://public.test/missing.jpg',complete:true,naturalWidth:0,naturalHeight:0,pending:false};
  const page={evaluate:async()=>[row],structuralResourceDiagnostics:{snapshot:()=>[{browserState:'error',status:404}]}};
  const result=await waitForPortfolioImages(page,Date.now()+120000,{visibleOnly:true});
  assert.deepEqual({total:result.total,failed:result.failed,pending:result.pending},{total:1,failed:1,pending:0});
  assert.equal(result.diagnostics.maxWaitMs,5000);assert.equal(result.diagnostics.pollExitReason,'no_pending_resources');
  assert.equal(result.diagnostics.resources[0].refusalReason,'undecoded_dimensions');assert.equal(result.diagnostics.resources[0].network[0].status,404);
});
test('gate : expiration et attente mesurée, aucune promotion artificielle d’un pending',async()=>{
  const row={url:'https://public.test/pending.jpg',complete:false,naturalWidth:0,naturalHeight:0,pending:true};
  const page={evaluate:async()=>[row],waitForTimeout:ms=>new Promise(r=>setTimeout(r,ms)),structuralResourceDiagnostics:{snapshot:()=>[{browserState:'pending'}]}};
  const result=await waitForPortfolioImages(page,Date.now()+45,{visibleOnly:true});
  assert.equal(result.failed,0);assert.equal(result.pending,1);assert.equal(result.diagnostics.pollExitReason,'outer_deadline');
  assert.ok(result.diagnostics.waitedMs>=40);assert.equal(result.diagnostics.resources[0].refused,true);
  assert.equal(result.diagnostics.resources[0].refusalReason,'pending_at_outer_deadline');
});
test('gate : une nouvelle source au rediscovery est signalée, sans nouvelle attente ni retry',async()=>{
  let calls=0;const page={evaluate:async(_fn,args)=>{calls++;return [args.decode?
    {url:'https://public.test/new.jpg',complete:false,naturalWidth:0,pending:true}:
    {url:'https://public.test/old.jpg',complete:true,naturalWidth:1200,pending:false}];},structuralResourceDiagnostics:{snapshot:()=>[]}};
  const result=await waitForPortfolioImages(page,Date.now()+120000,{visibleOnly:true});assert.equal(calls,2);
  assert.equal(result.pending,1);assert.equal(result.diagnostics.pollExitReason,'no_pending_resources');assert.equal(result.diagnostics.resources[0].refusalReason,'pending_after_rediscovery');
});
