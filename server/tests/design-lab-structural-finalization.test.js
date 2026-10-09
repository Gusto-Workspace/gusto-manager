const test=require('node:test'),assert=require('node:assert/strict');
const {createStructuralService}=require('../services/design-lab/structural-reference.service');
const {memoryModel}=require('./helpers/structural-product-path');
const {reference,analysisV1}=require('./helpers/structural-analysis-fixture');
function setup({uncertain=false,failFinal=false,failCreate=false,analyzer}={}) {
 const ref=reference(),Model=memoryModel([ref]);
 const old={_id:'old',referenceId:ref._id,generationId:'old-generation',status:'failed',visionTransport:{state:'uncertain'}};
 const AttemptModel=memoryModel(uncertain?[old]:[]);let calls=0;
 const create=AttemptModel.create.bind(AttemptModel),update=AttemptModel.findOneAndUpdate.bind(AttemptModel);
 AttemptModel.create=async data=>{if(failCreate){failCreate=false;throw Error('injected create failure');}return create(data);};
 AttemptModel.findOneAndUpdate=(f,u,o)=>{if(failFinal&&u.$set.status==='applied'){failFinal=false;return {lean:async()=>{throw Error('injected final failure');}};}return update(f,u,o);};
 const service=createStructuralService({Model,AttemptModel,analysisContractVersion:1,logger:{warn(){}},productDiagnostics:()=>{},
  capture:()=>{throw Error('external capture forbidden');},upload:()=>{throw Error('upload forbidden');},destroy:()=>{throw Error('destroy forbidden');},
  analyze:async(c,m,opt)=>{calls++;if(analyzer)return analyzer(opt,Model,AttemptModel);
    await opt.onProgress('request_started',{});await opt.onResponse({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(analysisV1())}]}]});return analysisV1();}});
 return {service,Model,AttemptModel,id:ref._id,get calls(){return calls;},get ref(){return Model.records.get(ref._id);},get attempt(){return [...AttemptModel.records.values()].find(a=>a._id!=='old');}};
}
test('last checkpoint failure: committed analysis stays analyzed and attempt can finalize without Vision',async()=>{
 const h=setup({failFinal:true});const r=await h.service.run(h.id);
 assert.equal(r.status,'analyzed');assert.equal(h.attempt.status,'validated');assert.ok(h.attempt.rawResponse&&h.attempt.parsedResult);
 assert.equal(r.analysisApplication.attemptId,h.attempt._id);await h.service.reconcileExpiredOperations({referenceId:h.id});
 assert.equal(h.attempt.status,'applied');assert.equal(h.calls,1);
 await h.service.reconcileExpiredOperations({referenceId:h.id});assert.equal(h.calls,1);
});
test('uncertainty survives failed confirmed creation; next unconfirmed action never reaches analyzer',async()=>{
 const h=setup({uncertain:true,failCreate:true});await h.service.run(h.id,{confirmUncertainVision:true});
 assert.equal(h.calls,0);assert.equal(h.ref.visionConfirmationRequired,true);
 await h.service.run(h.id);assert.equal(h.calls,0);assert.equal(h.ref.operationDiagnostic.code,'STRUCTURAL_UNCERTAIN_VISION_CONFIRMATION_REQUIRED');
 await h.service.run(h.id,{confirmUncertainVision:true});assert.equal(h.calls,1);
 assert.equal(h.AttemptModel.records.get('old').visionUncertaintyResolution.confirmedByGenerationId,h.attempt.generationId);
 assert.equal(h.ref.visionConfirmationRequired,false);
});
test('timeout dispatch confirmation supersedes old uncertainty but retains new uncertain attempt',async()=>{
 const h=setup({uncertain:true,analyzer:async opt=>{await opt.onProgress('request_started',{});
  throw Object.assign(Error('timeout'),{status:504,visionDispatched:true});}});
 await h.service.run(h.id,{confirmUncertainVision:true});assert.ok(h.AttemptModel.records.get('old').visionUncertaintyResolution);
 assert.equal(h.ref.visionConfirmationRequired,true);await h.service.run(h.id);assert.equal(h.calls,1);
});
test('confirmed pre-dispatch failure does not supersede old uncertainty',async()=>{
 const h=setup({uncertain:true,analyzer:async opt=>{await opt.onProgress('request_started',{});
  throw Object.assign(Error('local failure'),{visionDispatched:false});}});
 await h.service.run(h.id,{confirmUncertainVision:true});assert.equal(h.AttemptModel.records.get('old').visionUncertaintyResolution,undefined);
 await h.service.run(h.id);assert.equal(h.calls,1);assert.equal(h.ref.visionConfirmationRequired,true);
});
test('late raw response survives recovery CAS without reapplying a lost generation',async()=>{
 const h=setup({analyzer:async(opt,Model,Attempts)=>{await opt.onProgress('request_started',{});
  const a=[...Attempts.records.values()][0];a.status='failed';
  const r=[...Model.records.values()][0];r.operationToken='replacement';r.status='analyzing';
  await opt.onResponse({id:'late',output:[]});throw Error('unreachable');}});
 await assert.rejects(h.service.run(h.id));assert.equal(h.attempt.rawResponse.id,'late');
 assert.equal(h.attempt.status,'failed');assert.equal(h.ref.operationToken,'replacement');assert.equal(h.ref.status,'analyzing');
});
test('lost acknowledgement after atomic analysis application is recognized by its marker',async()=>{
 const h=setup(),original=h.Model.findOneAndUpdate.bind(h.Model);let once=true;
 h.Model.findOneAndUpdate=(f,u,o)=>{
  const q=original(f,u,o);if(u.$set.analysis&&once){once=false;const lean=q.lean;q.lean=async()=>{await lean();throw Error('lost commit acknowledgement');};}return q;
 };
 assert.equal((await h.service.run(h.id)).status,'analyzed');assert.equal(h.attempt.status,'validated');
 await h.service.reconcileExpiredOperations({referenceId:h.id});assert.equal(h.attempt.status,'applied');assert.equal(h.calls,1);
});
test('failure reading attempt history cannot erase legacy uncertainty even with no attempt record',async()=>{
 const h=setup();h.ref.operationDiagnostic={recovery:'manual_confirmation_required'};
 const find=h.AttemptModel.find;let once=true;h.AttemptModel.find=f=>{
  // Let pre-acquisition recovery complete. Fail the history read after the
  // reference lease has been acquired, where uncertainty must survive catch.
  if(once && !f.status){once=false;const q={select:()=>q,sort:()=>q,lean:async()=>{throw Error('history unavailable');}};return q;}return find(f);
 };
 await h.service.run(h.id,{confirmUncertainVision:true});assert.equal(h.ref.visionConfirmationRequired,true);
 await h.service.run(h.id);assert.equal(h.calls,0);
});
