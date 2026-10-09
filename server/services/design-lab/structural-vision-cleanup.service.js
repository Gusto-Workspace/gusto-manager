/* global window, document, getComputedStyle, innerWidth, innerHeight, DOMMatrix, DOMPoint */
const {persistentVisibilityDOM}=require('./structural-persistent-elements');
const VISION_CLEANUP_POLICY='exclude_nonstructural_persistent_v1';

// Read-only classification at an already mandatory observed viewport. No domain,
// provider selector, new candidate position, or change to the artistic collector.
function visionLayerDOM({positioned=[],mode='inspect',token,maxNodes=6000,tolerance=2,
  proofKey='__gustoVisionLayoutProof'}) {
  const parent=n=>n.assignedSlot||n.parentElement||n.getRootNode()?.host||null;
  const walk=root=>{const nodes=[],scopes=[root];while(scopes.length){const scope=scopes.pop();
    if(scope.shadowRoot)scopes.push(scope.shadowRoot);for(const n of scope.children||[]){nodes.push(n);scopes.push(n);}}
    return nodes;};
  const geometry=n=>{const r=n.getBoundingClientRect();return {x:r.left,y:r.top,width:r.width,height:r.height};};
  const visible=n=>{for(let p=n;p;p=parent(p)){const s=getComputedStyle(p);if(s.display==='none'||['hidden','collapse'].includes(s.visibility)||Number(s.opacity)<=.01)return false;}
    // Same measurable primitive extent as structuralObservationDOM/registry
    // (both require 2 px per axis). Subpixel decorative scroll indicators
    // remain painted; masking must not add a stricter global animation gate.
    const r=n.getBoundingClientRect();return r.width>=2&&r.height>=2&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight;};
  const source=n=>n.matches('img,video,iframe')?[n.currentSrc||n.getAttribute('src')||'',n.getAttribute('poster')||'']:[];
  const layout=n=>{const s=getComputedStyle(n);return [s.display,s.perspective,s.fontSize,s.lineHeight,s.gridTemplateColumns,s.padding,s.margin,
    s.backgroundImage,s.filter,s.clipPath,s.overflow];};
  // Compare transforms in rendered pixels with the existing geometry
  // tolerance, not by exact floating-point CSS matrix serialization. A tiny
  // live scroll transform accepted by stabilization is not a masking defect.
  const transform=n=>{
    const s=getComputedStyle(n),r=n.getBoundingClientRect(),m=new DOMMatrix(s.transform==='none'?undefined:s.transform);
    const origin=s.transformOrigin.split(' ').map(parseFloat),w=n.offsetWidth||r.width,h=n.offsetHeight||r.height;
    return [[0,0],[w,0],[w,h],[0,h]].map(([x,y])=>{const p=m.transformPoint(new DOMPoint(x-origin[0],y-origin[1]));
      return [p.x/p.w+origin[0],p.y/p.w+origin[1]];});
  };
  const snapshot=nodes=>({token,dimensions:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],nodes:nodes.map(n=>({node:n,rect:geometry(n),source:source(n),layout:layout(n),transform:transform(n),text:[...n.childNodes].filter(c=>c.nodeType===3).map(c=>c.textContent).join('')}))});
  if(mode==='layout_begin'){
    const nodes=walk(document.body).filter(n=>!n.matches('script,style,link,meta,source')&&visible(n));
    if(nodes.length>maxNodes)return {valid:false,failures:[{reason:'layout_proof_truncated'}]};
    window[proofKey]=snapshot(nodes);return {valid:true};
  }
  if(mode==='snapshot'){
    const proof=window[proofKey];
    if(!proof||proof.token!==token)return {valid:false,failures:[{reason:'layout_proof_missing'}]};
    const nodes=[...new Set([...proof.nodes.map(p=>p.node).filter(n=>n.isConnected),...walk(document.body).filter(n=>!n.matches('script,style,link,meta,source')&&visible(n))])];
    if(nodes.length>maxNodes)return {valid:false,failures:[{reason:'layout_proof_truncated'}]};
    window[proofKey]=snapshot(nodes);
    return {valid:true};
  }
  if(mode==='verify'||mode==='restore'){
    const proof=window[proofKey];
    if(!proof||proof.token!==token)return {valid:false,failures:[{reason:'layout_proof_missing'}]};
    const failures=[];
    const known=new Set(proof.nodes.map(p=>p.node));
    if(walk(document.body).some(n=>!n.matches('script,style,link,meta,source')&&visible(n)&&!known.has(n)))
      failures.push({reason:'new_painted_structure'});
    for(const before of proof.nodes){
      const n=before.node,after=n.isConnected?geometry(n):null;
      if(!after||Object.keys(after).some(k=>Math.abs(after[k]-before.rect[k])>tolerance))failures.push({reason:'underlying_geometry_changed',tag:n.localName,before:before.rect,after});
      if(JSON.stringify(source(n))!==JSON.stringify(before.source))failures.push({reason:'active_media_source_changed',tag:n.localName,before:before.source,after:source(n)});
      if(JSON.stringify(layout(n))!==JSON.stringify(before.layout))failures.push({reason:'underlying_layout_changed',tag:n.localName,before:before.layout,after:layout(n)});
      const points=transform(n);
      if(points.some((p,i)=>p.some((v,k)=>!Number.isFinite(v)||Math.abs(v-before.transform[i][k])>tolerance)))
        failures.push({reason:'underlying_transform_changed',tag:n.localName,before:before.transform,after:points});
      const text=[...n.childNodes].filter(c=>c.nodeType===3).map(c=>c.textContent).join('');
      if(text!==before.text)failures.push({reason:'underlying_text_changed',tag:n.localName});
      if(failures.length>=8)break;
    }
    const dimensions=[document.documentElement.scrollWidth,document.documentElement.scrollHeight];
    if(JSON.stringify(dimensions)!==JSON.stringify(proof.dimensions))failures.push({reason:'document_dimensions_changed',before:proof.dimensions,after:dimensions});
    if(mode==='restore')delete window[proofKey];
    return {valid:!failures.length,failures,checkedNodes:proof.nodes.length};
  }
  const layers=[],preserved=[],ambiguous=[];
  // Bounded, read-only refusal evidence. Identity is diagnostic only: no
  // selector derived here participates in classification or loading.
  const describe=n=>{
    const s=getComputedStyle(n),rect=geometry(n);
    const area=Math.max(0,Math.min(innerWidth,rect.x+rect.width)-Math.max(0,rect.x))*
      Math.max(0,Math.min(innerHeight,rect.y+rect.height)-Math.max(0,rect.y));
    return {tag:n.localName,id:n.id||null,className:typeof n.className==='string'?n.className:null,
      role:n.getAttribute('role'),ariaLabel:n.getAttribute('aria-label'),ariaHidden:n.getAttribute('aria-hidden'),
      ariaExpanded:n.getAttribute('aria-expanded'),ariaControls:n.getAttribute('aria-controls'),
      rect,viewportCoverage:area/(innerWidth*innerHeight),visible:visible(n),
      style:{position:s.position,zIndex:s.zIndex,pointerEvents:s.pointerEvents,display:s.display,
        visibility:s.visibility,opacity:s.opacity,transform:s.transform,isolation:s.isolation,
        filter:s.filter,perspective:s.perspective,contain:s.contain,willChange:s.willChange,
        backgroundImage:s.backgroundImage,backgroundColor:s.backgroundColor},
      text:(n.textContent||'').replace(/\s+/g,' ').trim().slice(0,800),
      href:n.getAttribute('href'),src:n.getAttribute('src'),currentSrc:n.currentSrc||null,
      alt:n.getAttribute('alt')};
  };
  const refusalEvidence=(n,all,controls,signals)=>{
    const ancestors=[];for(let a=parent(n);a&&ancestors.length<12;a=parent(a))ancestors.push(describe(a));
    const media=all.filter(n=>visible(n)&&(n.matches('img,video,canvas,svg,iframe')||getComputedStyle(n).backgroundImage!=='none'));
    return {element:describe(n),ancestors,signals,controls:controls.slice(0,24).map(describe),
      media:media.slice(0,24).map(describe),descendantCount:all.length-1,
      truncated:controls.length>24||media.length>24,
      landmarks:all.filter(n=>n.matches('header,nav,main,footer,section,article,[role="navigation"]')).slice(0,12).map(describe)};
  };
  const registry=window.__gustoStructuralPositioned;
  for(const p of positioned){
    const n=registry?.elements.get(p.id);if(!n?.isConnected)continue;
    const descendants=walk(n),all=[n,...descendants];
    const nav=n=>n.matches('header,nav,[role="navigation"]')||/(?:^|[-_ ])(?:nav|navbar|navigation|menu|breadcrumb)(?:$|[-_ ])/i.test(`${n.id} ${n.className}`);
    let navigation=false;for(let a=n;a;a=parent(a))if(nav(a)){navigation=true;break;}
    if(p.protectedStructure||navigation){preserved.push({...p,reason:'structural_landmark_or_navigation'});continue;}
    // A semantic sticky section participates in the narrative layout. It must
    // not be inferred to be commercial from words such as "offer" alone.
    if(p.positionKind==='sticky'&&(n.matches('section,article')||n.closest('section,article'))){preserved.push({...p,reason:'sticky_narrative_layout'});continue;}
    const consentProof=window.__gustoConsentPreferenceProof?.certified.get(n);
    const consentLabel=[n.getAttribute('aria-label'),n.getAttribute('title'),n.textContent].filter(Boolean).join(' ')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
    if(consentProof?.version===1&&consentProof.label===consentLabel&&p.deduplicationEligible&&p.positionKind==='fixed'){
      layers.push({...p,reason:'certified_nonstructural_interface',mechanisms:['consent_preferences_event_provenance'],consentProof});continue;
    }
    const names=all.map(n=>`${n.id||''} ${typeof n.className==='string'?n.className:''} ${n.getAttribute('aria-label')||''}`).join(' ');
    const text=all.filter(visible).map(n=>[...n.childNodes].filter(c=>c.nodeType===3).map(c=>c.textContent).join(' ')).join(' ');
    const controls=all.filter(n=>n.matches('button,a,[role="button"],iframe')&&visible(n));
    const widget=/promo(?:tion)?|newsletter|special offer|discount|offre speciale|promotion|descuento|subscribe|abonn|accessibilit|accessibility|live chat|chat widget|(?:^|[-_ ])widget(?:$|[-_ ])/i.test(names+' '+text);
    const declaredInterface=/(?:^|[-_ ])(?:popup|pop[-_ ]?in|toast|notification|alerts?[-_ ]container)(?:$|[-_ ])/i.test(names)||n.matches('[role="alert"],[role="alertdialog"]');
    const dismiss=controls.some(n=>/^(?:hide|close|dismiss|collapse|minimize|fermer|masquer|replier|chiudi|cerrar|×|✕)(?:\b|$)/i.test((n.getAttribute('aria-label')||n.getAttribute('title')||n.textContent).trim()));
    // A detached external authoring-tool attribution is peripheral only when
    // its visible claim, document generator and destination independently
    // agree. No provider name, URL or class is trusted on its own. Navigation
    // and narrative landmarks have already been preserved above; the existing
    // peripheral/geometry eligibility and transactional masking proof apply.
    const normalizeBrand=value=>value.toLowerCase().replace(/[^a-z0-9]/g,'');
    const generator=normalizeBrand(document.querySelector('meta[name="generator"]')?.content||'');
    const attributionLabels=all.filter(visible).flatMap(n=>[
      [...n.childNodes].filter(c=>c.nodeType===3).map(c=>c.textContent).join(' ').trim(),
      n.getAttribute('alt')||'',n.getAttribute('aria-label')||'',n.getAttribute('title')||'']);
    let authoringAttribution=false;
    if(generator&&n.matches('a[href]')&&parent(n)===document.body&&p.positionKind==='fixed'&&
      p.deduplicationEligible&&controls.length===1&&controls[0]===n){
      try{
        const destination=new URL(n.href);
        authoringAttribution=['http:','https:'].includes(destination.protocol)&&destination.origin!==window.location.origin&&
          destination.hostname.split('.').some(label=>normalizeBrand(label)===generator)&&
          attributionLabels.some(label=>{
            const claim=/^(?:made (?:in|with)|built (?:with|on)|powered by|created (?:with|using))\s+(.+)$/i.exec(label);
            return claim&&normalizeBrand(claim[1])===generator;
          });
      }catch{} // Unresolved destinations never certify a layer.
    }
    if(authoringAttribution){layers.push({...p,reason:'certified_nonstructural_interface',
      mechanisms:['document_generator_attribution'],attribution:{generator,destination:n.href}});continue;}
    const interfaceSignal=widget||dismiss||declaredInterface;
    if(p.deduplicationEligible&&interfaceSignal){layers.push({...p,reason:'certified_nonstructural_interface',mechanisms:[...(widget?['commercial_or_widget_semantics']:[]),...(dismiss?['dismissible_peripheral_control']:[]),...(declaredInterface?['declared_floating_interface']:[])]});continue;}
    // Unknown peripheral controls, or a declared overlay that the existing
    // masking verifier cannot certify, cannot silently enter a Vision image.
    if((p.deduplicationEligible||interfaceSignal)&&controls.length){ambiguous.push({...p,reason:'nonstructural_layer_not_certifiable',
      evidence:refusalEvidence(n,all,controls,{protectedStructure:p.protectedStructure,navigation,
        deduplicationEligible:p.deduplicationEligible,widget,declaredInterface,dismiss,interfaceSignal,
        authoringAttribution,generator})});continue;}
    const css=getComputedStyle(n),opaque=css.backgroundColor!=='rgba(0, 0, 0, 0)'&&css.backgroundColor!=='transparent';
    const peripheral=p.rect.width<=innerWidth*.6&&p.rect.height<=innerHeight*.5;
    if(p.positionKind==='fixed'&&peripheral&&p.rect.width*p.rect.height>=innerWidth*innerHeight*.01&&
      (parseInt(css.zIndex,10)>0)&&(opaque||n.localName.includes('-'))){ambiguous.push({...p,reason:'ambiguous_painted_floating_surface',
        evidence:refusalEvidence(n,all,controls,{peripheral,opaque,interfaceSignal})});continue;}
    preserved.push({...p,reason:'no_certified_nonstructural_interface'});
  }
  if(layers.length&&!ambiguous.length){
    const nodes=walk(document.body).filter(n=>!n.matches('script,style,link,meta,source')&&visible(n));
    if(nodes.length>maxNodes)ambiguous.push({reason:'layout_proof_truncated'});
    else window[proofKey]=snapshot(nodes);
  }
  return {layers,preserved,ambiguous};
}

