const test=require('node:test'),assert=require('node:assert/strict');
const {reference,analysisV1}=require('./helpers/structural-analysis-fixture');
const {validateStructuralAnalysis,buildStructuralVisionRequest}=require('../services/design-lab/structural-reference.contract');
const Model=require('../models/structural-reference.model');
function analysisV2() {
 const a=analysisV1();a.analysisVersion=2;a.globalRelations=[];
 const principle={mechanism:'Déplacer l’axe principal',effect:'Équilibrer les masses',conditions:'Deux masses réellement visibles'};
 a.transferablePrinciples=[principle];
 a.structuralMoments=a.structuralMoments.map(m=>({order:m.order,role:m.role,layoutMode:'other',layoutExplanation:m.layoutExplanation,
  geometry:{imagePlacement:'left',textPlacement:'right',dominantMass:'balanced',massRelationship:'Deux masses adjacentes',primaryAxis:'multiple',
    imageTextRelationship:'adjacent',gridRegularity:'regular',overlap:'absent',whitespaceTopology:'interstitial'},
  transferablePrinciples:[principle],evidence:{...m.evidence,scope:'wholeMoment',level:'direct'}}));
 return a;
}
test('V1 remains valid; V2 explicit version uses compact moment geometry without legacy prose duplication',()=>{
 const r=reference(),meta={captureCoverage:r.captureCoverage};
 assert.equal(validateStructuralAnalysis(analysisV1(),meta,r.captures).analysisVersion,undefined);
 const req=buildStructuralVisionRequest(r.captures,meta,undefined,{analysisVersion:2}),a=analysisV2();
 assert.equal(validateStructuralAnalysis(a,meta,r.captures,req.manifest,2),a);
 assert.equal(req.analysisContract.version,2);assert.equal(req.analysisContract.promptHash.length,64);
 assert.ok(req.schema.properties.structuralMoments.items.properties.geometry);
 assert.equal(req.schema.properties.structuralMoments.items.properties.proportionLogic,undefined);
 assert.throws(()=>validateStructuralAnalysis(analysisV1(),meta,r.captures,req.manifest,2),/analysisVersion/);
 assert.match(req.instructions,/classification en dernier/);
 assert.match(req.instructions,/fragment vide/);
});
test('V2 validates persistence; V1 persistence does not invent V2 relations',async()=>{
 const r=reference();const v2=new Model({...r,analysis:analysisV2()});await v2.validate();
 assert.equal(v2.toObject().analysis.geometry,undefined);
 assert.equal(v2.toObject().analysis.structuralMoments[0].geometry.primaryAxis,'multiple');
 assert.equal(v2.toObject().analysis.transferablePrinciples[0].conditions,'Deux masses réellement visibles');
 const v1=new Model(r);await v1.validate();assert.equal(v1.toObject().analysis.analysisVersion,undefined);
 assert.equal(v1.toObject().analysis.globalRelations,undefined);
});
test('V2 rejects regular grid called offset; unknown remains valid and pure text overlaps are not invented missing media',()=>{
 const a=analysisV2();a.structuralMoments[0].layoutMode='offsetGrid';
 assert.throws(()=>validateStructuralAnalysis(a),/gridRegularity/);
 a.structuralMoments[0].geometry.gridRegularity='unknown';assert.equal(validateStructuralAnalysis(a),a);
});
test('relations link real moments and sources; duplicate or unrelated IDs are refused',()=>{
 const a=analysisV2();a.globalRelations=[{moments:[1,2],mechanism:'Bascule',effect:'Respiration',level:'direct',sourceViews:['top']}];
 assert.throws(()=>validateStructuralAnalysis(a),/globalRelations/);
 a.globalRelations=[];assert.equal(validateStructuralAnalysis(a),a);
 const b=structuredClone(a.structuralMoments[0]);b.order=2;b.evidence.startPercent=50;
 a.structuralMoments[0].evidence.endPercent=50;a.structuralMoments.push(b);
 a.rhythmSequence[0].endPercent=50;a.rhythmSequence.push({...a.rhythmSequence[0],order:2,startPercent:50,endPercent:100});
 a.globalRelations=[{moments:[1,2],mechanism:'Bascule d’axe',effect:'Respiration',level:'inferred',sourceViews:['top']}];
 assert.equal(validateStructuralAnalysis(a),a);
 a.globalRelations[0].moments=[1,1];assert.throws(()=>validateStructuralAnalysis(a),/globalRelations/);
});
test('media occurrence details stay durable but outside Vision metadata',()=>{
 const r=reference();r.captureCoverage.mediaEvidence.views=[{sourceHash:'not-an-input',position:0}];
 const req=buildStructuralVisionRequest(r.captures,{captureCoverage:r.captureCoverage},undefined,{analysisVersion:2});
 assert.doesNotMatch(JSON.stringify(req.content),/not-an-input/);assert.equal(r.captureCoverage.mediaEvidence.views.length,1);
});
module.exports={analysisV2};
test('product defaults to V2, checkpoints its contract; reprocess uses recorded version without another analyzer call',async()=>{
 const {memoryModel}=require('./helpers/structural-product-path');
 const {createStructuralService}=require('../services/design-lab/structural-reference.service');
 const r=reference(),Refs=memoryModel([r]),Attempts=memoryModel();let calls=0;
 const service=createStructuralService({Model:Refs,AttemptModel:Attempts,logger:{warn(){}},productDiagnostics:()=>{},
  capture:()=>{throw Error('external forbidden');},upload:()=>{throw Error('remote forbidden');},destroy:()=>{throw Error('remote forbidden');},
  analyze:async(c,m,o)=>{calls++;assert.equal(o.analysisContract.version,2);await o.onResponse({output:[{content:[{type:'output_text',text:JSON.stringify(analysisV2())}]}]});return analysisV2();}});
 const applied=await service.run(r._id);assert.equal(applied.status,'analyzed');assert.equal(applied.analysis.analysisVersion,2);
 const a=[...Attempts.records.values()][0];assert.equal(a.analysisContract.version,2);assert.equal(a.status,'applied');
 const repeated=await service.reprocess(r._id,a._id);assert.equal(repeated.status,'analyzed');assert.equal(calls,1);
});
