// Versioned input binding + exhaustive reading envelope. Artistic V1/V2/V3
// definitions are preserved; the binding is explicitly different from old A/B.
const assert=require('node:assert/strict');
const {digest}=require('./structural-original-evidence');
const contract=require('./structural-reference.contract');
const v3=require('./structural-artistic-v3');
const {descriptor}=require('./structural-observation-selection');
const {backgroundResponse}=require('./structural-vision-background');
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const text={type:'string',minLength:1,maxLength:1000};
const enumString=values=>({type:'string',enum:values});
const hash=x=>digest(Buffer.from(JSON.stringify(x)));
const READING_VERSION=1,BINDING_VERSION=1;
// Planning assumptions are deliberately explicit; not provider token accounting.
const MODEL_LIMITS=Object.freeze({model:'gpt-6-luna',context:1050000,output:128000,maxImages:1500,payloadBytes:512*1024*1024,
  imagePlanningMultiplier:4,outputPerObservation:1024,synthesisOutputReserve:32768,detail:'high',
  sizingStatus:'gpt_6_luna_specific_preprocessing_not_documented_in_sizing_table'});
function readSchema(ids) {
  return object({id:enumString(ids),geometry:structuredClone(contract.geometryV2),
    description:text,visibleMasses:text,axesAndProportions:text,overlapAndAlignment:text,
    density:enumString(['sparse','moderate','dense','unknown']),
    certainty:enumString(['direct','inferred','unknown']),
    uncertainty:{type:'string',minLength:0,maxLength:1000},
    stateVersusSection:enumString(['sampled_state_section_unknown']),
    relatedObservationIds:{type:'array',minItems:0,maxItems:ids.length,items:enumString(ids)}});
}
function binding(coverage,artisticVersion,presentIds) {
  assert.ok([2,3].includes(artisticVersion));
  const ids=['overview',...coverage.states.map(s=>s.id)];
  const schema=structuredClone(artisticVersion===3?contract.structuralAnalysisSchemaV3:contract.structuralAnalysisSchemaV2);
  const branches=artisticVersion===3?schema.properties.structuralMoments.items.anyOf:[schema.properties.structuralMoments.items];
  for(const branch of branches) {
    branch.properties.evidence.properties.sourceViews.items.enum=ids;
    if(artisticVersion===3){const a=branch.properties.evidence.properties.anchors.items.properties;a.viewId.enum=ids;a.observationId.enum=ids.slice(1);}
  }
  schema.properties.globalRelations.items.properties.sourceViews.items.enum=ids;
  const instructions=contract.structuralInstructions('sampled',true,undefined,true,artisticVersion)
    .replace('OBSERVATION1 à OBSERVATION5 identifient zéro à cinq vues locales complémentaires, présentes uniquement si leur gain géométrique est suffisant. Leur numéro n\'est pas une région de page.','Les identifiants state désignent les originaux HD réellement disponibles ; aucun nombre de cinq ne limite leur lecture. Leur numéro n\'est pas une région de page.')
    .replace('(overview et uniquement les observation1 à observation5 présentes dans viewOrder)','(overview et uniquement les state présents dans availableSourceIds)')+
    '\nLIAISON EXHAUSTIVE V1 : les identifiants possibles sont définis par le schéma commun. Les seules sources utilisables sont celles de availableSourceIds dans le contexte. overview est une carte de tous les états, jamais une image continue. Chaque state conserve sa plage réelle et peut recouvrir d’autres états. Ne confonds pas états, observations, moments et sections. Le sélecteur priorise ; il ne certifie aucune vérité artistique. Les observations détaillées doivent être lues avant la synthèse. La synthèse ne peut effacer une incertitude, un manque ou une contradiction des lectures. Une absence de détail doit rester explicite. Ne produis aucun score de qualité.';
  const states=coverage.states.filter(s=>presentIds.includes(s.id));
  const manifest={version:1,captureStrategy:'sampled',viewOrder:['overview',...states.map(s=>s.id)],
    views:[{id:'overview',geometry:null},...states.map(s=>({id:s.id,geometry:{visibleRangePx:s.visibleRangePx,totalHeight:coverage.totalHeight,pagePercentRange:s.visibleRangePx.map(n=>100*n/coverage.totalHeight)}}))]};
  const metadata={viewport:coverage.viewport,captureCoverage:{version:3,captureStrategy:'sampled',totalHeight:coverage.totalHeight,viewportHeight:coverage.viewport.height,
    storyboard:{panels:coverage.storyboard.panels},mediaEvidence:{uninspected:coverage.notObservable}},externalEmbeds:coverage.unavailableEmbeds};
  const captures=[{type:'overview',viewport:coverage.viewport},...states.map(s=>({type:s.id,viewport:coverage.viewport,sourceRect:{top:s.position,height:s.visibleRangePx[1]-s.position,width:s.width,left:0}}))];
  return {schema,instructions,manifest,metadata,captures,artisticVersion};
}
function planExhaustiveReading(coverage,{representativeIds=coverage.representativeIds,limits=MODEL_LIMITS,priorityIds=[]}={}) {
  if(!coverage.captureCertified)throw Object.assign(Error('Original capture not certified'),{code:'exhaustive_capture_uncertified',blockers:coverage.blockers});
  const unique=new Set(representativeIds);assert.equal(unique.size,representativeIds.length);
  assert.ok(representativeIds.length&&representativeIds.every(id=>coverage.representativeIds.includes(id)));
  const rows=representativeIds.map(id=>coverage.states.find(s=>s.id===id)).sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id));
  const estimatedTokens=s=>Math.ceil(s.width/32)*Math.ceil(s.height/32)*limits.imagePlanningMultiplier+2048;
  const budget=limits.context-limits.output-65536; // conservative shared prompt/context reserve
  const maxPerOutput=Math.floor((limits.output-limits.synthesisOutputReserve)/limits.outputPerObservation);
  const batches=[];let current=[],tokens=0,bytes=0;
  for(const s of rows) {
    const next=estimatedTokens(s),size=Math.ceil(s.width*s.height*4*4/3); // uncompressed RGBA + base64 planning bound
    if(next>budget||size>limits.payloadBytes/2)throw Object.assign(Error('Original exceeds reading limits'),{code:'exhaustive_observation_too_large',id:s.id});
    if(current.length&&(tokens+next>budget||bytes+size>limits.payloadBytes/2||current.length>=Math.min(maxPerOutput,limits.maxImages-3))) {batches.push(current);current=[];tokens=0;bytes=0;}
    current.push(s.id);tokens+=next;bytes+=size;
  }
  if(current.length)batches.push(current);
  const stages=batches.map((ids,i)=>({id:`detail-${i+1}`,kind:batches.length===1?'integrated':'detail',primaryIds:ids,
    boundaryIds:batches.length===1?[]:[...(i?[batches[i-1].at(-1)]:[]),...(i+1<batches.length?[batches[i+1][0]]:[])],
    priorityIds:ids.filter(id=>priorityIds.includes(id))}));
  if(stages.length>1)stages.push({id:'synthesis',kind:'synthesis',primaryIds:[],boundaryIds:[],priorityIds:[]});
  return {version:READING_VERSION,inputBindingVersion:BINDING_VERSION,generationId:coverage.generationId,
    sourceEvidenceHash:hash(coverage.states.map(s=>({id:s.id,sha256:s.sha256,visibleRangePx:s.visibleRangePx,sourceCrop:s.sourceCrop}))),
    selectedRepresentativeIds:rows.map(s=>s.id),allDistinctiveStatesCovered:unique.size===coverage.representativeIds.length,
    stages,maximumCalls:stages.length,limits:{...limits},planningEstimateNotBillingCap:true,automaticPaidRetries:0};
}
function buildReadingRequest(evidence,coverage,plan,stage,artisticVersion=3,reads=[]) {
  const presented=[...new Set([...stage.primaryIds,...stage.boundaryIds])];
  const available=stage.kind==='synthesis'?plan.selectedRepresentativeIds:presented;
  const b=binding(coverage,artisticVersion,available);
  const schema=stage.kind==='detail'?object({readingVersion:{type:'integer',minimum:1,maximum:1},observations:{type:'array',minItems:0,maxItems:coverage.states.length,items:readSchema(coverage.states.map(s=>s.id))}}):
    object({readingVersion:{type:'integer',minimum:1,maximum:1},observations:{type:'array',minItems:0,maxItems:stage.kind==='synthesis'?0:coverage.states.length,items:readSchema(coverage.states.map(s=>s.id))},analysis:b.schema});
  const context={readingVersion:1,inputBindingVersion:1,generationId:coverage.generationId,availableSourceIds:['overview',...available],
    priorityObservationIds:stage.priorityIds,
    actualDetailedImageIds:presented,requiredObservationIds:presented,previousDetailedReadings:reads,
    localMetadata:b.metadata,states:coverage.states.map(({mediaEvidence,...s})=>s),
    interpretationLimits:coverage.notObservable,unavailableEmbeds:coverage.unavailableEmbeds,
    equivalence:'Only identical PNG bytes and crop may share a reading. Positions and identities remain separate.',
    coverageScope:plan.allDistinctiveStatesCovered?'all_available_distinct_pixel_states':'selected_detailed_states_only'};
  const content=[{type:'input_text',text:JSON.stringify(context)},{type:'input_text',text:'overview — carte globale des états archivés'},
    {type:'input_image',image_url:`data:image/png;base64,${coverage.storyboard.buffer.toString('base64')}`,detail:'low'}];
  for(const id of presented){const o=evidence.observations.find(o=>o.id===id);assert.ok(o&&digest(o.buffer)===o.sha256);
    content.push({type:'input_text',text:JSON.stringify({id,visibleRangePx:o.visibleRangePx,sourceCrop:o.sourceCrop,width:o.width,height:o.height})},
      {type:'input_image',image_url:`data:image/png;base64,${o.buffer.toString('base64')}`,detail:'high'});}
  const instructions=b.instructions+'\nENVELOPPE DE LECTURE V1 : observations contient exactement une lecture par requiredObservationIds, sans omission ni doublon. Décris les pixels, masses dominantes, rapports de proportion, axes, superposition et densité ; unknown explicite si les pixels ne suffisent pas. Les changements de médias ne prouvent pas de nouvelles sections. Les relatedObservationIds se limitent aux observations réellement lues dans ce lot. Dans un lot detail, ne synthétise pas une page non vue. Dans synthesis, utilise uniquement les lectures précédentes validées et la carte globale ; une lecture inconnue ou conflictuelle n’est jamais une preuve directe. Dans integrated, remplis toutes les observations avant analysis.';
  const body={model:plan.limits.model,store:false,background:true,service_tier:'default',reasoning:{effort:'medium'},instructions,
    input:[{role:'user',content}],text:{format:{type:'json_schema',name:'structural_exhaustive_reading_v1',strict:true,schema}}};
  if(Buffer.byteLength(JSON.stringify(body))>plan.limits.payloadBytes)throw Error('Prepared payload exceeds model limit');
  return {body,binding:b,stage,plan,presented,previousReads:reads,identity:{readingVersion:1,inputBindingVersion:1,artisticVersion,
    promptHash:hash(instructions),schemaHash:hash(schema),contentHash:hash(content),requestHash:hash(body)}};
}
function validateReadings(value,request,coverage) {
  const required=request.presented;
  assert.equal(value.readingVersion,1);assert.ok(Array.isArray(value.observations));
  assert.deepEqual(value.observations.map(r=>r.id).sort(),[...required].sort(),'Missing or duplicate detailed reading');
  const allowed=new Set(required);
  for(const r of value.observations){assert.equal(r.stateVersusSection,'sampled_state_section_unknown');
    assert.deepEqual(Object.keys(r).sort(),Object.keys(readSchema([...allowed]).properties).sort());
    assert.ok(['direct','inferred','unknown'].includes(r.certainty));assert.ok(['sparse','moderate','dense','unknown'].includes(r.density));
    for(const f of ['description','visibleMasses','axesAndProportions','overlapAndAlignment'])assert.ok(typeof r[f]==='string'&&r[f].trim()&&r[f].length<=1000);
    assert.ok(typeof r.uncertainty==='string'&&r.uncertainty.length<=1000);if(r.certainty!=='direct')assert.ok(r.uncertainty.trim());
    assert.ok(Array.isArray(r.relatedObservationIds)&&r.relatedObservationIds.every(id=>allowed.has(id))&&new Set(r.relatedObservationIds).size===r.relatedObservationIds.length);
    const g=r.geometry;assert.deepEqual(Object.keys(g||{}).sort(),Object.keys(contract.geometryV2.properties).sort());for(const [key,schema]of Object.entries(contract.geometryV2.properties)){assert.ok(typeof g?.[key]==='string');if(schema.enum)assert.ok(schema.enum.includes(g[key]));else assert.ok(g[key].trim()&&g[key].length<=schema.maxLength);}
    if(g.imagePlacement==='absent')assert.ok(g.dominantMass!=='image'&&['absent','unknown'].includes(g.imageTextRelationship));
    if(g.textPlacement==='absent')assert.ok(g.dominantMass!=='text'&&['absent','unknown'].includes(g.imageTextRelationship));
    if(g.imageTextRelationship==='overlapping')assert.equal(g.overlap,'present');
  }
  assert.deepEqual(Object.keys(value).sort(),(request.stage.kind==='detail'?['readingVersion','observations']:['readingVersion','observations','analysis']).sort());
  if(request.stage.kind!=='detail'){
    contract.validateStructuralAnalysis(value.analysis,request.binding.metadata,request.binding.captures,request.binding.manifest,request.binding.artisticVersion,request.binding);
    const sourceReads=request.stage.kind==='synthesis'?request.previousReads:value.observations;
    for(const m of value.analysis.structuralMoments)if(m.evidence.level==='direct'){
      for(const id of m.evidence.sourceViews.filter(id=>id!=='overview'))assert.ok(sourceReads.some(r=>r.id===id&&r.certainty==='direct'),'Synthesis cannot promote uncertain source reading to direct evidence');
    }
  }
  return value;
}
function qualitySignals(reads,evidence) {
  const flags=[];
  for(const r of reads){const o=evidence.observations.find(o=>o.id===r.id);if(!o?.measures)continue;
    const features=descriptor(o.measures,2).composition;
    // Contradiction candidates, never an artistic verdict or an automatic retry.
    if(r.density==='sparse'&&features.coverage[1]>.65)flags.push({id:r.id,reason:'sparse_reading_vs_high_measured_image_coverage',scope:'geometric_witness_requires_visual_review'});
    if(r.geometry.dominantMass==='void'&&features.massScale[2]>.25)flags.push({id:r.id,reason:'void_dominance_vs_large_measured_typography',scope:'geometric_witness_requires_visual_review'});
    if(r.certainty!=='direct')flags.push({id:r.id,reason:'uncertain_detailed_reading'});
  }
  return flags;
}
// Shared background lifecycle owns each paid POST. The caller supplies durable
// stage stores and a bounded cohort authorization; no implicit network default.
async function executeReadingPlan({evidence,coverage,plan,artisticVersion=3,coordinator,authorization,request,now,policy}) {
  assert.ok(coordinator?.load&&coordinator?.commit&&coordinator?.stageStore&&request);
  assert.ok(authorization?.id&&authorization.maximumCalls>=plan.maximumCalls);
  let run=await coordinator.load();const identity=hash({plan,artisticVersion});
  if(run){assert.equal(run.identity,identity);if(['completed','stopped'].includes(run.state))return run;}
  else run={version:1,identity,state:'prepared',completedStages:[],reads:[],analysis:null,technicalValidity:false,artisticCertification:'not_evaluated',coverageComplete:false};
  await coordinator.commit(run);
  for(const stage of plan.stages){
    if(run.completedStages.includes(stage.id))continue;
    const prepared=buildReadingRequest(evidence,coverage,plan,stage,artisticVersion,run.reads);
    const store=await coordinator.stageStore(stage.id);
    try {
      const financials=await coordinator.financials();
      const raw=await backgroundResponse(prepared.body,{store,request,now,policy,
        authorization:{id:authorization.id,maximumCalls:1,capUSD:authorization.capUSD,spentUSD:financials.spentUSD,reservedUSD:financials.reservedUSD},
        resumeOnly:Boolean((await store.load())?.creationCommittedAt),onResponse:r=>coordinator.archiveTerminal(stage.id,r)});
      if(raw.pendingVision){run.state='provider_pending';await coordinator.commit(run);return run;}
      const items=raw.output?.flatMap(o=>o.content||[])||[];assert.ok(!items.some(c=>c.type==='refusal'));
      const parsed=JSON.parse(raw.output_text||items.filter(c=>c.type==='output_text').map(c=>c.text).join(''));
      validateReadings(parsed,prepared,coverage);
      for(const row of parsed.observations){const old=run.reads.find(r=>r.id===row.id);
        if(old){run.boundaryReadings||=[];run.boundaryReadings.push({stage:stage.id,previous:old,current:row});
          const contradiction=Object.keys(contract.geometryV2.properties).filter(k=>k!=='massRelationship').some(k=>old.geometry[k]!=='unknown'&&row.geometry[k]!=='unknown'&&old.geometry[k]!==row.geometry[k]);
          if(contradiction)throw Object.assign(Error('Conflicting geometric readings at batch boundary; evidence retained'),{code:'exhaustive_boundary_contradiction'});
          if(row.certainty!=='direct'){old.certainty=row.certainty;old.uncertainty=row.uncertainty;}
        }else run.reads.push(row);}
      if(parsed.analysis)run.analysis=parsed.analysis;
      run.completedStages.push(stage.id);run.state='reading';await coordinator.commit(run);
    }catch(error){run.state='stopped';run.failure={stage:stage.id,code:error.code||'invalid_exhaustive_result',message:error.message};await coordinator.commit(run);return run;}
  }
  run.qualityFlags=qualitySignals(run.reads,evidence);run.technicalValidity=true;run.state='completed';
  run.coverageComplete=plan.allDistinctiveStatesCovered&&plan.selectedRepresentativeIds.every(id=>run.reads.some(r=>r.id===id));
  run.coverage=coverage.states.map(s=>({...s,presentation:run.reads.some(r=>r.id===s.representativeId)?'presented_or_proven_equivalent':'not_presented',interpretation:run.reads.some(r=>r.id===s.representativeId)?'read':'not_read'}));
  run.artisticCertification='not_independently_evaluated';await coordinator.commit(run);return run;
}
async function runAutonomousReading(options,{wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),pollIntervalMs=5000}={}) {
  let result;
  do {result=await executeReadingPlan(options);if(result.state==='provider_pending')await wait(pollIntervalMs);}while(result.state==='provider_pending');
  return result;
}
module.exports={MODEL_LIMITS,READING_VERSION,BINDING_VERSION,binding,planExhaustiveReading,buildReadingRequest,validateReadings,qualitySignals,executeReadingPlan,runAutonomousReading};
