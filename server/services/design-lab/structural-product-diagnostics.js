// Passive local archive for real product runs. Never a pipeline/decision switch.
const fs = require("node:fs"), path = require("node:path");
function createProductDiagnostics({argv=process.argv,env=process.env,logger=console}={}) {
  const prefix="--structural-product-diagnostics-output=";
  const value=argv.find(arg=>arg.startsWith(prefix))?.slice(prefix.length);
  if(!value)return null;
  const root=path.resolve(__dirname,"../../diagnostics"),output=path.resolve(value);
  if(env.NODE_ENV!=="development" || !output.startsWith(root+path.sep))
    throw Error("Product diagnostics require development and an output inside server/diagnostics");
  return (referenceId,generationId,event)=>{
    try {
      if(!/^[a-f0-9]{24}$/i.test(String(referenceId)) || !/^[a-z0-9-]+$/i.test(generationId))throw Error("Invalid diagnostic identity");
      const directory=path.join(output,String(referenceId),generationId);
      fs.mkdirSync(directory,{recursive:true});
      const file=path.join(directory,"product-run.json");
      const previous=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,"utf8")):{};
      const next={...previous,referenceId:String(referenceId),generationId,...event,updatedAt:new Date().toISOString()};
      // Atomic replacement preserves the last completed checkpoint on interruption.
      fs.writeFileSync(file+".tmp",JSON.stringify(next,null,2));fs.renameSync(file+".tmp",file);
    } catch(error){logger.warn?.("structural:local_diagnostics_failed",{name:error.name});}
  };
}
module.exports={createProductDiagnostics};
