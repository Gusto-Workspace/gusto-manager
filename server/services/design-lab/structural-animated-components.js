/* global window, document, getComputedStyle, innerWidth, innerHeight, NodeFilter */
// Render-state stabilization only. No library names, hostnames, global timer
// interception, DOM replacement, dimensions or network policy changes.
const MOTION_CONFIG = Object.freeze({ maxNodes:6000, maxRoots:24, maxScopeNodes:256,
  samples:5, intervalMs:150, geometryTolerance:.5 });

function animationCaptureDOM({mode, rootIds=[], tolerance=.5, config}) {
  const registry=window.__gustoStructuralAnimation ||= {nodes:new WeakMap(),elements:new Map(),next:0};
  const parent=n=>n.assignedSlot||n.parentElement||n.getRootNode()?.host||null;
  const id=n=>{if(!registry.nodes.has(n))registry.nodes.set(n,++registry.next);
    const key=registry.nodes.get(n);registry.elements.set(key,n);return key;};
  const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
  const visible=n=>{let opacity=1;for(let p=n;p;p=parent(p)){const s=getComputedStyle(p);
    opacity*=Number(s.opacity);if(s.display==='none'||s.visibility==='hidden'||opacity<=.01)return false;}return true;};
  const scopeNodes=root=>[root,...root.querySelectorAll('*')].filter(n=>!n.matches('script,style,link,meta,source'));
  const state=n=>{const s=getComputedStyle(n);return {id:id(n),rect:rect(n),
    layout:[n.offsetWidth||0,n.offsetHeight||0,s.display,s.position,s.overflowX,s.overflowY,s.clipPath],
    motion:[s.transform,s.translate,s.rotate,s.scale,s.opacity,s.left,s.top,s.backgroundPositionX,s.backgroundPositionY,s.offsetDistance],
    inline:[n.style.transform,n.style.translate,n.style.rotate,n.style.scale,n.style.opacity,n.style.left,n.style.top],
    source:n.matches('img')?n.currentSrc||n.src:null,
    cssAnimation:s.animationName!=='none',cssTransition:parseFloat(s.transitionDuration)>0,
    webAnimation:n.getAnimations?.().some(a=>a.constructor.name==='Animation'&&a.playState==='running')||false};};
  const geometrySame=(a,b)=>['x','y','width','height'].every(k=>Math.abs(a[k]-b[k])<=tolerance);
  const inspectRoot=root=>{const nodes=scopeNodes(root);return {id:id(root),rect:rect(root),
    oversized:nodes.length>config.maxScopeNodes,
    nodes:nodes.slice(0,config.maxScopeNodes).map(state)};};
  const restore=()=>{
    const active=registry.active;if(!active)return [];
    active.styles.forEach(s=>s.remove());
    for(const [n,previous] of active.attributes){if(previous===null)n.removeAttribute('data-gusto-animated-frame');else n.setAttribute('data-gusto-animated-frame',previous);}
    for(const item of active.animations){if(item.animation.playState!=='idle'){
      item.animation.currentTime=item.time;
      if(item.playState==='running')item.animation.play();else item.animation.pause();}}
    delete registry.active;
    return active.components;
  };
  const verify=()=>{
    const active=registry.active;if(!active)return {valid:true,components:[]};
    const failures=[];
    for(const before of active.baselines){const root=registry.elements.get(before.id);
      if(!root?.isConnected){failures.push('component_disappeared');continue;}
      const after=inspectRoot(root);
      if(after.oversized||!geometrySame(before.rect,after.rect))failures.push('component_envelope_changed');
      if(before.nodes.length!==after.nodes.length||before.nodes.some((n,i)=>{
        const next=after.nodes[i];return !next||n.id!==next.id||!geometrySame(n.rect,next.rect)||
          JSON.stringify(n.layout)!==JSON.stringify(next.layout)||n.source!==next.source;
      }))failures.push('visible_structure_or_source_changed');
    }
    return {valid:!failures.length,failures:[...new Set(failures)],components:active.components};
  };
  if(mode==='restore')return restore();
  if(mode==='verify')return verify();
  if(mode==='observe'){
    const nodes=[],walkers=[document.createTreeWalker(document.body,NodeFilter.SHOW_ELEMENT)];
    while(walkers.length&&nodes.length<config.maxNodes){const n=walkers.at(-1).nextNode();
      if(!n){walkers.pop();continue;}nodes.push(n);if(n.shadowRoot)walkers.push(document.createTreeWalker(n.shadowRoot,NodeFilter.SHOW_ELEMENT));}
    const roots=new Set();
    for(const media of nodes.filter(n=>n.matches('img,video')&&visible(n))){
      const m=media.getBoundingClientRect();if(m.width<60||m.height<60)continue;
      for(let p=parent(media),depth=0;p&&depth++<12;p=parent(p)){
        const r=p.getBoundingClientRect(),s=getComputedStyle(p);
        if(r.width<innerWidth*.15||r.height<60||r.width>innerWidth*1.2||r.height>innerHeight*1.2||
          r.width*r.height<innerWidth*innerHeight*.08||r.bottom<=0||r.top>=innerHeight||r.right<=0||r.left>=innerWidth)continue;
        if(!/(hidden|clip|auto|scroll)/.test(s.overflowX+' '+s.overflowY)&&s.perspective==='none')continue;
        // Opacity-zero slides can be part of a crossfade. Display/visibility
        // and positive boxes still distinguish them from unrendered content.
        const images=[...p.querySelectorAll('img,video')].filter(n=>{const s=getComputedStyle(n),r=n.getBoundingClientRect();
          return s.display!=='none'&&s.visibility!=='hidden'&&r.width>=60&&r.height>=60;});
        if(images.length<2||images.length>64)continue;
        const boxes=images.map(n=>n.getBoundingClientRect());
        const xs=boxes.map(b=>b.left+b.width/2),ys=boxes.map(b=>b.top+b.height/2);
        const rangeX=Math.max(...xs)-Math.min(...xs),rangeY=Math.max(...ys)-Math.min(...ys);
        const widths=boxes.map(b=>b.width).sort((a,b)=>a-b),heights=boxes.map(b=>b.height).sort((a,b)=>a-b);
        const medianW=widths[Math.floor(widths.length/2)],medianH=heights[Math.floor(heights.length/2)];
        const horizontal=rangeX>medianW*.5&&rangeY<medianH*.6&&
          (Math.max(...boxes.map(b=>b.right))-Math.min(...boxes.map(b=>b.left))>r.width*1.1||p.scrollWidth>p.clientWidth+8);
        const vertical=rangeY>medianH*.5&&rangeX<medianW*.6&&
          (Math.max(...boxes.map(b=>b.bottom))-Math.min(...boxes.map(b=>b.top))>r.height*1.1||p.scrollHeight>p.clientHeight+8);
        const stacked=rangeX<medianW*.2&&rangeY<medianH*.2&&medianW*medianH>=r.width*r.height*.4;
        if(horizontal||vertical||stacked){roots.add(p);break;}
      }
    }
    return [...roots].slice(0,config.maxRoots).map(inspectRoot);
  }
  if(mode!=='freeze')throw Error('Unknown animation capture operation');
  if(registry.active)throw Error('Animation capture already active');
  const active={styles:[],attributes:new Map(),animations:[],baselines:[],components:[]};
  registry.active=active;
  try {
    const sheets=new Map();
    for(const rootId of rootIds){const root=registry.elements.get(rootId);
      if(!root?.isConnected)throw Error('Animated component disappeared');
      const baseline=inspectRoot(root);if(baseline.oversized)throw Error('Animated component exceeds measurement bound');
      active.baselines.push(baseline);
      const properties=['transform','translate','rotate','scale','opacity','left','top','background-position-x','background-position-y','offset-distance'];
      for(const n of scopeNodes(root)){
        if(active.attributes.has(n))continue;
        const computed=getComputedStyle(n),values=properties.map(p=>computed.getPropertyValue(p));
        const scope=n.getRootNode();
        let style=sheets.get(scope);
        if(!style){style=document.createElement('style');style.setAttribute('data-gusto-animated-style','true');
          (scope===document?document.head:scope).appendChild(style);sheets.set(scope,style);active.styles.push(style);}
        const marker=`frame-${id(n)}`;
        active.attributes.set(n,n.getAttribute('data-gusto-animated-frame'));
        n.setAttribute('data-gusto-animated-frame',marker);
        const index=style.sheet.insertRule(`[data-gusto-animated-frame="${marker}"]{}`,style.sheet.cssRules.length);
        const rule=style.sheet.cssRules[index].style;
        properties.forEach((p,i)=>{if(values[i])rule.setProperty(p,values[i],'important');});
        rule.setProperty('animation-play-state','paused','important');
        rule.setProperty('transition','none','important');
        for(const animation of n.getAnimations?.()||[]){if(animation.constructor.name==='Animation'&&animation.playState==='running'){
          active.animations.push({animation,time:animation.currentTime,playState:animation.playState});animation.pause();}}
      }
      active.components.push({id:rootId,rect:baseline.rect,nodeCount:baseline.nodes.length,
        mechanism:'scoped_computed_motion_snapshot',geometryPreserved:true});
    }
    const integrity=verify();
    if(!integrity.valid){restore();return {valid:false,failures:integrity.failures,components:[]};}
    return integrity;
  } catch(error){restore();throw error;}
}

