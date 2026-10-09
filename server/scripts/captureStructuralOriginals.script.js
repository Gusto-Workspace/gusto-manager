// Local experimental capture only. No app, credentials, DB, upload or Vision.
const fs=require('node:fs/promises'),path=require('node:path'),Module=require('node:module');
const load=Module._load;
Module._load=function(name,...args){if(/^(mongoose|mongodb|cloudinary|dotenv|openai)$/.test(name)||/openai\.service|\/app(?:\.js)?$/.test(name))throw Error(`Capture-only import forbidden: ${name}`);return load.call(this,name,...args);};
const requestGuard=(target,options={})=>{
 const u=typeof target==='string'||target instanceof URL?new URL(target):target;
 const host=u.hostname||u.host||'';
 if(/openai\.com$|api\.cloudinary\.com$/.test(host)||!['GET','HEAD'].includes((options.method||u.method||'GET').toUpperCase()))throw Error('Capture-only network boundary');
};
for(const protocol of ['http','https']){const t=require(protocol),original=t.request;t.request=function(target,options,...rest){requestGuard(target,typeof options==='object'?options:{});return original.call(this,target,options,...rest);};}
const originalFetch=global.fetch;global.fetch=(target,options)=>{requestGuard(target,options);return originalFetch(target,options);};
const {capturePortfolioSite}=require('../services/design-lab/portfolio-capture.service');
const {captureStructuralPage}=require('../services/design-lab/structural-page-capture.service');
const {sanitizeStructuralCapture}=require('../services/design-lab/capture-sanitization.service');
const {createOriginalEvidenceArchive}=require('../services/design-lab/structural-original-evidence');
async function main(){
 const [url,destination]=process.argv.slice(2);if(!url||!destination)throw Error('URL and new local evidence directory required');
 const directory=path.resolve(destination),archive=await createOriginalEvidenceArchive(directory,{sourceUrl:url});
 try {
  const result=await capturePortfolioSite(url,{singlePage:true,collectSpatialMetadata:true,beforeScreenshot:sanitizeStructuralCapture,
   onStructuralPhase:phase=>console.log(phase),
   capturePage:(page,deadline,initial)=>captureStructuralPage(page,deadline,initial,{diagnostic:true,selectionConfig:{algorithmVersion:2},onOriginalObservation:archive.record})});
  const page=result.pages[0];const summary=await archive.finish(page);
  await fs.writeFile(path.join(directory,'capture-diagnostics.json'),JSON.stringify(page.captureDiagnostics,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({status:'captured',...summary,strategy:page.captureCoverage.captureStrategy,totalHeight:page.captureCoverage.totalHeight,viewport:page.localMetadata.viewport,forbiddenCalls:0}));
 }catch(error){await archive.fail(error);await fs.writeFile(path.join(directory,'capture-error.json'),JSON.stringify({message:error.message,code:error.code,captureCoverage:error.captureCoverage,captureTiming:error.captureTiming,capturePerformance:error.capturePerformance,imageGateFailure:error.imageGateFailure,mediaEvidence:error.mediaEvidence,captureResourceDiagnostics:error.captureResourceDiagnostics},null,2)+'\n',{flag:'wx'});throw error;}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
