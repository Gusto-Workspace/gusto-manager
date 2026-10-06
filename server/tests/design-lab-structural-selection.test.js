const test = require("node:test"),
  assert = require("node:assert/strict"),
  sharp = require("sharp"),
  fs = require("node:fs");
const {
  selectionConfig,
  unionArea,
  descriptor,
  distance,
  projectionFor,
  prepareCandidate,
  marginal,
  selectStructuralObservations,
  structuralObservationDOM,
  persistentElements,
  withoutPersistentMeasures,
} = require("../services/design-lab/structural-observation-selection");
const {
  coverageIsComplete,
  traversalStoryboard,
} = require("../services/design-lab/structural-page-capture.service");
const {
  prepareStructuralViews,
} = require("../services/design-lab/structural-reference.service");
const {
  visionViewsForStrategy,
  structuralCoverageContext,
  structuralInstructions,
} = require("../services/design-lab/structural-reference.contract");
function candidate(id, position, textHeight = 16, imageWidth = 160) {
  const line = {
    x: 200,
    y: 200,
    width: 200,
    height: textHeight,
    kind: "text",
    group: 1,
    domOrder: 1,
    fontSize: textHeight,
    fullArea: 200 * textHeight,
  };
  return {
    id,
    position,
    domOrder: position,
    visibleRangePx: [position, position + 900],
    stabilized: true,
    measures: {
      position,
      viewport: { width: 1440, height: 900 },
      masses: [
        line,
        {
          x: 100,
          y: 350,
          width: imageWidth,
          height: 300,
          kind: "image",
          group: 2,
          domOrder: 2,
          fullArea: imageWidth * 300,
        },
      ],
      lines: [line],
      unknown: [],
      truncated: false,
      relationsKnown: true,
      measuredCoverage: 1,
    },
  };
}
function input(candidates) {
  return {
    candidates,
    reachedEnd: true,
    totalHeight: candidates.at(-1).position + 900,
    fixedIds: candidates.slice(0, 5).map((c) => c.id),
    storyboard: {
      width: 720,
      height: 2000,
      complete: true,
      panels: candidates.map((c, i) => ({
        observationId: c.id,
        scale: 1 / 6,
        rect: { x: 0, y: i * 200, width: 240, height: 150 },
      })),
    },
  };
}
test("union exacte : ancêtres et superpositions ne doublent pas la surface", () => {
  assert.equal(
    unionArea([
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 0, y: 0, width: 50, height: 50 },
    ]),
    10000,
  );
  assert.equal(
    unionArea([
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 50, y: 0, width: 100, height: 100 },
    ]),
    15000,
  );
});
test("projection : deux réductions réelles, grand storyboard limité par sa hauteur", () => {
  const c = candidate("a", 0),
    data = input([c]),
    config = selectionConfig();
  const p = projectionFor(c, data.storyboard, config);
  assert.equal(p.panelScale, 1 / 6);
  assert.equal(p.canvasScale, 512 / 2000);
  assert.equal(p.macroScale, ((1 / 6) * 512) / 2000);
  assert.equal(p.localScale, 1);
  const prepared = prepareCandidate(c, data.storyboard, config);
  assert.equal(prepared.projectedDimensions.lines[0].macro, 16 * p.macroScale);
});
test("descripteurs : slots absents stables et invariance à l'ordre des masses", () => {
  const a = candidate("a", 0).measures,
    b = structuredClone(a);
  b.masses.reverse();
  assert.deepEqual(descriptor(a), descriptor(b));
  assert.equal(distance(descriptor(a), descriptor(b)), 0);
  b.masses = [];
  b.lines = [];
  assert.ok(distance(descriptor(a), descriptor(b)) > 0);
});
test("formule marginale documentée, pas de position ni footer dans la distance", () => {
  const config = selectionConfig();
  const d = descriptor(candidate("a", 0).measures);
  const a = { L: 0.7, D: 0.6, descriptor: d, visibleRangePx: [0, 900] };
  const b = { ...a, visibleRangePx: [9000, 9900] };
  assert.deepEqual(marginal(a, [], config), {
    L: 0.7,
    D: 0.6,
    V: 0.6499999999999999,
    R: 0,
    G: 0.6499999999999999,
  });
  const s = marginal(b, [a], config);
  assert.equal(s.V, 0);
  assert.equal(s.R, 0.8);
  assert.ok(Math.abs(s.G - 0.215) < 1e-9);
});
test("moins de cinq : compositions identiques lointaines rejetées sans fallback", () => {
  const data = input(
    [0, 1800, 3600, 5400, 7200].map((p, i) => candidate(`c${i}`, p)),
  );
  const result = selectStructuralObservations(data, { threshold: 0.5 });
  assert.deepEqual(result.selectedIds, ["c0"]);
  assert.equal(result.mode, "adaptive");
  assert.ok(
    result.decisions
      .slice(1)
      .every((d) => d.reason === "gain_at_or_below_threshold"),
  );
  for (let i = 0; i < 30; i++)
    assert.deepEqual(
      selectStructuralObservations(structuredClone(data), { threshold: 0.5 }),
      result,
    );
});
test("capacité zéro et seuil strict : aucun slot artificiel, entrée configurable", () => {
  const data = input([candidate("a", 0), candidate("b", 1800)]);
  assert.deepEqual(
    selectStructuralObservations(data, { mandatoryEntry: false, threshold: 1 })
      .selectedIds,
    [],
  );
  assert.deepEqual(
    selectStructuralObservations(data, { maxLocalViews: 0 }).selectedIds,
    [],
  );
  assert.throws(() => selectionConfig({ maxLocalViews: 6 }));
});
test("seuil initial : faibles gains fiables arrêtent à l'entrée, sans fallback", () => {
  const candidates = [0, 900, 1800].map((p, i) => {
    const c = candidate(`c${i}`, p, 300, 1400);
    c.measures.masses = [];
    c.measures.lines = [];
    return c;
  });
  const result = selectStructuralObservations(input(candidates));
  assert.deepEqual(result.selectedIds, ["c0"]);
  assert.equal(result.mode, "adaptive");
});
test("détail mesuré : gap de 24 px projeté à 2,4 px apporte exactement D=0,60", () => {
  const c = candidate("a", 0);
  c.measures.masses = [];
  c.measures.lines = [];
  c.measures.groups = [
    {
      members: [
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 0, y: 124, width: 100, height: 100 },
      ],
    },
  ];
  const data = input([c]);
  data.storyboard.height = 512;
  data.storyboard.width = 512;
  data.storyboard.panels[0].scale = 0.1;
  const p = prepareCandidate(c, data.storyboard, selectionConfig());
  assert.ok(Math.abs(p.D - 0.6) < 1e-12);
});
test("pré-footer et footer admissibles peuvent coexister dans les derniers 20%", () => {
  const candidates = [
    candidate("entry", 0),
    candidate("prefooter", 8700, 16, 64),
    candidate("footer", 9400, 20, 80),
  ];
  for (const c of candidates.slice(1))
    c.measures.groups = [
      {
        x: 0,
        y: 0,
        width: 100,
        height: 76,
        domOrder: 3,
        members: [
          { x: 0, y: 0, width: 100, height: 32 },
          { x: 0, y: 44, width: 100, height: 32 },
        ],
      },
    ];
  const result = selectStructuralObservations(input(candidates));
  assert.ok(result.selectedIds.includes("prefooter"));
  assert.ok(result.selectedIds.includes("footer"));
});
test("gain marginal recalculé à chaque ajout et aucune vue facultative finale sous le seuil", () => {
  const candidates = [0, 1200, 2400, 3600, 4800, 6000].map((p, i) =>
    candidate(`c${i}`, p, 12 + i * 3, 64 + i * 24),
  );
  const result = selectStructuralObservations(input(candidates));
  assert.ok(result.selectedIds.length <= 5);
  assert.ok(
    result.decisions
      .filter((d) => d.selected && d.reason !== "mandatory_entry")
      .every((d) => d.scores.G > result.config.threshold),
  );
  for (const round of result.rounds)
    assert.ok(round.scores.every((s) => !round.selectedBefore.includes(s.id)));
});
test("fiabilité : canvas/clip non mesurable, collecte tronquée, projection manquante, stabilité", () => {
  for (const [mutate, reason] of [
    [
      (c) => {
        c.measures.unknown = [{ x: 0, y: 0, width: 1000, height: 800 }];
      },
      "unmeasurable_canvas_clip_or_transform",
    ],
    [
      (c) => {
        c.measures.truncated = true;
      },
      "incomplete_descriptors",
    ],
    [
      (c) => {
        c.measures.measuredCoverage = 0.3;
      },
      "insufficient_measured_coverage",
    ],
    [
      (c) => {
        c.stabilized = false;
      },
      "unstable_observation",
    ],
  ]) {
    const c = candidate("a", 0);
    mutate(c);
    const r = selectStructuralObservations(input([c]));
    assert.equal(r.mode, "fixed_fallback");
    assert.ok(r.fallbackReasons.includes(reason));
  }
  const data = input([candidate("a", 0)]);
  data.storyboard.panels = [];
  assert.ok(
    selectStructuralObservations(data).fallbackReasons.includes(
      "unknown_projection",
    ),
  );
});
test("géométrie storyboard indépendante des vues locales et couverture v3 de zéro à cinq", async () => {
  const viewport = { width: 1440, height: 900 };
  const buffer = await sharp({
    create: { ...viewport, channels: 3, background: "blue" },
  })
    .png()
    .toBuffer();
  const views = [0, 600, 1200, 1800, 2100].map((position, i) => ({
    id: `c${i}`,
    position,
    visibleHeight: 900,
    buffer,
  }));
  const storyboard = await traversalStoryboard(views, viewport, 3000);
  assert.equal(storyboard.width, 720);
  assert.equal(storyboard.height, 348);
  assert.deepEqual(storyboard.panels[4].rect, {
    x: 240,
    y: 198,
    width: 240,
    height: 150,
  });
  const coverage = {
    version: 3,
    captureStrategy: "sampled",
    totalHeight: 3000,
    viewportHeight: 900,
    complete: true,
    reachedEnd: true,
    distinctViews: true,
    storyboard: { ...storyboard, buffer: undefined },
    positions: [],
  };
  assert.equal(coverageIsComplete({ captureCoverage: coverage }), true);
  const encoded = await prepareStructuralViews(
    storyboard.buffer,
    viewport,
    { overview: storyboard.buffer },
    {},
    coverage,
  );
  assert.equal(encoded.length, 1);
  assert.equal(encoded[0].width, 720);
  assert.deepEqual(
    visionViewsForStrategy(encoded, "sampled", coverage).map((v) => v.type),
    ["overview"],
  );
  assert.deepEqual(
    structuralCoverageContext({ captureCoverage: coverage }, encoded)
      .requiredDetailViews,
    [],
  );
  coverage.storyboard.panels.splice(1, 3);
  assert.equal(coverageIsComplete({ captureCoverage: coverage }), false);
});
test("prompt variable : pas de quota milieu/footer et identités indépendantes de position", () => {
  const prompt = structuralInstructions("sampled", true);
  assert.match(prompt, /Aucun détail local au milieu ou au footer n'est exigé/);
  assert.match(prompt, /zéro à cinq vues locales/);
});
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
test("couches persistantes : preuve sur une grande part du parcours, pas un sticky de section", () => {
  const candidates = [0,1800,3600,5400,7200].map((p,i)=>candidate(`c${i}`,p));
  for (const c of candidates) c.measures.positioned = [
    {id:"control",rect:{x:0,y:600,width:400,height:250},positionKind:"fixed",deduplicationEligible:true,protectedStructure:false},
    {id:"navigation",rect:{x:0,y:0,width:1440,height:70},positionKind:"sticky",deduplicationEligible:false,protectedStructure:true},
  ];
  candidates[2].measures.positioned.push({id:"section",rect:{x:0,y:100,width:1440,height:600},positionKind:"sticky",deduplicationEligible:false});
  const result=persistentElements(candidates,8100,selectionConfig());
  assert.equal(result.find(p=>p.id==='control').deduplicationEligible,true);
  assert.equal(result.find(p=>p.id==='navigation').deduplicationEligible,false);
  assert.equal(result.find(p=>p.id==='section').confirmed,false);
  for (let i=0;i<20;i++) assert.deepEqual(persistentElements(structuredClone(candidates),8100,selectionConfig()),result);
  candidates.forEach((c,i)=>c.measures.positioned[0].rect.y+=i*15);
  assert.equal(persistentElements(candidates,8100,selectionConfig()).find(p=>p.id==='control').confirmed,false);
});
test("les contrôles répétés ne produisent ni relations ni nouvelles masses, la fiabilité reste intacte",()=>{
  const m=candidate('a',0).measures;
  m.masses[0].ownerIds=['control']; m.lines[0].ownerIds=['control'];
  m.unknown=[{x:0,y:0,width:1400,height:800}];
  const clean=withoutPersistentMeasures(m,['control']);
  assert.equal(clean.lines.length,0); assert.equal(clean.masses.length,1);
  assert.deepEqual(clean.unknown,m.unknown);
  assert.equal(m.lines.length,1);
});
test("Chromium : containing blocks réels, fixed host nul et protection des compositions",{skip:!fs.existsSync(chrome)},async()=>{
  const browser=await require('playwright-core').chromium.launch({executablePath:chrome,headless:true});
  const p=await browser.newPage({viewport:{width:1440,height:900}});
  await p.route('**/*',r=>r.abort());
  try {
    await p.setContent(`<style>body{margin:0}.host{height:0;overflow:hidden}.absolute{position:absolute;left:100px;top:200px;width:300px;height:200px;background:blue}.fixed{position:fixed;left:500px;top:200px;width:300px;height:200px;background:green}</style>
      <div style="position:relative"><div class="host"><div class="absolute"></div></div></div>
      <div class="host"><div class="fixed"></div></div>
      <div style="position:relative;left:900px;top:200px;width:200px;height:80px;overflow:hidden"><div style="width:300px;height:200px;background:red"></div></div>
      <header style="position:fixed;top:0;width:100%;height:70px">Navigation</header>
      <div id="control" style="position:fixed;left:0;bottom:45px;width:0;height:0"><div style="position:absolute;bottom:0;width:420px;height:250px;background:white"><button style="visibility:visible!important">Offers</button></div></div>
      <section style="position:sticky;top:100px;left:1100px;width:300px;height:180px"><button>Structural section</button></section>`);
    assert.equal(await p.evaluate(()=>document.elementFromPoint(200,250).className),'absolute');
    assert.equal(await p.evaluate(()=>document.elementFromPoint(600,250).className),'fixed');
    const m=await p.evaluate(structuralObservationDOM,{position:0,config:selectionConfig()});
    assert.ok(m.masses.some(r=>r.x===100&&r.y===200&&r.height===200));
    assert.ok(m.masses.some(r=>r.x===500&&r.y===200&&r.height===200));
    assert.ok(m.masses.some(r=>r.x===900&&r.height===80));
    assert.ok(m.positioned.find(r=>r.protectedStructure&&r.rect.width===1440));
    const layer=m.positioned.find(r=>r.deduplicationEligible&&r.rect.width===420);
    assert.ok(layer); assert.equal(layer.rect.height,250);
    const {persistentVisibilityDOM}=require('../services/design-lab/structural-persistent-elements');
    const before=await p.locator('#control').evaluate(n=>[n,...n.querySelectorAll('*')].map(n=>n.style.cssText));
    try {
      const hidden=await p.evaluate(persistentVisibilityDOM,{mode:'hide',token:'fixture',elements:[layer]});
      assert.deepEqual(hidden.ids,[layer.id]);
      assert.equal(await p.locator('#control button').evaluate(n=>getComputedStyle(n).visibility),'hidden');
      const nav=m.positioned.find(r=>r.protectedStructure&&r.rect.width===1440);
      await p.evaluate(persistentVisibilityDOM,{mode:'restore',token:'fixture'});
      const protectedResult=await p.evaluate(persistentVisibilityDOM,{mode:'hide',token:'fixture',elements:[nav]});
      assert.equal(protectedResult.ids.length,0);
      assert.equal(await p.locator('header').evaluate(n=>getComputedStyle(n).visibility),'visible');
      throw new Error('screenshot failure fixture');
    } catch(e) { assert.equal(e.message,'screenshot failure fixture'); }
    finally { await p.evaluate(persistentVisibilityDOM,{mode:'restore',token:'fixture'}); }
    const after=await p.locator('#control').evaluate(n=>[n,...n.querySelectorAll('*')].map(n=>n.style.cssText));
    assert.deepEqual(after,before);
    assert.equal(await p.evaluate(()=>window.__gustoStructuralHidden),undefined);
    // Open shadow roots are measured in composed order even with a zero-box
    // host. Their persistent controls are accessible without a domain selector.
    await p.setContent('<style>body{margin:0}</style><main style="height:4000px"></main><aside id="shadow-host" style="width:0;height:0"></aside>');
    await p.evaluate(()=>{document.querySelector('#shadow-host').attachShadow({mode:'open'}).innerHTML=
      '<div role="banner" style="position:fixed;left:0;bottom:45px;width:485px;height:270px;background:white"><p style="font-size:24px">Persistent control</p><a href="#">Offers</a><button style="position:absolute;left:485px;top:0;width:40px;height:270px">Hide</button><section style="display:none"><h1>Hidden popup</h1></section></div>';});
    const shadow=await p.evaluate(structuralObservationDOM,{position:0,config:selectionConfig()});
    const shadowLayer=shadow.positioned.find(p=>p.deduplicationEligible);
    assert.ok(shadowLayer); assert.equal(shadowLayer.rect.width,525);
    assert.equal(shadow.unknown.length,0);
    assert.ok(shadow.lines.some(l=>l.ownerIds.includes(shadowLayer.id)));
    const hiddenShadow=await p.evaluate(persistentVisibilityDOM,{mode:'hide',token:'shadow',elements:[shadowLayer]});
    assert.deepEqual(hiddenShadow.ids,[shadowLayer.id]);
    assert.equal(await p.evaluate(()=>getComputedStyle(document.querySelector('#shadow-host').shadowRoot.querySelector('a')).visibility),'hidden');
    await p.evaluate(persistentVisibilityDOM,{mode:'restore',token:'shadow'});
    assert.equal(await p.evaluate(()=>getComputedStyle(document.querySelector('#shadow-host').shadowRoot.querySelector('a')).visibility),'visible');
  } finally {await browser.close();}
});
test(
  "Chromium : lignes réelles, clipping, navigation persistante et placeholders",
  { skip: !fs.existsSync(chrome) },
  async () => {
    const browser = await require("playwright-core").chromium.launch({
      executablePath: chrome,
      headless: true,
    });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    await page.route("**/*", (r) => r.abort());
    try {
      await page.setContent(`<style>body{margin:0}p{font-size:32px;width:160px}nav{position:fixed;top:0} .hidden{opacity:0} .clip{width:200px;height:80px;overflow:hidden}</style>
      <nav>Persistent navigation</nav><p>Rendered lines across several rows</p><div class="hidden"><p>Hidden branch</p></div>
      <div class="clip"><div style="height:200px;width:300px;background:blue"></div></div>
      <div style="display:grid;grid-template-columns:100px 200px;gap:24px"><div style="height:60px;background:blue"></div><div style="height:80px;background:green"></div></div>
      <iframe data-gusto-external-embed-unavailable="true" style="width:300px;height:200px" srcdoc=""></iframe>`);
      const m = await page.evaluate(structuralObservationDOM, {
        position: 0,
        config: selectionConfig(),
      });
      assert.ok(m.lines.length >= 3);
      assert.ok(m.lines.every((r) => r.fontSize === 32));
      assert.ok(m.masses.some((r) => r.kind === "embed"));
      assert.ok(
        m.masses.some(
          (r) => r.kind === "surface" && r.width === 200 && r.height === 80,
        ),
      );
      assert.ok(m.groups.some((g) => g.members.length === 2));
      assert.equal(m.truncated, false);
      assert.equal(m.relationsKnown, true);
    } finally {
      await browser.close();
    }
  },
);
