const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {executeBackground,hash,save}=require('../scripts/runStructuralVisionAB.script');
const {analysisV1}=require('./helpers/structural-analysis-fixture');
const authorization={id:'new-specific-approval',maximumCalls:10,capUSD:1,historicalKnownUSD:.00564705,historicalReservedUSD:.36};
function setup(n=2){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'structural-ab-background-test-')),clock={at:1000000};
 const tasks=Array.from({length:n},(_,i)=>{const body=JSON.stringify({model:'gpt-6-luna',background:true,store:false,service_tier:'default',
   reasoning:{effort:'medium'},instructions:'unchanged',input:[],text:{format:{strict:true}}});
  return {neutralId:`S${i+1}-A`,site:{id:String(i),title:'Fixture',metadata:{},captures:[],manifest:{}},version:1,body,expectedHash:hash(body)};});
 return {directory,tasks,clock,key:'offline-fixture-only',authorization,now:()=>clock.at,wait:async ms=>{clock.at+=ms;},validate:()=>{}};
}
const envelope=(status='queued',id='resp_fixture')=>({id,status,model:'gpt-6-luna',service_tier:'default',error:null,
 ...(status==='completed'?{usage:{input_tokens:100,output_tokens:200,total_tokens:300},output:[{content:[{type:'output_text',text:JSON.stringify(analysisV1())}]}]}:{})});
