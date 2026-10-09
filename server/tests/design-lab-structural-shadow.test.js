const test = require("node:test"), assert = require("node:assert/strict"), sharp = require("sharp");
const { analyzeStructuralShadow, fixedProof, signature } = require("../services/design-lab/structural-observation-shadow");
const { selectStructuralObservations, selectionConfig } = require("../services/design-lab/structural-observation-selection");
const { coverageIsComplete } = require("../services/design-lab/structural-page-capture.service");

test("preuve shadow : le vrai gate peut passer sans prouver cadrage fixe ou fraîcheur post-parcours", () => {
  const context = { totalHeight: 11556, viewportHeight: 900, reachedEnd: true };
  const views = [0,2340,5265,8775,10656].map((position,i) => ({id:`a${i}`,position,visibleHeight:900,
    stabilized:true,signature:`signature${i}`,observedTotalHeight:11556,afterCompleteTraversal:false}));
  const proof = fixedProof(views, context);
  assert.equal(proof.actualFixedGatePass,true);
  assert.equal(proof.uniqueSignatures,5);
  assert.equal(proof.middleCovered,true);
  assert.equal(proof.allFiveGeometryChecksPass,false);
  assert.equal(proof.samples[1].targetErrorPx,209);
  assert.equal(proof.samples[3].targetErrorPx,250);
  assert.equal(proof.allFivePostTraversal,false);
  views[2].signature=views[0].signature;
  assert.equal(fixedProof(views,context).actualFixedGatePass,false);
});

test("shadow : pool exclusivement Phase A, sélecteur identique, répétabilité et aucun changement livré", async () => {
  const image = await sharp({create:{width:1440,height:900,channels:3,background:"navy"}}).png().toBuffer();
  const measures = (position) => ({viewport:{width:1440,height:900},position,
    masses:[{x:100,y:350,width:300,height:300,kind:"image",group:2,domOrder:2,fullArea:90000}],
    lines:[],groups:[],anchors:[],unknown:[],positioned:[],truncated:false,relationsKnown:true,measuredCoverage:1});
  const positions = [0,585,1170,1755,2100];
  const phaseA = positions.map(position=>({buffer:image,measures:measures(position),position,visibleHeight:900,
    stabilized:true,origin:"traversal",observedTotalHeight:3000,afterCompleteTraversal:false}));
  const config=selectionConfig();
  const trace={config,phaseA,phaseAContext:{totalHeight:3000,viewportHeight:900,viewport:{width:1440,height:900},
    reachedEnd:true,coveredPx:3000,bottomConfirmations:3},fixedViews:[]};
  const delivered={status:"ready_for_vision",captureCoverage:{version:3,captureStrategy:"sampled",positions:[{position:123}],
    captureTiming:{elapsedMs:90000}},capturePerformance:{phases:{mandatory_traversal:60000},operations:[]}};
  const before = JSON.stringify(delivered), sourceBefore=JSON.stringify(phaseA.map(({buffer,...v})=>v));
  const result=await analyzeStructuralShadow(trace,delivered);
  assert.equal(JSON.stringify(delivered),before);
  assert.equal(JSON.stringify(phaseA.map(({buffer,...v})=>v)),sourceBefore);
  assert.deepEqual(result.input.candidates.map(c=>c.position),positions);
  assert.deepEqual(result.report.shadow.selection,selectStructuralObservations(result.input,config));
  assert.equal(result.report.shadow.repeatability.identical,20);
  assert.equal(result.report.shadow.panelProof.complete,true);
  assert.equal(result.report.coverageComparison.strictlyEquivalent,false);
  assert.equal(result.report.shadow.phaseBExecuted,false);
  assert.ok(result.report.shadow.proposedViews.every(v=>positions.includes(v.position)));
  assert.equal(await signature(image),await signature(image));
  await assert.rejects(analyzeStructuralShadow({ ...trace, phaseA:[{...phaseA[0],origin:"fixed"}] },delivered),
    /actual validated traversal observations exclusively/);
  const c={version:2,captureStrategy:"sampled",complete:true,reachedEnd:true,distinctViews:true,totalHeight:3000,viewportHeight:900,
    positions:positions.map((position,i)=>({role:["top","upper","middle","lower","bottom"][i],position,stabilized:true,signature:`s${i}`}))};
  assert.equal(coverageIsComplete({captureCoverage:c}),true);
});

