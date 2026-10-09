// Durable local originals, independent of selector decisions and paid providers.
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const sharp=require('sharp');
const digest=b=>createHash('sha256').update(b).digest('hex');
const atomic=async(file,value)=>{const temp=`${file}.${randomUUID()}.tmp`;await fs.writeFile(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx'});await fs.rename(temp,file);};
async function createOriginalEvidenceArchive(directory,{sourceUrl,generationId=randomUUID()}={}) {
  await fs.mkdir(directory,{recursive:true});
  const manifest={version:1,generationId,sourceUrl,createdAt:new Date().toISOString(),state:'collecting',
    originalFormat:'png',observations:[],captureCoverage:null,artisticCertification:'not_evaluated'};
  // An existing generation must never be reused as a fresh capture destination.
  await fs.writeFile(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  let serial=Promise.resolve();
  return {directory,generationId,
    record(view){const operation=serial.then(async()=>{
      const {buffer,measures,...metadata}=view;
      if(!Buffer.isBuffer(buffer)||!/^state\d{4,}$/.test(view.id))throw Error('Invalid original observation');
      const image=await sharp(buffer).metadata();
      if(image.format!=='png'||!image.width||!image.height)throw Error('Original must be native PNG');
      const file=`${view.id}.png`,hash=digest(buffer);
      await fs.writeFile(path.join(directory,file),buffer,{flag:'wx'});
      const measurementsFile=`${view.id}.measurements.json`;
      await fs.writeFile(path.join(directory,measurementsFile),JSON.stringify(measures||{},null,2)+'\n',{flag:'wx'});
      manifest.observations.push({...metadata,file,measurementsFile,sha256:hash,measurementSha256:digest(Buffer.from(JSON.stringify(measures||{},null,2)+'\n')),
        width:image.width,height:image.height,format:image.format,bytes:buffer.length,originalAvailable:true});
      await atomic(path.join(directory,'manifest.json'),manifest);
    });serial=operation;return operation;},
    async finish(page){await serial;manifest.captureCoverage=page.captureCoverage;
      manifest.captureSanitization=page.captureSanitization;manifest.localMetadata=page.localMetadata;
      manifest.externalEmbeds=page.externalEmbeds||page.localMetadata?.externalEmbeds||[];
      manifest.state='captured';manifest.finishedAt=new Date().toISOString();
      await fs.writeFile(path.join(directory,'global.png'),page.buffer,{flag:'wx'});
      manifest.global={file:'global.png',sha256:digest(page.buffer),...(await sharp(page.buffer).metadata())};
      delete manifest.global.exif;delete manifest.global.icc;
      await atomic(path.join(directory,'manifest.json'),manifest);
      return {version:1,generationId,directory,manifestFile:'manifest.json',manifestSha256:digest(await fs.readFile(path.join(directory,'manifest.json'))),originalCount:manifest.observations.length};
    },
    async fail(error){await serial.catch(()=>{});manifest.state='incomplete';manifest.failure={code:error.code||null,message:error.message};
      manifest.captureCoverage=error.captureCoverage||null;await atomic(path.join(directory,'manifest.json'),manifest);},
  };
}
async function readOriginalEvidence(directory) {
  const manifest=JSON.parse(await fs.readFile(path.join(directory,'manifest.json'),'utf8'));
  const observations=[];
  const local=file=>{if(typeof file!=='string'||path.basename(file)!==file)throw Error('Evidence path must be local');return path.join(directory,file);};
  for(const row of manifest.observations) {
    const buffer=await fs.readFile(local(row.file)),measurements=await fs.readFile(local(row.measurementsFile));
    const image=await sharp(buffer).metadata();
    if(digest(buffer)!==row.sha256||digest(measurements)!==row.measurementSha256||image.width!==row.width||image.height!==row.height||image.format!==row.format)
      throw Object.assign(Error('Original evidence hash or dimension mismatch'),{code:'original_evidence_changed'});
    observations.push({...row,buffer,measures:JSON.parse(measurements)});
  }
  const global=manifest.global?await fs.readFile(local(manifest.global.file)):null;
  if(global&&digest(global)!==manifest.global.sha256)throw Error('Global evidence changed');
  return {manifest,observations,global};
}
module.exports={createOriginalEvidenceArchive,readOriginalEvidence,digest};
