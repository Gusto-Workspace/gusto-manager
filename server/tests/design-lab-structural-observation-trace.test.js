const test=require('node:test'),assert=require('node:assert/strict');
const {descriptor,selectionConfig,selectStructuralObservations}=require('../services/design-lab/structural-observation-selection');
const {applyReliabilityRegistry}=require('../services/design-lab/structural-reliability.service');
const {buildObservationTrace,expandObservationTrace,compactDescriptor}=require('../services/design-lab/structural-observation-trace');
const mass=(kind,x,y,width,height,group)=>({kind,x,y,width,height,group,fontSize:40,domOrder:group,fullArea:width*height});
function measures(image=mass('image',50,100,400,400,1),text=mass('text',650,100,400,200,2)) {
 return {viewport:{width:1440,height:900},masses:[image,text],lines:[text],groups:[],unknown:[],truncated:false,relationsKnown:true,measuredCoverage:1};
}
test('current descriptors already distinguish dominance, axes, image/text topology, overlap and central/peripheral void',()=>{
 const base=descriptor(measures());
 const pairs=[
  ['dominance',measures(mass('image',50,100,200,160,1),mass('text',400,100,950,600,2))],
  ['axis',measures(mass('image',800,100,400,400,1),mass('text',50,100,400,200,2))],
  ['image/text relation',measures(mass('image',50,500,400,300,1),mass('text',50,100,400,200,2))],
  ['overlap',measures(mass('image',50,100,400,400,1),mass('text',100,150,400,200,2))],
  ['void topology',measures(mass('image',500,200,400,400,1),mass('text',500,100,400,200,2))],
 ];
 for(const [name,m] of pairs)assert.notDeepEqual(descriptor(m),base,name);
 // This proves descriptor discrimination only, not useful marginal gain or
 // the model's understanding. No weights/thresholds/selection policy changed.
});
test('large numerical pools preserve every descriptor losslessly within the diagnostic envelope',()=>{
 const d={occupation:Array.from({length:192},(_,i)=>(i*7919%999983)/999983),
  geometry:Array.from({length:120},(_,i)=>(i*1543%999983)/999983),empty:Array(16).fill(.333333),features:Array(9).fill(.142857)};
 const observations=Array.from({length:160},(_,i)=>({id:`candidate${i}`,position:i*500,visibleHeight:900}));
 const decisions=observations.map(o=>({id:o.id,descriptor:d,selected:false,reason:'gain_at_or_below_threshold'}));
 const trace=buildObservationTrace({observations,scoring:{decisions},delivery:{decisions},deliveredIds:[],strategy:'sampled',
  config:selectionConfig(),registry:{status:'unproven',reasons:[]},totalHeight:50000});
 assert.equal(trace.descriptorEncoding,'deflate-json-base64-v1');
 assert.ok(Buffer.byteLength(JSON.stringify(trace))<=256*1024);
 const expanded=expandObservationTrace(trace);assert.equal(expanded.candidates.length,160);
 assert.deepEqual(expanded.candidates[159].descriptor,compactDescriptor(d));assert.equal(expanded.poolHash,trace.poolHash);
});
test('trace preserves theory, registry delivery, rejected descriptors and rounds without DOM text; deterministic and bounded',()=>{
 const candidates=[0,900,1800,2700,3600].map((position,i)=>({id:`candidate${i+1}`,position,visibleHeight:900,visibleRangePx:[position,position+900],domOrder:i,
  stabilized:true,measures:measures(),privateDOM:'must not persist'}));
 const input={candidates,fixedIds:candidates.map(c=>c.id),reachedEnd:true,totalHeight:4500,
  storyboard:{complete:true,width:720,height:348,panels:candidates.map((c,i)=>({observationId:c.id,scale:1/6,rect:{x:i%3*240,y:Math.floor(i/3)*174,width:240,height:150},visibleRangePx:c.visibleRangePx}))}};
 const config=selectionConfig(),scoring=selectStructuralObservations(input,config);
 const registry={status:'unproven',adaptiveEligible:false,reasons:['unknown_geometry']};
 const delivered=applyReliabilityRegistry(scoring,input.fixedIds,registry);
 const args={observations:candidates,scoring,delivery:delivered,deliveredIds:delivered.selectedIds,strategy:'sampled',config,registry,totalHeight:4500};
 const trace=buildObservationTrace(args);assert.deepEqual(trace,buildObservationTrace(args));
 assert.equal(trace.candidates.length,5);assert.ok(trace.candidates.every(c=>c.delivery.selected&&c.descriptor));
 assert.ok(trace.candidates.some(c=>!c.scoring.selected));assert.ok(trace.rounds.length);
 assert.equal(delivered.decisions.find(d=>!d.scoringSelected).reason,'fixed_fallback');
 assert.doesNotMatch(JSON.stringify(trace),/must not persist|privateDOM/);
 assert.ok(Buffer.byteLength(JSON.stringify(trace))<256*1024);assert.equal(config.threshold,.25);assert.equal(config.maxLocalViews,5);
});
