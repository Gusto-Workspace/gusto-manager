/* global window, document, HTMLMediaElement, MutationObserver, requestAnimationFrame, getComputedStyle, innerWidth, innerHeight */
function isVideoResourceDOM(url) {
  return [...document.querySelectorAll('video')].some(video=>[
    video.currentSrc,video.getAttribute('src'),video.getAttribute('data-src'),
    ...[...video.querySelectorAll('source')].flatMap(source=>[source.getAttribute('src'),source.getAttribute('data-src')]),
  ].filter(Boolean).some(value=>{
    try {const source=new URL(value,document.baseURI),requested=new URL(url);source.hash='';requested.hash='';return source.href===requested.href;}
    catch {return false;}
  }));
}
function installVideoCaptureDOM() {
  const records=new Map(),play=HTMLMediaElement.prototype.play;
  const registry=window.__gustoVideoCapture={records,play};
  const sourceOf=video=>video.currentSrc||video.src||video.querySelector('source[src]')?.src||'';
  const ready=video=>{
    const record=records.get(video);
    if(registry.restoring||!record||record.frozen||video.readyState<2||!video.videoWidth)return;
    video.pause();record.frozen=true;record.source=sourceOf(video);record.time=video.currentTime;
    record.posterCertified=false;
    video.preload='metadata';
    window.__gustoVideoFrameReady?.(record.source).catch(()=>{});
  };
  const attach=video=>{
    if(records.has(video))return;
    const record={preload:video.getAttribute('preload'),autoplay:video.autoplay,paused:video.paused,frozen:false};records.set(video,record);
    record.playing=()=>{
      record.posterCertified=false;
      if(!record.frozen&&video.readyState>=2)record.decoded?.();
    };video.addEventListener('play',record.playing);
    record.seeking=()=>{record.posterCertified=false;};video.addEventListener('seeking',record.seeking);
    // Keep native decoding and layout. Pause only after a decoded frame has
    // crossed paint ticks; autoplay/JS play cannot restart a certified frame.
    const decoded=()=>{
      if(record.posterCertified)return;
      const source=video.currentSrc||video.src;
      if(video.requestVideoFrameCallback)record.frameCallback=video.requestVideoFrameCallback((_now,metadata)=>{
        if(source!==(video.currentSrc||video.src))return;
        record.presentedFrames=metadata.presentedFrames;record.mediaTime=metadata.mediaTime;ready(video);
      });
      else requestAnimationFrame(()=>requestAnimationFrame(()=>ready(video)));
    };
    record.decoded=decoded;video.addEventListener('loadeddata',decoded);
    record.loading=()=>{
      // A late loadstart must not invalidate a frame already presented for the
      // same source. A genuine source replacement always needs a new proof.
      if(record.source!==sourceOf(video)){record.frozen=false;record.presentedFrames=null;record.posterCertified=false;}
    };video.addEventListener('loadstart',record.loading);
    if(video.readyState>=2)decoded();
  };
  HTMLMediaElement.prototype.play=function(...args){
    const record=records.get(this);
    if(this.tagName==='VIDEO'&&record?.frozen&&record.source===sourceOf(this))return Promise.resolve();
    if(record?.frozen)record.frozen=false;
    return play.apply(this,args);
  };
  const scan=()=>document.querySelectorAll('video').forEach(attach);
  registry.observer=new MutationObserver(scan);registry.observer.observe(document,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',scan,{once:true});scan();
}
async function visibleVideoDOM() {
  const registry=window.__gustoVideoCapture,proofs=[];
  for(const video of document.querySelectorAll('video')) {
    const r=video.getBoundingClientRect();if(r.width<120||r.height<120||r.bottom<=0||r.top>=innerHeight||r.right<=0||r.left>=innerWidth)continue;
    let visible=true;for(let p=video;p;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)<=.01)visible=false;}if(!visible)continue;
    const before={x:r.x,y:r.y,width:r.width,height:r.height};
    const record=registry?.records.get(video);
    const poster=video.getAttribute('poster')?.trim();
    let posterValid=false;
    const nativePoster=poster&&video.readyState<2;
    const source=video.currentSrc||video.getAttribute('src')||video.querySelector('source[src]')?.getAttribute('src');
    // A decoded poster is not proof that an actively requested video resolved.
    // Only a deliberate poster-only state may substitute for a decoded frame.
    // Failed/pending autoplay or preload must not certify a loading placeholder.
    if(nativePoster&&source&&(video.error||video.networkState===3||video.networkState===2||!video.paused||video.autoplay||video.preload!=='none'))throw Error('visible_video_unresolved_despite_poster');
    if(nativePoster){const image=new Image();image.src=new URL(poster,document.baseURI).href;
      await Promise.race([image.decode().then(()=>{posterValid=!!image.naturalWidth;}).catch(()=>{}),new Promise(resolve=>setTimeout(resolve,500))]);}
    const decoded=!posterValid&&video.readyState>=2&&video.videoWidth>0;
    if(!decoded&&!posterValid)throw Error('visible_video_without_decoded_frame_or_poster');
    if(decoded&&video.requestVideoFrameCallback&&!(record?.frozen&&video.paused&&Math.abs(record.time-video.currentTime)<=.001&&record.presentedFrames>0&&record.source===(video.currentSrc||video.src))){
      if(!record)throw Error('video_frame_registry_missing');
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{video.cancelVideoFrameCallback(callback);reject(Error('video_frame_not_presented'));},1500);
        const callback=video.requestVideoFrameCallback((_now,metadata)=>{
          clearTimeout(timer);record.presentedFrames=metadata.presentedFrames;record.mediaTime=metadata.mediaTime;resolve();
        });
        // A paused media element emits no next-frame callback. A same-time
        // seek asks Chromium to present its existing decoded frame, without
        // advancing playback or substituting pixels for a proof.
        if(video.paused)video.currentTime=video.currentTime;
      });
    }
    video.pause();
    if(record){record.frozen=true;record.source=video.currentSrc||video.src;record.time=video.currentTime;record.posterCertified=posterValid;record.poster=poster;video.preload='metadata';}
    if(decoded)await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    await window.__gustoVideoFrameReady?.(video.currentSrc||video.src);
    const next=video.getBoundingClientRect();
    if(['x','y','width','height'].some(k=>Math.abs(next[k]-before[k])>.5))throw Error('video_freeze_layout_changed');
    proofs.push({index:[...document.querySelectorAll('video')].indexOf(video),source:video.currentSrc||video.src,poster:poster||null,mechanism:decoded?'decoded_frame_paused':'native_poster',
      geometry:before,readyState:video.readyState,videoWidth:video.videoWidth,videoHeight:video.videoHeight,currentTime:video.currentTime,paused:video.paused,presentedFrames:record?.presentedFrames||null,mediaTime:record?.mediaTime??null});
  }
  return proofs;
}
function restoreVideoDOM() {
  const registry=window.__gustoVideoCapture;if(!registry)return {restored:true,count:0};
  registry.restoring=true;registry.observer.disconnect();HTMLMediaElement.prototype.play=registry.play;
  for(const [video,record] of registry.records){video.removeEventListener('loadeddata',record.decoded);
    video.removeEventListener('loadstart',record.loading);
    video.removeEventListener('play',record.playing);video.removeEventListener('seeking',record.seeking);
    if(record.frameCallback)video.cancelVideoFrameCallback?.(record.frameCallback);
    if(record.preload===null)video.removeAttribute('preload');else video.setAttribute('preload',record.preload);
    if((record.autoplay||!record.paused)&&video.isConnected)registry.play.call(video).catch(()=>{});
  }
  delete window.__gustoVideoCapture;return {restored:true,count:registry.records.size};
}
function verifyVideoDOM(proofs) {
  const failures=[];
  for(const proof of proofs){const video=[...document.querySelectorAll('video')][proof.index];
    if(!video||(video.currentSrc||video.src)!==proof.source){failures.push('video_source_changed');continue;}
    const r=video.getBoundingClientRect();if(['x','y','width','height'].some(k=>Math.abs(r[k]-proof.geometry[k])>.5))failures.push('video_geometry_changed');
    if(proof.mechanism==='decoded_frame_paused'&&(!video.paused||Math.abs(video.currentTime-proof.currentTime)>.001||video.readyState<2))failures.push('video_frame_changed');
    const record=window.__gustoVideoCapture?.records.get(video);
    if(proof.mechanism==='native_poster'&&(video.getAttribute('poster')?.trim()!==proof.poster||!record?.posterCertified||video.readyState>=2||!video.paused))failures.push('video_poster_changed');
  }
  return {valid:!failures.length,failures};
}
function videoStateDOM(){
  return [...document.querySelectorAll('video')].map((v,index)=>{
    const r=v.getBoundingClientRect(),s=getComputedStyle(v),record=window.__gustoVideoCapture?.records.get(v);
    return {index,currentSrc:v.currentSrc,src:v.getAttribute('src'),sources:[...v.querySelectorAll('source')].map(n=>({src:n.getAttribute('src'),media:n.getAttribute('media'),type:n.getAttribute('type')})),
      poster:v.getAttribute('poster'),readyState:v.readyState,networkState:v.networkState,error:v.error?{code:v.error.code,message:v.error.message}:null,
      videoWidth:v.videoWidth,videoHeight:v.videoHeight,paused:v.paused,currentTime:v.currentTime,preload:v.preload,autoplay:v.autoplay,
      rect:{x:r.x,y:r.y,width:r.width,height:r.height},style:{display:s.display,visibility:s.visibility,opacity:s.opacity},
      frameRecord:record?{frozen:record.frozen,source:record.source,presentedFrames:record.presentedFrames,posterCertified:record.posterCertified}:null};
  });
}
// Observe a refused gate in the same DOM task; never retry it or change its
// evidence requirements. Successful results remain the original proof array.
const inspectVisibleVideoDOM=new Function('args',`
  const capture=${visibleVideoDOM.toString()},state=${videoStateDOM.toString()};
  return capture().then(views=>({valid:true,views})).catch(error=>({valid:false,reason:error.message,media:state()}));
`);
module.exports={isVideoResourceDOM,installVideoCaptureDOM,visibleVideoDOM,inspectVisibleVideoDOM,videoStateDOM,restoreVideoDOM,verifyVideoDOM};
