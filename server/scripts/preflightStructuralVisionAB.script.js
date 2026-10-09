// Offline preparation only. No paid transport, application startup, DB or upload.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const sharp=require('sharp');
const {requestFor}=require('./prepareStructuralB1Validation.script');
const hash=v=>createHash('sha256').update(v).digest('hex');
const CRITERIA=['Capture/fidélité','Structure','Texte→image','Densité','Transitions','Principes','Prudence','Taxonomie','Utilité Design Lab'];
const PRICES={input:0.10,cachedInput:0.01,cacheWrite:0.125,output:0.50};
function price(usage,rates=PRICES) {
 const cached=usage.input_tokens_details?.cached_tokens||0,write=usage.input_tokens_details?.cache_write_tokens||0;
 const normal=usage.input_tokens-cached-write;assert.ok(normal>=0);
 return (normal*rates.input+cached*rates.cachedInput+write*rates.cacheWrite+usage.output_tokens*rates.output)/1e6;
}
function assemble(site,version,assets) {
 const req=requestFor(site,version);
 const content=req.content.map(c=>c.type==='input_image'?{...c,image_url:assets.find(a=>a.url===c.image_url).dataUrl}:c);
 return {model:'gpt-6-luna',store:false,service_tier:'default',reasoning:{effort:'medium'},
  instructions:req.instructions,input:[{role:'user',content}],
  text:{format:{type:'json_schema',name:'structural_reference_analysis',strict:true,schema:req.schema}}};
}
async function preflight(protocol,index,auditDirectory,archiveDirectory) {
 assert.equal(protocol.proposedMaximumCalls,10);assert.equal(protocol.authorizedCalls,0);assert.equal(protocol.sites.length,5);
 const checks=[],costs=[];let totalInputs=0,totalOutputs=0,totalImageBytes=0,additionalV2RequestBytes=0;
 fs.mkdirSync(archiveDirectory,{recursive:true});
 const frozenProtocol=path.join(archiveDirectory,'prepared-protocol.json');
 const protocolBytes=Buffer.from(JSON.stringify({...protocol,preflight:undefined}));
 // Only the experiment archive may change; canonical B1 artifacts stay read-only.
 if(fs.existsSync(frozenProtocol))assert.equal(hash(fs.readFileSync(frozenProtocol)),hash(protocolBytes));
 else fs.writeFileSync(frozenProtocol,protocolBytes,{flag:'wx',mode:0o600});
 for(const site of protocol.sites) {
  const assets=[];
  for(const view of site.manifest.views) {
   assert.match(site.id,/^[a-f0-9]{24}$/);assert.match(view.id,/^(overview|visionOverview|observation[1-5]|top|middle|bottom)$/);
   const expected=site.inputAssets.find(a=>a.id===view.id);
   assert.ok(expected);assert.equal(expected.detail,view.detail);
   const bytes=fs.readFileSync(path.join(auditDirectory,site.id,`${view.id}.webp`));
   assert.equal(hash(bytes),expected.sha256);
   const dimensions=await sharp(bytes).metadata();
   assert.equal(dimensions.width,expected.width);assert.equal(dimensions.height,expected.height);
   const directory=path.join(archiveDirectory,'inputs',site.id);fs.mkdirSync(directory,{recursive:true});
   const frozen=path.join(directory,`${view.id}.webp`);
   if(fs.existsSync(frozen))assert.equal(hash(fs.readFileSync(frozen)),expected.sha256);
   else fs.writeFileSync(frozen,bytes,{flag:'wx',mode:0o600});
   assets.push({id:view.id,url:view.url,dataUrl:`data:image/webp;base64,${bytes.toString('base64')}`});
   totalImageBytes+=bytes.length;
  }
  const a=assemble(site,1,assets),b=assemble(site,2,assets);
  const invariant=body=>{const {instructions,text,...common}=body;return {...common,text:{format:{...text.format,schema:undefined}}};};
  assert.deepEqual(invariant(a),invariant(b));assert.deepEqual(a.input,b.input);
  const variants=[a,b].map((body,i)=>({variant:i===0?'A':'B',version:i+1,requestSha256:hash(JSON.stringify(body)),
   inputSha256:hash(JSON.stringify(body.input)),instructionsSha256:hash(body.instructions),schemaSha256:hash(JSON.stringify(body.text.format.schema)),
   requestBytes:Buffer.byteLength(JSON.stringify(body))}));
  additionalV2RequestBytes+=variants[1].requestBytes-variants[0].requestBytes;
  checks.push({id:site.id,title:site.title,generation:site.generation,attempt:site.attempt,
   images:site.manifest.views.map(v=>({id:v.id,detail:v.detail,...site.inputAssets.find(a=>a.id===v.id)})),
   originalManifestSha256:hash(JSON.stringify(site.manifest)),inputEquality:true,onlyPromptSchemaDiffer:true,variants});
  const usage=index.references.find(r=>r.id===site.id).usage;
  totalInputs+=2*usage.input_tokens;totalOutputs+=2*usage.output_tokens;
  costs.push({id:site.id,title:site.title,historicalInputTokens:usage.input_tokens,historicalOutputTokens:usage.output_tokens,
   reasoningAlreadyIncluded:usage.output_tokens_details?.reasoning_tokens||0,historicalUsageRepricedPairUSD:2*price(usage),
   noCacheAllWritesPairUSD:2*(usage.input_tokens*PRICES.cacheWrite+usage.output_tokens*PRICES.output)/1e6});
 }
 const noCache=costs.reduce((n,c)=>n+c.noCacheAllWritesPairUSD,0);
 return {version:1,date:'2026-10-08',status:'ready_local_checks_passed_awaiting_explicit_budget_and_ten_call_approval',
  authorizedCalls:0,preparedCalls:10,verifiedImageFiles:checks.reduce((n,c)=>n+c.images.length,0),totalImageBytes,
  configuredModel:'gpt-6-luna',parameters:{...protocol.parameters,serviceTier:'default',store:false,maxOutputTokens:'unchanged_model_limit_128000'},
  imageTransport:'same_verified_local_webp_bytes_as_data_uris_for_both_variants_no_remote_asset_fetch',
  archive:'server/diagnostics/structural-b1-ab-20261008/preflight',checks,
  budget:{currency:'USD',taxesIncluded:false,pricingDate:'2026-10-08',ratesPerMillion:PRICES,
   pricingSource:'https://developers.openai.com/api/docs/pricing',modelSource:'https://developers.openai.com/api/docs/models/gpt-6-luna',
   historicalScaledInputTokens:totalInputs,historicalScaledOutputTokens:totalOutputs,historicalScaledTotalTokens:totalInputs+totalOutputs,
   historicalUsageRepricedUSD:costs.reduce((n,c)=>n+c.historicalUsageRepricedPairUSD,0),allInputCacheWritesSameOutputUSD:noCache,
   realisticEstimateUSD:0.06,realisticRangeUSD:[0.05,0.10],recommendedMaximumUSD:1.00,
   v2ExtraInputUSDApproximate:[0.0005,0.0015],v2OutputCostDeltaUnknown:true,
   additionalV2RequestBytes,extraInputEstimateMethod:'Measured extra UTF-8 request bytes, heuristic 2–5 bytes/token, cache writes at $0.125/M. Not a tokenizer or provider quote.',
   extraOutputCostPer10000TokensUSD:0.005,
   conservativeSingleCallReservationUSD:0.36,
   reservationBasis:'1.05M input tokens at maximum long-context cache-write rate $0.25/M plus 128K output at long-context rate $0.75/M = $0.3585; rounded up. Standard global endpoint only.',
   automaticRetries:0,perSite:costs,
   uncertainty:['output and reasoning length','cache reads/writes','vision input tokenization and hidden formatting','account access and quota not probed','provider alias may evolve','taxes and FX excluded']},
  storage:{localOnly:true,newExperimentIdRequired:true,noReferenceServiceRun:true,noAdminEndpoint:true,noDatabaseConnection:true,noCloudinaryCall:true,
   artifacts:['frozen inputs and original manifests','exact sent payload/hash','dispatch ledger and operation events','raw response before parse','parsed output and validation error',
    'usage/cache/reasoning/provider model/request ID/tier/elapsed time','masked evaluation packet','scores and visual evidence','unblind mapping and final per-site verdict']},
  stop:{sequentialCalls:true,maximumCalls:10,timeoutMs:120000,
   conditions:['timeout or ambiguous provider outcome','HTTP or network error','incomplete response/refusal/invalid output','model/tier/hash mismatch','local checkpoint failure',
    'spent plus worst-case next reservation exceeds approved cap','missing or inconsistent usage'],
   beforeFetch:'durably consume one call slot and reserve cost before any dispatch',onUncertainty:'retain reservation, halt cohort, never retry automatically',
   onPartialPair:'preserve both successful and failed evidence; pair not evaluable if either response unavailable'},
  evaluation:{criteria:CRITERIA,minimumUtility:8,unchangedScale:true,oldScoresUnchanged:true,
   reviewers:'independent of the paid generator; fresh-context or external review preferred; no extra paid evaluator call',
   blinding:'neutral random IDs; remove version/model and old scores; randomize presentation within each site; same neutral rendering; lock notes before unblinding',
   residualBias:'schema/style may reveal version; current implementer already knows V2; no claim of perfect blinding or full external independence',
   comparisonUnit:'visually grounded page interval/moment, not moment number which may differ between versions',
   perMoment:['geometry/dominance/axes/overlap/void','segmentation and scope of evidence','presence assertions/hallucinations','relations near and far','specific transferable mechanism/effect/conditions'],
   perSiteVerdict:['contemporary V1 scores','V2 scores','delta on all nine criteria','absolute V2 utility and whether >=8',
    'corrected/persistent/new errors','hallucinations removed/introduced','relations/principles','probable input limitations','causal hypotheses with confidence'],
   causalLimit:'One pair per site measures prompt+schema jointly; no separation of their effects or proof of reliability on unknown sites. All <8 scores and failures remain visible.',
   remainingB1:'eight references remain in scope of improvement; no additional calls prepared; Salterra requires capture repair/certification before artistic evaluation'}};
}
if(require.main===module)(async()=>{
 const [auditDirectory,archiveDirectory]=process.argv.slice(2);
 assert.ok(auditDirectory&&archiveDirectory,'Usage: offline guarded script AUDIT_DIRECTORY ARCHIVE_DIRECTORY');
 const file=path.resolve(__dirname,'../docs/STRUCTURAL_B1_AB_PREPARED.json');
 const protocol=JSON.parse(fs.readFileSync(file));
 const envText=fs.readFileSync(path.resolve(__dirname,'../.env'),'utf8');
 const model=(process.env.OPENAI_DESIGN_REFERENCE_ANALYSIS_MODEL||envText.match(/^OPENAI_DESIGN_REFERENCE_ANALYSIS_MODEL\s*=\s*([^\r\n]*)/m)?.[1]||'gpt-6-luna').trim().replace(/^['"]|['"]$/g,'');
 assert.equal(model,protocol.parameters.model,'Configured model differs from frozen protocol');
 assert.ok(process.env.OPENAI_API_KEY||/^OPENAI_API_KEY\s*=\s*\S+/m.test(envText),'API credential absent; no secret is printed');
 const result=await preflight(protocol,require('../docs/STRUCTURAL_B1_BASELINE_INDEX.json'),auditDirectory,archiveDirectory);
 protocol.preflight=result;
 fs.writeFileSync(file,JSON.stringify(protocol)+'\n');
 console.log(JSON.stringify({preparedCalls:result.preparedCalls,verifiedImages:result.verifiedImageFiles,estimateUSD:result.budget.realisticEstimateUSD,
  rangeUSD:result.budget.realisticRangeUSD,recommendedMaximumUSD:result.budget.recommendedMaximumUSD,authorizedCalls:0}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={preflight,assemble,price,PRICES};