// Same self-contained Chromium composition pattern as the reliability
// collector. Each visibility mutation and its layout/source proof execute in
// one DOM task: autonomous site motion or screenshot animation restoration
// must not become a new global gate attributed to masking.
const beginVisionMaskDOM=new Function('args',`
  const inspect=${visionLayerDOM.toString()},visibility=${persistentVisibilityDOM.toString()};
  const result=inspect(args);
  if(result.ambiguous.length||!result.layers.length)return result;
  result.hidden=visibility({mode:'hide',token:args.token,elements:result.layers,tolerance:args.tolerance});
  result.layout=inspect({...args,mode:'verify'});
  result.visibility=visibility({mode:'verify',token:args.token});
  return result;
`);
const restoreVisionMaskDOM=new Function('args',`
  const inspect=${visionLayerDOM.toString()},visibility=${persistentVisibilityDOM.toString()};
  const before=inspect({...args,mode:'snapshot'});
  const styles=visibility({mode:'restore',token:args.token});
  const layout=inspect({...args,mode:'restore'});
  return {valid:before.valid&&styles.stylesRestored&&layout.valid,styles,layout,before};
`);

function createVisionCleanupController(page,{token,config,time=(name,work)=>work()}){
  const visits=[];
  const fail=(reason,details)=>Object.assign(new Error(`Couche non structurelle non certifiée : ${reason}`),{code:'uncertified_vision_layer',visionCleanliness:{policy:VISION_CLEANUP_POLICY,complete:false,reason,...details}});
  async function capture(positioned,state,origin,work){
    const args={positioned,token,maxNodes:config.maxNodes,tolerance:config.persistentTolerance};
    let inspect;
    try{inspect=await time('vision_layer_mask_transaction',()=>page.evaluate(beginVisionMaskDOM,args));}
    catch(error){await page.evaluate(restoreVisionMaskDOM,args).catch(()=>{});throw error;}
    const visit={position:state.position,origin,suppressed:inspect.layers,preserved:inspect.preserved,ambiguous:inspect.ambiguous,restored:false};visits.push(visit);
    if(inspect.ambiguous.length)throw fail('ambiguous_layer',{...visit,
      ...(page.structuralConsentPreferenceDiagnostic?{consentPreferences:page.structuralConsentPreferenceDiagnostic}:{})});
    if(!inspect.layers.length){visit.restored=true;visit.verified=true;return work();}
    let buffer,error;
    try{
      const hidden=inspect.hidden;
      visit.visibilityTransitionsFinished=hidden.visibilityTransitionsFinished;
      if(hidden.skipped.length||hidden.ids.length!==inspect.layers.length)throw fail('mask_refused',{...visit,skipped:hidden.skipped});
      if(!inspect.visibility.valid||!inspect.layout.valid)throw fail('mask_integrity_failed',{...visit,visibility:inspect.visibility,layout:inspect.layout});
      visit.checkedNodes=inspect.layout.checkedNodes;
      const verify=async()=>{
        const visibility=await page.evaluate(persistentVisibilityDOM,{mode:'verify',token});
        if(!visibility.valid)throw fail('mask_integrity_failed',{...visit,visibility});
      };
      await time('vision_layer_integrity',verify);
      buffer=await work();
      await time('vision_layer_integrity',verify);
      visit.verified=true;
    }catch(e){error=e;}
    finally{
      try{
        const restored=await time('vision_layer_restore_transaction',()=>page.evaluate(restoreVisionMaskDOM,args));
        visit.styleRestoration=restored.styles;
        visit.restored=restored.valid;
        if(!restored.valid)throw fail('restoration_failed',{...visit,restored});
      }catch(e){error=e;}
    }
    if(error)throw error;
    return buffer;
  }
  const summary=()=>({version:1,policy:VISION_CLEANUP_POLICY,complete:visits.every(v=>v.verified&&v.restored),verifiedViews:visits.length,
    suppressedOccurrences:visits.reduce((n,v)=>n+v.suppressed.length,0),restorationVerified:visits.every(v=>v.restored)});
  return {capture,summary,visits};
}
function visionInputsAreClean(coverage){return coverage?.visionCleanliness?.version===1&&coverage.visionCleanliness.policy===VISION_CLEANUP_POLICY&&coverage.visionCleanliness.complete===true&&coverage.visionCleanliness.restorationVerified===true;}
module.exports={visionLayerDOM,createVisionCleanupController,VISION_CLEANUP_POLICY,visionInputsAreClean};
