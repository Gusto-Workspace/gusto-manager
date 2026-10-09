// Collector reliability v1, independent of artistic scoring and selected views.
// The validated inspection never changes descriptors, scores, pixels or gates.
const { performance } = require("node:perf_hooks");
const { selectionConfig, unionArea, structuralObservationDOM } = require("./structural-observation-selection");

// Self-contained read-only Chromium inspection, run at an already observed
// viewport while its existing capture freeze is still active.
function inspectStructuralPaintDOM({ measures, position, regionTop = 0, regionBottom, config }) {
  const started = performance.now(), width = window.innerWidth, height = window.innerHeight;
  const identities = window.__gustoShadowPaintIds ||= { nodes: new WeakMap(), next: 0 };
  const cssCache = new WeakMap(), boxCache = new WeakMap(), orders = new WeakMap();
  const css = n => { if (!cssCache.has(n)) cssCache.set(n, getComputedStyle(n)); return cssCache.get(n); };
  const bounds = n => { if (!boxCache.has(n)) boxCache.set(n, n.getBoundingClientRect()); return boxCache.get(n); };
  const parent = n => n.assignedSlot || n.parentElement || n.getRootNode()?.host || null;
  const rect = b => ({ x:b.left, y:b.top, width:b.right-b.left, height:b.bottom-b.top });
  const area = r => Math.max(0,r.width)*Math.max(0,r.height);
  const findings = [], witnesses = [];
  let scanned = 0, checked = 0, truncated = false, glyphs = 0;
  const walkers = [document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT)];
  const nodes = [];
  while (walkers.length) {
    const n = walkers.at(-1).nextNode();
    if (!n) { walkers.pop(); continue; }
    if (++scanned > config.maxNodes) { truncated = true; break; }
    orders.set(n,scanned); nodes.push(n);
    if (n.shadowRoot) walkers.push(document.createTreeWalker(n.shadowRoot, NodeFilter.SHOW_ELEMENT));
  }
  // Match the collector's viewport, containing-block and hidden/navigation
  // exclusions. Non-rectangular clipping is not certified by a bounding box.
  const visible = (n, raw) => {
    let left=Math.max(0,raw.left), right=Math.min(width,raw.right),
      top=Math.max(regionTop,raw.top), bottom=Math.min(regionBottom ?? height,raw.bottom),
      opacity=1, escaped=null;
    const uncertainty=[];
    for(let p=n;p;p=parent(p)) {
      const s=css(p), b=bounds(p);
      opacity*=Number(s.opacity);
      if(s.display==="none" || ["hidden","collapse"].includes(s.visibility) || s.contentVisibility==="hidden" || opacity<=.01 ||
        (p.tagName==="DIALOG"&&!p.open) || (p.tagName==="DETAILS"&&!p.open&&!n.closest("summary"))) return null;
      if(["fixed","sticky"].includes(s.position) && b.height>0 && b.height<height*.15 &&
        (p.matches('header,nav,[role="banner"],[role="navigation"]') || (b.width>=width*.6&&b.top<height*.15))) return null;
      const containing=s.transform!=="none"||s.perspective!=="none"||s.filter!=="none"||/paint|layout|strict|content/.test(s.contain)||/transform|perspective|filter/.test(s.willChange);
      const clips=!escaped||containing||(escaped==="absolute"&&s.position!=="static");
      if(clips)escaped=null;
      if(p!==n&&clips&&/(hidden|clip|scroll|auto)/.test(s.overflowX)){left=Math.max(left,b.left);right=Math.min(right,b.right);}
      if(p!==n&&clips&&/(hidden|clip|scroll|auto)/.test(s.overflowY)){top=Math.max(top,b.top);bottom=Math.min(bottom,b.bottom);}
      if(["absolute","fixed"].includes(s.position))escaped=s.position;
      if(s.clipPath!=="none") {
        const inset=s.clipPath.match(/^inset\(([^)]*)\)/);
        if(inset){
          const v=inset[1].replace(/\s+round[\s\S]*$/,"").split(/\s+/),[t="0",r=t,d=t,l=r]=v;
          const px=(v,size)=>v.endsWith("%")?parseFloat(v)*size/100:parseFloat(v)||0;
          left=Math.max(left,b.left+px(l,b.width));right=Math.min(right,b.right-px(r,b.width));
          top=Math.max(top,b.top+px(t,b.height));bottom=Math.min(bottom,b.bottom-px(d,b.height));
        } else {
          const pts=s.clipPath.match(/^polygon\((.*)\)$/)?.[1].split(",").map(v=>v.trim().split(/\s+/));
          const xy=pts?.map(([x,y])=>[x?.endsWith("%")?parseFloat(x)*b.width/100:parseFloat(x),y?.endsWith("%")?parseFloat(y)*b.height/100:parseFloat(y)]);
          if(/^circle\(0(?:px|%|\s)/.test(s.clipPath) || (xy?.every(p=>p.every(Number.isFinite)) &&
            Math.abs(xy.reduce((a,p,i)=>{const q=xy[(i+1)%xy.length];return a+p[0]*q[1]-q[0]*p[1];},0))<.001)) return null;
          const rectangle=xy?.length===4&&xy.every(p=>p.every(Number.isFinite))&&new Set(xy.map(p=>p[0])).size===2&&new Set(xy.map(p=>p[1])).size===2&&new Set(xy.map(p=>p.join(":"))).size===4&&xy.every((p,i)=>{const q=xy[(i+1)%4];return p[0]===q[0]||p[1]===q[1];});
          if(rectangle){left=Math.max(left,b.left+Math.min(...xy.map(p=>p[0])));right=Math.min(right,b.left+Math.max(...xy.map(p=>p[0])));top=Math.max(top,b.top+Math.min(...xy.map(p=>p[1])));bottom=Math.min(bottom,b.top+Math.max(...xy.map(p=>p[1])));}
          else uncertainty.push("non_rectangular_clipping");
        }
      }
      const matrix=s.transform.match(/^matrix\((.*)\)$/)?.[1].split(",").map(Number);
      const matrix3d=s.transform.match(/^matrix3d\((.*)\)$/)?.[1].split(",").map(Number);
      if(s.perspective!=="none"||matrix3d?.some((v,i)=>![0,5,10,12,13,14,15].includes(i)&&Math.abs(v)>.001)) uncertainty.push("non_rectangular_transform_or_perspective");
      if(matrix&&matrix.slice(1,3).some(v=>Math.abs(v)>.001))uncertainty.push("non_rectangular_affine_transform");
    }
    return right-left>=2&&bottom-top>=2 ? {rect:{x:left,y:top,width:right-left,height:bottom-top},uncertainty:[...new Set(uncertainty)]} : null;
  };
  const identity=n=>{
    if(!identities.nodes.has(n))identities.nodes.set(n,++identities.next);
    return {elementId:`paint${identities.nodes.get(n)}`,tag:n.localName,domOrder:orders.get(n)};
  };
  const boxes=[...(measures.masses||[]),...(measures.lines||[])];
  const contains=(r,x,y)=>x>=r.x-.5&&x<=r.x+r.width+.5&&y>=r.y-.5&&y<=r.y+r.height+.5;
  const represented=(r,related)=> {
    // Descriptor rounding is half a pixel; inspect the edges beyond that
    // precision rather than penalizing roundoff. These are not invented views.
    const xs=[r.x+.5,r.x+r.width/2,r.x+r.width-.5],ys=[r.y+.5,r.y+r.height/2,r.y+r.height-.5];
    return xs.flatMap(x=>ys.map(y=>({x,y}))).filter(p=>!related.some(b=>contains(b,p.x,p.y)));
  };
  const hitAt=(n,p)=>{
    let hit=document.elementFromPoint(p.x,p.y);
    for(let d=0;hit?.shadowRoot&&d<32;d++){const inner=hit.shadowRoot.elementFromPoint(p.x,p.y);if(!inner||inner===hit)break;hit=inner;}
    return hit && (hit===n||n.contains(hit));
  };
  const audit=(n,raw,kind,related,mechanism,important=true)=>{
    const v=visible(n,raw);if(!v||!important)return;
    checked++;
    const id=identity(n);
    // SVG native extents + screen CTM certify affine glyph/shape envelopes.
    // Affine transforms of opaque HTML primitives do not provide that proof.
    const uncertainty=kind.startsWith("svg_")?v.uncertainty.filter(s=>s!=="non_rectangular_affine_transform"):v.uncertainty;
    if(uncertainty.length){findings.push({...id,status:"unproven",reason:"uncertifiable_paint_geometry",mechanisms:uncertainty,rect:v.rect,kind});return;}
    const missing=represented(v.rect,related);
    if(!missing.length)return;
    const point=missing.find(p=>hitAt(n,p));
    if(point){
      findings.push({...id,status:"unreliable",reason:"visible_paint_not_represented",mechanisms:[mechanism],kind,rect:v.rect,
        representedRects:related.map(r=>({x:r.x,y:r.y,width:r.width,height:r.height})),point});
      witnesses.push({x:point.x,y:point.y,elementId:id.elementId});
    }
    // Bounding boxes alone are not proof of ink. Without a painted witness,
    // leave that local extent uncertain; do not invent a negative coverage ratio.
    else if(kind.startsWith("svg_")||css(n).pointerEvents==="none") findings.push({...id,status:"unproven",reason:"paint_extent_not_certified",mechanisms:[mechanism],rect:v.rect,kind});
  };
  for(const n of nodes){
    if(findings.length>=config.maxMasses){truncated=true;break;}
    if(n.matches("script,style,link,meta,source"))continue;
    let svgRoot=n.closest("svg");
    if(svgRoot){while(svgRoot.parentElement?.closest("svg"))svgRoot=svgRoot.parentElement.closest("svg");}
    const rootBox=svgRoot?visible(svgRoot,bounds(svgRoot)):null;
    if(svgRoot && (!rootBox || rootBox.rect.width<32 || rootBox.rect.height<32 || area(rootBox.rect)<4096))continue;
    const ownOrder=orders.get(n), rootOrder=orders.get(svgRoot);
    const related=boxes.filter(b=>b.domOrder===(svgRoot?rootOrder:ownOrder));
    // Exact duplicate boxes can retain another DOM order in the collector.
    const sameBox=svgRoot?rootBox?.rect:visible(n,bounds(n))?.rect;
    const equivalents=sameBox?boxes.filter(b=>["surface","image","embed"].includes(b.kind)&&["x","y","width","height"].every(k=>Math.abs(b[k]-sameBox[k])<=.5)):[];
    if(svgRoot){
      if(n.closest("defs,clipPath,mask,pattern,marker,symbol"))continue; // definitions do not paint by themselves
      if(n.matches("text,textPath,tspan") && n.childNodes.length && [...n.childNodes].some(c=>c.nodeType===3&&c.textContent.trim())){
        let count=0;try{count=n.getNumberOfChars();}catch{}
        const matrix=n.getScreenCTM();
        if(!matrix||!count){const v=visible(n,bounds(n));if(v)findings.push({...identity(n),status:"unproven",reason:"svg_ink_geometry_unavailable",rect:v.rect,kind:"svg_text"});continue;}
        for(let i=0;i<count;i++){
          if(++glyphs>config.maxLines){truncated=true;break;}
          try {
            const b=n.getExtentOfChar(i),points=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(matrix));
            const raw={left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))};
            audit(n,raw,"svg_text",[...related,...equivalents],"svg_descendant_outside_descriptor");
          }catch{findings.push({...identity(n),status:"unproven",reason:"svg_glyph_geometry_unavailable",rect:rect(bounds(n)),kind:"svg_text"});break;}
        }
      } else if(n!==svgRoot&&n.matches("path,rect,circle,ellipse,polygon,polyline,line,image,use")){
        const s=css(n);if(s.fill==="none"&&s.stroke==="none")continue;
        audit(n,bounds(n),"svg_shape",[...related,...equivalents],"svg_descendant_outside_descriptor");
      }
      continue;
    }
    const raw=bounds(n),v=visible(n,raw);
    if(!v)continue;
    const substantial=v.rect.width>=32&&v.rect.height>=32&&area(v.rect)>=4096;
    if(substantial&&(n.matches("canvas")||(n.localName.includes("-")&&!n.shadowRoot&&!n.children.length))){
      findings.push({...identity(n),status:"unproven",reason:"opaque_primitive_geometry_uncertifiable",kind:n.localName,rect:v.rect});continue;
    }
    const s=css(n),media=n.matches("img")?Boolean(n.currentSrc&&n.complete&&n.naturalWidth):n.matches("video")?Boolean(n.videoWidth||n.poster):/url\(/.test(s.backgroundImage);
    if(substantial&&(media||n.matches("iframe")))audit(n,raw,"media",[...related,...equivalents],"painted_media_outside_descriptor");
    else if(substantial&&(s.backgroundColor!=="rgba(0, 0, 0, 0)"||/gradient\(/.test(s.backgroundImage)))
      audit(n,raw,"surface",[...related,...equivalents],"painted_surface_outside_descriptor");
    for(const child of n.childNodes){
      if(child.nodeType!==3||!child.textContent.trim())continue;
      const range=document.createRange();range.selectNodeContents(child);
      for(const b of range.getClientRects())audit(n,b,"text",related.filter(r=>r.kind==="text"),"painted_text_outside_descriptor");
    }
  }
  return {version:1,position,scope:"existing_viewport_only",scanned,checked,glyphs,truncated,findings,witnesses,domElapsedMs:performance.now()-started};
}

