// Isolated experiment transport. Never starts the app, capture, DB, or upload services.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {createHash, randomInt, randomUUID} = require('node:crypto');
const {execFileSync} = require('node:child_process');
const sharp = require('sharp');
const {assemble, price} = require('./preflightStructuralVisionAB.script');
const {validateStructuralAnalysis} = require('../services/design-lab/structural-reference.contract');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const ENDPOINT = 'https://api.openai.com/v1/responses';
const RESERVATION = 0.36;
function save(file, value, raw = false) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  const fd = fs.openSync(temporary, 'wx', 0o600);
  try {fs.writeFileSync(fd, raw ? value : JSON.stringify(value, null, 2)+'\n');fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
  fs.renameSync(temporary, file);
  const dir = fs.openSync(path.dirname(file), 'r');
  try {fs.fsyncSync(dir);} finally {fs.closeSync(dir);}
}
function billed(usage) {
  assert.ok(usage, 'Missing provider usage');
  for (const key of ['input_tokens','output_tokens','total_tokens']) assert.ok(Number.isInteger(usage[key]) && usage[key]>=0, `Invalid ${key}`);
  assert.equal(usage.total_tokens, usage.input_tokens+usage.output_tokens);
  assert.ok(usage.input_tokens<=1050000 && usage.output_tokens<=128000, 'Native model limits exceeded');
  for (const key of ['cached_tokens','cache_write_tokens']) {
    const n=usage.input_tokens_details?.[key]??0;
    assert.ok(Number.isInteger(n)&&n>=0, `Invalid ${key}`);
  }
  const reasoning=usage.output_tokens_details?.reasoning_tokens??0;
  assert.ok(Number.isInteger(reasoning)&&reasoning>=0&&reasoning<=usage.output_tokens);
  return price(usage, usage.input_tokens>272000 ? {input:.20,cachedInput:.02,cacheWrite:.25,output:.75} : undefined);
}
async function execute({tasks, directory, key, transport=global.fetch, validate=validateStructuralAnalysis,
  timeoutMs=120000, cap=1, progress=()=>{}, beforeDispatch=()=>{}}) {
  assert.ok(tasks.length<=10 && tasks.length>0);
  const ledger={experimentId:path.basename(directory),status:'prepared',maximumCalls:10,capUSD:cap,
    reservationUSD:RESERVATION,spentUSD:0,uncertainReservedUSD:0,calls:[],automaticRetries:0};
  const checkpoint=()=>save(path.join(directory,'ledger.json'),ledger);
  checkpoint();
  let actualModel;
  for(const task of tasks) {
    const callDir=path.join(directory,'calls',task.neutralId);
    fs.mkdirSync(callDir,{recursive:true});
    const call={neutralId:task.neutralId,siteId:task.site.id,status:'prepared',requestSha256:hash(task.body),reservedUSD:0};
    try {
      beforeDispatch();
      assert.equal(call.requestSha256,task.expectedHash,'Frozen request hash mismatch');
      assert.ok(ledger.calls.length<10,'Call limit reached');
      assert.ok(ledger.spentUSD+ledger.uncertainReservedUSD+RESERVATION<=cap,'Preventive budget insufficient');
      save(path.join(callDir,'request.json'),task.body,true);
      call.reservedUSD=RESERVATION;call.status='dispatch_committed';call.startedAt=new Date().toISOString();
      ledger.calls.push(call);ledger.status='running';ledger.uncertainReservedUSD+=RESERVATION;
      checkpoint(); // Slot and worst-case liability must exist durably BEFORE fetch.
      progress({event:'dispatch',site:task.site.title,number:ledger.calls.length,spentUSD:ledger.spentUSD});
      const controller=new AbortController();
      const started=Date.now();let timer;
      const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('REQUEST_TIMEOUT'));},timeoutMs);});
      let response,bytes;
      try {
        ({response,bytes}=await Promise.race([
          (async()=>{const response=await transport(ENDPOINT,{method:'POST',redirect:'error',
            headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:task.body,signal:controller.signal});
            const bytes=Buffer.from(await response.arrayBuffer());return {response,bytes};})(),timeout]));
      } finally {clearTimeout(timer);}
      // Complete raw body and HTTP metadata precede even provider-envelope JSON parsing.
      save(path.join(callDir,'raw-response.json'),bytes,true);
      const http={status:response.status,elapsedMs:Date.now()-started,receivedAt:new Date().toISOString(),
        requestId:response.headers.get('x-request-id'),contentType:response.headers.get('content-type'),date:response.headers.get('date'),
        rawSha256:hash(bytes)};
      save(path.join(callDir,'transport.json'),http);
      call.httpStatus=http.status;call.elapsedMs=http.elapsedMs;call.requestId=http.requestId;
      const envelope=JSON.parse(bytes.toString('utf8'));
      save(path.join(callDir,'provider-metadata.json'),{id:envelope.id,model:envelope.model,serviceTier:envelope.service_tier,
        status:envelope.status,usage:envelope.usage,error:envelope.error,incompleteDetails:envelope.incomplete_details});
      if(envelope.usage) {
        const cost=billed(envelope.usage);
        assert.ok(cost<=RESERVATION,'Charge exceeds reserved native maximum');
        call.costUSD=cost;call.usage=envelope.usage;call.reservedUSD=0;
        ledger.spentUSD+=cost;ledger.uncertainReservedUSD-=RESERVATION;
        checkpoint();
      }
      assert.ok(response.ok,`PROVIDER_HTTP_${response.status}`);
      assert.ok(envelope.usage,'Missing provider usage');
      assert.equal(envelope.status,'completed','Incomplete provider result');
      assert.equal(envelope.error??null,null,'Provider error');
      assert.ok(envelope.model==='gpt-6-luna'||envelope.model?.startsWith('gpt-6-luna-'),'Provider model mismatch');
      assert.equal(envelope.service_tier,'default','Provider tier mismatch');
      if(actualModel)assert.equal(envelope.model,actualModel,'Model snapshot changed');
      actualModel=envelope.model;
      assert.ok(http.elapsedMs<timeoutMs,'REQUEST_TIMEOUT');
      const contents=envelope.output?.flatMap(o=>o.content||[])||[];
      assert.ok(!contents.some(c=>c.type==='refusal'),'Provider refusal');
      const text=contents.filter(c=>c.type==='output_text').map(c=>c.text).join('');
      save(path.join(callDir,'output-text.txt'),text,true);
      const parsed=JSON.parse(text);
      save(path.join(callDir,'parsed.json'),parsed);
      validate(parsed,task.site.metadata,task.site.captures,task.site.manifest,task.version);
      save(path.join(callDir,'validation.json'),{valid:true,checkedAt:new Date().toISOString()});
      call.status='validated';checkpoint();
      progress({event:'validated',site:task.site.title,number:ledger.calls.length,spentUSD:ledger.spentUSD});
    } catch(error) {
      call.status='stopped';call.error={message:error.message,code:error.code,validation:error.validation};
      save(path.join(callDir,'validation.json'),{valid:false,...call.error});
      if(!ledger.calls.includes(call))ledger.blockedCall=call;
      ledger.status='stopped';ledger.stopReason=call.error;checkpoint();
      progress({event:'stopped',number:ledger.calls.length,spentUSD:ledger.spentUSD,reason:error.message});
      return ledger; // Never continue to another site, retry, or resume on failure.
    }
  }
  ledger.status='completed';checkpoint();return ledger;
}
function preservation(repository, auditDirectory) {
  const paths=execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard'],{cwd:repository}).toString().split('\0').filter(Boolean);
  const files={};
  for(const name of paths) {
    if(name.includes('.env')||name==='server/scripts/runStructuralVisionAB.script.js')continue;
    const file=path.join(repository,name);
    if(fs.existsSync(file)&&fs.statSync(file).isFile())files[name]=hash(fs.readFileSync(file));
  }
  const index=JSON.parse(fs.readFileSync(path.join(repository,'server/docs/STRUCTURAL_B1_BASELINE_INDEX.json')));
  for(const reference of index.references)for(const name of ['analysis.json','manifest.json',...reference.inputAssets.map(a=>`${a.id}.webp`)]){
    const file=path.join(auditDirectory,reference.id,name);files[`historical/${reference.id}/${name}`]=hash(fs.readFileSync(file));
  }
  files['historical/private-snapshot']=hash(fs.readFileSync(path.join(auditDirectory,'baseline-private.json')));
  return {head:execFileSync('git',['rev-parse','HEAD'],{cwd:repository}).toString().trim(),files};
}
async function main() {
  assert.deepEqual(process.argv.slice(2),['--execute-approved-ten-calls'],'Explicit execution flag required');
  const repository=path.resolve(__dirname,'../..');
  const root=path.join(repository,'server/diagnostics/structural-b1-ab-20261008');
  const lock=path.join(root,'approved-execution.lock');
  // Persistent lock remains after completion or failure: accidental rerun cannot consume more calls.
  const lockFD=fs.openSync(lock,'wx',0o600);fs.closeSync(lockFD);
  const directory=path.join(root,'runs',new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8));
  fs.mkdirSync(directory,{recursive:true});save(lock,{directory,createdAt:new Date().toISOString()});
  const protocolBytes=fs.readFileSync(path.join(repository,'server/docs/STRUCTURAL_B1_AB_PREPARED.json'));
  const protocol=JSON.parse(protocolBytes);
  assert.equal(protocol.proposedMaximumCalls,10);assert.equal(protocol.sites.length,5);
  assert.equal(protocol.parameters.model,'gpt-6-luna');assert.equal(protocol.parameters.timeoutMs,120000);
  assert.equal(protocol.parameters.automaticRetries,0);assert.equal(protocol.parameters.reasoningEffort,'medium');
  const auditDirectory='/private/tmp/gusto-structural-b1-audit-20261008';
  const before=preservation(repository,auditDirectory);
  save(path.join(directory,'preservation-before.json'),before);
  save(path.join(directory,'approved-protocol.json'),protocolBytes,true);
  save(path.join(directory,'executor.js'),fs.readFileSync(__filename),true);
  save(path.join(directory,'approval.json'),{source:'Explicit human authorization in current chat',date:new Date().toISOString(),maximumCalls:10,
    capUSD:1,taxesIncluded:false,automaticRetries:0,protocolSha256:hash(protocolBytes),endpoint:ENDPOINT,
    pricingVerifiedAt:'2026-10-08',rates:protocol.preflight.budget.ratesPerMillion});
  save(path.join(directory,'evaluation-preregistration.json'),protocol.preflight.evaluation);
  const truthFile=path.join(root,'composition-reference.json');
  save(path.join(directory,'composition-reference.json'),fs.readFileSync(truthFile),true);
  const tasks=[],mapping=[];
  for(const [i,site] of protocol.sites.entries()) {
    const assets=[];
    for(const view of site.manifest.views) {
      const expected=site.inputAssets.find(a=>a.id===view.id);
      const bytes=fs.readFileSync(path.join(root,'preflight/inputs',site.id,`${view.id}.webp`));
      assert.equal(hash(bytes),expected.sha256);
      const meta=await sharp(bytes).metadata();assert.equal(meta.width,expected.width);assert.equal(meta.height,expected.height);
      assets.push({url:view.url,dataUrl:`data:image/webp;base64,${bytes.toString('base64')}`});
    }
    const displayOrder=randomInt(2)?[1,2]:[2,1],executionOrder=randomInt(2)?[1,2]:[2,1];
    const pair=[];
    for(const version of [1,2]) {
      const body=JSON.stringify(assemble(site,version,assets));
      const expectedHash=protocol.preflight.checks.find(c=>c.id===site.id).variants.find(v=>v.version===version).requestSha256;
      assert.equal(hash(body),expectedHash);
      const neutralId=`S${i+1}-${displayOrder.indexOf(version)===0?'A':'B'}`;
      pair.push({site,version,body,expectedHash,neutralId});
      mapping.push({siteId:site.id,title:site.title,neutralId,version});
    }
    tasks.push(...executionOrder.map(version=>pair.find(t=>t.version===version)));
  }
  save(path.join(directory,'private-unblind-mapping.json'),mapping);
  save(path.join(directory,'dispatch-plan.json'),tasks.map(({body,...t})=>({neutralId:t.neutralId,siteId:t.site.id,requestSha256:t.expectedHash})));
  save(path.join(directory,'mapping-commitment.json'),{sha256:hash(JSON.stringify(mapping))});
  const envText=fs.readFileSync(path.join(repository,'server/.env'),'utf8');
  const envValue=name=>{const value=envText.match(new RegExp(`^${name}\\s*=\\s*([^\\r\\n]*)`,'m'))?.[1]?.trim();return value?.replace(/^['"]|['"]$/g,'');};
  const key=process.env.OPENAI_API_KEY||envValue('OPENAI_API_KEY');assert.ok(key,'API key absent');
  assert.equal(process.env.OPENAI_DESIGN_REFERENCE_ANALYSIS_MODEL||envValue('OPENAI_DESIGN_REFERENCE_ANALYSIS_MODEL')||'gpt-6-luna','gpt-6-luna');
  console.log(JSON.stringify({event:'ready',directory,calls:tasks.length,capUSD:1}));
  const ledger=await execute({tasks,directory,key,beforeDispatch:()=>{
    assert.deepEqual(preservation(repository,auditDirectory),before,'Historical artifacts or source changed during experiment');
  },progress:event=>console.log(JSON.stringify(event))});
  const after=preservation(repository,auditDirectory);
  save(path.join(directory,'preservation-after.json'),{unchanged:JSON.stringify(after)===JSON.stringify(before),...after});
  assert.deepEqual(after,before,'Historical artifacts or application source changed');
  console.log(JSON.stringify({event:'finished',directory,status:ledger.status,calls:ledger.calls.length,spentUSD:ledger.spentUSD,uncertainReservedUSD:ledger.uncertainReservedUSD}));
}
// The synchronous executor above is retained for historical fixtures only.
// All new real execution uses the same coordinator and HTTP function as product.
const {backgroundResponse,POLICY}=require('../services/design-lab/structural-vision-background');
const {openaiRequest}=require('../services/design-lab/openai-transport');
const {isDeepStrictEqual}=require('node:util');
function workerLock(directory) {
  const file=path.join(directory,'worker.lock'),token=randomUUID();
  const claim=()=>{const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify({pid:process.pid,token}));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}};
  try{claim();}catch(error){
    if(error.code!=='EEXIST')throw error;
    const previous=JSON.parse(fs.readFileSync(file));let alive=true;
    try{process.kill(previous.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}
    assert.ok(!alive,'Another executor is alive; no dispatch');
    const reclaim=path.join(directory,'worker-reclaim.lock'),fd=fs.openSync(reclaim,'wx',0o600);
    try{assert.deepEqual(JSON.parse(fs.readFileSync(file)),previous);fs.renameSync(file,file+'.abandoned-'+randomUUID());claim();}
    finally{fs.closeSync(fd);fs.unlinkSync(reclaim);}
  }
  return {assert:()=>assert.equal(JSON.parse(fs.readFileSync(file)).token,token,'Executor ownership lost'),
    release:()=>{if(JSON.parse(fs.readFileSync(file)).token===token)fs.unlinkSync(file);}};
}
function financials(ledger) {
  ledger.newKnownCostUSD=ledger.calls.reduce((n,c)=>n+(c.checkpoint?.budget?.costUSD??0),0);
  ledger.newReservedUSD=ledger.calls.reduce((n,c)=>n+(c.checkpoint?.budget?.reservationUSD??0),0);
  ledger.cumulativeKnownUSD=ledger.historicalKnownUSD+ledger.newKnownCostUSD;
  ledger.cumulativeReservedUSD=ledger.historicalReservedUSD+ledger.newReservedUSD;
  ledger.exposureUSD=ledger.cumulativeKnownUSD+ledger.cumulativeReservedUSD;
  ledger.availableUSD=ledger.capUSD-ledger.exposureUSD;
  assert.ok(ledger.exposureUSD<=ledger.capUSD+1e-12,'Cumulative budget exceeded');
}
async function executeBackground({tasks,directory,key,transport=global.fetch,validate=validateStructuralAnalysis,
  authorization,now=()=>Date.now(),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),progress=()=>{},beforeRequest=()=>{}}) {
  assert.ok(authorization?.id&&authorization.maximumCalls===10&&authorization.capUSD===1,'Exact fresh cohort approval required');
  assert.equal(authorization.historicalKnownUSD,.00564705);assert.equal(authorization.historicalReservedUSD,.36);
  assert.ok(tasks.length>0&&tasks.length<=10);assert.ok(key);
  const digest=hash(JSON.stringify(tasks.map(t=>({neutralId:t.neutralId,version:t.version,requestSha256:t.expectedHash,site:t.site}))));
  const lock=workerLock(directory),ledgerFile=path.join(directory,'ledger.json');let ledger;
  const persist=()=>{financials(ledger);save(ledgerFile,ledger);};
  try {
    ledger=fs.existsSync(ledgerFile)?JSON.parse(fs.readFileSync(ledgerFile)):{version:3,mode:'background',
      experimentId:path.basename(directory),authorizationId:authorization.id,taskDigest:digest,status:'prepared',
      maximumCalls:10,capUSD:1,historicalKnownUSD:authorization.historicalKnownUSD,
      historicalReservedUSD:authorization.historicalReservedUSD,calls:[],automaticCreationRetries:0};
    assert.equal(ledger.version,3);assert.equal(ledger.mode,'background');assert.equal(ledger.authorizationId,authorization.id);
    assert.equal(ledger.capUSD,1);assert.equal(ledger.maximumCalls,10);
    assert.equal(ledger.taskDigest,digest);assert.equal(ledger.historicalKnownUSD,.00564705);assert.equal(ledger.historicalReservedUSD,.36);
    if(['stopped','completed'].includes(ledger.status))return ledger;
    persist();
    for(const task of tasks) {
      const callDir=path.join(directory,'calls',task.neutralId);fs.mkdirSync(callDir,{recursive:true});
      let call=ledger.calls.find(c=>c.neutralId===task.neutralId);
      if(call?.status==='validated')continue;
      const body=JSON.parse(task.body);
      try {
        assert.equal(hash(task.body),task.expectedHash,'Frozen background request hash mismatch');
        assert.equal(body.model,'gpt-6-luna');assert.equal(body.background,true);assert.equal(body.store,false);
        assert.equal(body.service_tier,'default');assert.equal(body.reasoning.effort,'medium');assert.equal(body.text.format.strict,true);
        const requestFile=path.join(callDir,'request.json');
        if(fs.existsSync(requestFile))assert.equal(hash(fs.readFileSync(requestFile)),task.expectedHash);
        else save(requestFile,task.body,true);
        const store={
          load:async()=>structuredClone(call?.checkpoint??null),
          compareAndSet:async(expected,next)=>{
            lock.assert();if(!isDeepStrictEqual(call?.checkpoint??null,expected))return null;
            if(!call){
              financials(ledger);assert.ok(ledger.calls.length<10&&ledger.availableUSD>=RESERVATION,'Preventive cumulative budget insufficient');
              call={neutralId:task.neutralId,siteId:task.site.id,generationId:randomUUID(),requestSha256:task.expectedHash,
                status:'dispatch_committed',postInvocations:0,getInvocations:0,startedAt:now(),checkpoint:null};ledger.calls.push(call);
            }
            call.checkpoint=structuredClone(next);persist(); // One authoritative atomic slot + checkpoint + global liability.
            save(path.join(callDir,'checkpoint.json'),next);return structuredClone(next);
          },
          beforeRequest:async()=>{lock.assert();await beforeRequest();},
          archiveRawBody:async(raw,http)=>{
            lock.assert();const responses=path.join(callDir,'http');fs.mkdirSync(responses,{recursive:true});
            const name=String(fs.readdirSync(responses).filter(n=>n.endsWith('.body')).length+1).padStart(4,'0');
            save(path.join(responses,name+'.body'),raw,true);save(path.join(responses,name+'.json'),{...http,rawSha256:hash(raw)});
            save(path.join(callDir,'raw-response.json'),raw,true);
          },
          readRawBody:async()=>{const f=path.join(callDir,'raw-response.json');return fs.existsSync(f)?fs.readFileSync(f,'utf8'):null;},
          readTerminalResponse:async()=>{const f=path.join(callDir,'terminal-response.json');return fs.existsSync(f)?JSON.parse(fs.readFileSync(f)):null;},
        };
        let result;
        do {
          financials(ledger);
          try {
            result=await backgroundResponse(body,{store,now,authorization:{id:authorization.id,maximumCalls:1,capUSD:1,
              spentUSD:ledger.cumulativeKnownUSD,reservedUSD:ledger.cumulativeReservedUSD},resumeOnly:Boolean(call),
              request:(endpoint,payload,options)=>openaiRequest(endpoint,payload,{...options,apiKey:key,
                transport:async(url,http)=>{
                  lock.assert();const post=http.method==='POST';
                  if(post){assert.equal(call.postInvocations,0);call.postInvocations++;}else call.getInvocations++;
                  ledger.status='running';persist();
                  progress({event:post?'creation':'retrieval',neutralId:task.neutralId,site:task.site.title,
                    calls:ledger.calls.length,exposureUSD:ledger.exposureUSD});
                  return transport(url,http);
                }}),
              onResponse:async raw=>{save(path.join(callDir,'terminal-response.json'),raw);save(path.join(callDir,'provider-metadata.json'),{
                id:raw.id,model:raw.model,status:raw.status,serviceTier:raw.service_tier,usage:raw.usage,error:raw.error,incompleteDetails:raw.incomplete_details});},
            });
          }catch(error){
            if(!error.resumeExistingResponse)throw error;
            call.pollInterruptions=(call.pollInterruptions||0)+1;call.lastPollError={code:error.code||'TRANSPORT_ERROR',at:now()};persist();
            progress({event:'poll_interrupted_same_id',neutralId:task.neutralId,responseId:call.checkpoint.responseId});
            result={pendingVision:true};
          }
          if(result.pendingVision)await wait(Math.min(10000,Math.max(1,(call.checkpoint.nextPollAt||now()+POLICY.pollIntervalMs)-now())));
        }while(result.pendingVision);
        if(ledger.actualModel)assert.equal(result.model,ledger.actualModel,'Model snapshot changed across cohort');
        ledger.actualModel=result.model;call.completedAt=now();call.elapsedMs=call.completedAt-call.startedAt;persist();
        const contents=result.output?.flatMap(o=>o.content||[])||[];
        assert.ok(!contents.some(c=>c.type==='refusal'),'Provider refusal');
        const text=result.output_text||contents.filter(c=>c.type==='output_text').map(c=>c.text).join('');
        save(path.join(callDir,'output-text.txt'),text,true);const parsed=JSON.parse(text);save(path.join(callDir,'parsed.json'),parsed);
        validate(parsed,task.site.metadata,task.site.captures,task.site.manifest,task.version);
        save(path.join(callDir,'validation.json'),{valid:true,checkedAt:new Date(now()).toISOString()});
        call.status='validated';call.validatedAt=now();persist();
        progress({event:'validated',neutralId:task.neutralId,site:task.site.title,elapsedMs:call.elapsedMs,
          costUSD:call.checkpoint.budget.costUSD,exposureUSD:ledger.exposureUSD});
      }catch(error){
        const failure={code:error.code||'EXPERIMENT_FAILED',message:require('../services/design-lab/structural-operation-diagnostic').safeText(error.message),at:now()};
        if(call){call.status='stopped';call.error=failure;}else ledger.blockedCall={neutralId:task.neutralId,error:failure};
        ledger.status='stopped';ledger.stopReason=failure;persist();save(path.join(callDir,'validation.json'),{valid:false,...failure});
        progress({event:'stopped',...failure,calls:ledger.calls.length,exposureUSD:ledger.exposureUSD});return ledger;
      }
    }
    ledger.status='completed';persist();return ledger;
  }finally{lock.release();}
}
async function backgroundMain() {
  if(process.argv[2]==='--resume-approved-background')return resumeBackgroundMain();
  assert.deepEqual(process.argv.slice(2),['--execute-approved-background-ten-calls'],'Exact new background execution flag required');
  const repository=path.resolve(__dirname,'../..'),root=path.join(repository,'server/diagnostics/structural-b1-ab-background-20261008');
  const preflight=JSON.parse(fs.readFileSync(path.join(root,'technical-preflight.json')));
  assert.equal(preflight.blockingChecksPassed,true);assert.equal(preflight.authorizedMaximumCalls,10);
  const protocolFile=path.join(repository,'server/docs/STRUCTURAL_B1_AB_PREPARED.json'),protocolBytes=fs.readFileSync(protocolFile);
  assert.equal(hash(protocolBytes),preflight.originalProtocolSha256);const protocol=JSON.parse(protocolBytes);
  const baseline=JSON.parse(fs.readFileSync(path.join(root,'integration-preservation-before.json')));
  const verifyPreserved=()=>{
    for(const [file,expected]of Object.entries(baseline.files)){
      if(['server/scripts/runStructuralVisionAB.script.js','server/services/design-lab/openai.service.js'].includes(file))continue;
      const absolute=path.isAbsolute(file)?file:path.join(repository,file);assert.equal(hash(fs.readFileSync(absolute)),expected,'Historical/source preservation: '+file);
    }
    for(const [file,expected]of Object.entries(preflight.executorSourceHashes))assert.equal(hash(fs.readFileSync(path.join(repository,file))),expected,'Frozen executor source changed');
    assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:repository}).toString().trim(),baseline.head);
  };
  verifyPreserved();
  const envText=fs.readFileSync(path.join(repository,'server/.env'),'utf8');
  const value=name=>{const found=envText.match(new RegExp(`^${name}\\s*=\\s*([^\\r\\n]*)`,'m'))?.[1]?.trim();return found?.replace(/^['"]|['"]$/g,'');};
  const key=process.env.OPENAI_API_KEY||value('OPENAI_API_KEY');assert.ok(key,'API key absent');
  assert.equal(process.env.OPENAI_DESIGN_REFERENCE_ANALYSIS_MODEL||value('OPENAI_DESIGN_REFERENCE_ANALYSIS_MODEL')||'gpt-6-luna','gpt-6-luna');
  const oldRun=path.join(repository,'server/diagnostics/structural-b1-ab-20261008/runs/2026-10-08T18-56-27-309Z-50c62f71');
  const oldLedger=JSON.parse(fs.readFileSync(path.join(oldRun,'ledger.json')));assert.equal(oldLedger.spentUSD,.00564705);assert.equal(oldLedger.uncertainReservedUSD,.36);
  const lock=path.join(root,'approved-background-execution.lock'),lockFD=fs.openSync(lock,'wx',0o600);fs.closeSync(lockFD);
  const directory=path.join(root,'runs',new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8));
  fs.mkdirSync(directory,{recursive:true});save(lock,{directory,createdAt:new Date().toISOString()});
  const authorization={id:randomUUID(),maximumCalls:10,capUSD:1,historicalKnownUSD:.00564705,historicalReservedUSD:.36,
    sourceAttachmentSha256:preflight.sourceAttachmentSha256,source:'Explicit human authorization for ten NEW background calls, historical exposure included'};
  save(path.join(directory,'approval.json'),authorization);save(path.join(directory,'original-protocol.json'),protocolBytes,true);
  save(path.join(directory,'operational-amendment.json'),preflight);save(path.join(directory,'executor.js'),fs.readFileSync(__filename),true);
  save(path.join(directory,'coordinator.js'),fs.readFileSync(path.join(repository,'server/services/design-lab/structural-vision-background.js')),true);
  save(path.join(directory,'http-transport.js'),fs.readFileSync(path.join(repository,'server/services/design-lab/openai-transport.js')),true);
  save(path.join(directory,'evaluation-preregistration.json'),protocol.preflight.evaluation);
  save(path.join(directory,'composition-reference.json'),fs.readFileSync(path.join(repository,'server/diagnostics/structural-b1-ab-20261008/composition-reference.json')),true);
  const tasks=[],mapping=[];
  for(const [index,site]of protocol.sites.entries()){
    const assets=[];
    for(const view of site.manifest.views){
      const bytes=fs.readFileSync(path.join(repository,'server/diagnostics/structural-b1-ab-20261008/preflight/inputs',site.id,view.id+'.webp'));
      const expected=site.inputAssets.find(a=>a.id===view.id);assert.equal(hash(bytes),expected.sha256);
      const meta=await sharp(bytes).metadata();assert.equal(meta.width,expected.width);assert.equal(meta.height,expected.height);
      assets.push({url:view.url,dataUrl:'data:image/webp;base64,'+bytes.toString('base64')});
    }
    const display=randomInt(2)?[1,2]:[2,1],order=randomInt(2)?[1,2]:[2,1],pair=[];
    for(const version of [1,2]){
      const original=assemble(site,version,assets);assert.equal(hash(JSON.stringify(original)),protocol.preflight.checks.find(c=>c.id===site.id).variants.find(v=>v.version===version).requestSha256);
      const body=JSON.stringify({...original,background:true}),expectedHash=preflight.requests.find(r=>r.siteId===site.id&&r.version===version).backgroundRequestSha256;
      assert.equal(hash(body),expectedHash);const neutralId=`S${index+1}-${display.indexOf(version)===0?'A':'B'}`;
      pair.push({site,version,body,expectedHash,neutralId});mapping.push({siteId:site.id,title:site.title,neutralId,version});
    }
    assert.deepEqual(JSON.parse(pair[0].body).input,JSON.parse(pair[1].body).input);
    tasks.push(...order.map(version=>pair.find(t=>t.version===version)));
  }
  assert.equal(tasks[0].site.id,'6ac39cff599b9a26b2dc05d2');assert.equal(tasks.length,10);
  save(path.join(directory,'private-unblind-mapping.json'),mapping);save(path.join(directory,'mapping-commitment.json'),{sha256:hash(JSON.stringify(mapping))});
  save(path.join(directory,'dispatch-plan.json'),tasks.map(({body,...t})=>({...t,requestSha256:t.expectedHash})));
  for(const task of tasks){const d=path.join(directory,'calls',task.neutralId);fs.mkdirSync(d,{recursive:true});save(path.join(d,'request.json'),task.body,true);}
  console.log(JSON.stringify({event:'ready',directory,newCalls:10,cumulativeCapUSD:1,initialAvailableUSD:.63435295}));
  const ledger=await executeBackground({tasks,directory,key,authorization,beforeRequest:verifyPreserved,
    progress:event=>{if(event.event!=='retrieval')console.log(JSON.stringify(event));}});
  verifyPreserved();save(path.join(directory,'preservation-after.json'),{verified:true,protectedFiles:Object.keys(baseline.files).length,headUnchanged:true});
  console.log(JSON.stringify({event:'finished',directory,status:ledger.status,newPOSTs:ledger.calls.reduce((n,c)=>n+c.postInvocations,0),
    newKnownUSD:ledger.newKnownCostUSD,knownCumulativeUSD:ledger.cumulativeKnownUSD,uncertainReservedUSD:ledger.cumulativeReservedUSD,exposureUSD:ledger.exposureUSD}));
}
async function resumeBackgroundMain() {
  assert.equal(process.argv.length,4,'One exact existing run directory required');
  const repository=path.resolve(__dirname,'../..'),root=path.join(repository,'server/diagnostics/structural-b1-ab-background-20261008');
  const approved=JSON.parse(fs.readFileSync(path.join(root,'approved-background-execution.lock'))),directory=path.resolve(process.argv[3]);
  assert.equal(directory,approved.directory);const frozen=JSON.parse(fs.readFileSync(path.join(directory,'operational-amendment.json')));
  for(const [file,expected]of Object.entries(frozen.executorSourceHashes))assert.equal(hash(fs.readFileSync(path.join(repository,file))),expected);
  const authorization=JSON.parse(fs.readFileSync(path.join(directory,'approval.json')));
  assert.equal(authorization.sourceAttachmentSha256,frozen.sourceAttachmentSha256);
  const tasks=JSON.parse(fs.readFileSync(path.join(directory,'dispatch-plan.json'))).map(task=>({...task,
    body:fs.readFileSync(path.join(directory,'calls',task.neutralId,'request.json'),'utf8')}));
  const env=fs.readFileSync(path.join(repository,'server/.env'),'utf8');
  const key=process.env.OPENAI_API_KEY||env.match(/^OPENAI_API_KEY\s*=\s*([^\r\n]*)/m)?.[1]?.trim().replace(/^['"]|['"]$/g,'');assert.ok(key);
  const result=await executeBackground({tasks,directory,key,authorization,progress:e=>{if(e.event!=='retrieval')console.log(JSON.stringify(e));}});
  console.log(JSON.stringify({event:'finished',directory,status:result.status,exposureUSD:result.exposureUSD}));
}
// The old authorization/flag cannot launch a new run.
if(require.main===module)backgroundMain().catch(error=>{console.error(JSON.stringify({event:'local_failure',message:error.message}));process.exitCode=1;});
module.exports={execute,billed,hash,save,executeBackground,workerLock,financials};
