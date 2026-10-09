const test=require('node:test'),assert=require('node:assert/strict');
const protocol=require('../docs/STRUCTURAL_B1_AB_PREPARED.json');
const {requestFor}=require('../scripts/prepareStructuralB1Validation.script');
const {createHash}=require('node:crypto');
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fs=require('node:fs'),path=require('node:path');
const {assemble,price}=require('../scripts/preflightStructuralVisionAB.script');
test('prepared contemporary A/B freezes identical public inputs and contract hashes without authorizing dispatch',()=>{
 assert.equal(protocol.authorizedCalls,0);assert.equal(protocol.proposedMaximumCalls,10);
 assert.equal(protocol.parameters.automaticRetries,0);assert.equal(protocol.sites.length,5);
 assert.equal(protocol.maturity.minimumDesignLabUtility,8);assert.equal(protocol.maturity.automaticScoring,false);
 for(const site of protocol.sites) {
  const a=requestFor(site,1),b=requestFor(site,2);assert.deepEqual(a.manifest,b.manifest);assert.deepEqual(a.content,b.content);
  assert.equal(hash(a.content),site.variants[0].contentSha256);assert.equal(hash(b.content),site.variants[1].contentSha256);
  assert.deepEqual(a.analysisContract,site.variants[0].analysisContract);assert.deepEqual(b.analysisContract,site.variants[1].analysisContract);
 }
 assert.doesNotMatch(JSON.stringify(protocol),/rawResponse|parsedResult|api[_-]?key|operationToken/);
});
test('extended protocol retains the previous three pairs exactly and never authorizes the ten calls',
 {skip:!fs.existsSync(path.resolve(__dirname,'..',protocol.supersedes.archive))?'Archived local preflight evidence unavailable; prepare offline before this evidence check.':false},()=>{
 const previousBytes=fs.readFileSync(path.resolve(__dirname,'..',protocol.supersedes.archive));
 assert.equal(createHash('sha256').update(previousBytes).digest('hex'),protocol.supersedes.sha256);
 const previous=JSON.parse(previousBytes);assert.equal(previous.sites.length,3);
 previous.sites.forEach(site=>assert.deepEqual(protocol.sites.find(s=>s.id===site.id),site));
 assert.equal(protocol.preflight.preparedCalls,10);assert.equal(protocol.preflight.authorizedCalls,0);
 assert.equal(protocol.preflight.verifiedImageFiles,25);
});
test('frozen bytes reconstruct all ten exact requests; only prompt and schema differ in each pair',
 {skip:!protocol.sites.every(s=>s.manifest.views.every(v=>fs.existsSync(path.resolve(__dirname,'../diagnostics/structural-b1-ab-20261008/preflight/inputs',s.id,`${v.id}.webp`))))?'Frozen local B1 WebP unavailable; prepare offline before this byte check.':false},()=>{
 for(const site of protocol.sites) {
  const assets=site.manifest.views.map(v=>{
   const file=path.resolve(__dirname,'../diagnostics/structural-b1-ab-20261008/preflight/inputs',site.id,`${v.id}.webp`);
   const bytes=fs.readFileSync(file),expected=site.inputAssets.find(a=>a.id===v.id);
   assert.equal(createHash('sha256').update(bytes).digest('hex'),expected.sha256);
   return {url:v.url,dataUrl:`data:image/webp;base64,${bytes.toString('base64')}`};
  });
  const a=assemble(site,1,assets),b=assemble(site,2,assets),check=protocol.preflight.checks.find(s=>s.id===site.id);
  assert.deepEqual(a.input,b.input);assert.equal(hash(a),check.variants[0].requestSha256);assert.equal(hash(b),check.variants[1].requestSha256);
  for(const key of ['model','store','service_tier','reasoning'])assert.deepEqual(a[key],b[key]);
  assert.ok(a.input[0].content.filter(c=>c.type==='input_image').every(c=>c.image_url.startsWith('data:image/webp;base64,')));
 }
});
test('budget accounts for cache writes instead of double charging and includes reasoning once; evaluation keeps nine criteria',()=>{
 assert.equal(price({input_tokens:1000,input_tokens_details:{cache_write_tokens:800,cached_tokens:100},output_tokens:200}),.000211);
 const p=protocol.preflight;assert.equal(p.evaluation.criteria.length,9);assert.equal(p.evaluation.minimumUtility,8);
 assert.equal(p.budget.historicalScaledTotalTokens,212614);assert.equal(p.budget.recommendedMaximumUSD,1);
 assert.equal(p.stop.maximumCalls,10);assert.equal(p.stop.timeoutMs,120000);assert.equal(p.stop.sequentialCalls,true);
 assert.equal(p.storage.noDatabaseConnection,true);assert.equal(p.storage.noReferenceServiceRun,true);
});
