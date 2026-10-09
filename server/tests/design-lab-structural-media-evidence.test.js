const test=require('node:test'),assert=require('node:assert/strict');
const {inspectMediaEvidence,summarizeMediaEvidence,inspectedMediaAreComplete}=require('../services/design-lab/structural-media-evidence');
const {createStructuralResourcePolicy}=require('../services/design-lab/structural-resource-policy');
const fs=require('node:fs');
test('secondary known media absent is rejected even with another decoded image and varied geometry',()=>{
 const painted={kind:'image',url:'https://fixture.test/hero',naturalWidth:1200,pending:false};
 assert.throws(()=>inspectMediaEvidence([painted,{...painted,url:'https://fixture.test/secondary',naturalWidth:0}]),e=>
  e.code==='structural_media_incomplete'&&e.mediaEvidence.views[0].knownMissing===1);
});
test('no image obligation is a valid void; opaque geometry and unavailable embeds are outside image completeness claims',()=>{
 const p=summarizeMediaEvidence([inspectMediaEvidence([],{position:0,origin:'fixed',videoFrames:1})]);
 assert.equal(inspectedMediaAreComplete({mediaEvidence:p}),true);assert.ok(p.uninspected.includes('third_party_frame_contents'));
 const opaque=inspectMediaEvidence([{kind:'image',url:'data:image/png;base64,secret',naturalWidth:200,pending:false}]);
 assert.equal(opaque.knownMissing,0);assert.doesNotMatch(JSON.stringify(opaque),/secret/);
 assert.equal(inspectedMediaAreComplete({complete:true,paintEvidence:{complete:true}}),false);
});
test('bounded evidence reports truncation without claiming all source media inspected',()=>{
 const p=summarizeMediaEvidence([inspectMediaEvidence(Array.from({length:70},()=>({naturalWidth:200,pending:false})))]);
 assert.equal(p.inspectedOccurrences,70);assert.equal(p.views[0].obligations.length,64);assert.equal(p.truncated,true);
});
test('online admission evidence distinguishes request type from proved future obligation; policy unchanged at 160',async()=>{
 const p=createStructuralResourcePolicy();const transport=async url=>({url,body:Buffer.alloc(1)});
 for(let i=0;i<160;i++)await p.fetch(`https://fixture.test/secondary-${i}?sensitive=hidden`,'fetch',transport,{});
 await assert.rejects(p.fetch('https://fixture.test/late','image',transport,{},true),e=>e.limitKind==='requests');
 const t=p.admissionTrace();assert.equal(t.policy,'unchanged');assert.equal(t.events.at(-1).decision,'refused_requests');
 assert.equal(t.events[0].obligationEvidence,'request_type_only');assert.equal(t.events.at(-1).selectedSourceCertified,false);
 assert.doesNotMatch(JSON.stringify(t),/sensitive|https:/);assert.equal(p.stats.uniqueRequests,160);
});
test('Chromium: actual missing secondary image, opaque painted image, intentional absence and inaccessible frame remain distinct',
 {skip:!fs.existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')},async()=>{
 const {inspectCaptureImagesDOM}=require('../services/design-lab/capture-image-visibility');
 const b=await require('playwright-core').chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const p=await b.newPage();await p.route('**/*',r=>r.abort());
 const src='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240"><rect width="400" height="240" fill="teal"/></svg>').toString('base64');
 try {
  await p.setContent(`<img width="400" height="240" src="${src}"><img width="400" height="240" src="https://fixture.test/missing">`);
  const rows=await p.evaluate(inspectCaptureImagesDOM,{visibleOnly:true,decode:true,diagnostics:true});
  assert.equal(rows.length,2);assert.ok(rows.some(r=>r.naturalWidth));assert.throws(()=>inspectMediaEvidence(rows),e=>e.code==='structural_media_incomplete');
  await p.setContent(`<img width="400" height="240" style="transform:rotateY(20deg)" src="${src}">`);
  assert.equal(inspectMediaEvidence(await p.evaluate(inspectCaptureImagesDOM,{visibleOnly:true,decode:true,diagnostics:true})).knownMissing,0);
  await p.setContent('<h1>Intentional text-only composition</h1><img hidden width="400" height="240"><iframe src="https://fixture.test/inaccessible"></iframe>');
  assert.equal(inspectMediaEvidence(await p.evaluate(inspectCaptureImagesDOM,{visibleOnly:true,diagnostics:true})).inspected,0);
 }finally{await b.close();}
});
