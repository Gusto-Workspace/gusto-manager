const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execute,billed,hash}=require('../scripts/runStructuralVisionAB.script');
const setup=()=>{const directory=fs.mkdtempSync(path.join(os.tmpdir(),'structural-ab-executor-test-'));return {directory,key:'fake-key-never-dispatched'};};
const tasks=n=>Array.from({length:n},(_,i)=>({neutralId:`S${i+1}-A`,site:{id:String(i),title:`Site ${i}`,metadata:{},captures:[],manifest:{}},version:1,body:'{}',expectedHash:hash('{}')}));
const ok=()=>new Response(JSON.stringify({model:'gpt-6-luna',status:'completed',service_tier:'default',error:null,
  usage:{input_tokens:100,output_tokens:200,total_tokens:300},output:[{content:[{type:'output_text',text:'{}'}]}]}),{status:200,headers:{'x-request-id':'test-only'}});
test('Ten calls sequentially; durable reservation before transport; raw archived before validation',async()=>{
 const config=setup();let count=0,active=0;
 const result=await execute({...config,tasks:tasks(10),transport:async()=>{
  assert.equal(active++,0);const ledger=JSON.parse(fs.readFileSync(path.join(config.directory,'ledger.json')));
  assert.equal(ledger.calls.length,++count);assert.equal(ledger.calls.at(-1).status,'dispatch_committed');
  assert.ok(ledger.uncertainReservedUSD>=.36-1e-10);active--;return ok();
 },validate:()=>{const ledger=JSON.parse(fs.readFileSync(path.join(config.directory,'ledger.json')));
  assert.ok(fs.existsSync(path.join(config.directory,'calls',ledger.calls.at(-1).neutralId,'raw-response.json')));
 }});
 assert.equal(result.status,'completed');assert.equal(count,10);assert.equal(result.uncertainReservedUSD,0);
 assert.ok(result.spentUSD<1);
});
test('Invalid business output halts cohort after first raw/parsed archive; no retry',async()=>{
 const config=setup();let count=0;const result=await execute({...config,tasks:tasks(10),transport:async()=>{count++;return ok();},validate:()=>{throw Error('INVALID_TEST_OUTPUT');}});
 assert.equal(count,1);assert.equal(result.status,'stopped');assert.ok(result.spentUSD>0);
 assert.ok(fs.existsSync(path.join(config.directory,'calls','S1-A','parsed.json')));
});
test('HTTP error retains unknown liability and stops; no retry',async()=>{
 const config=setup();let count=0;const result=await execute({...config,tasks:tasks(10),transport:async()=>{count++;return new Response('{"error":{"message":"quota"}}',{status:429});}});
 assert.equal(count,1);assert.equal(result.status,'stopped');assert.equal(result.uncertainReservedUSD,.36);
 assert.ok(fs.existsSync(path.join(config.directory,'calls','S1-A','raw-response.json')));
});
test('Timeout aborts once and keeps reservation',async()=>{
 const config=setup();let count=0,aborted=false;
 const result=await execute({...config,tasks:tasks(10),timeoutMs:5,transport:(_url,{signal})=>{count++;signal.addEventListener('abort',()=>{aborted=true;});return new Promise(()=>{});}});
 assert.equal(count,1);assert.equal(aborted,true);assert.equal(result.status,'stopped');assert.equal(result.uncertainReservedUSD,.36);
});
test('Preventive cap or request hash mismatch blocks dispatch altogether',async()=>{
 for(const fault of ['cap','hash']){let count=0;const t=tasks(1);if(fault==='hash')t[0].expectedHash='wrong';
 const result=await execute({...setup(),tasks:t,cap:fault==='cap'?.35:1,transport:async()=>{count++;return ok();}});
 assert.equal(count,0);assert.equal(result.calls.length,0);assert.equal(result.status,'stopped');}
});
test('Cost includes cache writes and reasoning exactly once; rejects inconsistent usage',()=>{
 assert.equal(billed({input_tokens:10000,output_tokens:2000,total_tokens:12000,input_tokens_details:{cached_tokens:2000,cache_write_tokens:1000},output_tokens_details:{reasoning_tokens:1500}}),.001845);
 assert.throws(()=>billed({input_tokens:100,output_tokens:200,total_tokens:299}));
 assert.throws(()=>billed({input_tokens:100,output_tokens:200,total_tokens:300,input_tokens_details:{cached_tokens:101}}));
});
