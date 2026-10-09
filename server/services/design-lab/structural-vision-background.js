// One Responses lifecycle, shared by product and future experiments. No model,
// capture, schema, DB, SDK, or credential dependency. Storage must be durable.
const {createHash,randomUUID}=require('node:crypto');
const assert=require('node:assert/strict');
const POLICY=Object.freeze({createTimeoutMs:30000,pollTimeoutMs:15000,totalMs:540000,pollIntervalMs:5000,trackingLeaseMs:45000});
const PENDING=['queued','in_progress'];
const TERMINAL=['completed','failed','incomplete','cancelled'];
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=(code,message,extra={})=>Object.assign(Error(message),{code,status:502,...extra});
function usageCost(usage,model) {
  assert.ok(/^gpt-6-luna(?:-|$)/.test(model),'Pricing/model not certified for this lifecycle');
  assert.ok(usage,'Provider usage missing');
  for(const key of ['input_tokens','output_tokens','total_tokens'])assert.ok(Number.isInteger(usage[key])&&usage[key]>=0,`Invalid ${key}`);
  assert.equal(usage.total_tokens,usage.input_tokens+usage.output_tokens);
  assert.ok(usage.input_tokens<=1050000&&usage.output_tokens<=128000,'Native model limits exceeded');
  const cached=usage.input_tokens_details?.cached_tokens??0,write=usage.input_tokens_details?.cache_write_tokens??0;
  assert.ok(Number.isInteger(cached)&&cached>=0&&Number.isInteger(write)&&write>=0&&cached+write<=usage.input_tokens);
  const reasoning=usage.output_tokens_details?.reasoning_tokens??0;
  assert.ok(Number.isInteger(reasoning)&&reasoning>=0&&reasoning<=usage.output_tokens);
  const long=usage.input_tokens>272000;
  return ((usage.input_tokens-cached-write)*(long?.20:.10)+cached*(long?.02:.01)+write*(long?.25:.125)+usage.output_tokens*(long?.75:.50))/1e6;
}
function validateResponseId(id) {
  if(typeof id!=='string'||!/^resp_[A-Za-z0-9_-]{1,240}$/.test(id))throw fail('OPENAI_INVALID_RESPONSE_ID','Identifiant de récupération OpenAI invalide.');
  return id;
}
async function backgroundResponse(body,{store,request,authorization,resumeOnly=false,manualRetrieval=false,
  onResponse,now=()=>Date.now(),policy=POLICY}={}) {
  assert.ok(store?.load&&store?.compareAndSet&&store?.archiveRawBody,'Durable response store required');
  assert.equal(body.store,false);assert.equal(body.background,true);assert.equal(body.service_tier,'default');
  if(!/^gpt-6-luna(?:-|$)/.test(body.model))throw fail('OPENAI_BACKGROUND_MODEL_UNCERTIFIED','Budget et récupération non certifiés pour ce modèle ; aucun dispatch.');
  const requestSha256=hash(body),owner=randomUUID();
  let state=await store.load(),created=false;
  // Resume the operational policy originally journaled for this response.
  if(state?.policy)policy=state.policy;
  for(const key of Object.keys(POLICY))assert.ok(Number.isInteger(policy[key])&&policy[key]>0,`Invalid background ${key}`);
  const change=async fields=>{
    const current=await store.load();
    if(state?.clientRequestId&&current?.clientRequestId!==state.clientRequestId)throw fail('OPENAI_BACKGROUND_CHECKPOINT_CHANGED','Checkpoint de réponse remplacé.');
    if(state?.responseId&&current?.responseId!==state.responseId)throw fail('OPENAI_BACKGROUND_CHECKPOINT_CHANGED','Identifiant de réponse remplacé.');
    if(current?.trackingOwner&&current.trackingOwner!==owner&&fields.trackingOwner!==owner)
      throw fail('OPENAI_TRACKING_LEASE_LOST','Lease de récupération remplacé.',{providerOutcomeUnknown:true});
    const next={...current,...fields};
    const saved=await store.compareAndSet(current,next);
    if(!saved)throw fail('OPENAI_BACKGROUND_CHECKPOINT_CONFLICT','Checkpoint concurrent ; aucun nouveau dispatch.');
    state=saved;return saved;
  };
  if(state?.requestSha256&&state.requestSha256!==requestSha256)throw fail('OPENAI_BACKGROUND_REQUEST_CHANGED','Requête différente du checkpoint ; récupération refusée.');
  if(!state?.creationCommittedAt) {
    if(resumeOnly)throw fail('OPENAI_BACKGROUND_NO_RESPONSE','Aucune création background conservée ; aucun dispatch autorisé.');
    const reservationUSD=.36; // Native worst case: 1.05M * .25/M + 128K * .75/M.
    if(!authorization?.id||authorization.maximumCalls!==1||!Number.isFinite(authorization.capUSD)||
      authorization.capUSD-(authorization.spentUSD||0)-(authorization.reservedUSD||0)<reservationUSD)
      throw fail('OPENAI_BACKGROUND_BUDGET','Autorisation ou budget préventif insuffisant ; aucun dispatch.');
    const startedAt=now();
    const next={mode:'background',version:1,state:'creation_committed',clientRequestId:randomUUID(),requestSha256,
      creationCommittedAt:startedAt,deadlineAt:startedAt+policy.totalMs,creationLeaseUntil:startedAt+policy.trackingLeaseMs,
      model:body.model,serviceTier:'default',store:false,automaticRetries:0,creationCalls:1,
      policy:{...policy},budget:{authorizationId:authorization.id,capUSD:authorization.capUSD,
        reservationUSD,maximumCostUSD:reservationUSD,costUSD:null,costState:'unknown',pricingDate:'2026-10-08',currency:'USD',taxesIncluded:false}};
    const claimed=await store.compareAndSet(state,next,body);
    if(!claimed)return {pendingVision:true,trackingBusy:true}; // Another worker owns the single creation.
    state=claimed;created=true;
  }
  if(!state.responseId&&!created) {
    // A crash between archiving the acknowledgement bytes and saving its ID is
    // recoverable from those actual bytes. Never infer an ID from a request ID.
    const raw=await store.readRawBody?.();
    if(raw) {
      let acknowledgement;try{acknowledgement=JSON.parse(raw);}catch{}
      if(acknowledgement?.id&&[...PENDING,...TERMINAL].includes(acknowledgement.status)) {
        validateResponseId(acknowledgement.id);
        await change({responseId:acknowledgement.id,providerStatus:acknowledgement.status,state:'acknowledged',creationLeaseUntil:null});
      }
    }
    if(!state.responseId) {
      if(['not_started','rejected'].includes(state.state))throw fail('OPENAI_CREATION_NOT_ACCEPTED',
        'Cette tentative n’a pas créé de réponse récupérable ; aucun nouveau dispatch sur son autorisation.',
        {providerOutcomeUnknown:false,visionDispatched:state.state==='rejected',clientRequestId:state.clientRequestId});
      if(state.state==='creation_committed'&&now()<state.creationLeaseUntil)return {pendingVision:true,creationPending:true};
      throw fail('OPENAI_CREATION_UNCERTAIN','Création envoyée sans identifiant conservé : état fournisseur incertain, aucun retry.',
        {providerOutcomeUnknown:true,clientRequestId:state.clientRequestId,visionDispatched:true});
    }
  }
  const durableTerminal=!created ? await store.readTerminalResponse?.() : null;
  if(!created) {
    validateResponseId(state.responseId);
    if(!durableTerminal&&!manualRetrieval&&now()>=state.deadlineAt)throw fail('OPENAI_BACKGROUND_DEADLINE','Durée globale de suivi atteinte ; réponse existante conservée, aucun nouvel appel.',
      {providerOutcomeUnknown:true,responseId:state.responseId,clientRequestId:state.clientRequestId,timeoutMs:policy.totalMs});
    if(!manualRetrieval&&state.nextPollAt>now())return {pendingVision:true,responseId:state.responseId};
    if(state.trackingOwner&&state.trackingLeaseUntil>now())return {pendingVision:true,trackingBusy:true,responseId:state.responseId};
    const claimed=await store.compareAndSet(state,{...state,trackingOwner:owner,trackingLeaseUntil:now()+policy.trackingLeaseMs,state:'retrieving'});
    if(!claimed)return {pendingVision:true,trackingBusy:true};
    state=claimed;
  }
  const clientRequestId=created?state.clientRequestId:randomUUID();
  let requestInvoked=false;
  try {
    await store.beforeRequest?.(); // Renew/check generation ownership before HTTP.
    if(!created)await change({lastPollClientRequestId:clientRequestId,lastPolledAt:now()});
    const result=durableTerminal ? {body:durableTerminal,requestId:state.lastRequestId,httpStatus:state.lastHttpStatus} : await (async()=>{
      requestInvoked=true;return request(created?'responses':`responses/${validateResponseId(state.responseId)}`,created?body:undefined,{
      method:created?'POST':'GET',timeout:created?policy.createTimeoutMs:policy.pollTimeoutMs,
      clientRequestId,captureMetadata:true,onRawBody:(raw,http)=>store.archiveRawBody(raw,{...http,clientRequestId,phase:created?'creation':'retrieval'}),
      });
    })();
    const response=result.body;
    validateResponseId(response?.id);
    if(state.responseId&&response.id!==state.responseId)throw fail('OPENAI_BACKGROUND_ID_MISMATCH','Identifiant reçu différent de la réponse suivie.');
    await change({responseId:response.id,providerStatus:response.status,creationLeaseUntil:null,
      ...(created?{creationRequestId:result.requestId}:{}),trackingOwner:owner,trackingLeaseUntil:now()+policy.trackingLeaseMs});
    const base=body.model;
    if(response.model!==base&&!response.model?.startsWith(base+'-'))throw fail('OPENAI_BACKGROUND_MODEL_MISMATCH','Modèle fournisseur différent de la requête.');
    if(state.actualModel&&state.actualModel!==response.model)throw fail('OPENAI_BACKGROUND_MODEL_MISMATCH','Snapshot modèle modifié pendant le suivi.');
    if(response.service_tier!=='default')throw fail('OPENAI_BACKGROUND_TIER_MISMATCH','Service tier fournisseur différent du budget.');
    await change({responseId:response.id,providerStatus:response.status,actualModel:response.model,
      state:'acknowledged',creationLeaseUntil:null,lastRequestId:result.requestId,lastHttpStatus:result.httpStatus,
      ...(created?{creationRequestId:result.requestId}:{}),trackingOwner:owner,trackingLeaseUntil:now()+policy.trackingLeaseMs});
    if(PENDING.includes(response.status)) {
      await change({state:'provider_pending',nextPollAt:now()+policy.pollIntervalMs,trackingOwner:null,trackingLeaseUntil:null});
      return {pendingVision:true,responseId:response.id,providerStatus:response.status};
    }
    // Raw bytes and terminal envelope are durable before cost or output parsing.
    await onResponse?.(response);
    if(!TERMINAL.includes(response.status))throw fail('OPENAI_BACKGROUND_STATUS','Statut fournisseur inconnu.');
    let costUSD=null;
    if(response.usage)try{costUSD=usageCost(response.usage,response.model);}catch(error){
      throw fail('OPENAI_BACKGROUND_USAGE','Usage fournisseur incohérent.',{cause:error});
    }
    const maximumCostUSD=state.budget.maximumCostUSD??((state.budget.costUSD??0)+state.budget.reservationUSD);
    if(costUSD!==null&&costUSD>maximumCostUSD)throw fail('OPENAI_BACKGROUND_BUDGET','Coût fournisseur supérieur à la réservation.');
    await change({state:'terminal',providerStatus:response.status,usage:response.usage??null,
      providerError:response.error??null,incompleteDetails:response.incomplete_details??null,
      budget:{...state.budget,costUSD,costState:costUSD===null?'unknown':'usage_calculated',
        reservationUSD:costUSD===null?state.budget.reservationUSD:0}});
    if(response.status!=='completed')throw fail(`OPENAI_RESPONSE_${response.status.toUpperCase()}`,
      `Réponse fournisseur ${response.status} ; brut conservé, aucun retry.`,{responseId:response.id});
    if(costUSD===null)throw fail('OPENAI_BACKGROUND_USAGE','Réponse complète sans usage ; coût incertain, brut conservé.');
    if(response.error)throw fail('OPENAI_PROVIDER_RESPONSE_ERROR','Réponse complète contenant une erreur fournisseur ; brut conservé.');
    return response;
  } catch(error) {
    // Even an acknowledgement arriving beyond the local creation deadline can
    // contain an actual recoverable ID. Preserve it without treating the late
    // request as success and without sending another creation.
    const late=error.completeRawResponse;
    if(late?.id)try{
      validateResponseId(late.id);
      if(!state.responseId)await change({responseId:late.id,providerStatus:late.status,creationRequestId:error.requestId});
      if(TERMINAL.includes(late.status)) {
        await onResponse?.(late);
        let costUSD=null;try{costUSD=usageCost(late.usage,late.model);}catch{}
        await change({usage:late.usage??null,budget:{...state.budget,costUSD,costState:costUSD===null?'unknown':'usage_calculated',
          reservationUSD:costUSD===null?state.budget.reservationUSD:0}});
      }
    }catch{}
    const notDispatched=created&&(!requestInvoked||error.visionDispatched===false);
    const rejected=created&&error.code==='OPENAI_HTTP_ERROR'&&error.httpStatus>=400&&error.httpStatus<500&&error.httpStatus!==408;
    const uncertain=created&&!state.responseId&&!notDispatched&&!rejected;
    // A lost polling connection retains the ID and reservation; it can only be
    // followed by GET, never by another POST or an implicit sync fallback.
    try {await change({state:notDispatched?'not_started':rejected?'rejected':state.providerStatus&&TERMINAL.includes(state.providerStatus)?'terminal':uncertain?'uncertain':'tracking_interrupted',
      trackingOwner:null,trackingLeaseUntil:null,nextPollAt:now()+policy.pollIntervalMs,
      ...(notDispatched?{budget:{...state.budget,reservationUSD:0,costUSD:0,costState:'not_dispatched'}}:{}),
      lastError:{code:error.code||'OPENAI_TRANSPORT_ERROR',at:now()}});}catch{}
    const recoverableTransport=error.code==='OPENAI_TIMEOUT'||error.name==='TypeError'||
      (error.code==='OPENAI_HTTP_ERROR'&&(error.httpStatus===429||error.httpStatus>=500));
    Object.assign(error,{responseId:state.responseId??null,clientRequestId:state.clientRequestId,
      visionDispatched:created?!notDispatched:true,
      providerOutcomeUnknown:!notDispatched&&!rejected&&(uncertain||!TERMINAL.includes(state.providerStatus)),
      resumeExistingResponse:Boolean(state.responseId&&recoverableTransport&&!TERMINAL.includes(state.providerStatus))});
    throw error;
  }
}
module.exports={backgroundResponse,POLICY,usageCost,validateResponseId};
