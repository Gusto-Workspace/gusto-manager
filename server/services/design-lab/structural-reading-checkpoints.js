const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {isDeepStrictEqual}=require('node:util');
const {randomUUID}=require('node:crypto');
const {digest}=require('./structural-original-evidence');
const save=(file,value)=>{const temp=`${file}.${randomUUID()}.tmp`;fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx'});fs.renameSync(temp,file);};
const read=file=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
// A single cohort lock and ledger own all site/variant stage reservations.
// Acquire once around the whole experiment. Reclaim only a demonstrably dead
// local PID, under a separate reclaim lock; retain the abandoned lock as proof.
function createReadingCheckpointCohort(directory,authorization) {
  assert.ok(authorization?.id&&Number.isInteger(authorization.maximumCalls)&&authorization.maximumCalls>0&&authorization.capUSD>0);
  assert.ok(Number.isFinite(authorization.historicalKnownUSD)&&Number.isFinite(authorization.historicalReservedUSD));
  fs.mkdirSync(directory,{recursive:true});
  const lock=path.join(directory,'worker.lock'),owner=randomUUID();
  const claim=()=>{const fd=fs.openSync(lock,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify({pid:process.pid,owner}));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}};
  try{claim();}catch(error){if(error.code!=='EEXIST')throw error;const previous=read(lock);let alive=true;
    assert.ok(Number.isInteger(previous?.pid)&&previous.pid>0);try{process.kill(previous.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}
    assert.ok(!alive,'Another reading worker is alive');const reclaim=path.join(directory,'worker-reclaim.lock'),fd=fs.openSync(reclaim,'wx',0o600);
    try{assert.deepEqual(read(lock),previous);fs.renameSync(lock,lock+'.abandoned-'+randomUUID());claim();}finally{fs.closeSync(fd);fs.unlinkSync(reclaim);}
  }
  const check=()=>assert.equal(read(lock)?.owner,owner,'Reading cohort lock ownership lost');
  const ledgerFile=path.join(directory,'ledger.json');let ledger=read(ledgerFile);
  try {
    if(ledger)assert.deepEqual(ledger.authorization,authorization);
    else ledger={version:1,authorization,calls:[],automaticPaidRetries:0};
    save(ledgerFile,ledger);
  }catch(error){fs.unlinkSync(lock);throw error;}
  const financials=()=>({spentUSD:authorization.historicalKnownUSD+ledger.calls.reduce((n,c)=>n+(c.checkpoint?.budget?.costUSD||0),0),
    reservedUSD:authorization.historicalReservedUSD+ledger.calls.reduce((n,c)=>n+(c.checkpoint?.budget?.reservationUSD||0),0)});
  const persist=()=>{check();const f=financials();assert.ok(f.spentUSD+f.reservedUSD<=authorization.capUSD+1e-12);save(ledgerFile,ledger);};
  return {ledger,financials,close(){check();fs.unlinkSync(lock);},
    forRun(runId,generationId){assert.ok(/^[a-zA-Z0-9_-]+$/.test(runId)&&generationId);const runDir=path.join(directory,runId);fs.mkdirSync(runDir,{recursive:true});
      const generationFile=path.join(runDir,'generation.json'),identity={generationId};const existing=read(generationFile);if(existing)assert.deepEqual(existing,identity);else save(generationFile,identity);
      const owned=()=>{check();assert.deepEqual(read(generationFile),identity,'Capture generation superseded');};
      return {load:async()=>{owned();return read(path.join(runDir,'pipeline.json'));},commit:async run=>{owned();save(path.join(runDir,'pipeline.json'),run);},financials:async()=>financials(),
        archiveTerminal:async(stage,raw)=>{owned();const dir=path.join(runDir,stage);fs.mkdirSync(dir,{recursive:true});save(path.join(dir,'terminal.json'),raw);},
        async stageStore(stage){assert.ok(/^detail-\d+$|^synthesis$/.test(stage));const id=`${runId}:${stage}`,dir=path.join(runDir,stage);fs.mkdirSync(dir,{recursive:true});
          const call=()=>ledger.calls.find(c=>c.id===id);
          return {load:async()=>{owned();return structuredClone(call()?.checkpoint||null);},
            compareAndSet:async(expected,next)=>{owned();if(!isDeepStrictEqual(call()?.checkpoint||null,expected))return null;
              let c=call();if(!c){const f=financials();assert.ok(ledger.calls.length<authorization.maximumCalls&&authorization.capUSD-f.spentUSD-f.reservedUSD>=.36,'Preventive cohort budget or call limit exhausted');c={id,generationId,checkpoint:null};ledger.calls.push(c);}
              c.checkpoint=structuredClone(next);persist();return structuredClone(next);},
            beforeRequest:async()=>owned(),
            archiveRawBody:async(raw,http)=>{owned();const rawDir=path.join(dir,'http');fs.mkdirSync(rawDir,{recursive:true});const n=String(fs.readdirSync(rawDir).filter(x=>x.endsWith('.body')).length+1).padStart(4,'0');
              fs.writeFileSync(path.join(rawDir,n+'.body'),raw,{flag:'wx'});save(path.join(rawDir,n+'.json'),{...http,sha256:digest(Buffer.from(raw))});fs.writeFileSync(path.join(dir,'latest.body'),raw);},
            readRawBody:async()=>{const file=path.join(dir,'latest.body');return fs.existsSync(file)?fs.readFileSync(file,'utf8'):null;},
            readTerminalResponse:async()=>read(path.join(dir,'terminal.json')),
          };
        },
      };
    },
  };
}
module.exports={createReadingCheckpointCohort};