test("shadow fallback : les cinq positions planifiées ne sont jamais de faux candidats mesurés", async () => {
  const image=await sharp({create:{width:1440,height:900,channels:3,background:"teal"}}).png().toBuffer();
  const trace={config:selectionConfig(),phaseA:[{buffer:image,position:0,visibleHeight:900,origin:"traversal",stabilized:true,
    observedTotalHeight:3000,measures:{viewport:{width:1440,height:900},masses:[],lines:[],groups:[],anchors:[],unknown:[{x:0,y:0,width:1440,height:900}],
      positioned:[],truncated:false,relationsKnown:true,measuredCoverage:0.5}}],
    phaseAContext:{totalHeight:3000,viewportHeight:900,viewport:{width:1440,height:900},coveredPx:900,reachedEnd:false},fixedViews:[]};
  const shadow=await analyzeStructuralShadow(trace,{status:"blocked"});
  assert.equal(shadow.report.shadow.mode,"fixed_fallback");
  assert.deepEqual(shadow.report.shadow.proposedViews.map(v=>v.position),[0,420,1050,1680,2100]);
  assert.ok(shadow.report.shadow.proposedViews.every(v=>v.observed===false));
  assert.equal(shadow.input.candidates.length,1);
  assert.equal(shadow.report.shadow.panelProof.complete,false);
  assert.ok(shadow.report.shadow.fallbackReasons.includes("incomplete_storyboard_coverage"));
});

async function fixedPoolFixture() {
  const totalHeight=5212, viewportHeight=900;
  const measures=position=>({viewport:{width:1440,height:900},position,
    masses:[{x:100,y:350,width:300,height:300,kind:"image",group:2,domOrder:2,fullArea:90000}],
    lines:[],groups:[],anchors:[],unknown:[],positioned:[],truncated:false,relationsKnown:true,measuredCoverage:1});
  const buffers=await Promise.all(["navy","teal","red","green","purple"].map(background=>
    sharp({create:{width:1440,height:900,channels:3,background}}).png().toBuffer()));
  const frame=(position,buffer,origin)=>({position,buffer,origin,visibleHeight:900,stabilized:true,
    observedTotalHeight:totalHeight,afterCompleteTraversal:origin==="fixed",measures:measures(position)});
  const phaseA=[0,585,1170,1755,2340,2925,3510,4095,4312].map(position=>frame(position,buffers[0],"traversal"));
  const fixedViews=[0,862,2156,3450,4312].map((position,i)=>frame(position,buffers[i],"fixed"));
  for(const v of fixedViews)v.signature=await signature(v.buffer);
  return {trace:{config:selectionConfig(),phaseA,fixedViews,
    phaseAContext:{totalHeight,viewportHeight,viewport:{width:1440,height:900},reachedEnd:true,coveredPx:totalHeight,bottomConfirmations:3}},
    product:{status:"ready_for_vision",captureCoverage:{version:3,captureStrategy:"sampled",positions:[],captureTiming:{elapsedMs:60000}},
      capturePerformance:{phases:{mandatory_traversal:25000,fixed_samples:10000,optional_boundary_candidates:20000},operations:[]}}};
}

test("pool A + fixes : cinq preuves réelles intactes, recaptures prévues seulement pour les locales A",async()=>{
  const {trace,product}=await fixedPoolFixture();
  const before=JSON.stringify(trace), deliveredBefore=JSON.stringify(product);
  const r=await analyzeStructuralShadow(trace,product,{includeFixed:true});
  assert.equal(JSON.stringify(trace),before);assert.equal(JSON.stringify(product),deliveredBefore);
  assert.equal(r.input.candidates.length,12);assert.equal(r.input.fixedIds.length,5);
  assert.ok(r.input.candidates.every(v=>["fixed","traversal"].includes(v.origin)));
  assert.ok(r.input.fixedIds.every(id=>r.input.candidates.find(v=>v.id===id).afterCompleteTraversal));
  assert.equal(r.candidates.find(v=>v.position===0).origin,"fixed");
  assert.deepEqual(r.report.current.fixedProof,r.report.shadow.fiveNearestObservedProof);
  assert.equal(r.report.coverageComparison.strictlyEquivalent,true);
  assert.equal(r.report.coverageComparison.scope,"five_fixed_control_evidence_only");
  assert.equal(r.report.shadow.panelProof.complete,true);
  assert.deepEqual(r.report.shadow.selection,selectStructuralObservations(r.input,trace.config));
  assert.equal(r.report.shadow.repeatability.identical,20);
  assert.ok(r.report.shadow.proposedViews.every(v=>v.phaseBRecaptureRequired===(v.origin!=="fixed")));
  assert.equal(r.report.estimate.estimatedCaptureMs,35000+r.report.estimate.freshDeliveryViews*2000);
  assert.equal(r.report.acceptance.proposedSequencingExecuted,false);
});

