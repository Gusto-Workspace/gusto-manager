/* global window, document, getComputedStyle, innerWidth, innerHeight */
const {randomUUID}=require('crypto');
const {persistentVisibilityDOM}=require('./structural-persistent-elements');
const {visionLayerDOM}=require('./structural-vision-cleanup.service');
const args={stateKey:'__gustoConsentHidden',registryKey:'__gustoConsentElements',proofKey:'__gustoConsentLayout'};

// A hidden dialog is not a visible CMP root. It can still certify its empty
// sibling backdrop, but only inside an exclusive consent-interface container.
// No provider, identifier, class, domain or page-specific selector is consulted.
function consentBackdropDOM(){
  const drawn=n=>{for(let p=n;p;p=p.parentElement){const s=getComputedStyle(p);
    if(s.display==='none'||['hidden','collapse'].includes(s.visibility)||Number(s.opacity)<.02)return false;}
    const r=n.getBoundingClientRect();return r.width>0&&r.height>0;};
  const structural=n=>n.matches('header,nav,main,footer,section,article,h1,[role="navigation"],[role="main"],[role="banner"]')||
    Boolean(n.querySelector('header,nav,main,footer,section,article,h1,[role="navigation"],[role="main"]'));
  const consent=n=>{
    if(structural(n))return false;
    const dialog=n.matches('dialog,[role="dialog"],[aria-modal="true"],[role="region"]')||n.querySelector('dialog,[role="dialog"],[aria-modal="true"]');
    const text=n.textContent.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').toLowerCase();
    // Explicit accept-all controls + cookie/consent copy + dialog semantics
    // certify the interface without requiring a vendor or a wording template.
    const copy=/\bcookies?\b|\bconsent(?:ement)?\b|privacy preferences|preferences de confidentialite/.test(text);
    const control=[...n.querySelectorAll('button,a,[role="button"],input[type="button"],input[type="submit"]')].some(b=>
      /^(?:accept all(?: cookies)?|allow all(?: cookies)?|tout accepter|accepter (?:tout|tous|tous les cookies)|accetta tutti(?: i cookie)?|consenti tutti)[.!\s]*$/i.test((b.getAttribute('aria-label')||b.textContent||b.value||'').trim()));
    return Boolean(dialog&&copy&&control);
  };
  const layers=[];
  for(const n of document.body?.querySelectorAll('*')||[]){
    const s=getComputedStyle(n),r=n.getBoundingClientRect(),parent=n.parentElement;
    if(s.position!=='fixed'||!drawn(n)||n.childElementCount||n.textContent.trim()||s.backgroundImage!=='none'||
      n.matches('img,video,canvas,svg,iframe,input,button,a')||!parent||parent.matches('body,html')||structural(parent))continue;
    const area=Math.max(0,Math.min(innerWidth,r.right)-Math.max(0,r.left))*Math.max(0,Math.min(innerHeight,r.bottom)-Math.max(0,r.top))/(innerWidth*innerHeight);
    if(area<.5)continue; // same backdrop extent as the existing blocker classifier
    const peers=[...parent.children].filter(p=>p!==n&&!p.matches('script,style,link,meta'));
    if(!peers.length||peers.some(p=>drawn(p)||!consent(p)))continue;
    const z=parseInt(s.zIndex,10)||0;
    const associated=peers.filter(p=>{
      const candidates=[p,...p.querySelectorAll('*')];
      const peerZ=Math.max(...candidates.map(c=>parseInt(getComputedStyle(c).zIndex,10)||0));
      return z>0&&peerZ>=z&&peerZ-z<=10; // existing sibling stacking tolerance
    });
    if(!associated.length)continue;
    layers.push({node:n,rect:{x:Math.max(0,r.left),y:Math.max(0,r.top),width:Math.min(innerWidth,r.right)-Math.max(0,r.left),height:Math.min(innerHeight,r.bottom)-Math.max(0,r.top)},
      reason:'orphaned_hidden_consent_backdrop',association:'exclusive_sibling_consent_interface',
      dialogEvidence:associated.map(p=>({tag:p.localName,role:p.getAttribute('role'),label:p.getAttribute('aria-label'),visible:false})),
      tag:n.localName,id:n.id,className:typeof n.className==='string'?n.className:''});
  }
  const elements=new Map(),nodes=new WeakMap();
  layers.forEach((p,i)=>{p.id=`persistent${i+1}`;elements.set(p.id,p.node);nodes.set(p.node,i+1);delete p.node;});
  window.__gustoConsentElements={elements,nodes};
  return layers;
}
const beginConsentDOM=new Function('args',`
  return (async()=>{
  const detect=${consentBackdropDOM.toString()},visibility=${persistentVisibilityDOM.toString()},layout=${visionLayerDOM.toString()};
  if(window[args.stateKey])return {existing:true,visibility:visibility({...args,mode:'verify'})};
  const layers=detect();if(!layers.length)return {layers};
  const before=layout({...args,mode:'layout_begin'});if(!before.valid)return {layers,before};
  const hidden=visibility({...args,mode:'hide',elements:layers});
  // Flush reactions to the mask itself before certifying its effects. This
  // catches MutationObserver source/layout changes without adding a delay.
  await Promise.resolve();
  return {layers,before,hidden,visibility:visibility({...args,mode:'verify'}),layout:layout({...args,mode:'verify'})};
  })();
`);
const restoreConsentDOM=new Function('args',`
  const visibility=${persistentVisibilityDOM.toString()},layout=${visionLayerDOM.toString()};
  if(!window[args.stateKey])return {valid:true,absent:true};
  const before=layout({...args,mode:'snapshot'}),styles=visibility({...args,mode:'restore'}),after=layout({...args,mode:'restore'});
  delete window[args.registryKey];return {valid:before.valid&&styles.stylesRestored&&after.valid,before,styles,after};
`);
const invalid=details=>Object.assign(new Error('Backdrop de consentement non certifiable — analyse non lancée.'),{
  code:'blocked_by_overlay',status:422,consentBackdropIntegrity:details});
