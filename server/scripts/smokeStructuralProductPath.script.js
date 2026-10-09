// Offline persistence/paid boundaries only: the real Express route calls the
// normal service.run, captureAndPrepare and its default capture implementation.
// Never import app.js, connect to its DB, or add a runtime validation mode.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const serverRoot=path.resolve(__dirname,'..');
const env=require('dotenv').parse(fs.readFileSync(path.join(serverRoot,'.env')));
for(const [key,value] of Object.entries(env))
  if(/^GUSTO_STRUCTURAL_|^GUSTO_PORTFOLIO_(CAPTURE_ENABLED|CHROME_PATH)$/.test(key)&&process.env[key]===undefined)process.env[key]=value;
const forbidden={openai:0,mongo:0,cloudinary:0,externalWrites:0};
const block=kind=>{forbidden[kind]++;throw Error(`Product smoke forbids ${kind}`);};
const mongoose=require('mongoose');mongoose.connect=()=>block('mongo');mongoose.Query.prototype.exec=()=>block('mongo');
const mongodb=require('mongodb');mongodb.MongoClient.prototype.connect=()=>block('mongo');
for(const method of ['insertOne','insertMany','updateOne','updateMany','deleteOne','deleteMany','findOneAndUpdate','bulkWrite'])mongodb.Collection.prototype[method]=()=>block('mongo');
const cloudinary=require('cloudinary').v2;
for(const method of ['upload','upload_stream','destroy','explicit'])cloudinary.uploader[method]=()=>block('cloudinary');
const inspect=(target,options={})=>{
  const url=typeof target==='string'||target instanceof URL?new URL(target):null;
  const host=url?.hostname||target?.hostname||target?.host||'';
  const method=(options.method||target?.method||'GET').toUpperCase();
  if(/(^|\.)openai\.com$/.test(host))block('openai');
  if(host==='api.cloudinary.com')block('cloudinary');
  // The only mutation is the in-memory Express analyze route on loopback.
  const local=host==='127.0.0.1'&&method==='POST'&&/^\/api\/admin\/design-lab\/structural-references\/[a-f0-9]+\/analyze$/.test(url?.pathname||target?.path||'');
  if(!['GET','HEAD'].includes(method)&&!local)block('externalWrites');
};
for(const protocol of ['http','https']){const transport=require(protocol),request=transport.request;
  transport.request=function(target,options,...rest){inspect(target,typeof options==='object'?options:{});return request.call(this,target,options,...rest);};}
const nativeFetch=global.fetch;global.fetch=(target,options)=>{inspect(target,options);return nativeFetch(target,options);};
const {runProductPath}=require('../tests/helpers/structural-product-path');
const {buildStructuralVisionRequest}=require('../services/design-lab/structural-reference.contract');
const core=[
  ['waldhaus','https://www.waldhaus-sils.ch/'],['salterra','https://www.salterra.com/'],
  ['khufu','https://khufusbistro.com/'],['gucci','https://www.gucciosteria.com/en/florence/homepage/'],
  ['amici','https://restaurant-amici.com/'],['tastavents','https://tastavents.com/'],
  ['castello','https://www.castellodelsole.com/en/'],
];
const digest=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const redactCaptures=rows=>rows?.map(({url,...row})=>({...row,url:'inline_prepared_webp'}));
async function run(sourceUrl,directory){
  fs.mkdirSync(directory,{recursive:true});
  const r=await runProductPath({sourceUrl,observeUpload:(buffer,i)=>fs.writeFileSync(path.join(directory,`prepared-${i}.webp`),buffer)});
  let vision,byteProof;
  if(r.boundary){
    vision=buildStructuralVisionRequest(r.boundary.captures,r.boundary.metadata);
    if(JSON.stringify(vision.manifest)!==JSON.stringify(r.boundary.manifest))throw Error('Product manifest diverged from prepared contract');
    byteProof=vision.content.filter(c=>c.type==='input_image').map((c,i)=>{
      const bytes=Buffer.from(c.image_url.split(',')[1],'base64'),type=vision.manifest.viewOrder[i];
      const index=r.boundary.captures.findIndex(v=>v.type===type);
      if(index<0||!bytes.equals(r.uploads[index]))throw Error('Vision bytes differ from prepared capture');
      return {type,file:`prepared-${index}.webp`,bytes:bytes.length,sha256:digest(bytes)};
    });
    fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(vision.manifest,null,2));
    fs.writeFileSync(path.join(directory,'vision-request.json'),JSON.stringify(vision,null,2));
  }
  const capture=r.events.find(e=>e.capturePerformance),cov=r.response.reference.captureCoverage;
  const ready=r.events.some(e=>e.status==='prepared_for_vision')&&r.analyzerBoundaryCalls===1&&!!byteProof;
  const summary={sourceUrl,finishedAt:new Date().toISOString(),status:ready?'ready_for_vision':r.response.reference.status,
    elapsedMs:r.elapsedMs,captureMs:capture?.capturePerformance.elapsedMs,
    strategy:cov?.captureStrategy,version:cov?.version,registry:capture?.captureDiagnostics?.registry?.status,
    positions:cov?.positions?.map(p=>p.position),forbidden:{...forbidden},byteProof,
    analyzerBoundaryCalls:r.analyzerBoundaryCalls,inMemoryUploads:r.uploads.length,
    reference:{...r.response.reference,captures:redactCaptures(r.response.reference.captures)},
    events:r.events.map(e=>({...e,captures:redactCaptures(e.captures)})),
    attempts:r.attempts.map(a=>({id:a._id,status:a.status,rawResponsePresent:!!a.rawResponse,manifest:a.captureSnapshot.visionInput}))};
  fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(summary,null,2));
  console.log(JSON.stringify({sourceUrl,status:summary.status,captureMs:summary.captureMs,elapsedMs:summary.elapsedMs,
    strategy:summary.strategy,registry:summary.registry,positions:summary.positions,forbidden}));
  if(!ready||Object.values(forbidden).some(Boolean))process.exitCode=1;
  return summary;
}
(async()=>{
  const [source,output]=process.argv.slice(2);
  if(!source||!output)throw Error('Usage: node scripts/smokeStructuralProductPath.script.js <url | --core> <output-directory-outside-repository>');
  const directory=path.resolve(output),repository=path.resolve(serverRoot,'..');
  fs.mkdirSync(directory,{recursive:true});
  const real=fs.realpathSync(directory);
  if(real===repository||real.startsWith(repository+path.sep))throw Error('Smoke artifacts must stay outside the watched repository');
  if(source==='--core'){
    const summaries=[];for(const [name,url]of core)summaries.push(await run(url,path.join(real,name)));
    fs.writeFileSync(path.join(real,'summary.json'),JSON.stringify(summaries.map(({events,reference,attempts,...r})=>r),null,2));
  }else {const url=new URL(source);if(!['http:','https:'].includes(url.protocol))throw Error('HTTP URL required');await run(url.href,real);}
})().catch(error=>{console.error(error);process.exitCode=1;});
