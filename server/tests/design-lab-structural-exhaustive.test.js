const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),sharp=require('sharp');
const {createOriginalEvidenceArchive,readOriginalEvidence,digest}=require('../services/design-lab/structural-original-evidence');
const {buildExhaustiveCoverage}=require('../services/design-lab/structural-exhaustive-coverage');
const reading=require('../services/design-lab/structural-exhaustive-reading');
const {createReadingCheckpointCohort}=require('../services/design-lab/structural-reading-checkpoints');
const contract=require('../services/design-lab/structural-reference.contract');
const fixtures=require('./helpers/structural-composition-fixtures');
const {reference,analysisV1}=require('./helpers/structural-analysis-fixture');
async function evidence(count=23,{repeat=false}={}) {
 const originals=[];
 for(let i=0;i<count;i++){const name=repeat?'gallery':Object.keys(fixtures.fixtures)[i%9];
  const buffer=await sharp(Buffer.from(fixtures.svg(name))).png().toBuffer();
  originals.push({id:`state${String(i+1).padStart(4,'0')}`,buffer,sha256:digest(buffer),position:i*520,visibleRangePx:[i*520,i*520+800],
   sourceCrop:{left:0,top:0,width:1200,height:800},width:1200,height:800,format:'png',measures:fixtures.measures(name),
   viewport:{width:1200,height:800},origin:'traversal',mediaEvidence:{knownMissing:0},externalEmbeds:[]});
 }
 const r=reference();return {observations:originals,manifest:{generationId:`fixture-${count}`,state:'captured',captureCoverage:{...r.captureCoverage,totalHeight:(count-1)*520+800,viewportHeight:800},
  captureSanitization:r.captureSanitization,localMetadata:{viewport:{width:1200,height:800}}}};
}
function observation(id){return{id,geometry:{imagePlacement:'center',textPlacement:'center',dominantMass:'balanced',massRelationship:'Deux masses visibles',primaryAxis:'center',imageTextRelationship:'overlapping',gridRegularity:'free',overlap:'present',whitespaceTopology:'mixed'},description:'Observation des pixels',visibleMasses:'Masses présentes',axesAndProportions:'Axe central',overlapAndAlignment:'Superposition visible',density:'moderate',certainty:'direct',uncertainty:'',stateVersusSection:'sampled_state_section_unknown',relatedObservationIds:[]};}
function analysis(request,coverage){const a=analysisV1(),p={mechanism:'Superposer deux masses',effect:'Relier les surfaces',conditions:'Deux masses coprésentes'};
 a.analysisVersion=request.binding.artisticVersion;a.globalRelations=[];a.transferablePrinciples=[p];
 a.structuralMoments=a.structuralMoments.map(m=>({order:m.order,role:m.role,layoutMode:'other',layoutExplanation:m.layoutExplanation,geometry:observation('x').geometry,transferablePrinciples:[p],
  evidence:{...m.evidence,sourceViews:['overview'],scope:'sampledStates',level:'inferred',...(a.analysisVersion===3?{anchors:[{viewId:'overview',observationId:coverage.states[0].id,startPercent:0,endPercent:1,dominantMass:'balanced',imageTextRelationship:'overlapping'}]}:{})}}));return a;
}
function output(req,cov){return{readingVersion:1,observations:req.presented.map(observation),...(req.stage.kind==='detail'?{}:{analysis:analysis(req,cov)})};}
test('18, 23 and 55 original states: no visually distinct close state is removed; exact duplicates retain separate positions',async()=>{
 for(const n of [18,23,55]){const e=await evidence(n),c=await buildExhaustiveCoverage(e);assert.equal(c.captureCertified,true);assert.equal(c.states.length,n);assert.equal(c.distinctPixelStates,9);assert.ok(c.states[0].overlappingIds.includes('state0002'));assert.equal(c.states[9].representativeId,'state0001');assert.ok(c.states[9].equivalenceProof);assert.notEqual(c.states[9].position,c.states[0].position);assert.equal(c.artisticCertification,'not_evaluated');}
 const e=await evidence(2);const c=await buildExhaustiveCoverage(e);assert.equal(c.representativeIds.length,2);assert.equal(c.states[0].sectionIdentity,'unknown');
});
test('missing originals, unobserved gaps and unavailable eligible media never certify exhaustive pixels',async()=>{
 const e=await evidence(23);e.observations.splice(2,5);let c=await buildExhaustiveCoverage(e);assert.equal(c.captureCertified,false);assert.ok(c.blockers.includes('original_pixel_coverage_gaps'));assert.throws(()=>reading.planExhaustiveReading(c));
 const m=await evidence(3);m.observations[1].mediaEvidence.knownMissing=1;c=await buildExhaustiveCoverage(m);assert.equal(c.captureCertified,false);
 const empty=await evidence(0);c=await buildExhaustiveCoverage(empty);assert.ok(c.blockers.includes('originals_missing'));
});
test('unavailable embeds and sampled motion remain limitations, never an appearance or motion certification',async()=>{
 const e=await evidence(3);e.observations[1].externalEmbeds=[{externalEmbedUnavailable:true,domain:'fixture.test',top:500,width:400,height:300}];const c=await buildExhaustiveCoverage(e);
 assert.equal(c.unavailableEmbeds.length,1);assert.equal(c.captureCertified,true);assert.ok(c.states.every(s=>s.limits.includes('sampled_static_state_not_motion_observation')));
});
test('PNG preservation survives selector independence, detects file tampering and refuses generation overwrite',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'structural-original-')),e=await evidence(3);
 try{const a=await createOriginalEvidenceArchive(dir,{sourceUrl:'https://fixture.test/'});for(const o of e.observations)await a.record(o);await a.finish({buffer:e.observations[0].buffer,captureCoverage:e.manifest.captureCoverage,captureSanitization:e.manifest.captureSanitization,localMetadata:e.manifest.localMetadata});
 const read=await readOriginalEvidence(dir);assert.equal(read.observations.length,3);assert.deepEqual(read.observations[1].buffer,e.observations[1].buffer);assert.equal(read.observations[1].width,1200);await assert.rejects(createOriginalEvidenceArchive(dir));
 await fs.writeFile(path.join(dir,'state0002.png'),e.observations[0].buffer);await assert.rejects(readOriginalEvidence(dir),{code:'original_evidence_changed'});
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('automatic single/batched planning preserves ordered coverage and both sides of every batch boundary',async()=>{
 const e=await evidence(23),c=await buildExhaustiveCoverage(e),single=reading.planExhaustiveReading(c);assert.equal(single.stages[0].kind,'integrated');assert.equal(single.maximumCalls,1);
 const batch=reading.planExhaustiveReading(c,{limits:{...reading.MODEL_LIMITS,context:250000,payloadBytes:30*1024*1024}});
 assert.ok(batch.stages.length>2);assert.deepEqual(batch.stages.filter(s=>s.kind==='detail').flatMap(s=>s.primaryIds),c.representativeIds);
 for(let i=0;i<batch.stages.length-2;i++){assert.ok(batch.stages[i].boundaryIds.includes(batch.stages[i+1].primaryIds[0]));assert.ok(batch.stages[i+1].boundaryIds.includes(batch.stages[i].primaryIds.at(-1)));}
 const subset=reading.planExhaustiveReading(c,{representativeIds:c.representativeIds.slice(0,2)});assert.equal(subset.allDistinctiveStatesCovered,false);assert.equal(subset.stages[0].kind,'integrated');
});
test('coverage factor freezes artistic prompt/schema; contract factor freezes images/order/geometry; native PNGs remain high',async()=>{
 const e=await evidence(23),c=await buildExhaustiveCoverage(e),full=reading.planExhaustiveReading(c),few=reading.planExhaustiveReading(c,{representativeIds:c.representativeIds.slice(0,2)});
 const all3=reading.buildReadingRequest(e,c,full,full.stages[0],3),some3=reading.buildReadingRequest(e,c,few,few.stages[0],3),all2=reading.buildReadingRequest(e,c,full,full.stages[0],2);
 assert.equal(all3.body.instructions,some3.body.instructions);assert.deepEqual(all3.binding.schema,some3.binding.schema);
 assert.deepEqual(all3.body.text.format.schema,some3.body.text.format.schema);
 assert.deepEqual(all3.body.input,all2.body.input);assert.notEqual(all3.identity.schemaHash,all2.identity.schemaHash);
 const images=all3.body.input[0].content.filter(i=>i.type==='input_image');assert.equal(images.length,c.representativeIds.length+1);assert.ok(images.slice(1).every(i=>i.detail==='high'&&i.image_url.startsWith('data:image/png;base64,')));
});
test('missing/duplicate/distant IDs, fake sections, contradictions and uncertain source promotion are rejected',async()=>{
 const e=await evidence(3),c=await buildExhaustiveCoverage(e),p=reading.planExhaustiveReading(c),r=reading.buildReadingRequest(e,c,p,p.stages[0],3),good=output(r,c);
 assert.doesNotThrow(()=>reading.validateReadings(good,r,c));
 for(const mutate of [v=>v.observations.pop(),v=>v.observations[1].id=v.observations[0].id,v=>v.observations[0].stateVersusSection='section',v=>v.observations[0].relatedObservationIds=['unseen'],v=>v.observations[0].geometry.imagePlacement='absent',v=>v.analysis.structuralMoments[0].evidence.anchors[0].observationId='unseen']){const v=structuredClone(good);mutate(v);assert.throws(()=>reading.validateReadings(v,r,c));}
 const v=structuredClone(good);v.analysis.structuralMoments[0].evidence.sourceViews=[r.presented[0]];v.analysis.structuralMoments[0].evidence.level='direct';v.analysis.structuralMoments[0].evidence.anchors[0].viewId=r.presented[0];v.observations[0].certainty='unknown';v.observations[0].uncertainty='Missing geometric evidence';assert.throws(()=>reading.validateReadings(v,r,c));
});
test('density/large typography witness flags trigger review without assigning a score or paid retry',async()=>{
 const e=await evidence(9),reads=[observation('state0004'),observation('state0003')];e.observations[2].measures.lines[0].fontSize=300;reads[0].density='sparse';reads[1].geometry.dominantMass='void';
 const signals=reading.qualitySignals(reads,e);assert.ok(signals.some(s=>s.reason.includes('image_coverage')));assert.ok(signals.some(s=>s.reason.includes('typography')));assert.ok(signals.every(s=>s.score===undefined));
});
test('durable pipeline archives raw before validation, reserves budget, resumes only GET, and is idempotent after success',async()=>{
 const e=await evidence(3),c=await buildExhaustiveCoverage(e),p=reading.planExhaustiveReading(c),req=reading.buildReadingRequest(e,c,p,p.stages[0],3),dir=await fs.mkdtemp(path.join(os.tmpdir(),'reading-cohort-'));
 const auth={id:'offline',maximumCalls:1,capUSD:1,historicalKnownUSD:.024139325,historicalReservedUSD:.36};let cohort= createReadingCheckpointCohort(dir,auth),posts=0,gets=0,clock=1000;
 const request=async(endpoint,body,opts)=>{if(opts.method==='POST')posts++;else gets++;const response={id:'resp_fixture',model:'gpt-6-luna',service_tier:'default',status:opts.method==='POST'?'queued':'completed',...(opts.method==='GET'?{output_text:JSON.stringify(output(req,c)),usage:{input_tokens:1000,output_tokens:1000,total_tokens:2000}}:{})};await opts.onRawBody(JSON.stringify(response),{httpStatus:200});return {body:response};};
 try{let result=await reading.executeReadingPlan({evidence:e,coverage:c,plan:p,coordinator:cohort.forRun('siteA',c.generationId),authorization:auth,request,now:()=>clock});assert.equal(result.state,'provider_pending',JSON.stringify(result.failure));assert.equal(posts,1);assert.equal(cohort.ledger.calls[0].checkpoint.budget.reservationUSD,.36);cohort.close();clock+=6000;cohort=createReadingCheckpointCohort(dir,auth);
 result=await reading.executeReadingPlan({evidence:e,coverage:c,plan:p,coordinator:cohort.forRun('siteA',c.generationId),authorization:auth,request,now:()=>clock});assert.equal(result.state,'completed');assert.equal(result.coverageComplete,true);assert.equal(result.artisticCertification,'not_independently_evaluated');assert.equal(posts,1);assert.equal(gets,1);
 await reading.executeReadingPlan({evidence:e,coverage:c,plan:p,coordinator:cohort.forRun('siteA',c.generationId),authorization:auth,request,now:()=>clock});assert.equal(posts,1);assert.equal(gets,1);assert.ok((await fs.readdir(path.join(dir,'siteA','detail-1','http'))).includes('0002.body'));
 assert.throws(()=>createReadingCheckpointCohort(dir,auth));await fs.writeFile(path.join(dir,'siteA','generation.json'),JSON.stringify({generationId:'superseded'}));assert.throws(()=>cohort.forRun('siteA',c.generationId));
 }finally{cohort.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('provider invalid result/timeout/budget stop without another paid POST and preserve prior/raw evidence',async()=>{
 const e=await evidence(2),c=await buildExhaustiveCoverage(e),p=reading.planExhaustiveReading(c);
 for(const mode of ['invalid','timeout','budget']){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'reading-failure-')),auth={id:'offline',maximumCalls:1,capUSD:mode==='budget'?.5:1,historicalKnownUSD:.024139325,historicalReservedUSD:.36},cohort=createReadingCheckpointCohort(dir,auth);let calls=0;
  try{const request=async(endpoint,body,opts)=>{calls++;if(mode==='timeout')throw Object.assign(Error('timeout'),{code:'OPENAI_TIMEOUT'});const response={id:'resp_invalid',model:'gpt-6-luna',service_tier:'default',status:'completed',output_text:'{"readingVersion":1,"observations":[]}',usage:{input_tokens:1,output_tokens:1,total_tokens:2}};await opts.onRawBody(JSON.stringify(response),{httpStatus:200});return{body:response};};
   const args={evidence:e,coverage:c,plan:p,coordinator:cohort.forRun('fail',c.generationId),authorization:auth,request};const result=await reading.executeReadingPlan(args);assert.equal(result.state,'stopped');assert.equal(calls,mode==='budget'?0:1);await reading.executeReadingPlan(args);assert.equal(calls,mode==='budget'?0:1);if(mode==='invalid')assert.ok(await fs.readFile(path.join(dir,'fail','detail-1','http','0001.body')));if(mode==='timeout')assert.equal(cohort.financials().reservedUSD,.72);
  }finally{cohort.close();await fs.rm(dir,{recursive:true,force:true});}
 }
});
test('multi-pass execution preserves boundary witnesses and stops on contradictory geometry before synthesis',async()=>{
 const e=await evidence(9),c=await buildExhaustiveCoverage(e),plan=reading.planExhaustiveReading(c,{limits:{...reading.MODEL_LIMITS,payloadBytes:25*1024*1024}});assert.ok(plan.maximumCalls>2);
 for(const conflicting of [false,true]){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'reading-boundary-')),auth={id:'offline',maximumCalls:plan.maximumCalls,capUSD:5,historicalKnownUSD:.024139325,historicalReservedUSD:.36},cohort=createReadingCheckpointCohort(dir,auth);let calls=0;
  try{const coordinator=cohort.forRun('multi',c.generationId);const request=async(endpoint,body,opts)=>{
    const stage=plan.stages[calls++],prior=(await coordinator.load()).reads,prepared=reading.buildReadingRequest(e,c,plan,stage,3,prior),value=output(prepared,c);
    if(conflicting&&calls===2){const repeated=value.observations.find(r=>prior.some(p=>p.id===r.id));repeated.geometry.dominantMass='text';}
    const raw={id:`resp_stage${calls}`,model:'gpt-6-luna',service_tier:'default',status:'completed',usage:{input_tokens:1000,output_tokens:1000,total_tokens:2000},output_text:JSON.stringify(value)};await opts.onRawBody(JSON.stringify(raw),{httpStatus:200});return{body:raw};};
   const result=await reading.executeReadingPlan({evidence:e,coverage:c,plan,coordinator,authorization:auth,request});
   if(conflicting){assert.equal(result.state,'stopped');assert.equal(result.failure.code,'exhaustive_boundary_contradiction');assert.equal(calls,2);assert.equal(result.completedStages.length,1);assert.ok(result.boundaryReadings.length);}
   else {assert.equal(result.state,'completed');assert.equal(result.coverageComplete,true);assert.equal(result.reads.length,c.distinctPixelStates);assert.equal(calls,plan.maximumCalls);assert.ok(result.boundaryReadings.length);assert.ok(result.analysis);}
  }finally{cohort.close();await fs.rm(dir,{recursive:true,force:true});}
 }
});
test('Chromium preserves every native screenshot before position pooling and archive survives browser closure',async()=>{
 const browser=await require('playwright-core').chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'reading-browser-')),archive=await createOriginalEvidenceArchive(dir,{sourceUrl:'https://fixture.test/'});let closed=false;
 try{const p=await browser.newPage({viewport:{width:1440,height:900}});await p.setContent('<style>body{margin:0}section{height:1000px;font-size:80px}</style>'+['#ade','#feb','#afa'].map((c,i)=>`<section style="background:${c}">Distinct composition ${i}</section>`).join(''));
  const {sanitizeStructuralCapture}=require('../services/design-lab/capture-sanitization.service'),{captureStructuralPage}=require('../services/design-lab/structural-page-capture.service');
  const initial=await sanitizeStructuralCapture(p,Date.now()+90000),page=await captureStructuralPage(p,Date.now()+90000,initial,{onOriginalObservation:archive.record});await archive.finish(page);await browser.close();closed=true;
  const saved=await readOriginalEvidence(dir);assert.equal(saved.observations.length,page.originalViews.length);assert.ok(saved.observations.length>5);assert.ok(saved.observations.filter(o=>o.position===2100).length>=3);assert.ok(saved.observations.every(o=>o.format==='png'&&o.width===1440&&o.height===900));
  const c=await buildExhaustiveCoverage(saved);assert.equal(c.captureCertified,true);assert.ok(c.states.length>c.distinctPixelStates);
 }finally{if(!closed)await browser.close();await fs.rm(dir,{recursive:true,force:true});}
});
test('abandoned local worker is reclaimed safely and autonomous polling performs one POST then one GET',async()=>{
 const e=await evidence(2),c=await buildExhaustiveCoverage(e),p=reading.planExhaustiveReading(c),r=reading.buildReadingRequest(e,c,p,p.stages[0],3),dir=await fs.mkdtemp(path.join(os.tmpdir(),'reading-auto-'));
 await fs.writeFile(path.join(dir,'worker.lock'),JSON.stringify({pid:2147483647,owner:'dead'}));
 const auth={id:'offline',maximumCalls:1,capUSD:1,historicalKnownUSD:.024139325,historicalReservedUSD:.36},cohort=createReadingCheckpointCohort(dir,auth);let clock=1000,posts=0,gets=0;
 try{const request=async(endpoint,body,opts)=>{if(opts.method==='POST')posts++;else gets++;const raw={id:'resp_auto',model:'gpt-6-luna',service_tier:'default',status:opts.method==='POST'?'queued':'completed',...(opts.method==='GET'?{usage:{input_tokens:1000,output_tokens:1000,total_tokens:2000},output_text:JSON.stringify(output(r,c))}:{})};await opts.onRawBody(JSON.stringify(raw),{httpStatus:200});return {body:raw};};
  const result=await reading.runAutonomousReading({evidence:e,coverage:c,plan:p,coordinator:cohort.forRun('auto',c.generationId),authorization:auth,request,now:()=>clock},{wait:async ms=>{clock+=ms;}});assert.equal(result.state,'completed');assert.equal(posts,1);assert.equal(gets,1);assert.ok((await fs.readdir(dir)).some(f=>f.startsWith('worker.lock.abandoned-')));
 }finally{cohort.close();await fs.rm(dir,{recursive:true,force:true});}
});
