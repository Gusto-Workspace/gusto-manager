const test=require("node:test"),assert=require("node:assert/strict"),Module=require("node:module");
const appFile=require.resolve("../app");
test("démarrage produit : crons normaux, routes Design Lab, recovery et écoute sans bind spécial",async()=>{
  const load=Module._load,uses=[],crons=[],listen=[],recovery=[],logs=[];
  const reconcile=()=>{},followResponses=()=>{};
  const app={set(){},use:(...args)=>uses.push(args),options(){}};
  const express=()=>app;express.json=()=>()=>{};express.raw=()=>()=>{};
  const oldLog=console.log;
  Module._load=function(request,parent,...args){
    if(parent?.filename!==appFile)return load.call(this,request,parent,...args);
    if(request==="dotenv")return {config(){}};
    if(request.startsWith("./services/cron-job/")){crons.push(request);return {};}
    if(request==="express")return express;
    if(request==="http")return {createServer:()=>({listen:(...args)=>listen.push(args)})};
    if(request==="cors")return ()=>()=>{};
    if(request==="mongoose")return {connect:()=>Promise.resolve()};
    if(request==="./services/sse-bus.service")return {mountSseRoute(){}};
    if(request==="./middleware/restrict-accountant-access")return {restrictAccountantAccess:()=>{}};
    if(request.startsWith("./routes/"))return {route:request};
    if(request==="./services/design-lab/structural-reference.service")return {createStructuralService:()=>({reconcileExpiredOperations:reconcile,resumePendingVisionResponses:followResponses})};
    if(request==="./services/design-lab/structural-operation-recovery.service")return {startStructuralOperationRecovery:(fn,options)=>recovery.push({fn,options})};
    throw Error(`Unexpected app dependency: ${request}`);
  };
  console.log=(...args)=>logs.push(args);
  try{
    delete require.cache[appFile];require(appFile);await Promise.resolve();
    assert.deepEqual(crons.map(s=>s.split("/").at(-1)),[
      "backup.service","customer-tags.service","reservation-reminders.service","sms-reminders.service",
      "reservation-bank-hold-authorization.service","reservation-bank-hold-expiration.service","reservation-lifecycle.service",
      "gift-card-lifecycle.service","gift-card-fulfillment.service","take-away-lifecycle.service",
    ]);
    for(const file of ["design-lab.routes","design-lab-portfolio.routes","design-lab-structural.routes"])
      assert.ok(uses.some(([prefix,...routes])=>prefix==="/api"&&routes.some(r=>r?.route===`./routes/admin/${file}`)));
    assert.deepEqual(recovery,[{fn:reconcile,options:{followResponses}}]);assert.equal(listen.length,1);
    assert.equal(listen[0].length,2);assert.equal(typeof listen[0][1],"function");
    listen[0][1]();assert.ok(logs.some(args=>String(args[0]).startsWith("Server is running on port")));
  }finally{Module._load=load;console.log=oldLog;delete require.cache[appFile];}
});
