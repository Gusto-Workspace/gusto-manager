const test=require('node:test'),assert=require('node:assert/strict');
const {createStructuralOperationRecovery,startStructuralOperationRecovery,CODE}=require('../services/design-lab/structural-operation-recovery.service');
const at=new Date('2026-10-07T12:00:00Z'),old=new Date('2026-10-07T08:00:00Z'),ttlMs=15*60*1000;
const clone=v=>v&&structuredClone(v);
function matches(row,filter){return Object.entries(filter).every(([key,value])=>{
 if(key==='$or')return value.some(v=>matches(row,v));
 if(value&&typeof value==='object'&&!(value instanceof Date)){
  if('$in'in value)return value.$in.some(v=>v===row[key]||(v===null&&row[key]==null));
  if('$lt'in value)return row[key]!=null&&new Date(row[key])<value.$lt;
 }
 return value===null?row[key]==null:value instanceof Date?row[key]!=null&&+new Date(row[key])===+value:String(row[key])===String(value);
});}
function setup({reference={},attempt={},noAttempt=false,active=false}={}){
 let ref={_id:'ref',status:'analyzing',operationToken:'generation',operationStartedAt:old,
  captures:[{type:'overview',url:'existing'}],analysis:{overview:'previous valid analysis'},analyzedAt:old,...reference};
 let row=noAttempt?null:{_id:'attempt',referenceId:'ref',generationId:'generation',status:'running',createdAt:old,updatedAt:old,
  rawResponse:null,parsedResult:null,captureSnapshot:{captures:clone(ref.captures)},...attempt};
 let referenceRace,attemptRace,attemptFailures=0;
 const query=read=>{const q={select:()=>q,sort:()=>q,lean:async()=>clone(read())};return q;};
 const Model={find:f=>query(()=>matches(ref,f)?[ref]:[]),findById:()=>query(()=>ref),
  findOneAndUpdate:(f,u)=>query(()=>{referenceRace?.();referenceRace=null;if(!matches(ref,f))return null;Object.assign(ref,clone(u.$set));return ref;})};
 const AttemptModel={findOne:f=>query(()=>row&&matches(row,f)?row:null),find:f=>query(()=>row&&matches(row,f)?[row]:[]),
  findOneAndUpdate:(f,u)=>query(()=>{if(attemptFailures-->0)throw Error('checkpoint unavailable');attemptRace?.();attemptRace=null;
   if(!row||!matches(row,f))return null;Object.assign(row,clone(u.$set),{updatedAt:at});return row;})};
 const reconcile=createStructuralOperationRecovery({Model,AttemptModel,ttlMs,now:()=>at,isReferenceActive:()=>active,logger:{warn(){}}});
 return {reconcile,get reference(){return clone(ref);},get attempt(){return clone(row);},
  raceReference:f=>{referenceRace=()=>f(ref);},raceAttempt:f=>{attemptRace=()=>f(row);},failAttempts:n=>{attemptFailures=n;}};
}
test('redémarrage : capture finie, aucune réponse — échec explicite, conservation des données et reprise manuelle',async()=>{
 const h=setup(),before=h.reference,snapshot=h.attempt.captureSnapshot;
 assert.deepEqual(await h.reconcile({referenceId:'ref'}),{recoveredReferences:['ref'],interruptedAttempts:['attempt']});
 assert.equal(h.reference.status,'error');assert.equal(h.reference.operationToken,'');assert.equal(h.reference.operationStartedAt,null);
 assert.deepEqual(h.reference.analysis,before.analysis);assert.deepEqual(h.reference.captures,before.captures);assert.deepEqual(h.reference.analyzedAt,before.analyzedAt);
 assert.equal(h.attempt.status,'failed');assert.equal(h.attempt.rawResponse,null);assert.equal(h.attempt.parsedResult,null);
 assert.equal(h.attempt.interruption.code,CODE);assert.equal(h.attempt.interruption.previousStatus,'running');assert.deepEqual(h.attempt.captureSnapshot,snapshot);
 assert.match(h.reference.lastError,/sans réponse conservée/);assert.equal(h.attempt.appliedAt,undefined);
 assert.equal(h.reference.operationDiagnostic.recovery,'manual_confirmation_required');
 assert.deepEqual(await h.reconcile(),{recoveredReferences:[],interruptedAttempts:[]});
});
test('réponse brute complète ou déjà validée conservée : aucun faux succès ni retraitement automatique',async()=>{
 for(const status of ['received','validated']){
  const raw={id:'existing-response',status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{}'}]}]};
  const parsed={overview:'durable response'},h=setup({attempt:{status,rawResponse:raw,parsedResult:parsed,validationError:{previous:'diagnostic'}}});
  await h.reconcile();assert.equal(h.reference.status,'error');assert.equal(h.attempt.status,'failed');
  assert.deepEqual(h.attempt.rawResponse,raw);assert.deepEqual(h.attempt.parsedResult,parsed);assert.deepEqual(h.attempt.validationError,{previous:'diagnostic'});
  assert.match(h.reference.lastError,/sans nouvel appel Vision/);assert.equal(h.attempt.appliedAt,undefined);
 }
});
test('lease fraîche ou traitement actif du processus : ne pas interrompre',async()=>{
 for(const options of [{reference:{operationStartedAt:at}},{active:true}]){
  const h=setup(options),before=clone(h.reference);assert.deepEqual(await h.reconcile(),{recoveredReferences:[],interruptedAttempts:[]});
  assert.deepEqual(h.reference,before);assert.equal(h.attempt.status,'running');
 }
});
test('compare-and-set : une nouvelle génération remplace le lease pendant la récupération',async()=>{
 const h=setup();h.raceReference(r=>{r.operationToken='new-generation';r.operationStartedAt=at;});
 assert.deepEqual(await h.reconcile(),{recoveredReferences:[],interruptedAttempts:[]});
 assert.equal(h.reference.operationToken,'new-generation');assert.equal(h.reference.status,'analyzing');assert.equal(h.attempt.status,'running');
});
test('checkpoint arrivé pendant la récupération : conservation intégrale de la nouvelle réponse',async()=>{
 const h=setup(),raw={id:'late-response',output:[]};h.raceAttempt(a=>{a.status='received';a.rawResponse=raw;a.updatedAt=at;});
 await h.reconcile();assert.equal(h.reference.status,'error');assert.equal(h.attempt.status,'received');assert.deepEqual(h.attempt.rawResponse,raw);
});
test('crash pendant capture avant création attempt : pas de succès inventé ni nettoyage Cloudinary',async()=>{
 const h=setup({reference:{status:'capturing',captureCoverage:null},noAttempt:true});await h.reconcile();
 assert.equal(h.reference.status,'error');assert.equal(h.attempt,null);assert.deepEqual(h.reference.captures,[{type:'overview',url:'existing'}]);
});
test('état historique sans date de lease : déverrouillage conservateur',async()=>{
 const h=setup({reference:{operationStartedAt:null,operationToken:''},noAttempt:true});await h.reconcile();assert.equal(h.reference.status,'error');
});
test('référence déjà déverrouillée mais checkpoint orphelin : réparation idempotente après une panne de stockage',async()=>{
 const h=setup();h.failAttempts(2);await assert.rejects(h.reconcile(),/checkpoint unavailable/);
 assert.equal(h.reference.status,'error');assert.equal(h.attempt.status,'running');
 assert.deepEqual(await h.reconcile(),{recoveredReferences:[],interruptedAttempts:['attempt']});assert.equal(h.attempt.status,'failed');
});
test('retraitement actif d’une ancienne génération : ne pas confondre historique et lease courant',async()=>{
 const h=setup({reference:{operationStartedAt:at,operationToken:'reprocessing-new-token'},attempt:{status:'validated'}});
 await h.reconcile();assert.equal(h.attempt.status,'validated');assert.equal(h.reference.status,'analyzing');
});
test('attempts terminaux appliqués ou rejetés : ne pas modifier le verdict',async()=>{
 for(const status of ['applied','validation_failed','failed']){
  const h=setup({reference:{status:'analyzed',operationToken:'',operationStartedAt:null},attempt:{status}}),before=h.attempt;
  await h.reconcile();assert.deepEqual(h.attempt,before);assert.equal(h.reference.status,'analyzed');
 }
});
test('sweep au démarrage et périodique : pas de chevauchement, arrêt possible',async()=>{
 let calls=0,release;const pending=new Promise(r=>{release=r;});
 const scheduler=startStructuralOperationRecovery(async()=>{calls++;await pending;},{intervalMs:5,logger:{warn(){}}});
 try{await new Promise(r=>setTimeout(r,20));assert.equal(calls,1);release();await scheduler.ready;}
 finally{scheduler.stop();}
});
test('suivi rapide indépendant du recovery historique, sans chevauchement de GET ni timers après arrêt',async()=>{
 const originalInterval=global.setInterval,originalClear=global.clearInterval,timers=[],cleared=[];
 let follows=0,reconciles=0,release;
 const pending=new Promise(resolve=>{release=resolve;});
 global.setInterval=(callback,interval)=>{const timer={callback,interval,unref(){}};timers.push(timer);return timer;};
 global.clearInterval=timer=>cleared.push(timer);
 try {
  const scheduler=startStructuralOperationRecovery(async()=>{reconciles++;},{followResponses:async()=>{follows++;await pending;}});
  await scheduler.ready;assert.equal(reconciles,1);
  assert.equal(timers[0].interval,60000);assert.equal(timers[1].interval,5000);
  const tracking=timers[1].callback();await timers[1].callback();assert.equal(follows,1);
  await timers[0].callback();assert.equal(reconciles,2);release();await tracking;
  scheduler.stop();assert.deepEqual(cleared,timers);
 }finally{global.setInterval=originalInterval;global.clearInterval=originalClear;release();}
});
test('crash après application : marqueur exact permet finalisation sans attendre TTL ni inventer un succès',async()=>{
 const h=setup({reference:{status:'analyzed',operationToken:'',analysisApplication:{generationId:'generation',attemptId:'attempt',appliedAt:at}},
  attempt:{status:'validated',updatedAt:at,rawResponse:{id:'durable'},parsedResult:{overview:'valid'}}});
 await h.reconcile();assert.equal(h.attempt.status,'applied');assert.deepEqual(h.attempt.rawResponse,{id:'durable'});
 await h.reconcile();assert.equal(h.attempt.status,'applied');
});
test('marqueur d’une autre génération : ne pas promouvoir cet attempt',async()=>{
 const h=setup({reference:{status:'analyzed',operationToken:'',analysisApplication:{generationId:'other',attemptId:'other'}},attempt:{status:'validated'}});
 await h.reconcile();assert.equal(h.attempt.status,'failed');
});