function motionRoots(frames, tolerance=.5) {
  if(frames.length<3)return [];
  const last=frames.at(-1),result=[];
  const sameRect=(a,b)=>['x','y','width','height'].every(k=>Math.abs(a[k]-b[k])<=tolerance);
  for(const root of last){
    const history=frames.map(frame=>frame.find(r=>r.id===root.id));
    if(history.some(r=>!r||r.oversized||!sameRect(root.rect,r.rect)||r.nodes.length!==root.nodes.length))continue;
    if(history.some(r=>r.nodes.some((n,i)=>n.id!==root.nodes[i].id||
      JSON.stringify(n.layout.slice(0,6))!==JSON.stringify(root.nodes[i].layout.slice(0,6)))))continue;
    const changes=history.slice(1).map((frame,i)=>frame.nodes.some((n,j)=>
      JSON.stringify(n.motion)!==JSON.stringify(history[i].nodes[j].motion)));
    if(!changes.every(Boolean))continue;
    // Replaced media cannot be pinned by a transform snapshot; keep the gate.
    if(history.some(r=>r.nodes.some((n,i)=>n.source!==root.nodes[i].source)))continue;
    const mechanisms=new Set();
    for(const r of history)for(const n of r.nodes){
      if(n.cssAnimation)mechanisms.add('css_animation');
      if(n.cssTransition)mechanisms.add('css_transition');
      if(n.webAnimation)mechanisms.add('web_animation');
    }
    if(history.some((r,i)=>i&&r.nodes.some((n,j)=>JSON.stringify(n.inline)!==JSON.stringify(history[i-1].nodes[j].inline))))
      mechanisms.add('inline_motion_updates');
    if(!mechanisms.size)mechanisms.add('computed_motion_updates');
    result.push({id:root.id,mechanisms:[...mechanisms].sort(),rect:root.rect});
  }
  return result;
}