// Trusted local functions only, materialized together for one browser task.
// No page-supplied code is composed or executed by this wrapper.
const collectAndInspectDOM = new Function("args", `
  const collect=${structuralObservationDOM.toString()};
  const inspect=${inspectStructuralPaintDOM.toString()};
  const start=performance.now();
  const measures=collect(args), baseDOMElapsedMs=performance.now()-start;
  let inspection;
  try { inspection=inspect({...args,measures}); }
  catch(error) { inspection={findings:[{status:"unproven",reason:"shadow_paint_inspection_failed"}],error:error.message}; }
  return {measures,inspection,baseDOMElapsedMs};
`);

async function collectReliabilityMeasurement(page, args, { state, origin }) {
  const started=performance.now();
  const {measures,inspection,baseDOMElapsedMs}=await page.evaluate(collectAndInspectDOM,args);
  return {origin,position:state.position,observedTotalHeight:state.totalHeight,visibleHeight:state.visibleHeight,
    measures,inspection,elapsedMs:inspection.domElapsedMs||0,baseDOMElapsedMs,sharedEvaluationElapsedMs:performance.now()-started};
}

function buildReliabilityRegistry(records, overrides={}, requiredVisits) {
  const started=performance.now();
  const config=selectionConfig(overrides), entries=[];
  for(const [index,r]of records.entries()){
    if(!["traversal","fixed"].includes(r.origin))throw new Error("Shadow reliability accepts existing traversal/fixed visits only");
    const provenance={visitId:`visit${index+1}`,origin:r.origin,position:r.position,observedTotalHeight:r.observedTotalHeight};
    const m=r.measures;
    const add=(status,reason,extra={})=>entries.push({...extra,...provenance,status,reason});
    if(!m?.viewport?.width||!m?.viewport?.height)add("unproven","unknown_geometry");
    else {
      if(m.truncated||!m.relationsKnown)add("unproven","incomplete_descriptors");
      if(!(m.measuredCoverage>=config.minMeasuredCoverage))add("unreliable","insufficient_measured_coverage",{measuredCoverage:m.measuredCoverage});
      const clip=b=>({x:Math.max(0,b.x),y:Math.max(0,b.y),width:Math.max(0,Math.min(m.viewport.width,b.x+b.width)-Math.max(0,b.x)),height:Math.max(0,Math.min(m.viewport.height,b.y+b.height)-Math.max(0,b.y))});
      const fraction=unionArea((m.unknown||[]).map(clip))/(m.viewport.width*m.viewport.height);
      if(fraction>config.maxUnknownArea)add("unproven","unmeasurable_canvas_clip_or_transform",{unknownAreaFraction:fraction});
    }
    if(!r.inspection)add("unproven","shadow_paint_inspection_missing");
    else {
      if(r.inspection.truncated)add("unproven","shadow_paint_inspection_truncated");
      for(const f of r.inspection.findings||[]) {
        if(!["reliable","unreliable","unproven"].includes(f.status)||!f.reason)add("unproven","invalid_shadow_paint_evidence");
        else add(f.status,f.reason,f);
      }
    }
    if(!entries.some(e=>e.visitId===provenance.visitId))add("reliable","observed_paint_represented");
  }
  if(requiredVisits && (records.length!==requiredVisits.length || records.some((r,i)=>
    r.origin!==requiredVisits[i]?.origin || r.position!==requiredVisits[i]?.position)))
    entries.push({visitId:"visitCoverage",status:"unproven",reason:"shadow_paint_visit_evidence_missing_or_mismatched"});
  const status=entries.some(e=>e.status==="unreliable")?"unreliable":!records.length||entries.some(e=>e.status==="unproven")?"unproven":"reliable";
  return {version:1,scope:"all_actual_phase_a_and_fixed_visits",status,adaptiveEligible:status==="reliable",entries,
    reasons:[...new Set(entries.filter(e=>e.status!=="reliable").map(e=>e.reason))],
    visits:records.length,positions:records.map(r=>({origin:r.origin,position:r.position})),
    limits:["bounded_dom_and_glyph_inspection","paint_witnesses_use_browser_hit_testing","no_certificate_for_unobserved_viewports","no_full_pixel_or_pseudo_element_decomposition"],
    cost:{browserEvaluations:records.length,additionalBrowserEvaluations:0,measurement:"synchronous_inspection_dom_execution_only",
      addedElapsedMs:records.reduce((s,r)=>s+(r.elapsedMs||0),0),aggregationElapsedMs:performance.now()-started,
      sharedEvaluationElapsedMs:records.reduce((s,r)=>s+(r.sharedEvaluationElapsedMs||0),0),
      domElapsedMs:records.reduce((s,r)=>s+(r.inspection?.domElapsedMs||0),0)}};
}

function applyReliabilityRegistry(selection, fixedIds, registry) {
  if(registry.adaptiveEligible)return selection;
  return {...selection,mode:"fixed_fallback",selectedIds:[...fixedIds],
    fallbackReasons:[...new Set([...selection.fallbackReasons,`shadow_collector_${registry.status}`,...registry.reasons])],
    decisions:selection.decisions.map(d=>({...d,scoringSelected:d.selected,scoringReason:d.reason,
      selected:fixedIds.includes(d.id),reason:fixedIds.includes(d.id)?'fixed_fallback':'not_in_fixed_pool',
      deliveryReason:"shadow_reliability_registry"}))};
}
module.exports={inspectStructuralPaintDOM,collectAndInspectDOM,collectReliabilityMeasurement,buildReliabilityRegistry,applyReliabilityRegistry};
