const test = require("node:test");
const assert = require("node:assert/strict");
const { captureStructuralPage, coverageIsComplete, OBSERVATION_SEQUENCING } = require("../services/design-lab/structural-page-capture.service");
const { sanitizeStructuralCapture } = require("../services/design-lab/capture-sanitization.service");

test("Chromium : défaut produit = parcours enregistré, cinq preuves identiques, aucune tournée, fraîcheur et verdicts indépendants", async () => {
  const browser = await require("playwright-core").chromium.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const fixture = (kind) => `<style>body{margin:0}section{height:700px;font-size:60px}#moving{position:fixed;top:100px;right:0;width:100px;height:100px;background:blue;transform:translateX(0)}</style>
    <main>${["#fcaaaa","#aaccff","#bbffbb","#ffee99","#aaffee","#ddbbff"].map((color,i) =>
      `<section style="background:${color}">Composition ${i+1}${kind==="canvas"?'<canvas width="1400" height="550"></canvas>':''}</section>`).join("")}</main>
    ${kind==="svg"?'<svg width="360" height="360" style="position:absolute;left:200px;top:3000px;overflow:visible"><rect x="20" y="20" width="220" height="220" fill="red"/><text x="340" y="200" font-size="32">STRUCTURE</text></svg>':''}
    <div id="moving"></div><script>addEventListener('scroll',()=>document.querySelector('#moving').style.transform='translateX(-'+Math.min(180,Math.round(scrollY/20))+'px)')</script>`;
  async function run(record, kind) {
    const page = await browser.newPage({ viewport: { width:1440, height:900 } });
    await page.route("**/*", r => r.abort());
    const trace = {};
    try {
      await page.setContent(fixture(kind));
      const initial = await sanitizeStructuralCapture(page, Date.now()+120000);
      const result = record
        ? await captureStructuralPage(page, Date.now()+120000, initial, {observationTrace:trace})
        : await captureStructuralPage(page, Date.now()+120000, initial);
      assert.equal(coverageIsComplete(result), true);
      assert.equal(result.captureCoverage.version, 3);
      assert.equal(result.captureCoverage.observationSelection.sequencing,OBSERVATION_SEQUENCING);
      assert.equal(result.captureCoverage.optionalCandidateBudget.captured,0);
      assert.equal(result.capturePerformance.operations.some(v=>v.phase==="optional_boundary_candidates"),false);
      assert.equal(result.capturePerformance.operations.filter(v=>v.phase==="fixed_samples"&&v.operation==="screenshot").reduce((n,v)=>n+v.count,0),5);
      const e=result.captureDiagnostics;
      assert.ok(e.pool.every(v=>["traversal","fixed"].includes(v.origin)));
      assert.equal(e.fixedControls.length,5);
      for(const d of e.deliveries){
        const candidate=e.pool.find(v=>v.id===d.id);
        assert.equal(d.recaptured,candidate.origin!=="fixed");
        if(candidate.origin!=="fixed")assert.ok(d.freshnessRequired&&d.geometryRestored);
      }
      return { result, trace };
    } finally { await page.close(); }
  }
  try {
    const normal = await run(false), recorded = await run(true);
    const e=normal.result.captureDiagnostics;
    assert.equal(e.registry.status,"reliable");assert.equal(e.selection.mode,"adaptive");
    assert.deepEqual(e.fixedControls.map(v=>[v.position,v.signature]),recorded.trace.fixedViews.map(v=>[v.position,v.signature]));
    assert.deepEqual(normal.result.captureCoverage.positions,recorded.result.captureCoverage.positions);
    assert.deepEqual(e.scoringSelection.decisions,recorded.result.captureDiagnostics.scoringSelection.decisions);
    assert.equal(recorded.result.captureDiagnostics.registry.visits,recorded.trace.phaseA.length+5);
    const canvas = await run(false,"canvas");
    assert.equal(canvas.result.captureDiagnostics.registry.status,"unproven");
    assert.equal(canvas.result.captureDiagnostics.selection.mode,"fixed_fallback");
    assert.deepEqual(canvas.result.captureCoverage.positions.map(v=>v.position),canvas.result.captureDiagnostics.fixedControls.map(v=>v.position));
    assert.equal(canvas.result.captureDiagnostics.finalRecaptures,0);
    const svg=await run(true,"svg"),registry=svg.result.captureDiagnostics.registry;
    assert.equal(registry.status,"unreliable");assert.equal(svg.result.captureDiagnostics.selection.mode,"fixed_fallback");
    assert.ok(registry.entries.some(v=>v.status==="unreliable"&&v.origin==="traversal"&&v.mechanisms?.includes("svg_descendant_outside_descriptor")));
    assert.equal(registry.positions.some(v=>v.position===3310),false);
    assert.deepEqual(svg.result.captureCoverage.positions.map(v=>v.position),svg.trace.fixedViews.map(v=>v.position));
  } finally { await browser.close(); }
});