test("cas Gucci exact : conserver cinq fixes ne conserve pas le défaut du candidat 3310 absent du pool",async()=>{
  const {trace,product}=await fixedPoolFixture();
  trace.currentSelection={mode:"fixed_fallback",fallbackReasons:["insufficient_measured_coverage"],decisions:[
    {id:"candidate19",position:3310,reliability:{reliable:false,reasons:["insufficient_measured_coverage"]}}]};
  const r=await analyzeStructuralShadow(trace,product,{includeFixed:true});
  assert.equal(r.report.shadow.mode,"adaptive");
  assert.equal(r.report.shadow.fiveNearestObservedProof.actualFixedGatePass,true);
  assert.equal(r.report.shadow.fiveNearestObservedProof.allFivePostTraversal,true);
  assert.equal(r.input.candidates.some(v=>v.position===3310),false);
  assert.equal(r.report.acceptance.measurementFallbackPreserved,false);
  assert.equal(r.report.acceptance.simulationCoherent,false);
  assert.deepEqual(r.report.acceptance.reasons,["measurement_fallback_not_preserved"]);
  assert.equal(r.report.acceptance.excludedUnreliableCandidates[0].position,3310);
});

test("pool A + fixes : géométrie inconnue impose les cinq captures fixes réelles sans nouvelle livraison inventée",async()=>{
  const {trace,product}=await fixedPoolFixture();
  trace.phaseA[3].measures.unknown=[{x:0,y:0,width:1440,height:900}];
  const r=await analyzeStructuralShadow(trace,product,{includeFixed:true});
  assert.equal(r.report.shadow.mode,"fixed_fallback");
  assert.ok(r.report.shadow.fallbackReasons.includes("unmeasurable_canvas_clip_or_transform"));
  assert.deepEqual(r.report.shadow.proposedViews.map(v=>v.position),[0,862,2156,3450,4312]);
  assert.ok(r.report.shadow.proposedViews.every(v=>v.observed&&v.afterCompleteTraversal&&!v.phaseBRecaptureRequired));
  assert.equal(r.report.estimate.freshDeliveryViews,0);
  assert.equal(r.report.estimate.reusedFixedViews,5);
  await assert.rejects(analyzeStructuralShadow({...trace,fixedViews:trace.fixedViews.slice(0,4)},product,{includeFixed:true}),
    /five actual post-traversal fixed captures/);
});

test("registre shadow indépendant : défaut d'une visite A remplacée conservé sans changer L/D/V/R/G",async()=>{
  const {trace,product}=await fixedPoolFixture();
  trace.reliabilityRecords=[...trace.phaseA,...trace.fixedViews].map(v=>({...v,inspection:{findings:[]},elapsedMs:2}));
  trace.reliabilityRecords[0].inspection.findings=[{status:"unreliable",reason:"visible_paint_not_represented",kind:"svg_text",elementId:"paint1"}];
  const baseline=await analyzeStructuralShadow(trace,product,{includeFixed:true});
  const guarded=await analyzeStructuralShadow(trace,product,{includeFixed:true,reliabilityRegistry:true});
  assert.equal(baseline.report.shadow.mode,"adaptive");
  assert.deepEqual(guarded.report.shadow.scoringSelection,baseline.report.shadow.selection);
  assert.equal(guarded.report.shadow.mode,"fixed_fallback");
  assert.equal(guarded.report.reliabilityRegistry.entries[0].origin,"traversal");
  assert.equal(guarded.candidates[0].origin,"fixed");
  assert.deepEqual(guarded.report.shadow.selection.selectedIds,guarded.input.fixedIds);
  assert.equal(guarded.report.shadow.repeatability.identical,20);
  assert.equal(guarded.report.reliabilityRegistry.cost.addedElapsedMs,28);
  trace.reliabilityRecords.pop();
  const incomplete=await analyzeStructuralShadow(trace,product,{includeFixed:true,reliabilityRegistry:true});
  assert.ok(incomplete.report.reliabilityRegistry.reasons.includes("shadow_paint_visit_evidence_missing_or_mismatched"));
});
