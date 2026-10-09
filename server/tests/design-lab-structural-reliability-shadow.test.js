const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const {selectionConfig,structuralObservationDOM}=require("../services/design-lab/structural-observation-selection");
const {collectAndInspectDOM,buildReliabilityRegistry,applyReliabilityRegistry}=require("../services/design-lab/structural-reliability.service");
const chrome=process.env.GUSTO_PORTFOLIO_CHROME_PATH||"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const config=selectionConfig();
const svg=(overflow=false,top=180)=>`<svg width="360" height="360" style="position:absolute;left:200px;top:${top}px;overflow:visible"><rect x="20" y="20" width="220" height="220" fill="red"/><text x="${overflow?340:70}" y="200" font-size="32">STRUCTURE</text></svg>`;

test("Chromium : registre SVG, overflow, cadrages existants et primitives opaques",{skip:!fs.existsSync(chrome)},async t=>{
  const browser=await require("playwright-core").chromium.launch({executablePath:chrome,headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.route("**/*",r=>r.abort());
  const observe=async(position=0,origin="traversal")=>{
    await page.evaluate(y=>scrollTo(0,y),position);
    const {measures,inspection}=await page.evaluate(collectAndInspectDOM,{position,config});
    assert.deepEqual(measures,await page.evaluate(structuralObservationDOM,{position,config}));
    return {position,origin,observedTotalHeight:2200,measures,inspection,elapsedMs:1};
  };
  try{
    await t.test("SVG débordant : témoin peint réel absent des masses, non fiable",async()=>{
      await page.setContent(`<style>body{margin:0;min-height:2200px}</style>${svg(true)}`);
      const r=await observe(),registry=buildReliabilityRegistry([r],config);
      assert.equal(registry.status,"unreliable");
      assert.ok(registry.entries.some(e=>e.reason==="visible_paint_not_represented"&&e.kind==="svg_text"&&e.point));
      assert.ok(registry.entries.some(e=>e.mechanisms?.includes("svg_descendant_outside_descriptor")));
    });
    await t.test("SVG entièrement représenté : pas de bannissement technologique",async()=>{
      await page.setContent(`<style>body{margin:0;min-height:2200px}</style>${svg(false)}`);
      const r=await observe();assert.equal(buildReliabilityRegistry([r],config).status,"reliable");
    });
    await t.test("SVG affine entièrement représenté : extents natifs certifiables",async()=>{
      await page.setContent(`<style>body{margin:0;min-height:2200px}svg text{transform:rotate(5deg);transform-origin:180px 180px}</style>${svg(false)}`);
      assert.equal(buildReliabilityRegistry([await observe()],config).status,"reliable");
    });
    await t.test("défaut intrinsèque entre cadrages : détecté aux visites existantes sans visiter son ancrage",async()=>{
      await page.setContent(`<style>body{margin:0;min-height:2200px}</style>${svg(true,950)}`);
      const a=await observe(600),b=await observe(1100,"fixed");
      const registry=buildReliabilityRegistry([a,b],config);
      assert.deepEqual(registry.positions.map(v=>v.position),[600,1100]);
      assert.equal(registry.positions.some(v=>v.position===950),false);
      assert.equal(registry.status,"unreliable");
      // Dropping the offending view from the artistic pool cannot drop evidence.
      const selection={mode:"adaptive",selectedIds:["onlyOtherView"],fallbackReasons:[],decisions:[{id:"onlyOtherView",selected:true,scores:{L:.3,D:.4,V:.5,R:.1,G:.32}}]};
      const adjusted=applyReliabilityRegistry(selection,["fixed1"],registry);
      assert.equal(adjusted.mode,"fixed_fallback");assert.deepEqual(adjusted.selectedIds,["fixed1"]);
      assert.deepEqual(adjusted.decisions[0].scores,selection.decisions[0].scores);
      assert.equal(selection.mode,"adaptive");assert.equal(selection.decisions[0].selected,true);
    });
    await t.test("primitive peinte impossible à certifier : unproven, jamais reliable",async()=>{
      await page.setContent('<style>body{margin:0;min-height:2200px}</style><canvas width="500" height="400" style="position:absolute;top:100px;left:100px;background:blue"></canvas>');
      await page.evaluate(()=>{const c=document.querySelector("canvas"),x=c.getContext("2d");x.fillStyle="blue";x.fillRect(0,0,500,400);});
      const r=await observe();const registry=buildReliabilityRegistry([r],config);
      assert.equal(registry.status,"unproven");assert.equal(registry.adaptiveEligible,false);
      assert.ok(registry.entries.some(e=>e.reason==="opaque_primitive_geometry_uncertifiable"));
    });
    await t.test("textPath débordant : emprises des glyphes, pas seulement le rectangle SVG",async()=>{
      await page.setContent('<style>body{margin:0;min-height:2200px}</style><svg width="360" height="360" style="position:absolute;left:300px;top:250px;overflow:visible"><defs><path id="arc" d="M -60,180 A 240,240 0 1,1 420,180 A 240,240 0 1,1 -60,180"/></defs><text font-size="30"><textPath href="#arc">STRUCTURAL TEXT AROUND A LARGE CIRCLE WITH REAL OVERFLOW</textPath></text></svg>');
      const registry=buildReliabilityRegistry([await observe()],config);
      assert.equal(registry.status,"unreliable");
      assert.ok(registry.entries.some(e=>e.tag==="textPath"&&e.status==="unreliable"));
    });
    await t.test("overflow réellement visible hors wrapper nul : les mesures existantes restent représentées",async()=>{
      await page.setContent('<style>body{margin:0;min-height:2200px}.host{height:0;overflow:hidden}.media{position:absolute;top:100px;left:100px;width:500px;height:400px;background:linear-gradient(red,blue)}</style><div class="host"><div class="media"></div></div>');
      const r=await observe();assert.equal(buildReliabilityRegistry([r],config).status,"reliable");
    });
    await t.test("navigation exclue de nouveauté : aucune fausse preuve négative",async()=>{
      await page.setContent('<style>body{margin:0;min-height:2200px}nav{position:fixed;top:0;left:0;width:100%;height:100px;background:black;color:white}</style><nav>Navigation visible conservée</nav>');
      assert.equal(buildReliabilityRegistry([await observe()],config).status,"reliable");
    });
    await t.test("clipping rectangulaire représenté : fiable",async()=>{
      await page.setContent('<style>body{margin:0;min-height:2200px}.box{position:absolute;top:200px;left:200px;width:500px;height:300px;background:blue;clip-path:polygon(0 0,100% 0,100% 100%,0 100%)}</style><div class="box"></div>');
      assert.equal(buildReliabilityRegistry([await observe()],config).status,"reliable");
    });
    await t.test("clipping courbe non certifiable : unproven avec seuils existants",async()=>{
      await page.setContent('<style>body{margin:0;min-height:2200px}.box{position:absolute;top:200px;left:200px;width:600px;height:400px;background:blue;clip-path:circle(40%)}</style><div class="box"></div>');
      const r=await observe();assert.equal(buildReliabilityRegistry([r],config).status,"unproven");
      assert.ok(r.inspection.findings.some(e=>e.status==="unproven"&&e.mechanisms.includes("non_rectangular_clipping")));
    });
    await t.test("collecte et inspection synchrones : mouvement CSS n'est pas une omission",async()=>{
      await page.setContent('<style>body{margin:0;min-height:2200px}.box{position:absolute;left:200px;top:200px;width:500px;height:300px;background:blue;animation:move .4s linear infinite alternate}@keyframes move{to{transform:translateY(80px)}}</style><div class="box">Texte représenté</div>');
      // No asynchronous gap between descriptor and evidence, no tolerance change.
      const {measures,inspection}=await page.evaluate(collectAndInspectDOM,{position:0,config});
      assert.equal(buildReliabilityRegistry([{origin:"traversal",position:0,measures,inspection}],config).status,"reliable");
    });
  }finally{await browser.close();}
});

test("registre fail closed, provenance exhaustive et preuve négative monotone",()=>{
  const m={viewport:{width:1440,height:900},masses:[],lines:[],unknown:[],relationsKnown:true,truncated:false,measuredCoverage:1};
  const bad={origin:"traversal",position:585,measures:m,inspection:{findings:[{status:"unreliable",reason:"visible_paint_not_represented",elementId:"paint1",rect:{x:400,y:20,width:100,height:40}}]}};
  const good={origin:"fixed",position:585,measures:m,inspection:{findings:[]}};
  const r=buildReliabilityRegistry([bad,good],config);
  assert.equal(r.visits,2);assert.equal(r.status,"unreliable");assert.equal(r.entries[0].origin,"traversal");
  assert.equal(r.entries[1].status,"reliable"); // same-position post-traversal replacement cannot erase history
  assert.equal(buildReliabilityRegistry([{...good,inspection:undefined}],config).status,"unproven");
  assert.equal(buildReliabilityRegistry([],config).status,"unproven");
  assert.throws(()=>buildReliabilityRegistry([{...good,origin:"boundary"}],config),/existing traversal\/fixed/);
});
