const {structuralAnalysisSchema,VIEW_TYPES}=require('../../services/design-lab/structural-reference.contract');
function value(schema) {
  if(schema.type==='object')return Object.fromEntries(Object.entries(schema.properties).map(([k,s])=>[k,value(s)]));
  if(schema.type==='array')return Array.from({length:Math.max(1,schema.minItems||0)},()=>value(schema.items));
  if(schema.type==='integer')return schema.minimum;
  return schema.enum?.[0]||'Observation spatiale de fixture locale.';
}
function analysisV1() {
  const a=value(structuralAnalysisSchema);
  a.structuralMoments[0].order=1;a.rhythmSequence[0].order=1;
  a.rhythmSequence[0].startPercent=0;a.rhythmSequence[0].endPercent=100;
  Object.assign(a.structuralMoments[0].evidence,{startPercent:0,endPercent:100,sourceViews:['visionOverview','top','middle','bottom']});
  return a;
}
function reference() {
  return {_id:'507f1f77bcf86cd799439011',title:'Local fixture',slug:'local-fixture',domain:'fixture.test',sourceType:'manual_url',sourceUrl:'https://fixture.test/',status:'analyzed',
    analysis:analysisV1(),operationToken:'',captureSanitization:{version:3,qualityPassed:true,blockingOverlayDetected:false,sanitizedAt:new Date()},
    captureCoverage:{version:2,captureStrategy:'continuous',totalHeight:3000,viewportHeight:900,complete:true,reachedEnd:true,distinctViews:true,
      mediaEvidence:{version:1,scope:'visible_eligible_media_in_captured_viewports',complete:true,knownMissing:0,inspectedViewports:3},
      paintEvidence:{version:1,complete:true},visionCleanliness:{version:1,policy:'exclude_nonstructural_persistent_v1',complete:true,restorationVerified:true},
      positions:[0,1050,2100].map((position,i)=>({role:['top','middle','bottom'][i],position,visibleRangePx:[position,position+900],stabilized:true}))},
    captures:VIEW_TYPES.map(type=>({type,url:`https://fixture.test/${type}.webp`,publicId:type,viewport:{width:1440,height:900},
      sourceRect:{left:0,top:{top:0,middle:1050,bottom:2100}[type]||0,width:1440,height:['desktop_full','visionOverview'].includes(type)?3000:900}}))};
}
module.exports={analysisV1,reference};
