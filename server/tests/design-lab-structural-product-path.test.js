const test=require('node:test'),assert=require('node:assert/strict'),sharp=require('sharp');
const {runProductPath}=require('./helpers/structural-product-path');
const {consentFixture}=require('./helpers/structural-consent-fixture');
const {capturePortfolioSite}=require('../services/design-lab/portfolio-capture.service');
const {buildStructuralVisionRequest}=require('../services/design-lab/structural-reference.contract');
const previousEnabled=process.env.GUSTO_PORTFOLIO_CAPTURE_ENABLED;
test.after(()=>{if(previousEnabled===undefined)delete process.env.GUSTO_PORTFOLIO_CAPTURE_ENABLED;else process.env.GUSTO_PORTFOLIO_CAPTURE_ENABLED=previousEnabled;});
process.env.GUSTO_PORTFOLIO_CAPTURE_ENABLED='true';
async function fixtureRun(settings={}) {
  const html=settings.html||consentFixture(settings),requests=[];let documentTimeout=false;
  const result=await runProductPath({sourceUrl:'https://fixture.example/',capture:(url,options)=>{
    assert.equal(options.beforeScreenshot,require('../services/design-lab/capture-sanitization.service').sanitizeStructuralCapture);
    assert.equal(options.capturePage,require('../services/design-lab/structural-page-capture.service').captureStructuralPage);
    return capturePortfolioSite(url,{...options,lookup:async()=>({address:'8.8.8.8',family:4}),
      fetchResource:async value=>{requests.push(value);assert.equal(new URL(value).hostname,'fixture.example');
        if(settings.documentTimeout&&!documentTimeout){documentTimeout=true;throw Object.assign(new Error('Initial transport timeout'),{
          code:'ABORT_ERR',cause:{name:'TimeoutError'},redirectsObserved:0,
          transportProof:{responseStarted:false,signalAborted:true,abortReason:'TimeoutError'}});}
        if(new URL(value).pathname==='/slow.webp'){
          await new Promise(resolve=>setTimeout(resolve,8000));
          return {url:value,status:200,headers:{'content-type':'image/webp'},body:await sharp({create:{width:320,height:180,channels:3,background:'#d60'}}).webp().toBuffer()};
        }
        return {url:value,status:200,headers:{'content-type':'text/html'},body:Buffer.from(html)};}});
  }});
  return {...result,requests};
}
test('POST produit complet : API scrollTo du site remplacée par un helper métier, défilement natif certifié sans modifier le site',async()=>{
  const html=consentFixture({}).replace('<!doctype html>',`<!doctype html><script>window.scrollTo=function(target){if(!target.getClientRects)throw new TypeError('r.getClientRects is not a function');};</script>`);
  assert.match(html,/getClientRects/);
  const r=await fixtureRun({html});
  assert.equal(r.analyzerBoundaryCalls,1,r.response.reference.lastError);
  assert.equal(r.response.reference.captureCoverage.reachedEnd,true);
  assert.equal(r.response.reference.captureCoverage.complete,true);
  assert.ok(r.boundary);assert.equal(r.uploads.length,r.boundary.captures.length);
});
test('POST produit complet : backdrop orphelin associé à un consentement caché, nettoyage certifié avant gate puis préparation réelle',async()=>{
  const r=await fixtureRun();
  assert.equal(r.statusCode,200);assert.equal(r.analyzerBoundaryCalls,1,r.response.reference.lastError);
  assert.equal(r.attempts.length,1);assert.equal(r.attempts[0].rawResponse,undefined);
  assert.deepEqual(r.response.reference.analysis,{previous:'preserved'});
  const capture=r.events.find(e=>e.captureDiagnostics),proof=capture.captureDiagnostics.consentBackdrops;
  assert.equal(capture.captureCoverage.complete,true);assert.equal(capture.captureSanitization.blockingOverlayDetected,false);
  assert.equal(capture.captureCoverage.captureStrategy,'sampled');assert.equal(capture.captureCoverage.version,3);
  assert.equal(capture.captureCoverage.visionCleanliness.complete,true);
  assert.equal(proof.complete,true);assert.equal(proof.restorationVerified,true);
  assert.equal(proof.entries.length,1);assert.equal(proof.entries[0].proof.layers[0].reason,'orphaned_hidden_consent_backdrop');
  assert.equal(proof.entries[0].restoration.styles.stylesRestored,true);
  assert.ok(proof.entries[0].proof.layout.checkedNodes>0);
  const prepared=buildStructuralVisionRequest(r.boundary.captures,r.boundary.metadata);
  assert.deepEqual(prepared.manifest,r.boundary.manifest);
  const images=prepared.content.filter(c=>c.type==='input_image');assert.equal(images.length,prepared.manifest.viewOrder.length);
  images.forEach((c,i)=>assert.deepEqual(Buffer.from(c.image_url.split(',')[1],'base64'),r.uploads[r.boundary.captures.findIndex(v=>v.type===prepared.manifest.viewOrder[i])]));
  const top=r.boundary.captures.findIndex(v=>['top','observation1'].includes(v.type));
  assert.ok(top>=0);
  const pixel=async(x,y)=>[...await sharp(r.uploads[top]).extract({left:x,top:y,width:1,height:1}).removeAlpha().raw().toBuffer()];
  assert.ok((await pixel(100,30)).every((c,i)=>Math.abs(c-[17,34,51][i])<=2),'header structurel conservé, tolérance d’encodage WebP');
  const color=await pixel(100,200);assert.ok(color[0]>200&&color[1]>120,'surface sous-jacente réellement peinte, aucun voile noir');
});
test('POST produit complet : surface ambiguë conservée et bloquante, zéro préparation/upload/analyzer',async()=>{
  const r=await fixtureRun({ambiguous:true});
  assert.equal(r.response.reference.status,'blocked_by_overlay');assert.equal(r.analyzerBoundaryCalls,0);
  assert.equal(r.attempts.length,0);assert.equal(r.uploads.length,0);
  assert.equal(r.response.reference.captureSanitization.blockingOverlays[0].areaRatio,1);
  assert.deepEqual(r.response.reference.analysis,{previous:'preserved'});
});
test('POST produit complet : association sémantique insuffisante si le masquage altère le layout, blocage conservé',async()=>{
  const r=await fixtureRun({coupled:true});
  assert.equal(r.response.reference.status,'blocked_by_overlay');assert.equal(r.analyzerBoundaryCalls,0);
  assert.equal(r.attempts.length,0);assert.equal(r.uploads.length,0);
});
test('POST produit complet : même certification pour un backdrop apparaissant tard dans le parcours',async()=>{
  const r=await fixtureRun({late:true});
  assert.equal(r.analyzerBoundaryCalls,1,r.response.reference.lastError);assert.equal(r.attempts[0].rawResponse,undefined);
  const capture=r.events.find(e=>e.captureDiagnostics);
  assert.equal(capture.captureDiagnostics.consentBackdrops.complete,true);
  assert.equal(capture.captureDiagnostics.consentBackdrops.restorationVerified,true);
  assert.equal(capture.captureCoverage.complete,true);
});
test('POST produit complet : une source peinte modifiée par le masquage reste refusée',async()=>{
  const r=await fixtureRun({sourceCoupled:true});
  assert.equal(r.response.reference.status,'blocked_by_overlay');assert.equal(r.analyzerBoundaryCalls,0);
  assert.equal(r.attempts.length,0);assert.equal(r.uploads.length,0);
});
test('POST produit complet : réaction asynchrone au masque modifiant une source peinte également refusée',async()=>{
  const r=await fixtureRun({asyncSourceCoupled:true});
  assert.equal(r.response.reference.status,'blocked_by_overlay');assert.equal(r.analyzerBoundaryCalls,0);assert.equal(r.uploads.length,0);
});
test('POST produit complet : image visible lente déjà en transfert, attente certifiée sans second téléchargement ni élargissement des 5 s',async()=>{
  const r=await fixtureRun({lateImage:true});
  assert.equal(r.analyzerBoundaryCalls,1,r.response.reference.lastError);
  assert.equal(r.requests.filter(u=>u.endsWith('/slow.webp')).length,1);
  const diagnostics=r.events.find(e=>e.captureDiagnostics).captureDiagnostics;
  const gates=diagnostics.imageGates;
  assert.ok(gates.some(g=>g.transportSettlement?.previousGate.maxWaitMs===5000));
  assert.ok(gates.every(g=>g.resources.every(v=>!v.refused)));
});
test('POST produit complet : navigation initiale récupérée avant livraison Chromium, un seul document réellement livré',async()=>{
  const r=await fixtureRun({documentTimeout:true});assert.equal(r.analyzerBoundaryCalls,1,r.response.reference.lastError);
  assert.equal(r.requests.filter(u=>u==='https://fixture.example/').length,2);
  const resources=r.events.find(e=>e.captureDiagnostics).captureDiagnostics.resources;
  assert.equal(resources.navigations.filter(n=>n.url==='https://fixture.example/').length,1);
  assert.equal(resources.recoveries.length,1);assert.equal(resources.recoveries[0].outcome,'completed');
});
test('POST produit complet : lazy préchargée par le site dans une Image détachée, transfert existant attendu sans activation artificielle',async()=>{
  const r=await fixtureRun({detachedLazy:true});assert.equal(r.analyzerBoundaryCalls,1,r.response.reference.lastError);
  assert.equal(r.requests.filter(u=>u.endsWith('/slow.webp')).length,1);
  const gates=r.events.find(e=>e.captureDiagnostics).captureDiagnostics.imageGates;
  const settled=gates.find(g=>g.transportSettlement?.previousGate.resources.some(v=>v.pendingTransferUrl));
  assert.ok(settled,'une source visible vide doit être reliée au transfert détaché engagé par le site');
  const prior=settled.transportSettlement.previousGate.resources.find(v=>v.pendingTransferUrl);
  assert.equal(prior.source.currentSrc,'');assert.equal(prior.source.src,null);assert.equal(prior.complete,true);
  assert.equal(prior.naturalWidth,0);assert.equal(prior.pendingTransferUrl,'https://fixture.example/slow.webp');
  assert.ok(settled.resources.some(v=>v.source.currentSrc==='https://fixture.example/slow.webp'&&v.naturalWidth===320));
  assert.equal(settled.transportSettlement.previousGate.maxWaitMs,5000);
});
test('POST produit complet : simple data-src sans déclencheur ni transfert demeure bloquant, aucune source forcée',async()=>{
  const r=await fixtureRun({untriggeredLazy:true});assert.equal(r.analyzerBoundaryCalls,0);
  assert.equal(r.response.reference.status,'incomplete_page_capture');assert.equal(r.uploads.length,0);
  assert.equal(r.requests.filter(u=>u.endsWith('/slow.webp')).length,0);
});
test('POST produit complet : attribution logicielle prouvée nettoyée dans tous les buffers, navigation latérale conservée ; preuve manquante bloquante',async()=>{
  const html=`<meta name="generator" content="Studio Tool"><style>
    body{margin:0}header{position:fixed;left:0;top:0;width:306px;height:100vh;background:#123;color:white;z-index:10}
    main{margin-left:306px}section{height:900px}#credit{position:fixed;right:12px;bottom:12px;width:160px;height:28px;background:red;z-index:100}
    </style><header><nav><a href="/">Home</a><a href="#end">Contact</a></nav></header><main>
    <section style="background:#dfb">Introduction</section><section style="background:#bdf">Story</section>
    <section style="background:#fbd">Team</section><section style="background:#dbc" id="end">Footer</section></main>
    <a id="credit" href="https://studio-tool.example/" aria-label="Made in Studio Tool">Made in Studio Tool</a>`;
  const r=await fixtureRun({html});assert.equal(r.analyzerBoundaryCalls,1,r.response.reference.lastError);
  const diagnostics=r.events.find(e=>e.captureDiagnostics).captureDiagnostics;
  assert.ok(diagnostics.visionCleanup.visits.every(v=>v.verified&&v.restored));
  assert.ok(diagnostics.visionCleanup.visits.every(v=>v.suppressed.some(p=>p.mechanisms.includes('document_generator_attribution'))));
  const prepared=buildStructuralVisionRequest(r.boundary.captures,r.boundary.metadata);
  assert.deepEqual(prepared.manifest,r.boundary.manifest);
  for(const c of prepared.content.filter(c=>c.type==='input_image')){
    const {data,info}=await sharp(Buffer.from(c.image_url.split(',')[1],'base64')).removeAlpha().raw().toBuffer({resolveWithObject:true});
    let red=0,nav=0;for(let i=0;i<data.length;i+=info.channels){
      if(data[i]>200&&data[i+1]<40&&data[i+2]<40)red++;
      if(Math.abs(data[i]-17)<8&&Math.abs(data[i+1]-34)<8&&Math.abs(data[i+2]-51)<8)nav++;
    }
    assert.equal(red,0,'aucun badge rouge dans les octets Vision, storyboard compris');
    assert.ok(nav>0,'navigation structurelle préservée dans les octets Vision');
  }
  const refused=await fixtureRun({html:html.replace('content="Studio Tool"','content="Unrelated Tool"')});
  assert.equal(refused.analyzerBoundaryCalls,0);assert.equal(refused.uploads.length,0);assert.equal(refused.attempts.length,0);
  const failure=refused.events.find(e=>e.visionCleanliness?.reason==='ambiguous_layer');
  assert.equal(failure.visionCleanliness.ambiguous[0].evidence.element.id,'credit');
  assert.deepEqual(refused.response.reference.analysis,{previous:'preserved'});
});
test('POST produit complet : gestion persistante du consentement, nettoyage de tous les octets Vision et refus sans rattachement CMP',async()=>{
  const html=`<style>body{margin:0}header{position:fixed;top:0;width:100%;height:60px;background:#123;color:white;z-index:10}
    section{height:700px}#cmp{position:fixed;bottom:0;width:100%;height:220px;background:white;z-index:30}
    #preferences{position:fixed;right:16px;bottom:16px;width:38px;height:38px;background:#ff0000;z-index:100;display:none}</style>
    <header><nav>Structural navigation</nav></header><main>${['#dfb','#bdf','#fbd','#dbc','#aaf'].map((c,i)=>`<section style="background:${c}">Structural section ${i}</section>`).join('')}</main>
    <div id="cmp" role="alertdialog"><p>We use cookies for tracking with your consent.</p><a id="policy" href="#policy">Cookie policy</a><button id="accept">Accept all</button></div>
    <button id="preferences" title="Your tracking consent preferences"><span>Your tracking consent preferences</span></button>
    <script>(()=>{const preferences=document.querySelector('#preferences');
      document.querySelector('#policy').addEventListener('click',()=>{});
      document.querySelector('#accept').addEventListener('click',()=>{document.querySelector('#cmp').remove();preferences.style.display='block';});
      preferences.addEventListener('click',()=>{throw Error('Passive certification must never click preferences');});
    })();</script>`;
  const r=await fixtureRun({html});assert.equal(r.analyzerBoundaryCalls,1,r.response.reference.lastError);
  const e=r.events.find(e=>e.captureDiagnostics),visits=e.captureDiagnostics.visionCleanup.visits;
  assert.ok(visits.every(v=>v.verified&&v.restored));
  assert.ok(visits.every(v=>v.suppressed.length===1&&v.suppressed[0].mechanisms.includes('consent_preferences_event_provenance')));
  assert.equal(e.captureSanitization.consentPreferences.certified,1);
  const prepared=buildStructuralVisionRequest(r.boundary.captures,r.boundary.metadata);
  assert.deepEqual(prepared.manifest,r.boundary.manifest);
  for(const c of prepared.content.filter(c=>c.type==='input_image')){
    const {data,info}=await sharp(Buffer.from(c.image_url.split(',')[1],'base64')).removeAlpha().raw().toBuffer({resolveWithObject:true});
    let red=0,header=0;for(let i=0;i<data.length;i+=info.channels){
      if(data[i]>200&&data[i+1]<40&&data[i+2]<40)red++;
      if(Math.abs(data[i]-17)<8&&Math.abs(data[i+1]-34)<8&&Math.abs(data[i+2]-51)<8)header++;
    }
    assert.equal(red,0,'aucune préférence rouge dans les entrées Vision, overview comprise');
    assert.ok(header>0,'header conservé');
  }
  const rejected=await fixtureRun({html:html.replace('We use cookies for tracking with your consent.','Subscribe to our newsletter.').replace('>Accept all<','>Subscribe<')});
  assert.equal(rejected.analyzerBoundaryCalls,0);assert.equal(rejected.uploads.length,0);assert.equal(rejected.attempts.length,0);
});
test('POST produit complet : contrôle de gestion CMP délégué 162×50, contrat entièrement propre ; callback étranger toujours bloquant',async()=>{
  const register="const delegate=(selector,callback)=>document.addEventListener('click',event=>{event.target.closest(selector)&&callback(event)});";
  const preferenceBinding="delegate('#preferences',()=>{throw Error('Certification must never open preferences');});";
  const html=`<style>body{margin:0}header{position:fixed;top:0;width:100%;height:60px;background:#123;color:white;z-index:10}
    section{height:900px}#cmp{position:fixed;bottom:0;left:0;width:100%;height:220px;background:white;z-index:100}
    #preferences{position:fixed;right:40px;bottom:-35px;width:162px;height:50px;background:red;z-index:100;display:none}</style>
    <header><nav>Structural navigation</nav></header><main>${['#dfb','#bdf','#fbd','#dbc'].map((color,i)=>`<section style="background:${color}">Composition ${i}</section>`).join('')}</main>
    <div role="dialog" aria-modal="true" id="cmp"><p>We use cookies for tracking with your consent.</p><button id="accept">Accept all</button><button>Deny</button></div>
    <div><button id="preferences">Gestisci consenso</button></div>
    <script>(()=>{${register}delegate('#accept',()=>{document.querySelector('#cmp').style.display='none';document.querySelector('#preferences').style.display='block';});${preferenceBinding}})();</script>`;
  const r=await fixtureRun({html});assert.equal(r.analyzerBoundaryCalls,1,r.response.reference.lastError);
  const e=r.events.find(e=>e.captureDiagnostics),visits=e.captureDiagnostics.visionCleanup.visits;
  assert.equal(e.captureCoverage.complete,true);assert.equal(e.captureCoverage.reachedEnd,true);
  assert.equal(e.captureSanitization.consentPreferences.certified,1);
  assert.ok(visits.every(v=>v.verified&&v.restored&&v.suppressed.length===1));
  assert.ok(visits.every(v=>v.suppressed[0].consentProof.controlBinding.kind==='guarded_delegated_click'));
  const prepared=buildStructuralVisionRequest(r.boundary.captures,r.boundary.metadata);assert.deepEqual(prepared.manifest,r.boundary.manifest);
  for(const [index,c] of prepared.content.filter(c=>c.type==='input_image').entries()){
    const bytes=Buffer.from(c.image_url.split(',')[1],'base64');
    assert.deepEqual(bytes,r.uploads[r.boundary.captures.findIndex(v=>v.type===prepared.manifest.viewOrder[index])]);
    const {data,info}=await sharp(bytes).removeAlpha().raw().toBuffer({resolveWithObject:true});let red=0,header=0;
    for(let i=0;i<data.length;i+=info.channels){if(data[i]>200&&data[i+1]<40&&data[i+2]<40)red++;
      if(Math.abs(data[i]-17)<8&&Math.abs(data[i+1]-34)<8&&Math.abs(data[i+2]-51)<8)header++;}
    assert.equal(red,0,'aucun bouton CMP dans les pixels du contrat, overview comprise');assert.ok(header>0,'header préservé');
  }
  const rejected=await fixtureRun({html:html.replace(preferenceBinding,'')+`<script>(()=>{${register}${preferenceBinding}})();</script>`});
  assert.equal(rejected.analyzerBoundaryCalls,0);assert.equal(rejected.uploads.length,0);assert.equal(rejected.attempts.length,0);
  const failure=rejected.events.find(e=>e.status==='failed');
  assert.equal(failure.error.code,'uncertified_vision_layer');assert.equal(failure.visionCleanliness.reason,'ambiguous_layer');
});