function createAnimatedCaptureController(page, deadline, config=MOTION_CONFIG) {
  let active=[], lastDiagnostic={status:'no_identifiable_motion',components:[]};
  const evaluate=(mode,extra={})=>page.evaluate(animationCaptureDOM,{mode,config,tolerance:config.geometryTolerance,...extra});
  const restore=async()=>{if(!active.length)return;await evaluate('restore');active=[];};
  return {
    async freeze(){
      await restore();
      lastDiagnostic={status:'no_identifiable_motion',components:[]};
      const frames=[await evaluate('observe')];
      if(!frames[0].length)return [];
      for(let i=1;i<config.samples;i++){
        if(Date.now()+config.intervalMs>=deadline){lastDiagnostic={status:'motion_sampling_budget_exhausted',components:[]};return [];}
        await page.waitForTimeout(config.intervalMs);
        frames.push(await evaluate('observe'));
        if(i===2&&!motionRoots(frames,config.geometryTolerance).length)return [];
      }
      const roots=motionRoots(frames,config.geometryTolerance);if(!roots.length)return [];
      const frozen=await evaluate('freeze',{rootIds:roots.map(r=>r.id)});
      if(!frozen.valid){lastDiagnostic={status:'snapshot_rejected',failures:frozen.failures,components:[]};return [];}
      active=frozen.components.map(c=>({...c,detectedMechanisms:roots.find(r=>r.id===c.id).mechanisms}));
      lastDiagnostic={status:'controlled_snapshot',components:active};
      return active;
    },
    async verify(){if(!active.length)return {valid:true,components:[]};return evaluate('verify');},
    components:()=>active,
    diagnostic:()=>lastDiagnostic,
    restore,
  };
}
module.exports={MOTION_CONFIG,animationCaptureDOM,motionRoots,createAnimatedCaptureController};
