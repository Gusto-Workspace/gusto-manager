const {createHash}=require('crypto');
const {deflateSync,inflateSync}=require('node:zlib');
const {descriptor}=require('./structural-observation-selection');
const numbers=(a,max)=>Array.isArray(a)?a.slice(0,max).map(v=>Number.isFinite(v)?Math.round(v*1e6)/1e6:null):[];
const scores=s=>s?Object.fromEntries(['L','D','V','R','G'].map(k=>[k,Number.isFinite(s[k])?s[k]:null])):null;
function compactDescriptor(d) {
  return d?{occupation:numbers(d.occupation,192),geometry:numbers(d.geometry,120),empty:numbers(d.empty,16),features:numbers(d.features,9),
    ...(d.version===2?{version:2,composition:Object.fromEntries(['coverage','massScale','topology','grouping','layering'].map(key=>[key,numbers(d.composition[key],6)]))}:{})}:null;
}
function buildObservationTrace({observations,scoring,delivery,deliveredIds,strategy,config,registry,totalHeight}) {
  const candidates=observations.slice(0,160).map((o,i)=>{
    const id=o.id||`candidate${i+1}`,s=scoring?.decisions.find(d=>d.id===id),f=delivery?.decisions.find(d=>d.id===id);
    return {id,position:o.position,visibleRangePx:o.visibleRangePx||[o.position,o.position+o.visibleHeight],
      descriptor:compactDescriptor(s?.descriptor || (o.measures?.viewport&&o.measures?.masses&&o.measures?.lines?descriptor(o.measures):null)),
      descriptorReliable:s?.reliability?.reliable??false,reliability:s?.reliability||null,
      scoring:{selected:s?.selected??null,reason:s?.reason||'not_run_for_continuous',scores:scores(s?.scores)},
      delivery:{selected:deliveredIds.includes(id),reason:f?.deliveryReason||f?.reason||(deliveredIds.includes(id)?'continuous_fixed_view':'not_delivered'),
        scoringSelected:f?.scoringSelected??f?.selected??null,scores:scores(f?.scores)}};
  });
  const upgraded=scoring?.version===2;
  const trace={version:upgraded?2:1,descriptorVersion:upgraded?2:1,strategy,totalHeight,
    config:{threshold:config.threshold,maxLocalViews:config.maxLocalViews,minMeasuredCoverage:config.minMeasuredCoverage,
      maxUnknownArea:config.maxUnknownArea,macroCanvas:config.macroCanvas,resolution:config.resolution,
      ...(upgraded?{algorithmVersion:2,weights:config.weights,proximity:config.proximity,scorePrecision:config.scorePrecision,
        mandatoryEntry:config.mandatoryEntry}: {})},
    registry:{status:registry.status,adaptiveEligible:registry.adaptiveEligible,reasons:registry.reasons},
    scoringMode:scoring?.mode||'not_run_for_continuous',deliveryMode:delivery?.mode||'continuous',
    fallbackReasons:delivery?.fallbackReasons||[],candidates,
    rounds:(scoring?.rounds||[]).slice(0,6).map(r=>({selectedBefore:r.selectedBefore,scores:r.scores.slice(0,160).map(s=>({id:s.id,...scores(s)}))})),
    exchanges:(scoring?.exchanges||[]).slice(0,5).map(e=>({removed:e.removed,added:e.added,improvement:e.improvement})),
    truncated:observations.length>160};
  trace.poolHash=createHash('sha256').update(JSON.stringify(candidates.map(c=>[c.id,c.position,c.descriptor]))).digest('hex');
  // Data is allow-listed, numeric and bounded; never serialize DOM or buffers.
  // Large pools retain every descriptor losslessly instead of dropping a
  // candidate merely to fit the diagnostic envelope.
  if(Buffer.byteLength(JSON.stringify(trace))>256*1024) {
    trace.descriptorEncoding='deflate-json-base64-v1';
    trace.descriptorData=deflateSync(Buffer.from(JSON.stringify(candidates.map(c=>c.descriptor)))).toString('base64');
    candidates.forEach((c,index)=>{c.descriptor={index};});
  }
  if(Buffer.byteLength(JSON.stringify(trace))>256*1024)throw Object.assign(new Error('Trace numérique de sélection trop grande.'),{code:'structural_observation_trace_too_large',status:422});
  return trace;
}
function expandObservationTrace(trace) {
  if(trace.descriptorEncoding!=='deflate-json-base64-v1')return structuredClone(trace);
  const descriptors=JSON.parse(inflateSync(Buffer.from(trace.descriptorData,'base64'),{maxOutputLength:2*1024*1024}).toString());
  const result=structuredClone(trace);
  result.candidates.forEach(c=>{c.descriptor=descriptors[c.descriptor.index];});
  delete result.descriptorData;delete result.descriptorEncoding;return result;
}
module.exports={buildObservationTrace,compactDescriptor,expandObservationTrace};
