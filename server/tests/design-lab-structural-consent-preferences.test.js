const test=require('node:test'),assert=require('node:assert/strict');
const {inspectConsentDOM}=require('../services/design-lab/capture-sanitization.service');
const {observeConsentPreferences}=require('../services/design-lab/structural-consent-preferences.service');
const {structuralObservationDOM,selectionConfig}=require('../services/design-lab/structural-observation-selection');
const {createVisionCleanupController}=require('../services/design-lab/structural-vision-cleanup.service');
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function fixture({label='Le tue preferenze relative al consenso per le tecnologie di tracciamento',differentSource=false,mixed=false,navigation=false,invalidInterface=false,large=false,policyLink=false,wrongPolicy=false,titleOnly=false,delegated=false,unsupportedDelegate=false,manageSize=false}={}){
  return `<style>body{margin:0}header{position:fixed;top:0;width:100%;height:60px;background:#123;z-index:10;color:white}
  main{height:3000px;background:#bdf}#cmp{position:fixed;bottom:0;width:100%;height:200px;z-index:20;background:white}
  #preferences{position:fixed;right:16px;bottom:16px;width:${large?300:manageSize?162:38}px;height:${large?240:manageSize?50:38}px;background:red;z-index:100;display:none}
  #business{position:fixed;left:500px;top:120px;width:160px;height:50px;background:blue}</style>
  <header><nav>Structural navigation ${navigation?'<span id="navigation-slot"></span>':''}</nav></header><main>Page composition</main>
  <div id="cmp" role="alertdialog"><p>${invalidInterface?'Subscribe to our newsletter':'We use cookies for tracking with your consent'}</p><button id="accept">${invalidInterface?'Subscribe':'Accept all'}</button><a id="policy" title="Cookie policy" href="https://legal.example.test/policy-1">${titleOnly?'A tool':'Cookie policy'}</a></div>
  <button id="preferences" title="${label}"><span>${label}</span></button>${mixed?'<button id="business">Save order</button>':''}
  ${policyLink?`<a id="notice" style="position:absolute;top:400px" href="https://legal.example.test/${wrongPolicy?'unrelated':'policy-1'}">Informativa sulla raccolta</a>`:''}
  <script>(()=>{
  window.preferenceClicks=0;const pref=document.querySelector('#preferences');
  const open=()=>{window.preferenceClicks++;};
  const accept=()=>{document.querySelector('#cmp').remove();pref.style.display='block';};
  ${delegated?`const delegate=(selector,callback)=>document.addEventListener('click',event=>{${unsupportedDelegate?'if(event.target.closest(selector))callback(event);':'event.target.closest(selector)&&callback(event)'}});
    delegate('#accept',accept);${differentSource?'':"delegate('#preferences',open);"}${mixed?"delegate('#business',()=>{});":''}`:
    `document.querySelector('#policy').addEventListener('click',()=>{});document.querySelector('#accept').addEventListener('click',accept);
    ${differentSource?'':"pref.addEventListener('click',open);"}${mixed?"document.querySelector('#business').addEventListener('click',()=>{});":''}`}
  ${policyLink?"document.querySelector('#notice').addEventListener('click',()=>{});":''}
  ${navigation?"document.querySelector('#navigation-slot').append(pref);":''}
  })();</script>${differentSource?(delegated?"<script>const register=(selector,callback)=>document.addEventListener('click',event=>{event.target.closest(selector)&&callback(event)});register('#preferences',()=>{window.preferenceClicks++;});</script>":"<script>document.querySelector('#preferences').addEventListener('click',()=>{window.preferenceClicks++;});</script>"):''}`;
}
async function inspectAndDismiss(page,options){
  await page.setContent(fixture(options));const token='test-consent';
  await page.evaluate(inspectConsentDOM,{token});
  const sources=await observeConsentPreferences(page,{token,mode:'sources',deadline:Date.now()+15000});
  await page.locator('#accept').click();
  assert.equal(await page.locator('#cmp').count(),0,'le dialogue initial a réellement disparu');
  assert.equal(await page.locator('#preferences').evaluate(n=>getComputedStyle(n).display),'block');
  const controls=await observeConsentPreferences(page,{token,mode:'controls',deadline:Date.now()+15000});
  const measured=await page.evaluate(structuralObservationDOM,{position:0,config:selectionConfig()});
  return {sources,controls,measured,cleanup:createVisionCleanupController(page,{token:'vision-test',config:selectionConfig()})};
}
test('Chromium : gestion de consentement certifiée par provenance générique, refus conservateurs',async t=>{
  const browser=await require('playwright-core').chromium.launch({executablePath:chrome,headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});await page.route('**/*',r=>r.abort());
  try{
    await t.test('sémantique + interface initiale + même binding CMP : seule la préférence masquée/restaurée, aucun clic supplémentaire',async()=>{
      const {sources,controls,measured,cleanup}=await inspectAndDismiss(page,{});
      assert.ok(sources.sourceWitnesses>0);assert.equal(controls.certified,1);
      await cleanup.capture(measured.positioned,{position:0},'traversal',async()=>{
        assert.equal(await page.locator('#preferences').evaluate(n=>getComputedStyle(n).visibility),'hidden');
        assert.equal(await page.locator('header').evaluate(n=>getComputedStyle(n).visibility),'visible');
        return Buffer.from('pixels');
      });
      assert.equal(cleanup.visits[0].suppressed.length,1);
      assert.deepEqual(cleanup.visits[0].suppressed[0].mechanisms,['consent_preferences_event_provenance']);
      assert.equal(cleanup.summary().restorationVerified,true);
      assert.equal(await page.locator('#preferences').evaluate(n=>getComputedStyle(n).visibility),'visible');
      assert.equal(await page.evaluate(()=>window.preferenceClicks),0);
    });
    await t.test('gestion du consentement 162×50 : acceptation et préférence déléguées, preuve des callbacks sans clic supplémentaire',async()=>{
      const {sources,controls,measured,cleanup}=await inspectAndDismiss(page,{delegated:true,manageSize:true,label:'Gestisci consenso'});
      assert.equal(sources.sourceWitnesses,1);assert.equal(controls.certified,1);
      assert.equal(controls.attestations[0].controlBinding.kind,'guarded_delegated_click');
      assert.equal(controls.attestations[0].controlBinding.selector,'#preferences');
      await cleanup.capture(measured.positioned,{position:0},'traversal',async()=>{
        assert.equal(await page.locator('#preferences').evaluate(n=>getComputedStyle(n).visibility),'hidden');
        assert.equal(await page.locator('header').evaluate(n=>getComputedStyle(n).visibility),'visible');return Buffer.from('pixels');
      });
      assert.equal(cleanup.visits[0].suppressed.length,1);assert.equal(cleanup.summary().restorationVerified,true);
      assert.equal(await page.locator('#preferences').evaluate(n=>getComputedStyle(n).visibility),'visible');
      assert.equal(await page.evaluate(()=>window.preferenceClicks),0);
    });
    await t.test('Manage consent : sémantique de gestion également valide avec binding direct attesté',async()=>{
      const {controls}=await inspectAndDismiss(page,{label:'Manage consent',manageSize:true});assert.equal(controls.certified,1);
    });
    for(const [name,settings] of [
      ['petit bouton inconnu', {label:'An unknown control'}],
      ['label consentement sans association : source différente',{differentSource:true}],
      ['interface initiale newsletter, aucune preuve CMP générique',{invalidInterface:true}],
      ['bundle partagé avec interface métier',{mixed:true}],
      ['grand panneau : ne pas extrapoler une certification de bouton',{large:true}],
      ['lien extérieur différent du document CMP même si même script',{policyLink:true,wrongPolicy:true}],
      ['attribution avec title évoquant une policy sans libellé explicite',{policyLink:true,titleOnly:true}],
      ['gestion métier sans sémantique consentement',{delegated:true,label:'Manage booking',manageSize:true}],
      ['tracking métier : ne pas assimiler le suivi de commandes au consentement',{delegated:true,label:'Manage tracking orders',manageSize:true}],
      ['consentement délégué sans callback de la source CMP',{delegated:true,differentSource:true,label:'Gestisci consenso',manageSize:true}],
      ['source CMP déléguée également utilisée par une interface métier',{delegated:true,mixed:true,label:'Gestisci consenso',manageSize:true}],
      ['dispatcher non certifiable : ne pas interpréter un corps arbitraire',{delegated:true,unsupportedDelegate:true,label:'Gestisci consenso',manageSize:true}],
      ['grand panneau délégué : géométrie périphérique inchangée',{delegated:true,large:true,label:'Gestisci consenso'}],
    ])await t.test(name+' reste bloqué sans capture',async()=>{
      const {controls,measured,cleanup}=await inspectAndDismiss(page,settings);assert.equal(controls.certified,0);
      let shots=0;await assert.rejects(cleanup.capture(measured.positioned,{position:0},'traversal',()=>{shots++;}),
        e=>e.code==='uncertified_vision_layer'&&e.visionCleanliness.reason==='ambiguous_layer');
      assert.equal(shots,0);assert.equal(await page.locator('#preferences').evaluate(n=>getComputedStyle(n).visibility),'visible');
    });
    await t.test('contrôle de navigation conservé, même libellé et source',async()=>{
      const {controls,measured,cleanup}=await inspectAndDismiss(page,{navigation:true});assert.equal(controls.certified,0);
      await cleanup.capture(measured.positioned,{position:0},'fixed',async()=>{
        assert.equal(await page.locator('#preferences').evaluate(n=>getComputedStyle(n).visibility),'visible');return Buffer.from('pixels');
      });assert.equal(cleanup.visits[0].suppressed.length,0);
    });
    await t.test('navigation avec dispatch délégué et libellé explicite : jamais neutralisée',async()=>{
      const {controls,measured,cleanup}=await inspectAndDismiss(page,{delegated:true,navigation:true,label:'Gestisci consenso',manageSize:true});
      assert.equal(controls.certified,0);
      await cleanup.capture(measured.positioned,{position:0},'fixed',async()=>{
        assert.equal(await page.locator('#preferences').evaluate(n=>getComputedStyle(n).visibility),'visible');return Buffer.from('pixels');
      });assert.equal(cleanup.visits[0].suppressed.length,0);
    });
    await t.test('lien vers le document CMP exact : ne contredit pas le rattachement, reste visible',async()=>{
      const {controls,measured,cleanup}=await inspectAndDismiss(page,{policyLink:true});
      assert.equal(controls.certified,1);assert.equal(controls.mixedSourceCount,0);
      assert.equal(controls.associatedPolicyBindings.length,1);
      await cleanup.capture(measured.positioned,{position:0},'traversal',async()=>{
        assert.equal(await page.locator('#notice').evaluate(n=>getComputedStyle(n).visibility),'visible');
        assert.equal(await page.locator('#preferences').evaluate(n=>getComputedStyle(n).visibility),'hidden');
        return Buffer.from('pixels');
      });assert.equal(cleanup.visits[0].suppressed.length,1);
    });
    await t.test('preuve invalidée si le libellé change',async()=>{
      await inspectAndDismiss(page,{});
      await page.evaluate(()=>{const n=document.querySelector('#preferences');n.title='An unknown control';n.textContent='An unknown control';});
      const controls=await observeConsentPreferences(page,{token:'test-consent',mode:'controls',deadline:Date.now()+15000});
      assert.equal(controls.certified,0);
      const measured=await page.evaluate(structuralObservationDOM,{position:0,config:selectionConfig()});
      await assert.rejects(createVisionCleanupController(page,{token:'vision-test',config:selectionConfig()}).capture(measured.positioned,{position:0},'fixed',()=>Buffer.from('pixels')),
        e=>e.code==='uncertified_vision_layer');
    });
    await t.test('même libellé sur un nouveau noeud sans binding : aucune réutilisation de preuve',async()=>{
      await inspectAndDismiss(page,{});
      await page.evaluate(()=>{const n=document.querySelector('#preferences');n.replaceWith(n.cloneNode(true));});
      const controls=await observeConsentPreferences(page,{token:'test-consent',mode:'controls',deadline:Date.now()+15000});
      assert.equal(controls.certified,0);
      const measured=await page.evaluate(structuralObservationDOM,{position:0,config:selectionConfig()});
      await assert.rejects(createVisionCleanupController(page,{token:'vision-test',config:selectionConfig()}).capture(measured.positioned,{position:0},'fixed',()=>Buffer.from('pixels')),
        e=>e.code==='uncertified_vision_layer');
    });
    await t.test('provenance CDP indisponible : demeure non certifié, jamais accepté par le seul texte',async()=>{
      const context=await browser.newContext({viewport:{width:1440,height:900}}),other=await context.newPage(),original=context.newCDPSession;
      await other.route('**/*',r=>r.abort());
      context.newCDPSession=async()=>{throw Error('Event provenance unavailable');};
      try{
        const {controls,measured,cleanup}=await inspectAndDismiss(other,{});
        assert.equal(controls.certified,0);assert.equal(controls.unproven,'event_provenance_unavailable');
        await assert.rejects(cleanup.capture(measured.positioned,{position:0},'fixed',()=>Buffer.from('pixels')),
          e=>e.code==='uncertified_vision_layer');
      }finally{context.newCDPSession=original;await context.close();}
    });
  }finally{await browser.close();}
});
