const {createHash}=require('crypto');
const SCOPE='visible_eligible_media_in_captured_viewports';
// Evidence is deliberately scoped: absent/hidden nodes, pseudo-elements,
// inaccessible frames and undersized/clipped media are not certified complete.
function inspectMediaEvidence(rows,{position,origin,videoFrames=0}={}) {
  if(!Array.isArray(rows))throw Object.assign(new Error('Inspection média indisponible.'),{status:422,code:'structural_media_inspection_unavailable'});
  const missing=rows.filter(r=>r.pending || !r.naturalWidth || r.decodeFailure);
  const proof={position,origin,inspected:rows.length,knownMissing:missing.length,videoFrames,
    obligations:rows.slice(0,64).map(r=>({
      kind:['image','css_background','video_poster','video','video_pending_source'].includes(r.kind)?r.kind:'image',
      sourceHash:r.url?createHash('sha256').update(r.url).digest('hex'):null,
      sourceSelected:Boolean(r.url),state:r.pending?'pending':r.naturalWidth?'decoded_dimensions':'missing',
      rectangle:r.geometry?Object.fromEntries(['x','y','width','height'].map(k=>[k,Number.isFinite(r.geometry[k])?Math.round(r.geometry[k]*100)/100:null])):null,
    })),truncated:rows.length>64};
  if(missing.length)throw Object.assign(new Error('Média visible inspecté manquant : capture refusée avant Vision.'),{
    status:422,code:'structural_media_incomplete',mediaEvidence:{version:1,scope:SCOPE,complete:false,views:[proof]}});
  return proof;
}
function summarizeMediaEvidence(views) {
  return {version:1,scope:SCOPE,complete:views.length>0&&views.every(v=>v.knownMissing===0),
    inspectedViewports:views.length,inspectedOccurrences:views.reduce((n,v)=>n+v.inspected,0),
    knownMissing:views.reduce((n,v)=>n+v.knownMissing,0),
    eligibility:{minimumElementSidePx:120,minimumVisibleSidePx:32,minimumVisibleAreaPx:4096},
    uninspected:['hidden_or_absent_nodes','small_or_clipped_media','pseudo_elements','third_party_frame_contents',
      'non_http_css_backgrounds','additional_background_elements_reusing_same_source'],
    truncated:views.length>256||views.some(v=>v.truncated),views:views.slice(0,256)};
}
function inspectedMediaAreComplete(coverage) {
  const p=coverage?.mediaEvidence;
  return p?.version===1&&p.scope===SCOPE&&p.complete===true&&p.knownMissing===0&&p.inspectedViewports>0;
}
module.exports={inspectMediaEvidence,summarizeMediaEvidence,inspectedMediaAreComplete,SCOPE};