const response=value=>new Response(JSON.stringify(value),{status:200,headers:{'x-request-id':'req_fixture'}});
test('ten new creations sequentially, historic exposure never reset, raw and financial checkpoint precede artistic validation',async()=>{
 const h=setup(10);let posts=0;
 const ledger=await executeBackground({...h,transport:async(_url,options)=>{
  assert.equal(options.redirect,'error');assert.ok(options.headers['X-Client-Request-Id']);assert.equal(options.method,'POST');posts++;
  const durable=JSON.parse(fs.readFileSync(path.join(h.directory,'ledger.json')));assert.equal(durable.calls.length,posts);
  assert.ok(durable.exposureUSD>=.72564705-1e-10);assert.ok(durable.exposureUSD<=1);
  return response(envelope('completed',`resp_${posts}`));
 },validate:()=>{const durable=JSON.parse(fs.readFileSync(path.join(h.directory,'ledger.json'))),call=durable.calls.at(-1);
  assert.ok(fs.existsSync(path.join(h.directory,'calls',call.neutralId,'terminal-response.json')));
  assert.equal(call.checkpoint.budget.reservationUSD,0);assert.equal(call.checkpoint.budget.costUSD,.00011);
 }});assert.equal(posts,10);assert.equal(ledger.status,'completed');assert.equal(ledger.cumulativeReservedUSD,.36);
 assert.ok(Math.abs(ledger.cumulativeKnownUSD-(.00564705+.0011))<1e-12);
 const again=await executeBackground({...h,transport:()=>{throw Error('no retry');}});assert.equal(again.status,'completed');
});
test('more than 120 simulated seconds and transient GET loss: same ID, one POST, unchanged policy',async()=>{
 const h=setup(1);let post=0,get=0;
 const ledger=await executeBackground({...h,transport:async(url,opt)=>{
  if(opt.method==='POST'){post++;return response(envelope());}
  assert.ok(url.endsWith('/responses/resp_fixture'));get++;if(get===1){h.clock.at+=150000;throw new TypeError('GET disconnected');}
  return response(envelope('completed'));
 }});assert.equal(post,1);assert.equal(get,2);assert.equal(ledger.status,'completed');assert.ok(ledger.calls[0].elapsedMs>120000);
 assert.equal(ledger.calls[0].pollInterruptions,1);
});
test('simulated process crash after durable acknowledgement, new executor resumes GET only, costs charged once',async()=>{
 const h=setup(1);let post=0,get=0;
 const configuration=path.join(h.directory,'fixture.json');save(configuration,{directory:h.directory,tasks:h.tasks,key:h.key,authorization});
 const executor=require.resolve('../scripts/runStructuralVisionAB.script'),guard=require.resolve('./helpers/structural-offline-guard');
 const code=`const fs=require('node:fs');const c=JSON.parse(fs.readFileSync(${JSON.stringify(configuration)}));
 require(${JSON.stringify(executor)}).executeBackground({...c,now:()=>1000000,wait:async()=>process.exit(17),validate:()=>{},
 transport:async()=>new Response(JSON.stringify(${JSON.stringify(envelope())}),{status:200})});`;
 assert.throws(()=>require('node:child_process').execFileSync(process.execPath,['--require',guard,'-e',code]),e=>e.status===17);
 h.clock.at+=5000;
 const resumed=await executeBackground({...h,transport:async(_url,opt)=>{if(opt.method==='POST')post++;else get++;return response(envelope('completed'));}});
 assert.equal(post,0);assert.equal(get,1);assert.equal(resumed.status,'completed');assert.equal(resumed.calls[0].postInvocations,1);
 assert.equal(resumed.cumulativeReservedUSD,.36);assert.equal(resumed.calls[0].checkpoint.budget.costUSD,.00011);
});
test('two executors share a stage lock; no concurrent generation',async()=>{
 const h=setup(1);let release,post=0;const pending=new Promise(r=>{release=r;});
 const first=executeBackground({...h,transport:async()=>{post++;await pending;return response(envelope('completed'));}});
 await new Promise(r=>setImmediate(r));
 await assert.rejects(executeBackground({...h,transport:()=>{throw Error('must not fetch');}}),/Another executor/);
 release();assert.equal((await first).status,'completed');assert.equal(post,1);
});
test('creation acknowledgement lost, unknown usage or unknown status stop whole cohort, preserve .36, no next POST',async()=>{
 for(const kind of ['lost','usage','status']){
  const h=setup(3);let calls=0;
  const result=await executeBackground({...h,transport:async()=>{calls++;
   if(kind==='lost')throw new TypeError('connection lost');
   const raw=envelope(kind==='status'?'unknown':'completed');if(kind==='usage')raw.usage.total_tokens=1;return response(raw);
  }});
  assert.equal(calls,1);assert.equal(result.status,'stopped');assert.equal(result.cumulativeReservedUSD,.72);
  assert.ok(Math.abs(result.exposureUSD-.72564705)<1e-12);
  await executeBackground({...h,transport:()=>{throw Error('no redispatch on restart');}});
 }
});
test('all terminal failures and refusals stop before next creation with raw proof',async()=>{
 for(const kind of ['incomplete','failed','cancelled','refusal','invalidJSON']){
  const h=setup(2);let calls=0;
  const result=await executeBackground({...h,transport:async()=>{calls++;const raw=envelope(['refusal','invalidJSON'].includes(kind)?'completed':kind);
   if(kind==='refusal')raw.output=[{content:[{type:'refusal',refusal:'fixture'}]}];
   if(kind==='invalidJSON')raw.output=[{content:[{type:'output_text',text:'{ invalid'}]}];return response(raw);
  }});assert.equal(result.status,'stopped');assert.equal(calls,1);assert.ok(fs.existsSync(path.join(h.directory,'calls','S1-A','terminal-response.json')));
 }
});
test('native high first cost leaves insufficient budget for next reservation; no softened reservation',async()=>{
 const h=setup(2);let posts=0;
 const result=await executeBackground({...h,transport:async()=>{posts++;const raw=envelope('completed');
  raw.usage={input_tokens:1000000,output_tokens:120000,total_tokens:1120000,input_tokens_details:{cache_write_tokens:1000000}};return response(raw);
 }});assert.equal(posts,1);assert.equal(result.status,'stopped');assert.ok(result.availableUSD<.36);
 assert.equal(result.cumulativeReservedUSD,.36);assert.ok(result.exposureUSD<1);
});
test('global deadline, mismatched prepared hash and model prevent additional POST',async()=>{
 const h=setup(2);let post=0;
 const result=await executeBackground({...h,wait:async()=>{h.clock.at+=540001;},transport:async()=>{post++;return response(envelope());}});
 assert.equal(result.status,'stopped');assert.equal(post,1);assert.equal(result.calls[0].checkpoint.responseId,'resp_fixture');
 const wrong=setup(1);wrong.tasks[0].expectedHash='wrong';let calls=0;
 assert.equal((await executeBackground({...wrong,transport:()=>{calls++;}})).status,'stopped');assert.equal(calls,0);
});
