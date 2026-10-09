const path=require('node:path'),Module=require('node:module');
const server=path.resolve(__dirname,'../..');
const dep=n=>require(path.join(server,'node_modules',n));
const blocked=()=>{throw Object.assign(Error('AUDIT_REMOTE_EFFECT_FORBIDDEN'),{code:'AUDIT_REMOTE_EFFECT_FORBIDDEN'});};
const local=target=>{try{const host=typeof target==='object'?(target.hostname||target.host):new URL(String(target)).hostname;return ['127.0.0.1','localhost','::1','[::1]'].includes(String(host).split(':')[0])||host==='::1'||host==='[::1]';}catch{return false;}};
for(const name of ['node:http','node:https']){const p=require(name);for(const fn of ['request','get']){const orig=p[fn];p[fn]=function(target,...args){if(!local(target))blocked();return orig.call(this,target,...args);};}}
const origFetch=global.fetch;global.fetch=(target,...args)=>{if(!local(target))blocked();return origFetch(target,...args);};
const mongoose=dep('mongoose');mongoose.connect=blocked;mongoose.createConnection=blocked;mongoose.Query.prototype.exec=blocked;
const mongo=dep('mongodb');mongo.MongoClient.prototype.connect=blocked;
const cloud=dep('cloudinary').v2;for(const n of ['upload','upload_stream','destroy','explicit','rename'])cloud.uploader[n]=blocked;
const load=Module._load;Module._load=function(name,parent,...args){if(/(^|\/)app\.js$/.test(name)||name==='dotenv')blocked();return load.call(this,name,parent,...args);};
const pw=dep('playwright-core'),launch=pw.chromium.launch.bind(pw.chromium);
pw.chromium.launch=async(options={})=>{const browser=await launch({...options,args:[...(options.args||[]),'--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run']});
 const context=browser.newContext.bind(browser);browser.newContext=async(opts={})=>{const c=await context({...opts,serviceWorkers:'block'});await c.route('**/*',route=>route.abort());return c;};
 const page=browser.newPage.bind(browser);browser.newPage=async(opts={})=>{const p=await page({...opts,serviceWorkers:'block'});await p.context().route('**/*',route=>route.abort());return p;};return browser;};
