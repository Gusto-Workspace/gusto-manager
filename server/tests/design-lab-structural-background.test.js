const test=require('node:test'),assert=require('node:assert/strict');
const {isDeepStrictEqual}=require('node:util');
const {backgroundResponse,POLICY,usageCost}=require('../services/design-lab/structural-vision-background');
const {openaiRequest,analyzeStructuralReference}=require('../services/design-lab/openai.service');
const {createStructuralService}=require('../services/design-lab/structural-reference.service');
const {memoryModel}=require('./helpers/structural-product-path');
const {analysisV1,reference}=require('./helpers/structural-analysis-fixture');
const body=()=>({model:'gpt-6-luna',store:false,background:true,service_tier:'default',reasoning:{effort:'medium'},
 instructions:'Frozen artistic test instructions',input:[],text:{format:{type:'json_schema',name:'test',strict:true,schema:{type:'object'}}}});
const envelope=(status='queued',extra={})=>({id:'resp_background_fixture',model:'gpt-6-luna',service_tier:'default',status,
 ...(status==='completed'?{usage:{input_tokens:100,output_tokens:200,total_tokens:300},output:[{content:[{type:'output_text',text:JSON.stringify(analysisV1())}]}]}:{}),...extra});
const authorization={id:'fresh-offline-authorization',maximumCalls:1,capUSD:1};
function fixture(persisted={checkpoint:null,raw:null,terminal:null,prepared:null}) {
 const clock={at:1000000},calls=[],events=[];
 const store={
  load:async()=>structuredClone(persisted.checkpoint),
  compareAndSet:async(expected,next,request)=>{
   if(!isDeepStrictEqual(expected,persisted.checkpoint))return null;
   persisted.checkpoint=structuredClone(next);if(request)persisted.prepared=structuredClone(request);
   events.push('checkpoint');return structuredClone(next);
  },
  archiveRawBody:async raw=>{persisted.raw=raw;events.push('raw');},readRawBody:async()=>persisted.raw,
  readTerminalResponse:async()=>persisted.terminal,readRequest:async()=>persisted.prepared,
 };
 let sequence=[];
 const request=async(path,payload,options)=>{
  calls.push({path,payload,options});assert.ok(persisted.checkpoint.creationCommittedAt);
  assert.equal(options.method,path==='responses'?'POST':'GET');
  if(options.method==='POST'){assert.deepEqual(persisted.prepared,payload);assert.ok(persisted.checkpoint.budget.reservationUSD>=.36);}
  assert.match(options.clientRequestId,/^[0-9a-f-]{36}$/);
  const item=sequence.shift()||envelope('queued');if(item instanceof Error)throw item;
  await options.onRawBody(JSON.stringify(item),{requestId:`req_${calls.length}`,httpStatus:200});
  return {body:item,requestId:`req_${calls.length}`,httpStatus:200};
 };
 const invoke=options=>backgroundResponse(body(),{store,request,authorization,now:()=>clock.at,
  onResponse:async raw=>{assert.equal(JSON.parse(persisted.raw).id,raw.id);persisted.terminal=structuredClone(raw);events.push('terminal');},...options});
 return {persisted,clock,calls,events,store,invoke,setSequence:items=>{sequence=items;}};
}
test('queued → in_progress → completed beyond 120s, one creation, exact medium/strict/store:false unchanged',async()=>{
 const h=fixture();h.setSequence([envelope('queued'),envelope('in_progress'),envelope('completed')]);
 assert.equal((await h.invoke()).providerStatus,'queued');
 h.clock.at+=150000;assert.equal((await h.invoke({resumeOnly:true})).providerStatus,'in_progress');
 h.clock.at+=5000;assert.equal((await h.invoke({resumeOnly:true})).status,'completed');
 assert.equal(h.calls.filter(c=>c.options.method==='POST').length,1);assert.equal(h.calls.length,3);
 assert.ok(h.calls.slice(1).every(c=>c.path==='responses/resp_background_fixture'&&c.payload===undefined));
 assert.deepEqual(h.persisted.prepared,body());assert.equal(h.persisted.checkpoint.budget.reservationUSD,0);
 assert.equal(h.persisted.checkpoint.budget.costUSD,.00011);assert.equal(h.events[0],'checkpoint');
});
test('GET connection loss then restart resumes same ID with no new paid authorization or POST',async()=>{
 const h=fixture();await h.invoke();h.clock.at+=5000;
 h.setSequence([new TypeError('connection reset')]);
 await assert.rejects(h.invoke({resumeOnly:true}),e=>e.resumeExistingResponse&&e.responseId==='resp_background_fixture');
 assert.equal(h.persisted.checkpoint.state,'tracking_interrupted');assert.equal(h.persisted.checkpoint.budget.reservationUSD,.36);
 const restarted=fixture(structuredClone(h.persisted));restarted.clock.at=h.clock.at+5000;restarted.setSequence([envelope('completed')]);
 assert.equal((await restarted.invoke({resumeOnly:true,authorization:undefined})).status,'completed');
 assert.equal(restarted.calls.length,1);assert.equal(restarted.calls[0].options.method,'GET');
});
test('creation timeout before ID: one consumed slot, X-Client-Request-Id durable, uncertainty never erased by another authorization',async()=>{
 const h=fixture();h.setSequence([Object.assign(Error('creation timeout'),{code:'OPENAI_TIMEOUT',status:504,visionDispatched:true})]);
 await assert.rejects(h.invoke(),e=>e.providerOutcomeUnknown&&!!e.clientRequestId);
 assert.equal(h.persisted.checkpoint.state,'uncertain');assert.equal(h.persisted.checkpoint.budget.reservationUSD,.36);
 await assert.rejects(h.invoke({authorization:{...authorization,id:'different-authorization'}}),{code:'OPENAI_CREATION_UNCERTAIN'});
 assert.equal(h.calls.length,1);assert.equal(h.persisted.checkpoint.creationCalls,1);
});
test('crash after raw acknowledgement but before ID CAS restores actual ID from bytes, not from client request ID',async()=>{
 const h=fixture();await h.invoke();h.persisted.checkpoint.responseId=null;h.persisted.checkpoint.state='uncertain';
 h.clock.at+=5000;h.setSequence([envelope('completed')]);
 assert.equal((await h.invoke({resumeOnly:true})).status,'completed');assert.equal(h.calls.length,2);
 assert.equal(h.calls[1].options.method,'GET');
});
test('two concurrent creators and two concurrent trackers cannot duplicate POST or concurrent GET',async()=>{
 const h=fixture();const first=await Promise.all([h.invoke(),h.invoke()]);
 assert.ok(first.every(r=>r.pendingVision));assert.equal(h.calls.length,1);
 h.clock.at+=5000;h.setSequence([envelope('in_progress')]);
 await Promise.all([h.invoke({resumeOnly:true}),h.invoke({resumeOnly:true})]);
 assert.equal(h.calls.length,2);assert.equal(h.calls.filter(c=>c.options.method==='POST').length,1);
});
test('each terminal failure is archived with usage/cost before rejection; no retry',async()=>{
 for(const status of ['failed','incomplete','cancelled']) {
  const h=fixture();h.setSequence([envelope(status,{usage:{input_tokens:100,output_tokens:100,total_tokens:200},error:status==='failed'?{code:'provider_error'}:null})]);
  await assert.rejects(h.invoke(),{code:`OPENAI_RESPONSE_${status.toUpperCase()}`});
  assert.equal(h.persisted.terminal.status,status);assert.equal(h.persisted.checkpoint.providerStatus,status);
  assert.equal(h.persisted.checkpoint.budget.costUSD,.00006);assert.equal(h.calls.length,1);
 }
});
test('missing usage retains reservation; malformed usage never produces an invented zero cost',async()=>{
 for(const usage of [null,{input_tokens:10,output_tokens:20,total_tokens:1}]){
  const h=fixture();h.setSequence([envelope('completed',{usage})]);
  await assert.rejects(h.invoke(),{code:'OPENAI_BACKGROUND_USAGE'});
  assert.equal(h.persisted.checkpoint.budget.reservationUSD,.36);assert.equal(h.persisted.checkpoint.budget.costUSD,null);
  assert.equal(h.persisted.terminal.status,'completed');assert.equal(h.calls.length,1);
 }
});
test('insufficient shared budget and unsupported model are blocked before slot or transport',async()=>{
 const h=fixture();await assert.rejects(h.invoke({authorization:{...authorization,spentUSD:.65}}),{code:'OPENAI_BACKGROUND_BUDGET'});
 assert.equal(h.calls.length,0);assert.equal(h.persisted.checkpoint,null);
 await assert.rejects(backgroundResponse({...body(),model:'unknown-model'},{store:h.store}),{code:'OPENAI_BACKGROUND_MODEL_UNCERTIFIED'});
});
test('global tracking limit never recreates generation; manual retrieval is only GET and keeps original deadline',async()=>{
 const h=fixture();await h.invoke();const deadline=h.persisted.checkpoint.deadlineAt;h.clock.at=deadline+1;
 await assert.rejects(h.invoke({resumeOnly:true}),{code:'OPENAI_BACKGROUND_DEADLINE'});assert.equal(h.calls.length,1);
 h.setSequence([envelope('completed')]);assert.equal((await h.invoke({resumeOnly:true,manualRetrieval:true})).status,'completed');
 assert.equal(h.persisted.checkpoint.deadlineAt,deadline);assert.equal(h.calls[1].options.method,'GET');
});
test('restart keeps the original journaled operational policy rather than new defaults',async()=>{
 const h=fixture();await h.invoke();h.clock.at+=5000;h.setSequence([envelope('in_progress')]);
 await h.invoke({resumeOnly:true,policy:{...POLICY,pollTimeoutMs:1,pollIntervalMs:1,totalMs:1}});
 assert.equal(h.calls[1].options.timeout,POLICY.pollTimeoutMs);
 assert.equal(h.persisted.checkpoint.nextPollAt,h.clock.at+POLICY.pollIntervalMs);
});
test('expired tracking owner after crash is taken over; fresh owner is not stolen',async()=>{
 const h=fixture();await h.invoke();h.clock.at+=5000;
 h.persisted.checkpoint.trackingOwner='dead-process';h.persisted.checkpoint.trackingLeaseUntil=h.clock.at+45000;
 assert.equal((await h.invoke({resumeOnly:true})).trackingBusy,true);assert.equal(h.calls.length,1);
 h.clock.at+=45001;h.setSequence([envelope('completed')]);assert.equal((await h.invoke({resumeOnly:true})).status,'completed');
 assert.equal(h.calls.length,2);
});
test('persisted terminal raw finishes after retention/deadline without HTTP',async()=>{
 const h=fixture();h.setSequence([envelope('completed')]);await h.invoke();h.clock.at+=POLICY.totalMs+100000;
 assert.equal((await h.invoke({resumeOnly:true})).status,'completed');assert.equal(h.calls.length,1);
});
test('pre-dispatch storage failure and lost generation cause zero HTTP; stale/malicious response ID never leaves allowed path',async()=>{
 const h=fixture();h.store.beforeRequest=async()=>{throw Error('generation superseded');};
 await assert.rejects(h.invoke(),e=>e.visionDispatched===false);assert.equal(h.calls.length,0);
 assert.equal(h.persisted.checkpoint.budget.reservationUSD,0);
 const bad=fixture();await bad.invoke();bad.persisted.checkpoint.responseId='resp_/../../admin';bad.clock.at+=5000;
 await assert.rejects(bad.invoke({resumeOnly:true}),{code:'OPENAI_INVALID_RESPONSE_ID'});assert.equal(bad.calls.length,1);
});
test('price includes reasoning once and long context/cache writes; no softening of budget assumptions',()=>{
 assert.equal(usageCost({input_tokens:10000,output_tokens:2000,total_tokens:12000,input_tokens_details:{cached_tokens:2000,cache_write_tokens:1000},output_tokens_details:{reasoning_tokens:1500}},'gpt-6-luna'),.001845);
 assert.ok(usageCost({input_tokens:1050000,output_tokens:128000,total_tokens:1178000,input_tokens_details:{cache_write_tokens:1050000}},'gpt-6-luna')<.36);
});
async function withHTTP(handler,run) {
 const savedFetch=global.fetch,savedKey=process.env.OPENAI_API_KEY;global.fetch=handler;process.env.OPENAI_API_KEY='offline-fixture-only';
 try{return await run();}finally{global.fetch=savedFetch;if(savedKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=savedKey;}
}
function product(analyzer=analyzeStructuralReference) {
 const ref=reference(),Model=memoryModel([ref]),AttemptModel=memoryModel();
 const service=createStructuralService({Model,AttemptModel,analysisContractVersion:1,analyze:analyzer,logger:{warn(){}},productDiagnostics:()=>{},
  capture:()=>{throw Error('capture forbidden');},upload:()=>{throw Error('upload forbidden');},destroy:()=>{throw Error('destroy forbidden');}});
 return {ref,Model,AttemptModel,service,get attempt(){return [...AttemptModel.records.values()][0];}};
}
test('real HTTP helper: exact bytes durable before envelope parse, IDs sent, redirects forbidden, no SDK retry',async()=>{
 let count=0,raw=null;
 await withHTTP(async(url,opt)=>{count++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(opt.redirect,'error');
  assert.equal(opt.headers['X-Client-Request-Id'],'client-fixture');return new Response('{ invalid JSON',{status:200});},async()=>{
  await assert.rejects(openaiRequest('responses',body(),{timeout:30,clientRequestId:'client-fixture',onRawBody:async bytes=>{raw=bytes;}}),{code:'OPENAI_RESPONSE_ENVELOPE_INVALID'});
 });assert.equal(count,1);assert.equal(raw,'{ invalid JSON');
});
test('product acknowledges, survives a new service instance, applies same generation on GET, no recapture',async()=>{
 let post=0,get=0;
 await withHTTP(async(_url,opt)=>{if(opt.method==='POST')post++;else get++;
  return new Response(JSON.stringify(envelope(opt.method==='POST'?'queued':'completed')),{status:200,headers:{'x-request-id':'req_product'}});
 },async()=>{
  const h=product();const result=await h.service.run(h.ref._id);assert.equal(result.status,'analyzing');assert.equal(post,1);assert.equal(get,0);
  const id=h.attempt._id,generation=h.attempt.generationId;
  h.AttemptModel.records.get(id).visionTransport.nextPollAt=0;
  const restarted=createStructuralService({Model:h.Model,AttemptModel:h.AttemptModel,analysisContractVersion:1,logger:{warn(){}},productDiagnostics:()=>{},
   capture:()=>{throw Error('restart capture forbidden');},upload:()=>{throw Error('restart upload forbidden');}});
  await restarted.reconcileExpiredOperations();assert.equal(post,1);assert.equal(get,1);
  const ref=h.Model.records.get(h.ref._id);assert.equal(ref.status,'analyzed');assert.equal(ref.analysisApplication.generationId,generation);
  assert.equal(h.AttemptModel.records.get(id).status,'applied');assert.ok(h.attempt.rawResponseBody);
  assert.equal(h.attempt.visionTransport.budget.costUSD,.00011);
 });
});
test('product polling interrupted then resumed automatically: existing ID only, unknown budget retained',async()=>{
 let calls=0;
 await withHTTP(async(_url,opt)=>{calls++;if(calls===2)throw new TypeError('poll disconnected');
  return new Response(JSON.stringify(envelope(opt.method==='POST'?'queued':'completed')),{status:200});
 },async()=>{
  const h=product();await h.service.run(h.ref._id);h.attempt.visionTransport.nextPollAt=0;
  await h.service.resume(h.ref._id,h.attempt._id);
  assert.equal(h.Model.records.get(h.ref._id).status,'analyzing');assert.equal(h.attempt.status,'running');
  assert.equal(h.attempt.visionTransport.budget.reservationUSD,.36);
  h.attempt.visionTransport.nextPollAt=0;await h.service.reconcileExpiredOperations();
  assert.equal(h.Model.records.get(h.ref._id).status,'analyzed');assert.equal(calls,3);
 });
});
test('late completed response of superseded generation is archived but cannot overwrite current reference',async()=>{
 let calls=0,h;
 await withHTTP(async(_url,opt)=>{calls++;if(opt.method==='GET'){
  const ref=h.Model.records.get(h.ref._id);ref.operationToken='replacement-generation';ref.status='analyzing';ref.analysis={overview:'replacement preserved'};
 }return new Response(JSON.stringify(envelope(opt.method==='POST'?'queued':'completed')),{status:200});
 },async()=>{
  h=product();await h.service.run(h.ref._id);await assert.rejects(h.service.resume(h.ref._id,h.attempt._id));
  assert.equal(calls,2);assert.equal(h.attempt.rawResponse.status,'completed');
  assert.equal(h.Model.records.get(h.ref._id).operationToken,'replacement-generation');
  assert.equal(h.Model.records.get(h.ref._id).analysis.overview,'replacement preserved');
 });
});
test('storage CAS failure before creation sends zero HTTP and does not consume an in-memory authorization',async()=>{
 const h=fixture();h.store.compareAndSet=async()=>{throw Error('storage unavailable');};
 await assert.rejects(h.invoke(),/storage unavailable/);assert.equal(h.calls.length,0);assert.equal(h.persisted.checkpoint,null);
});
test('rejected creation and proven pre-dispatch failure cannot be reused or turned into false billing uncertainty',async()=>{
 for(const error of [Object.assign(Error('rejected'),{code:'OPENAI_HTTP_ERROR',httpStatus:400}),
   Object.assign(Error('no dispatch'),{visionDispatched:false})]) {
  const h=fixture();h.setSequence([error]);await assert.rejects(h.invoke(),e=>e.providerOutcomeUnknown===false);
  await assert.rejects(h.invoke({resumeOnly:true}),e=>e.code==='OPENAI_CREATION_NOT_ACCEPTED'&&!e.providerOutcomeUnknown);
  assert.equal(h.calls.length,1);
 }
});
test('known-ID timeout, invalid status/model/tier and expired provider ID all preserve evidence and never create twice',async()=>{
 const cases=[{value:Object.assign(Error('poll timeout'),{code:'OPENAI_TIMEOUT'}),code:'OPENAI_TIMEOUT',recover:true},
  {value:Object.assign(Error('expired ID'),{code:'OPENAI_HTTP_ERROR',httpStatus:404}),code:'OPENAI_HTTP_ERROR',recover:false},
  {value:envelope('mystery'),code:'OPENAI_BACKGROUND_STATUS',recover:false},
  {value:envelope('completed',{model:'different-model'}),code:'OPENAI_BACKGROUND_MODEL_MISMATCH',recover:false},
  {value:envelope('completed',{service_tier:'priority'}),code:'OPENAI_BACKGROUND_TIER_MISMATCH',recover:false}];
 for(const scenario of cases){
  const h=fixture();await h.invoke();h.clock.at+=5000;h.setSequence([scenario.value]);
  await assert.rejects(h.invoke({resumeOnly:true}),e=>e.code===scenario.code&&e.resumeExistingResponse===scenario.recover);
  assert.equal(h.persisted.checkpoint.responseId,'resp_background_fixture');assert.equal(h.calls.length,2);
  assert.equal(h.calls.filter(c=>c.options.method==='POST').length,1);assert.equal(h.persisted.checkpoint.budget.reservationUSD,.36);
 }
});
test('GET deadline uses AbortController once, sends original response ID, archives no invented output, never retries',async()=>{
 let count=0;
 await withHTTP(async(url,opt)=>{count++;assert.ok(url.endsWith('/responses/resp_existing'));
  return new Promise((_,reject)=>opt.signal.addEventListener('abort',()=>reject(Object.assign(Error('aborted'),{name:'AbortError'})),{once:true}));
 },async()=>{
  await assert.rejects(openaiRequest('responses/resp_existing',undefined,{method:'GET',timeout:5,clientRequestId:'retrieval-fixture'}),
    e=>e.code==='OPENAI_TIMEOUT'&&e.visionDispatched&&e.timeoutMs===5);
 });assert.equal(count,1);
});
test('two product service instances share durable tracking ownership and apply a single generation',async()=>{
 let post=0,get=0;
 await withHTTP(async(_url,opt)=>{if(opt.method==='POST')post++;else get++;
  return new Response(JSON.stringify(envelope(opt.method==='POST'?'queued':'completed')),{status:200});
 },async()=>{
  const h=product();await h.service.run(h.ref._id);h.attempt.visionTransport.nextPollAt=0;
  const other=createStructuralService({Model:h.Model,AttemptModel:h.AttemptModel,analysisContractVersion:1,logger:{warn(){}},productDiagnostics:()=>{},
    capture:()=>{throw Error('forbidden');},upload:()=>{throw Error('forbidden');}});
  const results=await Promise.allSettled([h.service.resume(h.ref._id,h.attempt._id),other.resume(h.ref._id,h.attempt._id)]);
  assert.ok(results.some(r=>r.status==='fulfilled'));assert.equal(post,1);assert.equal(get,1);
  assert.equal(h.attempt.status,'applied');assert.equal(h.Model.records.get(h.ref._id).analysisApplication.generationId,h.attempt.generationId);
 });
});
test('restart scan of uncertain creation without ID never dispatches and keeps reservation and client ID',async()=>{
 let calls=0;
 await withHTTP(async()=>{calls++;throw Object.assign(Error('create timeout'),{name:'AbortError'});},async()=>{
  const h=product();assert.equal((await h.service.run(h.ref._id)).status,'error');assert.equal(calls,1);
  const clientId=h.attempt.visionTransport.clientRequestId;
  await h.service.reconcileExpiredOperations();assert.equal(calls,1);
  assert.equal(h.attempt.visionTransport.clientRequestId,clientId);assert.equal(h.attempt.visionTransport.budget.reservationUSD,.36);
  assert.equal((await h.service.resume(h.ref._id,h.attempt._id)).status,'error');assert.equal(calls,1);
 });
});
