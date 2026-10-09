const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const f=require('./helpers/structural-composition-fixtures');
const {descriptor,distance,selectionConfig,selectStructuralObservations}=require('../services/design-lab/structural-observation-selection');
const {compactDescriptor,buildObservationTrace,expandObservationTrace}=require('../services/design-lab/structural-observation-trace');
const contract=require('../services/design-lab/structural-reference.contract');
const {reference,analysisV1}=require('./helpers/structural-analysis-fixture');
function analysis3() {
  const a=analysisV1();a.analysisVersion=3;a.globalRelations=[];
  const principle={mechanism:'Chevauchement de deux masses',effect:'Relier des surfaces',conditions:'Deux masses coprésentes et visibles'};
  a.transferablePrinciples=[principle];
  a.structuralMoments=a.structuralMoments.map(m=>({order:m.order,role:m.role,layoutExplanation:m.layoutExplanation,layoutMode:'other',
    geometry:{imagePlacement:'center',textPlacement:'center',dominantMass:'balanced',massRelationship:'Deux masses coprésentes',primaryAxis:'center',imageTextRelationship:'overlapping',gridRegularity:'free',overlap:'present',whitespaceTopology:'mixed'},
    transferablePrinciples:[principle],evidence:{...m.evidence,sourceViews:['visionOverview'],scope:'wholeMoment',level:'direct',anchors:[{viewId:'visionOverview',observationId:'visionOverview',startPercent:0,endPercent:100,dominantMass:'balanced',imageTextRelationship:'overlapping'}]}}));
  return a;
}
const validate=a=>{const r=reference();return contract.validateStructuralAnalysis(a,{captureCoverage:r.captureCoverage},r.captures,undefined,3);};
test('composition evidence separates typography, dense gallery and quiet panel; no artistic score is produced',()=>{
  const d=name=>descriptor(f.measures(name),2);
  assert.ok(d('gallery').composition.coverage[1]>.95);
  assert.equal(d('quiet').composition.coverage[1],0);
  assert.ok(d('typography').composition.massScale[1]>d('gallery').composition.massScale[1]);
  assert.ok(d('typography').composition.massScale[2]>d('quiet').composition.massScale[2]);
  assert.ok(distance(d('gallery'),d('quiet'))>.6);
  assert.ok(distance(d('typography'),d('gallery'))>.4);
  assert.equal(d('gallery').score,undefined);
});
test('center/periphery, genuine offsets and overlap have distinct geometric witnesses',()=>{
  const center=descriptor(f.measures('centerPeripheral'),2).composition;
  assert.ok(center.topology[0]>center.topology[1]);
  assert.ok(center.topology[3]>center.topology[2]);
  const regular=descriptor(f.measures('regular'),2),offset=descriptor(f.measures('offset'),2);
  assert.equal(regular.composition.grouping[0],0);assert.ok(offset.composition.grouping[0]>0);
  assert.ok(descriptor(f.measures('layered'),2).composition.layering[0]>0);
});
test('V2 selection changes information distance without tuning any weights, threshold or capture limit',()=>{
  // Long storyboard: larger losses of resolution are physically represented,
  // not a threshold override. Repetition increases page length, not diversity.
  const names=['immersive','typography','quiet','gallery','gallery','centerPeripheral','editorial',...Array(16).fill('editorial')];
  const input=f.input(names);
  const v1=selectStructuralObservations(input),v2=selectStructuralObservations(input,{algorithmVersion:2});
  for(const k of ['weights','threshold','maxLocalViews','resolution'])assert.deepEqual(v1.config[k],v2.config[k]);
  assert.equal(v1.version,1);assert.equal(v2.version,2);assert.ok(v2.selectedIds.length<=5);
  const selectedNames=v2.selectedIds.map(id=>names[Number(id.slice(6))-1]);
  assert.ok(selectedNames.includes('quiet'));assert.ok(selectedNames.includes('gallery'));
  assert.equal(selectedNames.filter(n=>n==='gallery').length,1);
  assert.equal(v1.selectedIds.length,1);assert.equal(v2.selectedIds.length,3);
  for(const d of v2.decisions.filter(d=>d.selected&&d.reason!=='mandatory_entry'))assert.ok(d.scores.G>v2.config.threshold);
  const repeat=selectStructuralObservations(f.input(Array(7).fill('gallery')),{algorithmVersion:2});
  assert.deepEqual(repeat.selectedIds,['sample1']);
  assert.deepEqual(selectStructuralObservations(structuredClone(input),{algorithmVersion:2}),v2);
  assert.throws(()=>selectionConfig({algorithmVersion:99}));
});
test('sampled states of the same composition do not become geometric novelty or sections',()=>{
  const a=f.measures('centerPeripheral'),b=structuredClone(a);b.position=8000;b.sourceIdentity='another photograph';
  assert.equal(distance(descriptor(a,2),descriptor(b,2)),0);
  const result=selectStructuralObservations(f.input(['centerPeripheral','centerPeripheral']),{algorithmVersion:2});
  assert.deepEqual(result.selectedIds,['sample1']);assert.equal(result.structuralMoments,undefined);
});
test('trace retains V2 composition families, weights and algorithm identity; legacy shape unchanged',()=>{
  const input=f.input(['quiet','gallery']),scoring=selectStructuralObservations(input,{algorithmVersion:2});
  const trace=buildObservationTrace({observations:input.candidates,scoring,delivery:scoring,deliveredIds:scoring.selectedIds,strategy:'sampled',config:scoring.config,registry:{status:'verified',adaptiveEligible:true,reasons:[]},totalHeight:input.totalHeight});
  assert.equal(trace.descriptorVersion,2);assert.deepEqual(trace.config.weights,scoring.config.weights);
  const restored=expandObservationTrace(trace);assert.ok(restored.candidates[0].descriptor.composition);
  assert.ok(Math.abs(distance(...scoring.decisions.map(d=>d.descriptor))-distance(...restored.candidates.map(d=>d.descriptor)))<1e-6);
  assert.equal(compactDescriptor(descriptor(f.measures('quiet'))).version,undefined);
});
test('large V2 traces compress without dropping composition witnesses or allowing arbitrary descriptor keys',()=>{
  let seed=42;const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return Math.round(seed/4294967296*1e6)/1e6;};
  const observations=Array.from({length:160},(_,i)=>({id:`candidate${i}`,position:i*800,visibleHeight:800}));
  const decisions=observations.map(o=>{const d=descriptor(f.measures('gallery'),2);
    for(const k of ['occupation','geometry','empty','features'])d[k]=d[k].map(next);
    for(const k of Object.keys(d.composition))d.composition[k]=d.composition[k].map(next);
    d.composition.secret='must not be retained';
    return {id:o.id,descriptor:d,reliability:{reliable:true,reasons:[]},selected:false,scores:{L:.5,D:.4,V:.3,R:.2,G:.25}};});
  const config=selectionConfig({algorithmVersion:2});
  const build=count=>buildObservationTrace({observations:observations.slice(0,count),scoring:{version:2,mode:'adaptive',decisions:decisions.slice(0,count)},delivery:{decisions:decisions.slice(0,count)},deliveredIds:[],strategy:'sampled',config,registry:{status:'verified',adaptiveEligible:true,reasons:[]},totalHeight:128000});
  assert.throws(()=>build(160),e=>e.code==='structural_observation_trace_too_large');
  const trace=build(100);
  assert.equal(trace.descriptorEncoding,'deflate-json-base64-v1');
  assert.ok(Buffer.byteLength(JSON.stringify(trace))<=256*1024);
  const expanded=expandObservationTrace(trace);
  for(let i=0;i<100;i++)assert.deepEqual(expanded.candidates[i].descriptor,compactDescriptor(decisions[i].descriptor));
  assert.equal(expanded.candidates[0].descriptor.composition.secret,undefined);
});
test('V3 schema excludes regular/offset label combination before dispatch; does not repair outputs',()=>{
  const a=analysis3();assert.equal(validate(a),a);
  const r=reference(),req=contract.buildStructuralVisionRequest(r.captures,{captureCoverage:r.captureCoverage},undefined,{analysisVersion:3});
  assert.equal(req.analysisContract.version,3);assert.equal(contract.ARTISTIC_CONTRACT_VERSION,2);
  assert.ok(Object.keys(req.schema.properties).indexOf('structuralMoments')<Object.keys(req.schema.properties).indexOf('globalRelations'));
  const branches=req.schema.properties.structuralMoments.items.anyOf;
  assert.ok(branches.every(b=>!b.properties.layoutMode.enum.includes('staggeredColumns')||!b.properties.geometry.properties.gridRegularity.enum.includes('regular')));
  assert.ok(Object.keys(branches[0].properties).indexOf('geometry')<Object.keys(branches[0].properties).indexOf('layoutMode'));
  a.structuralMoments[0].layoutMode='staggeredColumns';a.structuralMoments[0].geometry.gridRegularity='regular';
  const before=JSON.stringify(a);assert.throws(()=>validate(a));assert.equal(JSON.stringify(a),before);
  a.structuralMoments[0].geometry.gridRegularity='unknown';assert.throws(()=>validate(a));
  a.structuralMoments[0].layoutMode='other';assert.equal(validate(a),a);
});
test('V3 rejects absent image dominance and spatial overlap contradiction',()=>{
  const a=analysis3();a.structuralMoments[0].geometry.imagePlacement='absent';assert.throws(()=>validate(a),/geometry/);
  const b=analysis3();b.structuralMoments[0].geometry.overlap='absent';assert.throws(()=>validate(b),/overlap/);
  const c=analysis3();c.structuralMoments[0].geometry.textPlacement='absent';assert.throws(()=>validate(c),/geometry/);
});
test('V3 anchors reject nonexistent panels and distant positions; a local fragment cannot certify an entire page',()=>{
  const a=analysis3();a.structuralMoments[0].evidence.anchors[0].observationId='invented';assert.throws(()=>validate(a));
  const b=analysis3();const e=b.structuralMoments[0].evidence;e.sourceViews=['top'];e.anchors=[{...e.anchors[0],viewId:'top',observationId:'top',endPercent:100}];assert.throws(()=>validate(b),/anchors/);
  e.anchors[0].endPercent=30;assert.throws(()=>validate(b),/scope/);
  e.scope='localFragment';assert.equal(validate(b),b);
});
test('V3 uses actual sampled panel identity, not ordinal location or picture content',()=>{
  const r=reference();r.captureCoverage.version=3;r.captureCoverage.captureStrategy='sampled';r.captureCoverage.positions=[];
  r.captureCoverage.storyboard={panels:[{observationId:'sampleAtEnd',position:2100,visibleRangePx:[2100,3000]}]};
  const captures=[{type:'overview',url:'https://fixture.test/overview.webp',sourceRect:{top:0,left:0,width:720,height:300},viewport:{width:1440,height:900}}];
  const a=analysis3(),e=a.structuralMoments[0].evidence;e.scope='sampledStates';e.level='inferred';e.sourceViews=['overview'];e.anchors=[{...e.anchors[0],viewId:'overview',observationId:'sampleAtEnd',startPercent:70,endPercent:100}];
  assert.equal(contract.validateStructuralAnalysis(a,{captureCoverage:r.captureCoverage},captures,undefined,3),a);
  e.anchors[0].startPercent=0;assert.throws(()=>contract.validateStructuralAnalysis(a,{captureCoverage:r.captureCoverage},captures,undefined,3),/anchors/);
});
test('V3 direct relation cannot amplify an inferred moment; dominant mass must agree for a direct whole moment',()=>{
  const a=analysis3();a.structuralMoments[0].evidence.anchors[0].dominantMass='image';assert.throws(()=>validate(a),/dominantMass/);
  const b=analysis3(),m=structuredClone(b.structuralMoments[0]);m.order=2;
  b.structuralMoments[0].evidence.endPercent=50;b.structuralMoments[0].evidence.anchors[0].endPercent=50;
  m.evidence.startPercent=50;m.evidence.anchors[0].startPercent=50;m.evidence.level='inferred';b.structuralMoments.push(m);
  b.rhythmSequence[0].endPercent=50;b.rhythmSequence.push({...b.rhythmSequence[0],order:2,startPercent:50,endPercent:100});
  b.globalRelations=[{moments:[1,2],mechanism:'Bascule de masses',effect:'Contraste',level:'direct',sourceViews:['visionOverview']}];
  assert.throws(()=>validate(b),/globalRelations/);b.globalRelations[0].level='inferred';assert.equal(validate(b),b);
});
test('V3 persistence keeps anchors without requiring V1 prose; no database IO',async()=>{
  const Model=require('../models/structural-reference.model');const m=new Model({...reference(),analysis:analysis3()});await m.validate();
  assert.equal(m.toObject().analysis.structuralMoments[0].evidence.anchors[0].observationId,'visionOverview');
});
test('explicit V3 product path and raw reprocess persist contract identity without capture or provider IO',async()=>{
  const {memoryModel}=require('./helpers/structural-product-path');
  const {createStructuralService}=require('../services/design-lab/structural-reference.service');
  const Refs=memoryModel([reference()]),Attempts=memoryModel();let calls=0;
  const forbidden=()=>{throw Error('Remote forbidden');};
  const service=createStructuralService({Model:Refs,AttemptModel:Attempts,analysisContractVersion:3,
    logger:{warn(){}},productDiagnostics:()=>{},capture:forbidden,upload:forbidden,destroy:forbidden,
    analyze:async(c,m,o)=>{calls++;assert.equal(o.analysisContract.version,3);await o.onResponse({output:[{content:[{type:'output_text',text:JSON.stringify(analysis3())}]}]});return analysis3();}});
  const applied=await service.run(reference()._id);assert.equal(applied.status,'analyzed');
  const attempt=[...Attempts.records.values()][0];assert.equal(attempt.analysisContract.version,3);
  await service.reprocess(reference()._id,attempt._id);assert.equal(calls,1);
});
test('all ten frozen V1/V2 payload identities remain compatible and Cartapani rejection stays unchanged',()=>{
  const p=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../docs/STRUCTURAL_B1_AB_PREPARED.json')));
  const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
  for(const site of p.sites)for(const v of [1,2]) {
    const req=contract.buildStructuralVisionRequest(site.captures,site.metadata,site.manifest,{analysisVersion:v});
    const previous=site.variants.find(x=>x.analysisContract.version===v);
    assert.deepEqual(req.analysisContract,previous.analysisContract);
    assert.equal(hash(JSON.stringify(req.content)),previous.contentSha256);
  }
  const root=path.resolve(__dirname,'../diagnostics/structural-b1-ab-background-20261008/runs/2026-10-08T21-04-36-758Z-66b511e9');
  const cart=p.sites.find(s=>s.title==='Cartapani');const rejected=JSON.parse(fs.readFileSync(path.join(root,'calls/S2-A/parsed.json')));
  assert.throws(()=>contract.validateStructuralAnalysis(rejected,cart.metadata,cart.captures,cart.manifest,2),e=>e.validation.reason==='label_geometry_contradiction');
});
module.exports={analysis3};
