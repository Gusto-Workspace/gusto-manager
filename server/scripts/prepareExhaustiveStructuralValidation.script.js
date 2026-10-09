// Preparation only: reads local evidence; no provider, database or browser.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {readOriginalEvidence,digest}=require('../services/design-lab/structural-original-evidence');
const {buildExhaustiveCoverage}=require('../services/design-lab/structural-exhaustive-coverage');
const reading=require('../services/design-lab/structural-exhaustive-reading');
const write=(file,value)=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const hash=value=>digest(Buffer.from(JSON.stringify(value)));
async function prepare(root,outputName='prepared') {
 assert.ok(/^[a-zA-Z0-9_-]+$/.test(outputName));
 const output=path.join(root,outputName);await fs.mkdir(output,{recursive:true});
 const protocol={version:1,status:'prepared_not_authorized',paidCalls:0,authorizedCalls:0,sites:[],maximumCalls:0,
  criteria:['Capture/fidélité','Structure','Texte/image','Densité','Transitions','Principes transférables','Prudence','Taxonomie','Utilité Design Lab'],minimumUtility:8,
  callsSequential:true,automaticPaidRetries:0,model:reading.MODEL_LIMITS.model,detail:'high',globalDetail:'low',reasoning:'medium',background:true,store:false,serviceTier:'default',
  historicalKnownUSD:.024139325,historicalUncertainReservedUSD:.36,
  stopOn:['timeout','provider_error','invalid_result','missing_reading','boundary_contradiction','generation_changed','budget_insufficient'],
  evaluation:{blindMappingSeparate:true,nineCriteriaFrozen:true,compareByRecordedRanges:true,technicalValidityIsNotArtisticCertification:true},
  providerSizingLimitations:reading.MODEL_LIMITS.sizingStatus};
 for(const name of ['tastavents','cartapani','waldhaus']) {
  const directory=path.join(root,'captures',`${name}-live`),evidence=await readOriginalEvidence(directory),coverage=await buildExhaustiveCoverage(evidence);
  assert.ok(coverage.captureCertified,JSON.stringify(coverage.blockers));
  const selected=(evidence.manifest.captureCoverage.positions||[]).map(p=>{
   const original=evidence.observations.find(o=>o.position===p.position&&o.sha256===p.signature);
   assert.ok(original,'Selected PNG is not present in frozen originals');return coverage.states.find(s=>s.id===original.id).representativeId;
  });
  const selectedIds=[...new Set(selected)],all=reading.planExhaustiveReading(coverage,{priorityIds:selectedIds}),subset=reading.planExhaustiveReading(coverage,{representativeIds:selectedIds,priorityIds:selectedIds});
  const siteDir=path.join(output,name);await fs.mkdir(siteDir,{recursive:true});
  await fs.writeFile(path.join(siteDir,'storyboard-all-states.png'),coverage.storyboard.buffer,{flag:'wx'});
  const {storyboard,...manifest}=coverage;await write(path.join(siteDir,'coverage.json'),{...manifest,storyboard:{...storyboard,buffer:undefined,sha256:digest(storyboard.buffer),file:'storyboard-all-states.png'}});
  const variants=[{id:'selected-v3',artisticVersion:3,plan:subset},{id:'complete-v3',artisticVersion:3,plan:all},{id:'complete-v2',artisticVersion:2,plan:all}];
  const row={site:name,generationId:coverage.generationId,originals:coverage.capturedStateCount,distinctPixelStates:coverage.distinctPixelStates,selectedDetailedStates:selectedIds.length,
   nativeDimensions:coverage.viewport,format:'png',originalManifestSha256:digest(await fs.readFile(path.join(directory,'manifest.json'))),captureCertified:true,
   certificationScope:coverage.certificationScope,unavailableEmbeds:coverage.unavailableEmbeds,notObservable:coverage.notObservable,variants:[]};
  const built={};
  for(const variant of variants){const steps=[];
   for(const stage of variant.plan.stages){
    // Current sites fit integrated. A future synthesis cannot be frozen before
    // its actual detail responses; it must be instantiated by the coordinator.
    const req=reading.buildReadingRequest(evidence,coverage,variant.plan,stage,variant.artisticVersion,[]);
    if(stage.kind==='synthesis')throw Error('Multi-pass experiment needs conditional synthesis budget before frozen dispatch preparation');
    const file=`${variant.id}-${stage.id}.request.json`;await write(path.join(siteDir,file),req.body);
    steps.push({stage:stage.id,kind:stage.kind,file,identity:req.identity,images:req.body.input[0].content.filter(c=>c.type==='input_image').length,
     requestFileSha256:digest(await fs.readFile(path.join(siteDir,file))),payloadBytes:Buffer.byteLength(JSON.stringify(req.body)),detailedIds:req.presented});built[variant.id]=req;
   }
   row.variants.push({id:variant.id,artisticVersion:variant.artisticVersion,readingVersion:1,inputBindingVersion:1,plan:variant.plan,steps});protocol.maximumCalls+=variant.plan.maximumCalls;
  }
  assert.equal(built['selected-v3'].body.instructions,built['complete-v3'].body.instructions);
  assert.deepEqual(built['selected-v3'].body.text.format.schema,built['complete-v3'].body.text.format.schema);
  assert.deepEqual(built['complete-v2'].body.input,built['complete-v3'].body.input);
  row.invariants={coverageComparisonSamePromptAndSchema:true,contractComparisonSameImagesAndContext:true,nativeImagesUnchanged:true,sameGlobalMap:true};
  protocol.sites.push(row);
 }
 protocol.preventiveReservationPerCallUSD=.36;
 protocol.absoluteNativeWorstCaseUSD=protocol.maximumCalls*.36+protocol.historicalKnownUSD+protocol.historicalUncertainReservedUSD;
 protocol.recommendedGlobalCapUSD=Math.ceil(protocol.absoluteNativeWorstCaseUSD);
 protocol.estimatedNewCostUSD={low:protocol.maximumCalls*.015,high:protocol.maximumCalls*.06,
  basis:'planning range using historical 0.005-0.007 USD calls plus many native images and exhaustive observation output; unverified actual image tokens/reasoning',notBillingCap:true};
 protocol.conditionsBeforeDispatch=['new_explicit_financial_authorization','capture_visual_review_of_originals_and_known_embed_limit','freeze_executor_and_original_hashes','independent_blind_evaluation_prepared'];
 await write(path.join(output,'protocol.json'),protocol);
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const pages=await Promise.all(protocol.sites.map(async s=>{const e=await readOriginalEvidence(path.join(root,'captures',`${s.site}-live`));
  return `<section><h2>${esc(s.site)} — ${s.originals} originaux / ${s.distinctPixelStates} états de pixels distincts</h2><p>PNG 1440×900, génération ${esc(s.generationId)}. Certification limitée aux pixels capturés et médias inspectés ; aucune analyse artistique.</p><img class="map" src="${s.site}/storyboard-all-states.png"/><div class="grid">${e.observations.map(o=>`<article><h3>${esc(o.id)} · y${o.visibleRangePx.join('–')}</h3><a href="../captures/${s.site}-live/${o.file}"><img src="../captures/${s.site}-live/${o.file}" loading="lazy"/></a><p>${esc(o.origin)} · ${o.width}×${o.height} · SHA ${o.sha256.slice(0,12)}</p></article>`).join('')}</div></section>`;}));
 await fs.writeFile(path.join(output,'evidence-review.html'),`<!doctype html><html lang="fr"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'unsafe-inline'"><title>StructuralReference — originaux HD</title><style>body{font:16px system-ui;background:#eee;color:#222;margin:32px}section{margin:40px 0}.map{width:720px;max-width:100%}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:16px}article{background:white;padding:16px}article img{width:100%}p{overflow-wrap:anywhere}</style><h1>Preuves HD — nouvelle génération expérimentale</h1><p>Cliquer une image pour ouvrir son original PNG. États échantillonnés, aucune certification de mouvement ou de score artistique.</p>${pages.join('')}</html>`,{flag:'wx'});
 console.log(JSON.stringify({sites:protocol.sites.map(s=>({site:s.site,originals:s.originals,distinct:s.distinctPixelStates,selected:s.selectedDetailedStates})),calls:protocol.maximumCalls,capUSD:protocol.recommendedGlobalCapUSD,paidCalls:0}));
 return protocol;
}
if(require.main===module)prepare(path.resolve(process.argv[2]||'diagnostics/structural-exhaustive-hd-20261009'),process.argv[3]||'prepared').catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={prepare};
