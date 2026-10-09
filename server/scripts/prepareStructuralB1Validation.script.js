// Offline only: reads an existing private snapshot and local audit assets.
// No app, environment, database, upload, capture or paid-client dependency.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {performance} = require('node:perf_hooks');
const {buildStructuralVisionRequest,validateStructuralAnalysis} = require('../services/design-lab/structural-reference.contract');
const hash = value => createHash('sha256').update(value).digest('hex');
const same = (a,b) => assert.deepEqual(a,b);
const TARGETS = ['6ac39cff599b9a26b2dc05d2','6ac758d7d7b33e9ce0039cea','6ac789a195ac4c5a6cc51831',
  '6ac3603eb929a05351c55263','6ac786fa95ac4c5a6cc51523'];
function requestFor(site,version) {
  return buildStructuralVisionRequest(site.captures,site.metadata,site.manifest,{analysisVersion:version});
}
function prepare(snapshot,index,assetDirectory,previousProtocol) {
  const checked=[],sites=[];
  let verifiedAssets=0;
  for(const row of index.references) {
    const ref=snapshot.refs.find(r=>String(r._id)===row.id);
    const attempt=snapshot.attempts.find(a=>String(a._id)===row.attempt);
    assert.ok(ref && attempt,'Frozen reference/attempt missing');
    assert.equal(ref.status,'analyzed');assert.equal(attempt.status,'applied');
    assert.equal(attempt.generationId,row.generation);assert.equal(String(attempt.referenceId),row.id);
    same(ref.analysis,attempt.parsedResult);
    same(ref.captures,attempt.captureSnapshot.captures);
    const raw=attempt.rawResponse;
    assert.ok(raw,'Historical raw response missing');
    const text=raw.output_text || raw.output?.flatMap(o=>o.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('');
    same(JSON.parse(text),attempt.parsedResult);
    const {captures,metadata,visionInput}=attempt.captureSnapshot;
    const request=buildStructuralVisionRequest(captures,metadata,visionInput,{analysisVersion:1});
    validateStructuralAnalysis(attempt.parsedResult,metadata,captures,request.manifest,1);
    const folder=path.join(assetDirectory,row.id);
    assert.equal(hash(fs.readFileSync(path.join(folder,'analysis.json'))),row.analysisSha256);
    assert.equal(hash(fs.readFileSync(path.join(folder,'manifest.json'))),row.manifestSha256);
    for(const asset of row.inputAssets) {
      assert.equal(hash(fs.readFileSync(path.join(folder,`${asset.id}.webp`))),asset.sha256);
      verifiedAssets++;
    }
    checked.push({id:row.id,generation:row.generation,attempt:row.attempt,contractVersion:1,
      manifestMatches:true,rawParsedAppliedMatch:true,inputAssets:row.inputAssets.length,
      analysisSha256:row.analysisSha256,manifestSha256:row.manifestSha256});
    if(TARGETS.includes(row.id)) {
      // Public image/geometry inputs only; no raw response or reference record.
      const cleanCaptures=captures.map(c=>Object.fromEntries(['type','url','sourceRect','viewport','detail']
        .filter(key=>c[key]!==undefined).map(key=>[key,c[key]])));
      const site={id:row.id,title:row.title,generation:row.generation,attempt:row.attempt,
        captures:cleanCaptures,metadata,manifest:visionInput,
        inputAssets:row.inputAssets,variants:[]};
      for(const version of [1,2]) {
        const started=performance.now(),req=requestFor(site,version);
        site.variants.push({variant:version===1?'A':'B',analysisContract:req.analysisContract,
          contentSha256:hash(JSON.stringify(req.content)),contentBytes:Buffer.byteLength(JSON.stringify(req.content)),
          instructionsBytes:Buffer.byteLength(req.instructions),schemaBytes:Buffer.byteLength(JSON.stringify(req.schema)),
          preparationMs:performance.now()-started});
      }
      assert.equal(site.variants[0].contentSha256,site.variants[1].contentSha256);
      const previous=previousProtocol?.sites.find(s=>s.id===site.id);
      if(previous) {
        same(site.captures,previous.captures);same(site.metadata,previous.metadata);same(site.manifest,previous.manifest);
        same(site.inputAssets,previous.inputAssets);
        site.variants.forEach((v,i)=>{same(v.analysisContract,previous.variants[i].analysisContract);
          assert.equal(v.contentSha256,previous.variants[i].contentSha256);});
      }
      sites.push(previous?structuredClone(previous):site);
    }
  }
  assert.equal(checked.length,13);assert.equal(verifiedAssets,67);assert.equal(sites.length,5);
  sites.sort((a,b)=>TARGETS.indexOf(a.id)-TARGETS.indexOf(b.id));
  return {verification:{version:1,scope:'local_frozen_B1_snapshot_and_audit_bytes',
    snapshotAt:index.snapshotAt,references:checked,verifiedReferences:checked.length,verifiedAssets,
    remoteReads:0,remoteWrites:0,visionCalls:0,
    limitation:'Current audit asset hashes do not prove all historical dispatch bytes or live source fidelity.'},
    protocol:{version:2,status:'prepared_not_authorized_not_dispatched',authorizedCalls:0,proposedMaximumCalls:10,
      parameters:{model:'gpt-6-luna',reasoningEffort:'medium',timeoutMs:120000,automaticRetries:0},
      requiredBeforeDispatch:['human monetary budget approval','final protocol approval','same image bytes verified at execution','independent constant-grid visual evaluation'],
      historicalPairTokenEstimate:2*sites.reduce((n,s)=>n+index.references.find(r=>r.id===s.id).usage.total_tokens,0),tokenEstimateIsBillingCap:false,
      maturity:{minimumDesignLabUtility:8,scale:10,eachB2SiteRequired:true,
        retainAllFailures:true,automaticScoring:false,automaticPaidRetry:false},sites}};
}
if(require.main===module) {
  const [snapshotPath,assetDirectory,outputDirectory]=process.argv.slice(2);
  if(!snapshotPath || !assetDirectory || !outputDirectory)
    throw Error('Usage: node --require ./tests/helpers/structural-offline-guard.js scripts/prepareStructuralB1Validation.script.js SNAPSHOT_JSON AUDIT_ASSET_DIRECTORY OUTPUT_DIRECTORY');
  const protocolPath=path.join(outputDirectory,'STRUCTURAL_B1_AB_PREPARED.json');
  const previousBytes=fs.existsSync(protocolPath)?fs.readFileSync(protocolPath):null;
  const previousProtocol=previousBytes?JSON.parse(previousBytes):undefined;
  const result=prepare(JSON.parse(fs.readFileSync(snapshotPath)),require('../docs/STRUCTURAL_B1_BASELINE_INDEX.json'),assetDirectory,previousProtocol);
  fs.mkdirSync(outputDirectory,{recursive:true});
  if(previousProtocol?.version===1) {
    const archived=path.resolve(__dirname,'../diagnostics/structural-b1-ab-20261008/preflight/three-pair-protocol.superseded.json');
    fs.mkdirSync(path.dirname(archived),{recursive:true});
    if(fs.existsSync(archived))assert.equal(hash(fs.readFileSync(archived)),hash(previousBytes));
    else fs.writeFileSync(archived,previousBytes,{flag:'wx',mode:0o600});
    result.protocol.supersedes={version:1,maximumCalls:6,sha256:hash(previousBytes),archive:path.relative(path.resolve(__dirname,'..'),archived)};
  }else if(previousProtocol?.supersedes)result.protocol.supersedes=previousProtocol.supersedes;
  fs.writeFileSync(path.join(outputDirectory,'STRUCTURAL_B1_COMPATIBILITY.json'),JSON.stringify(result.verification,null,2)+'\n');
  fs.writeFileSync(path.join(outputDirectory,'STRUCTURAL_B1_AB_PREPARED.json'),JSON.stringify(result.protocol)+'\n');
  console.log(JSON.stringify({verifiedReferences:result.verification.verifiedReferences,verifiedAssets:result.verification.verifiedAssets,
    preparedPairs:result.protocol.sites.length,visionCalls:0,authorizedCalls:0}));
}
module.exports={prepare,requestFor};