async function maskCertifiedConsentBackdrops(page){
  page.structuralConsentBackdrops||=[];
  for(const frame of page.frames().slice(0,20)){
    let entry=page.structuralConsentBackdrops.find(e=>e.frame===frame);
    if(!entry)entry={frame,token:randomUUID(),frameKind:frame===page.mainFrame()?'main':'iframe'};
    let result;
    try{result=await frame.evaluate(beginConsentDOM,{...args,token:entry.token});}
    catch(error){if(frame.isDetached())continue;throw error;}
    if(result.existing){if(!result.visibility.valid)throw invalid(result);continue;}
    if(!result.layers.length)continue;
    entry.proof=result;entry.restored=false;page.structuralConsentBackdrops.push(entry);
    if(!result.before?.valid||result.hidden?.skipped.length||result.hidden?.ids.length!==result.layers.length||!result.visibility?.valid||!result.layout?.valid)throw invalid(result);
    entry.verified=true;
  }
}
async function verifyConsentBackdrops(page){
  for(const entry of page.structuralConsentBackdrops||[]){
    if(entry.restored)continue;
    const proof=await entry.frame.evaluate(persistentVisibilityDOM,{...args,token:entry.token,mode:'verify'});
    if(!proof.valid)throw invalid(proof);
  }
}
async function restoreConsentBackdrops(page){
  let error;
  for(const entry of page.structuralConsentBackdrops||[]){
    if(entry.restored)continue;
    try{entry.restoration=await entry.frame.evaluate(restoreConsentDOM,{...args,token:entry.token});
      entry.restored=entry.restoration.valid;if(!entry.restored)throw invalid(entry.restoration);
    }catch(e){error=e;}
  }
  if(error)throw error;
  return consentBackdropSummary(page);
}
function consentBackdropSummary(page){
  const entries=page.structuralConsentBackdrops||[];
  return {version:1,complete:entries.every(e=>e.verified&&e.restored),restorationVerified:entries.every(e=>e.restored),
    entries:entries.map(({frame,token,...e})=>e)};
}
module.exports={maskCertifiedConsentBackdrops,verifyConsentBackdrops,restoreConsentBackdrops,consentBackdropSummary,consentBackdropDOM};
