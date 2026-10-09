/* global document, window, getComputedStyle, innerWidth, innerHeight, NodeFilter */
const sharp = require('sharp');
// A render gate, not an artistic density/colour criterion. Sparse white pages
// with even a small painted text/image pass. Empty hydration roots do not.
function mainPaintDOM() {
  const parent = n => n.assignedSlot || n.parentElement || n.getRootNode()?.host || null;
  const roots = [document.documentElement, document.body, ...(document.body?.children || [])]
    .filter(n => n && !n.matches('script,style,link')).slice(0, 12).map(n => {
      const s = getComputedStyle(n), r = n.getBoundingClientRect();
      return { tag: n.localName, id: n.id, opacity: s.opacity, visibility: s.visibility,
        display: s.display, transform: s.transform, animation: s.animation, transition: s.transition,
        rect: { x: r.x, y: r.y, width: r.width, height: r.height } };
    });
  let painted = 0, paintedText = 0, hidden = 0, paintedBackgrounds = 0, examined = 0;
  const mains=[...document.querySelectorAll('main,[role="main"]')].filter(n=>{const r=n.getBoundingClientRect();return r.height>0&&r.top<innerHeight&&r.bottom>0;});
  const scopes=mains.length?mains:[document.body].filter(Boolean);
  const walkers = scopes.map(root=>({walker:document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT),first:true}));
  while (walkers.length && examined++ < 6000) {
    const entry=walkers.at(-1),n=entry.first?entry.walker.currentNode:entry.walker.nextNode();entry.first=false;
    if (!n) { walkers.pop(); continue; }
    if (n.shadowRoot) walkers.push({walker:document.createTreeWalker(n.shadowRoot, NodeFilter.SHOW_ELEMENT),first:false});
    if(n.nodeType!==1)continue;
    if (n.matches('script,style,link,meta,source,iframe')) continue;
    const r = n.getBoundingClientRect(), s = getComputedStyle(n);
    if (r.width < 2 || r.height < 2 || r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) continue;
    const text = [...n.childNodes].some(c => {
      if(c.nodeType!==3||!c.textContent.trim())return false;
      const range=document.createRange();range.selectNodeContents(c);
      return [...range.getClientRects()].some(r=>r.width>=2&&r.height>=2&&r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight);
    });
    const primitive = text || n.matches('img,svg,canvas,video,input,button') || s.backgroundImage !== 'none';
    const background = !n.matches('html,body') && s.backgroundColor!=='rgba(0, 0, 0, 0)' && s.backgroundColor!=='transparent';
    if (!primitive&&!background) continue;
    let opacity = 1, visible = true;
    for (let p = n; p; p = parent(p)) {
      const css = getComputedStyle(p); opacity *= Number(css.opacity);
      if (css.display === 'none' || ['hidden','collapse'].includes(css.visibility) || opacity <= .01) visible = false;
      if (/^blur\(/.test(css.filter) && parseFloat(css.filter.slice(5)) > Math.max(r.width, r.height)) visible = false;
    }
    if (visible) {if(primitive)painted++;if(text)paintedText++;if(background)paintedBackgrounds++;} else if(primitive)hidden++;
  }
  return { painted, paintedText, hidden, paintedBackgrounds, roots, reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches };
}
async function waitForMainPaint(page, deadline, { requireContent = false } = {}) {
  const started = Date.now(), end = Math.min(deadline, started + 5000);
  let proof;
  do {
    proof = await page.evaluate(mainPaintDOM);
    if (proof.painted > 0 || (proof.paintedBackgrounds>0&&proof.hidden===0) || (!requireContent && proof.hidden === 0)) return { ...proof, waitedMs: Date.now() - started };
    if (Date.now() >= end) break;
    await page.waitForTimeout(Math.min(100, end - Date.now()));
  } while (Date.now() < end);
  throw Object.assign(new Error('Contenu principal non peint : capture refusée avant gel.'), {
    status: 422, code: 'structural_main_content_invisible', paintReadiness: { ...proof, waitedMs: Date.now() - started },
  });
}
async function bufferPaintProof(buffer) {
  const {data,info}=await sharp(buffer).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const minimum=Array(info.channels).fill(255),maximum=Array(info.channels).fill(0);
  for(let i=0;i<data.length;i++) {const c=i%info.channels; minimum[c]=Math.min(minimum[c],data[i]);maximum[c]=Math.max(maximum[c],data[i]);}
  const ranges=maximum.map((v,i)=>v-minimum[i]);
  return {width:info.width,height:info.height,ranges,minimum,nonUniform:ranges.some(v=>v>2)};
}
async function assertPaintedBatch(buffers) {
  const proofs=await Promise.all(buffers.map(bufferPaintProof));
  if (!proofs.some(p=>p.nonUniform)&&new Set(proofs.map(p=>p.minimum.join(','))).size<2) throw Object.assign(new Error('Lot de captures visuellement vide : Vision interdit.'), {
    status:422,code:'structural_empty_visual_capture',paintProofs:proofs,
  });
  return proofs;
}
module.exports={mainPaintDOM,waitForMainPaint,bufferPaintProof,assertPaintedBatch};
