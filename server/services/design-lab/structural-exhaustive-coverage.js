// Coverage is about recorded pixels, never about inferred sections or 8/10 scores.
const {digest}=require('./structural-original-evidence');
const {coverageIsComplete,traversalStoryboard}=require('./structural-page-capture.service');
const {capturesAreClean}=require('./capture-sanitization.service');
const {inspectedMediaAreComplete}=require('./structural-media-evidence');
const {visionInputsAreClean}=require('./structural-vision-cleanup.service');
function intervals(rows,total) {
  let end=0;const gaps=[];
  for(const r of [...rows].sort((a,b)=>a.visibleRangePx[0]-b.visibleRangePx[0])) {
    if(r.visibleRangePx[0]>end+8)gaps.push([end,r.visibleRangePx[0]]);
    end=Math.max(end,r.visibleRangePx[1]);
  }
  if(end<total-5)gaps.push([end,total]);return gaps;
}
async function buildExhaustiveCoverage(evidence) {
  const {manifest,observations}=evidence,coverage=manifest.captureCoverage,total=coverage?.totalHeight;
  const seen=new Set(),equivalent=new Map(),states=[];
  for(const o of observations) {
    if(seen.has(o.id)||!Buffer.isBuffer(o.buffer)||digest(o.buffer)!==o.sha256||!Number.isFinite(o.position)||
      o.visibleRangePx?.[0]!==o.position||o.visibleRangePx[1]<=o.position||o.visibleRangePx[1]>total||o.width<1||o.height<1)
      throw Error('Invalid or changed original evidence');
    seen.add(o.id);
    const key=JSON.stringify([o.sha256,o.width,o.height,o.sourceCrop]);
    const representative=equivalent.get(key)||o.id;equivalent.set(key,representative);
    states.push({id:o.id,origin:o.origin,capturedAt:o.capturedAt,position:o.position,visibleRangePx:o.visibleRangePx,
      width:o.width,height:o.height,format:o.format,sha256:o.sha256,sourceCrop:o.sourceCrop,
      representativeId:representative,equivalenceProof:representative===o.id?null:{kind:'identical_original_bytes_and_crop',sha256:o.sha256},
      overlappingIds:[],sectionIdentity:'unknown',presentation:'not_presented',interpretation:'not_read',
      mediaEvidence:o.mediaEvidence,externalEmbeds:o.externalEmbeds||[],limits:['sampled_static_state_not_motion_observation']});
  }
  for(const s of states)s.overlappingIds=states.filter(t=>t.id!==s.id&&Math.min(t.visibleRangePx[1],s.visibleRangePx[1])>Math.max(t.visibleRangePx[0],s.visibleRangePx[0])).map(t=>t.id);
  const gaps=total>0?intervals(states,total):[[0,null]];
  const problems=[];
  if(manifest.state!=='captured'||!coverageIsComplete({captureCoverage:coverage}))problems.push('capture_not_complete');
  if(!capturesAreClean({captureSanitization:manifest.captureSanitization})||!visionInputsAreClean(coverage))problems.push('cleanliness_not_certified');
  if(!inspectedMediaAreComplete(coverage)||states.some(s=>s.mediaEvidence?.knownMissing!==0))problems.push('eligible_media_not_certified');
  if(coverage?.paintEvidence?.complete!==true)problems.push('paint_not_certified');
  if(gaps.length)problems.push('original_pixel_coverage_gaps');
  if(!states.length)problems.push('originals_missing');
  const unavailableEmbeds=states.flatMap(s=>s.externalEmbeds).filter((e,i,a)=>a.findIndex(t=>JSON.stringify(t)===JSON.stringify(e))===i);
  const representatives=states.filter(s=>s.representativeId===s.id).sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id));
  const viewport=manifest.localMetadata?.viewport||observations[0]?.viewport;
  const storyboard=representatives.length?await traversalStoryboard(representatives.map(s=>({id:s.id,position:s.position,visibleHeight:s.visibleRangePx[1]-s.position,buffer:observations.find(o=>o.id===s.id).buffer})),viewport,total):null;
  return {version:1,generationId:manifest.generationId,totalHeight:total,viewport,states,representativeIds:representatives.map(s=>s.id),
    capturedStateCount:states.length,distinctPixelStates:representatives.length,coverageGapsPx:gaps,
    captureCertified:problems.length===0,certificationScope:'captured_eligible_pixels_not_all_possible_website_states',
    blockers:problems,unavailableEmbeds,notObservable:coverage?.mediaEvidence?.uninspected||[],
    interpretationComplete:false,artisticCertification:'not_evaluated',storyboard};
}
module.exports={buildExhaustiveCoverage,intervals};
