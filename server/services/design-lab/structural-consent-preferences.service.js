const {selectionConfig}=require('./structural-observation-selection');
const observers=new WeakMap();

// Read-only DOM/event provenance: never opens a dialog, triggers a request,
// accepts consent or interprets a provider's classes/API/domain.
function consentPreferenceDOM({mode,token,maxNodes=6000,maxElements=64,attestations=[],bindings=[]}){
  const label=n=>[n.getAttribute('aria-label'),n.getAttribute('title'),n.textContent].filter(Boolean).join(' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
  const drawn=n=>{for(let p=n;p;p=p.parentElement){const s=getComputedStyle(p);
    if(s.display==='none'||['hidden','collapse'].includes(s.visibility)||Number(s.opacity)<=.01)return false;}
    const r=n.getBoundingClientRect();return r.width>=2&&r.height>=2&&r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight;};
  const structural=n=>n.matches('header,nav,main,footer,section,article,h1,[role="navigation"],[role="main"],[role="banner"]');
  const preferenceLabel=text=>/preferences?|preferenze|preferencias|einstellungen|parametres|settings|privacy choices/.test(text)&&
    /consent|consenso|cookies?|tracking|tracciamento|privacy|confidentialite/.test(text)||
    /\b(?:manage|gestisci|gerer|verwalten)\b/.test(text)&&/consent|consenso|cookies?|privacy|confidentialite/.test(text);
  let registry=window.__gustoConsentPreferenceProof;
  if(!registry||registry.url!==location.href||registry.body!==document.body){
    const generation=(registry?.generation||0)+1;
    registry=window.__gustoConsentPreferenceProof={url:location.href,body:document.body,generation,
      documentKey:`${performance.timeOrigin}:${generation}`,elements:new Map(),nodes:new WeakMap(),certified:new WeakMap(),next:0};
  }
  if(mode==='invalidate'){registry.certified=new WeakMap();return {documentKey:registry.documentKey};}
  const id=n=>{if(!registry.nodes.has(n)){if(registry.next>=maxElements)return null;
    registry.nodes.set(n,++registry.next);registry.elements.set(registry.next,n);}return registry.nodes.get(n);};
  if(mode==='attest'){
    for(const proof of attestations){const n=registry.elements.get(proof.id);if(n?.isConnected&&label(n)===proof.label)
      registry.certified.set(n,{...proof,version:1,mechanism:'observed_consent_event_provenance'});}
    return {certified:attestations.length};
  }
  if(mode==='controls')registry.certified=new WeakMap();
  const all=[...document.body.querySelectorAll('*')];
  if(all.length>maxNodes)return {documentKey:registry.documentKey,entries:[],unproven:'dom_proof_truncated'};
  if(mode==='delegated_matches'){
    // Selectors are read from live event closures, never guessed from a class.
    // Only exact, currently drawn targets count; broad/unknown targets cannot
    // silently be treated as consent controls.
    return {matches:bindings.map(binding=>{
      try{
        const nodes=[...document.querySelectorAll(binding.selector)].filter(drawn);
        if(nodes.length>maxElements)return {unknown:true,ids:[]};
        return {unknown:nodes.some(n=>!registry.nodes.has(n)),ids:nodes.map(n=>registry.nodes.get(n)).filter(Boolean)};
      }catch{return {unknown:true,ids:[]};}
    })};
  }
  // Protocol handles are scoped to this observation, not accumulated across
  // the traversal. Attestations themselves are weakly bound to live nodes.
  registry.elements.clear();registry.nodes=new WeakMap();registry.next=0;
  const entries=[],conflicts=[];
  if(mode==='sources'){
    for(const root of all.filter(n=>n.getAttribute('data-gusto-cmp-root')?.startsWith(token))){
      if(!drawn(root)||[root,...root.querySelectorAll('*')].some(structural))continue;
      const dialog=root.matches('dialog,[role="dialog"],[role="alertdialog"],[aria-modal="true"]')?root:
        root.querySelector('dialog,[role="dialog"],[role="alertdialog"],[aria-modal="true"]');
      const copy=label(root),accept=[...root.querySelectorAll('button,a,[role="button"],input[type="button"]')]
        .find(n=>drawn(n)&&/^(?:accept(?: all(?: cookies)?)?|allow all|tout accepter|accepter(?: tous)?|accetta(?: tutti(?: i cookie)?)?|consenti tutti)[.!\s]*$/i.test((n.getAttribute('aria-label')||n.textContent||n.value||'').trim()));
      if(!dialog||!accept||!(/\bcookies?\b|\btracking\b|\btracciamento\b|\btraceurs?\b/.test(copy)&&
        /consent|consenso|privacy|confidentialite/.test(copy)))continue;
      const key=id(root);if(key===null)continue;
      const acceptId=id(accept);if(acceptId===null)continue;
      entries.push({id:key,acceptId,interface:{tag:root.localName,dialogRole:dialog.getAttribute('role')||dialog.localName,
        acceptLabel:(accept.textContent||accept.getAttribute('aria-label')).trim().slice(0,120),copy:copy.slice(0,800),
        policyLinks:[...new Set([...root.querySelectorAll('a[href]')].filter(n=>
          drawn(n)&&/privacy|cookies?|confidentialite/i.test([n.textContent,n.getAttribute('aria-label')].filter(Boolean).join(' '))&&
          /^https?:/.test(n.href)).map(n=>n.href))].slice(0,maxElements)}});
    }
  }else if(mode==='controls'){
    for(const n of all.filter(n=>n.matches('button,[role="button"]'))){
      // Invalidate previous attestation before rechecking live event bindings.
      if(!drawn(n)||getComputedStyle(n).position!=='fixed')continue;
      let protectedStructure=false;for(let p=n;p;p=p.parentElement)if(structural(p)){protectedStructure=true;break;}
      const text=label(n),r=n.getBoundingClientRect();
      const area=Math.max(0,Math.min(innerWidth,r.right)-Math.max(0,r.left))*Math.max(0,Math.min(innerHeight,r.bottom)-Math.max(0,r.top))/(innerWidth*innerHeight);
      // Reuse the existing floating-surface classifier's 1% extent boundary.
      // Larger panels must be independently certified, never inferred from a label.
      if(protectedStructure||area>=.01||n.querySelector('button,a,[role="button"],iframe')||
        !preferenceLabel(text))continue;
      const key=id(n);if(key!==null)entries.push({id:key,label:text,rect:{x:r.x,y:r.y,width:r.width,height:r.height},area});
    }
    if(entries.length)for(const n of all.filter(n=>n.matches('button,a,[role="button"]')&&drawn(n)&&!preferenceLabel(label(n)))){
      const key=id(n);if(key===null)return {documentKey:registry.documentKey,entries:[],unproven:'event_proof_truncated'};
      conflicts.push({id:key,tag:n.localName,label:label(n).slice(0,400),role:n.getAttribute('role'),href:n.matches('a[href]')?n.href:null});
    }
  }
  return {documentKey:registry.documentKey,entries,conflicts};
}

// Certify only a pure target guard followed by one delegated callback. This is
// a JS dispatch shape, not a provider API: variable names/selectors are read
// from the live closure. Other bodies, getters, dynamic selectors and missing
// callback locations remain unproven. Neither function is ever invoked.
async function delegatedClickBindings(session,{group,maxElements,deadline}){
  const target=await session.send('Runtime.evaluate',{expression:'document',objectGroup:group});
  const listeners=(await session.send('DOMDebugger.getEventListeners',{objectId:target.result.objectId,depth:1})).listeners.filter(l=>l.type==='click');
  if(listeners.length>maxElements)return {bindings:[],unproven:'delegated_event_proof_truncated'};
  const bindings=[];
  for(const listener of listeners){
    if(Date.now()>=deadline)return {bindings:[],unproven:'sanitization_deadline'};
    const handler=(listener.originalHandler||listener.handler)?.objectId;if(!handler)continue;
    const source=(await session.send('Runtime.callFunctionOn',{objectId:handler,
      functionDeclaration:'function(){return Function.prototype.toString.call(this)}',returnByValue:true})).result.value;
    const guard=/^\s*\(?\s*([\w$]+)\s*\)?\s*=>\s*\{\s*\1\.target\.closest\(\s*([\w$]+)\s*\)\s*&&\s*([\w$]+)\(\s*\1\s*\)\s*;?\s*\}\s*$/.exec(source||'');
    if(!guard||guard[2]===guard[1]||guard[3]===guard[1]||guard[2]===guard[3])continue;
    const properties=await session.send('Runtime.getProperties',{objectId:handler,ownProperties:true});
    const scopes=properties.internalProperties?.find(p=>p.name==='[[Scopes]]')?.value.objectId;if(!scopes)continue;
    const scopeList=(await session.send('Runtime.getProperties',{objectId:scopes,ownProperties:true})).result.filter(p=>/^\d+$/.test(p.name));
    if(scopeList.length>8)continue;
    const captured=new Map();
    for(const scope of scopeList){
      if(!scope.value?.description?.startsWith('Closure')&&!scope.value?.description?.startsWith('Block'))continue;
      const values=(await session.send('Runtime.getProperties',{objectId:scope.value.objectId,ownProperties:true})).result;
      for(const name of [guard[2],guard[3]])if(!captured.has(name)){
        const value=values.find(p=>p.name===name);
        if(value)captured.set(name,value.value); // getters have no data value
      }
    }
    const selector=captured.get(guard[2]),callback=captured.get(guard[3]);
    if(selector?.type!=='string'||!selector.value||selector.value.length>512||callback?.type!=='function'||!callback.objectId)continue;
    const location=(await session.send('Runtime.getProperties',{objectId:callback.objectId,ownProperties:true})).internalProperties?.find(p=>p.name==='[[FunctionLocation]]')?.value.value;
    if(!location?.scriptId)continue;
    bindings.push({selector:selector.value,scriptId:location.scriptId,lineNumber:location.lineNumber,columnNumber:location.columnNumber,
      dispatchScriptId:listener.scriptId,kind:'guarded_delegated_click'});
  }
  return {bindings};
}

async function observeConsentPreferences(page,{token,mode,deadline}){
  const config=selectionConfig(),args={token,mode,maxNodes:config.maxNodes,maxElements:config.maxPersistentElements};
  let state=observers.get(page);
  if(!state||state.url!==page.url()){
    if(state?.session)await state.session.detach().catch(()=>{});
    state={url:page.url(),sources:new Map(),session:null};observers.set(page,state);
  }
  const summary={version:1,mode,certified:0,sourceWitnesses:state.sources.size};
  const group=`consent-provenance:${token}:${mode}`;
  if(Date.now()>=deadline){
    if(mode==='controls')await page.evaluate(consentPreferenceDOM,{...args,mode:'invalidate'});
    return {...summary,unproven:'sanitization_deadline'};
  }
  try{
    const result=await page.evaluate(consentPreferenceDOM,args);
    if(state.documentKey!==result.documentKey){state.sources.clear();state.documentKey=result.documentKey;summary.sourceWitnesses=0;}
    if(result.unproven||!result.entries.length)return {...summary,...(result.unproven?{unproven:result.unproven}:{})};
    state.session ||= await page.context().newCDPSession(page);
    const attestations=[];
    const listenersFor=async(entry,depth)=>{
      const handle=await state.session.send('Runtime.evaluate',{expression:`window.__gustoConsentPreferenceProof.elements.get(${entry.id})`,objectGroup:group});
      if(!handle.result.objectId)return [];
      try{return (await state.session.send('DOMDebugger.getEventListeners',{objectId:handle.result.objectId,depth,pierce:true})).listeners.filter(l=>l.type==='click');}
      finally{await state.session.send('Runtime.releaseObject',{objectId:handle.result.objectId});}
    };
    const delegated=await delegatedClickBindings(state.session,{group,maxElements:config.maxPersistentElements,deadline});
    if(delegated.unproven)return {...summary,unproven:delegated.unproven};
    const matched=delegated.bindings.length?(await page.evaluate(consentPreferenceDOM,{...args,mode:'delegated_matches',bindings:delegated.bindings})).matches:[];
    // A shared application/framework script is not proof of CMP ownership.
    // Exclude sources also handling currently visible navigation/business UI.
    const mixedSources=new Set(),mixedSourceBindings=[],associatedPolicyBindings=[];
    delegated.bindings.forEach((binding,i)=>{
      if(!state.sources.has(binding.scriptId))return;
      for(const entry of result.conflicts)if(matched[i].ids.includes(entry.id)){
        if(entry.tag==='a'&&state.sources.get(binding.scriptId).interface.policyLinks.includes(entry.href)){
          associatedPolicyBindings.push({...entry,scriptId:binding.scriptId,kind:binding.kind});continue;
        }
        mixedSources.add(binding.scriptId);mixedSourceBindings.push({...entry,...binding});
      }
    });
    for(const entry of result.conflicts){
      if(Date.now()>=deadline)return {...summary,unproven:'sanitization_deadline'};
      for(const l of await listenersFor(entry,1))if(state.sources.has(l.scriptId)){
        // A link to the exact policy document already observed in the CMP,
        // handled by that same source, is not an unrelated business interface.
        // This only preserves provenance; it never certifies/masks the link.
        if(entry.tag==='a'&&state.sources.get(l.scriptId).interface.policyLinks.includes(entry.href)){
          associatedPolicyBindings.push({...entry,scriptId:l.scriptId});continue;
        }
        mixedSources.add(l.scriptId);mixedSourceBindings.push({...entry,scriptId:l.scriptId,lineNumber:l.lineNumber,columnNumber:l.columnNumber});
      }
    }
    for(const entry of result.entries){
      if(Date.now()>=deadline)return {...summary,unproven:'sanitization_deadline'};
      const listeners=await listenersFor(entry,mode==='sources'?-1:1);
      if(mode==='sources'){
        for(const listener of listeners)state.sources.set(listener.scriptId,{scriptId:listener.scriptId,
          lineNumber:listener.lineNumber,columnNumber:listener.columnNumber,interface:entry.interface});
        delegated.bindings.forEach((binding,i)=>{if(!matched[i].unknown&&matched[i].ids.includes(entry.acceptId))
          state.sources.set(binding.scriptId,{...binding,interface:entry.interface});});
      }else{
        const bound=listeners.find(l=>state.sources.has(l.scriptId)&&!mixedSources.has(l.scriptId));
        const delegatedBound=delegated.bindings.find((b,i)=>!matched[i].unknown&&matched[i].ids.includes(entry.id)&&
          state.sources.has(b.scriptId)&&!mixedSources.has(b.scriptId));
        if(bound)attestations.push({...entry,sourceWitness:state.sources.get(bound.scriptId),
          controlBinding:{scriptId:bound.scriptId,lineNumber:bound.lineNumber,columnNumber:bound.columnNumber}});
        else if(delegatedBound)attestations.push({...entry,sourceWitness:state.sources.get(delegatedBound.scriptId),controlBinding:delegatedBound});
      }
    }
    if(attestations.length)await page.evaluate(consentPreferenceDOM,{...args,mode:'attest',attestations});
    return {...summary,certified:attestations.length,sourceWitnesses:state.sources.size,mixedSourceCount:mixedSources.size,mixedSourceBindings,associatedPolicyBindings,attestations};
  }catch(error){
    // Absence of a provenance proof does not certify anything. The unchanged
    // ambiguous-layer gate remains the decision maker (also without CDP).
    return {...summary,unproven:'event_provenance_unavailable',error:error.message};
  }finally{if(state.session)await state.session.send('Runtime.releaseObjectGroup',{objectGroup:group}).catch(()=>{});}
}
module.exports={consentPreferenceDOM,observeConsentPreferences};
