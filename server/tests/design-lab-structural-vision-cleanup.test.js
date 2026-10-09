const test=require('node:test'),assert=require('node:assert/strict'),sharp=require('sharp');
const {structuralObservationDOM,selectionConfig}=require('../services/design-lab/structural-observation-selection');
const {createVisionCleanupController,visionLayerDOM}=require('../services/design-lab/structural-vision-cleanup.service');
const {captureStructuralPage}=require('../services/design-lab/structural-page-capture.service');
const {sanitizeStructuralCapture}=require('../services/design-lab/capture-sanitization.service');
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
test('Chromium : nettoyage Vision transactionnel, conservation structurelle et refus explicite',async t=>{
  const browser=await require('playwright-core').chromium.launch({executablePath:chrome,headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});await page.route('**/*',r=>r.abort());
  const content=(extra='')=>`<style>body{margin:0}header{position:sticky;top:0;height:70px;background:#222;color:white;z-index:10}main{height:4000px;background:#88bbcc}section{position:sticky;top:120px;height:240px;width:500px;background:#abc}#promo{position:fixed;left:0;bottom:45px;width:420px;height:250px;background:white;z-index:50}</style>
    <header><nav>Structural navigation</nav></header><main><section>Sticky narrative composition</section><div style="height:700px">Underlying photo and text</div></main>
    <aside id="promo"><p>Special offer</p><button style="visibility:visible!important">Hide</button></aside>${extra}`;
  const inspect=()=>page.evaluate(structuralObservationDOM,{position:0,config:selectionConfig()});
  const controller=()=>createVisionCleanupController(page,{token:'test',config:selectionConfig()});
  const state={position:0};
  try{
    await t.test('promo fixed supprimée ; header sticky et section narrative conservés ; styles restaurés',async()=>{
      await page.setContent(content());const m=await inspect(),c=controller();
      const before=await page.locator('#promo').evaluate(n=>[n,...n.querySelectorAll('*')].map(n=>n.getAttribute('style')||''));
      const buffer=await c.capture(m.positioned,state,'traversal',()=>page.screenshot({type:'png'}));
      assert.deepEqual([...await sharp(buffer).extract({left:100,top:700,width:1,height:1}).removeAlpha().raw().toBuffer()],[136,187,204]);
      assert.deepEqual([...await sharp(buffer).extract({left:100,top:30,width:1,height:1}).removeAlpha().raw().toBuffer()],[34,34,34]);
      assert.equal(await page.locator('section').evaluate(n=>getComputedStyle(n).visibility),'visible');
      assert.deepEqual(await page.locator('#promo').evaluate(n=>[n,...n.querySelectorAll('*')].map(n=>n.getAttribute('style')||'')),before);
      assert.equal(c.visits[0].styleRestoration.stylesRestored,true);
      assert.equal(c.summary().complete,true);assert.equal(c.summary().suppressedOccurrences,1);
      assert.ok(c.visits[0].preserved.some(v=>v.protectedStructure&&v.positionKind==='sticky'));
      assert.equal(await page.evaluate(()=>Boolean(window.__gustoStructuralHidden||window.__gustoVisionLayoutProof)),false);
    });
    await t.test('shadow DOM ouvert imbriqué et descendant visibility visible important masqués',async()=>{
      await page.setContent(content());await page.evaluate(()=>{
        const host=document.createElement('div');document.querySelector('#promo').append(host);
        host.attachShadow({mode:'open'}).innerHTML='<span style="visibility:visible!important">Special discount</span>';
      });
      const c=controller();await c.capture((await inspect()).positioned,state,'fixed',async()=>{
        assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#promo div').shadowRoot.querySelector('span')).visibility),'hidden');
        return Buffer.from('pixels');
      });
      assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#promo div').shadowRoot.querySelector('span')).visibility),'visible');
    });
    await t.test('pseudo-éléments peints et override important : masquage borné et styles retirés',async()=>{
      await page.setContent(content('<style>#promo::before{content:"";visibility:visible!important;position:fixed;left:0;bottom:45px;width:420px;height:250px;background:red}</style>'));
      const stylesBefore=await page.locator('style').count(),c=controller();
      const pixels=await c.capture((await inspect()).positioned,state,'traversal',async()=>{
        assert.equal(await page.locator('#promo').evaluate(n=>getComputedStyle(n,'::before').visibility),'hidden');
        return page.screenshot({type:'png'});
      });
      assert.deepEqual([...await sharp(pixels).extract({left:100,top:700,width:1,height:1}).removeAlpha().raw().toBuffer()],[136,187,204]);
      assert.equal(await page.locator('#promo').evaluate(n=>getComputedStyle(n,'::before').visibility),'visible');
      assert.equal(await page.locator('[data-gusto-structural-pseudo-mask]').count(),0);
      assert.equal(await page.locator('style').count(),stylesBefore);
      assert.equal(c.summary().restorationVerified,true);
    });
    await t.test('transition visibility causée par le masque terminée ; autres transitions conservées',async()=>{
      await page.setContent(content('<style>#promo,#promo button{transition:all .6s}</style>'));
      await page.locator('#promo').evaluate(n=>{getComputedStyle(n).backgroundColor;n.style.backgroundColor='#eee';getComputedStyle(n).backgroundColor;});
      const c=controller();await c.capture((await inspect()).positioned,state,'traversal',async()=>{
        assert.equal(await page.locator('#promo').evaluate(n=>getComputedStyle(n).visibility),'hidden');
        assert.equal(await page.locator('#promo button').evaluate(n=>getComputedStyle(n).visibility),'hidden');
        assert.equal(await page.locator('#promo').evaluate(n=>n.getAnimations().some(a=>a.transitionProperty==='background-color'&&a.playState==='running')),true);
        return Buffer.from('pixels');
      });
      assert.equal(await page.locator('#promo button').evaluate(n=>getComputedStyle(n).visibility),'visible');
      assert.ok(c.visits[0].visibilityTransitionsFinished>0);
      assert.equal(c.summary().restorationVerified,true);
    });
    await t.test('texte enfant clippé : preuve sur emprise peinte ; descendant fixe échappé reste contrôlé',async()=>{
      await page.setContent(content().replace('<button style="visibility:visible!important">Hide</button>',
        '<button style="position:relative;overflow:hidden;width:48px;height:48px">Hide<span style="position:absolute;left:-200px;width:200px;height:18px">Special offer</span></button>'));
      const c=controller();await c.capture((await inspect()).positioned,state,'fixed',()=>Buffer.from('pixels'));
      assert.equal(c.summary().complete,true);
      await page.setContent(content().replace('<p>Special offer</p>',
        '<p>Special offer</p><div style="overflow:hidden;width:1px;height:1px"><span style="position:fixed;left:900px;bottom:100px;width:300px;height:120px">Visible escaped composition</span></div>'));
      await assert.rejects(controller().capture((await inspect()).positioned,state,'fixed',()=>Buffer.from('pixels')),e=>e.code==='uncertified_vision_layer');
    });
    await t.test('panneau ambigu : aucun masquage silencieux, aucun screenshot',async()=>{
      await page.setContent(content().replaceAll('promo','floating').replace('Special offer','Unknown composition').replace('>Hide<','>Explore<'));
      const c=controller();let shots=0;
      await assert.rejects(c.capture((await inspect()).positioned,state,'traversal',()=>{shots++;}),e=>{
        assert.equal(e.code,'uncertified_vision_layer');assert.equal(e.visionCleanliness.reason,'ambiguous_layer');
        const rejected=e.visionCleanliness.ambiguous[0];
        assert.equal(rejected.reason,'nonstructural_layer_not_certifiable');
        assert.equal(rejected.evidence.element.id,'floating');
        assert.equal(rejected.evidence.element.style.position,'fixed');
        assert.equal(rejected.evidence.element.style.zIndex,'50');
        assert.equal(rejected.evidence.controls[0].text,'Explore');
        assert.equal(rejected.evidence.signals.interfaceSignal,false);
        assert.ok(rejected.evidence.ancestors.some(n=>n.tag==='body'));
        return true;
      });
      assert.equal(shots,0);assert.equal(await page.locator('#floating').evaluate(n=>getComputedStyle(n).visibility),'visible');
    });
    await t.test('attribution outil externe : trois preuves concordantes, masque vérifié et restauration',async()=>{
      const badge='<a id="credit" href="https://studio-tool.example/" style="position:fixed;right:12px;bottom:12px;width:160px;height:28px;background:white;z-index:100"><img alt="Made in Studio Tool" width="118" height="12" src="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E"></a>';
      const fixture=content().replace(/<aside id="promo">[\s\S]*?<\/aside>/,'')+'<meta name="generator" content="Studio Tool">'+badge;
      await page.setContent(fixture);
      let c=controller();await c.capture((await inspect()).positioned,state,'traversal',async()=>{
        assert.equal(await page.locator('#credit').evaluate(n=>getComputedStyle(n).visibility),'hidden');
        assert.equal(await page.locator('header').evaluate(n=>getComputedStyle(n).visibility),'visible');
        return Buffer.from('pixels');
      });
      assert.ok(c.visits[0].suppressed.some(v=>v.mechanisms.includes('document_generator_attribution')));
      assert.equal(c.summary().restorationVerified,true);
      assert.equal(await page.locator('#credit').evaluate(n=>getComputedStyle(n).visibility),'visible');
      for(const incomplete of [
        fixture.replace('content="Studio Tool"','content="Other Tool"'),
        fixture.replace('https://studio-tool.example/','https://unrelated.example/'),
        fixture.replace('Made in Studio Tool','An external link'),
        fixture.replace('<meta name="generator" content="Studio Tool">',''),
        fixture.replace('href="https://studio-tool.example/"','href="#contact"'),
      ]){
        await page.setContent(incomplete);let shots=0;
        await assert.rejects(controller().capture((await inspect()).positioned,state,'fixed',()=>{shots++;}),
          e=>e.code==='uncertified_vision_layer'&&e.visionCleanliness.reason==='ambiguous_layer');
        assert.equal(shots,0);assert.equal(await page.locator('#credit').evaluate(n=>getComputedStyle(n).visibility),'visible');
      }
      await page.setContent(fixture.replace('<header><nav>Structural navigation</nav></header>',
        '<header><nav>Structural navigation'+badge.replace('id="credit"','id="navigation-credit"')+'</nav></header>').replace(badge,''));
      c=controller();await c.capture((await inspect()).positioned,state,'fixed',async()=>{
        assert.equal(await page.locator('#navigation-credit').evaluate(n=>getComputedStyle(n).visibility),'visible');
        return Buffer.from('pixels');
      });
      assert.equal(c.visits[0].suppressed.length,0);
    });
    await t.test('popup périphérique déclarée sans texte promotionnel : mécanisme générique certifié',async()=>{
      await page.setContent(content().replaceAll('promo','notice').replace('<aside id="notice">','<aside id="notice" class="alerts-container pop-in bottom-left" aria-label="pop-in banner">')
        .replace('Special offer','An announcement').replace('>Hide<','>Explore<'));
      const c=controller();await c.capture((await inspect()).positioned,state,'traversal',()=>Buffer.from('pixels'));
      assert.equal(c.summary().complete,true);
      assert.ok(c.visits[0].suppressed[0].mechanisms.includes('declared_floating_interface'));
      assert.equal(await page.locator('#notice').evaluate(n=>getComputedStyle(n).visibility),'visible');
    });
    await t.test('composition promotionnelle non certifiable : refus, pas de masquage aveugle',async()=>{
      await page.setContent(content().replace('<p>Special offer</p>','<p>Special offer</p><canvas width="300" height="160"></canvas>'));
      const m=await inspect();assert.equal(m.positioned.find(v=>v.rect.width===420).deduplicationEligible,false);
      await assert.rejects(controller().capture(m.positioned,state,'fixed',()=>Buffer.from('pixels')),e=>e.code==='uncertified_vision_layer');
    });
    await t.test('même portée que le collecteur : micro-indicateur animé conservé, rotation structurelle refusée',async()=>{
      await page.setContent(content('<span id="indicator" style="position:absolute;top:400px;left:719px;width:1px;height:500px;background:gray;transform-origin:top;transform:scaleY(.98)"></span>'));
      let c=controller();await c.capture((await inspect()).positioned,state,'fixed',async()=>{
        await page.evaluate(()=>document.querySelector('#indicator').style.transform='scaleY(.99)');return Buffer.from('pixels');
      });
      assert.equal(c.summary().complete,true);
      await page.addStyleTag({content:'body:has(#promo[style*="hidden"]) section{transform:rotate(180deg)}'});
      c=controller();await assert.rejects(c.capture((await inspect()).positioned,state,'fixed',()=>Buffer.from('pixels')),e=>e.code==='uncertified_vision_layer');
    });
    await t.test('échec screenshot ou mutation sous-jacente : restauration et capture refusée',async()=>{
      await page.setContent(content());let c=controller();
      await assert.rejects(c.capture((await inspect()).positioned,state,'fixed',()=>{throw Error('screenshot failed');}),/screenshot failed/);
      assert.equal(await page.locator('#promo button').evaluate(n=>getComputedStyle(n).visibility),'visible');
      await page.addStyleTag({content:'body:has(#promo[style*="hidden"]) section{height:260px}'});
      c=controller();await assert.rejects(c.capture((await inspect()).positioned,state,'fixed',()=>Buffer.from('pixels')),e=>e.code==='uncertified_vision_layer');
      assert.equal(await page.locator('#promo button').evaluate(n=>getComputedStyle(n).visibility),'visible');
      assert.equal(await page.evaluate(()=>Boolean(window.__gustoStructuralHidden||window.__gustoVisionLayoutProof)),false);
    });
  }finally{await browser.close();}
});
test('Chromium : tous les buffers storyboard, fallback, continuous et finales sont propres dès leur capture',async()=>{
  const browser=await require('playwright-core').chromium.launch({executablePath:chrome,headless:true});
  const p=await browser.newPage({viewport:{width:1440,height:900}});await p.route('**/*',r=>r.abort());
  const colors=['#fcaaaa','#aaccff','#bbffbb','#ffee99','#aaffee','#ddbbff'];
  async function run(sampled){
    await p.setContent(`<style>body{margin:0}header{position:fixed;top:0;height:60px;width:100%;background:#222;z-index:20}section{height:700px}canvas{width:1400px;height:550px}#promo{position:fixed;left:0;bottom:45px;width:420px;height:250px;background:white;z-index:50}</style>
      <header>Structural navigation</header><main>${colors.map(c=>`<section style="background:${c}">${sampled?'<canvas width="1400" height="550"></canvas>':''}</section>`).join('')}</main>
      <div id="promo"><p>Special offer</p><button style="visibility:visible!important">Hide</button></div>
      ${sampled?'<div id="moving" style="position:fixed;top:100px;right:0;width:100px;height:100px;background:blue"></div><script>addEventListener("scroll",()=>document.querySelector("#moving").style.transform="translateX(-"+Math.min(180,Math.round(scrollY/20))+"px)")</script>':''}`);
    const trace={},initial=await sanitizeStructuralCapture(p,Date.now()+120000);
    const result=await captureStructuralPage(p,Date.now()+120000,initial,{observationTrace:trace});
    assert.equal(result.captureCoverage.visionCleanliness.complete,true);
    assert.ok(result.captureDiagnostics.visionCleanup.visits.every(v=>v.verified&&v.restored&&v.suppressed.length===1));
    const samples=[...trace.phaseA,...trace.fixedViews];
    for(const v of samples){
      const pixel=[...await sharp(v.buffer).extract({left:100,top:700,width:1,height:1}).removeAlpha().raw().toBuffer()];
      assert.notDeepEqual(pixel,[255,255,255]);
      assert.deepEqual([...await sharp(v.buffer).extract({left:100,top:30,width:1,height:1}).removeAlpha().raw().toBuffer()],[34,34,34]);
    }
    if(sampled){
      assert.equal(result.captureCoverage.observationSelection.mode,'fixed_fallback');
      assert.equal(result.captureDiagnostics.finalRecaptures,0);
      assert.equal(result.captureCoverage.observationSelection.persistentElements.some(v=>v.deduplicationEligible),false);
      for(const panel of result.captureCoverage.storyboard.panels){
        const pixel=[...await sharp(result.buffer).extract({left:panel.rect.x+17,top:panel.rect.y+117,width:1,height:1}).removeAlpha().raw().toBuffer()];
        assert.notDeepEqual(pixel,[255,255,255]);
      }
    }else{
      assert.equal(result.captureCoverage.captureStrategy,'continuous');
      assert.equal((await sharp(result.buffer).metadata()).height,4200);
      for(const v of Object.values(result.viewBuffers))assert.notDeepEqual([...await sharp(v).extract({left:100,top:700,width:1,height:1}).removeAlpha().raw().toBuffer()],[255,255,255]);
    }
    assert.equal(await p.locator('#promo button').evaluate(n=>getComputedStyle(n).visibility),'visible');
  }
  try{await run(true);await run(false);}finally{await browser.close();}
});
