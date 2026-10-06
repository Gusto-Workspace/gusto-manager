/* global window, document, getComputedStyle, innerWidth, innerHeight */
// Only verified peripheral controls are hidden for a single local screenshot.
// Never remove DOM, alter layout, stop motion, or hide a structural landmark.
function persistentVisibilityDOM({ mode, token, elements = [], tolerance = 2 }) {
  const current = window.__gustoStructuralHidden;
  if (mode === "restore") {
    if (!current || current.token !== token) return [];
    for (const { node, value, priority } of current.styles) {
      if (value) node.style.setProperty("visibility", value, priority);
      else node.style.removeProperty("visibility");
    }
    delete window.__gustoStructuralHidden;
    return current.ids;
  }
  if (current) throw new Error("Persistent screenshot visibility already active");
  const styles = [], ids = [], skipped = [], saved = new Set();
  for (const expected of elements) {
    const node = window.__gustoStructuralPositioned?.elements.get(expected.id);
    if (!node?.isConnected || `persistent${window.__gustoStructuralPositioned?.nodes.get(node)}` !== expected.id) {
      skipped.push({ id:expected.id, reason:"element_disappeared" }); continue;
    }
    const children = [...node.querySelectorAll("*")];
    const drawn = (n) => {for(let p=n;p;p=p.assignedSlot||p.parentElement||p.getRootNode().host){const s=getComputedStyle(p);
      if(s.display==='none'||['hidden','collapse'].includes(s.visibility)||Number(s.opacity)<=.01)return false;}
      const r=n.getBoundingClientRect();return r.width>0&&r.height>0;};
    const landmark = (n) => n.matches('header,nav,main,footer,section,article,h1,[role="navigation"],[role="main"]') ||
      (n.matches('[role="banner"]') && n.getBoundingClientRect().top<=innerHeight*.15 && n.getBoundingClientRect().width>=innerWidth*.6);
    const css = getComputedStyle(node);
    if (children.length > 128 || !["fixed","sticky"].includes(css.position) ||
      landmark(node) ||
      [...node.querySelectorAll('header,nav,main,footer,section,article,h1,[role="banner"],[role="navigation"],[role="main"]')].some(n=>landmark(n)&&drawn(n))) {
      skipped.push({id:expected.id,reason:"structural_or_changed_layer"}); continue;
    }
    const own = node.getBoundingClientRect();
    const boxes = [...(own.width > 0 && own.height > 0 ? [own] : []),...children
      .filter((n)=>{for(let p=n;p&&p!==node;p=p.parentElement||p.getRootNode().host){const s=getComputedStyle(p);
        if(s.display==="none"||s.visibility==="hidden"||Number(s.opacity)<=.01)return false;}return true;})
      .map((n)=>n.getBoundingClientRect()).filter((r)=>r.width>0&&r.height>0)];
    if (!boxes.length) { skipped.push({id:expected.id,reason:"no_visible_geometry"}); continue; }
    const x=Math.max(0,Math.min(...boxes.map((r)=>r.left))), y=Math.max(0,Math.min(...boxes.map((r)=>r.top)));
    const rect={x,y,width:Math.min(innerWidth,Math.max(...boxes.map((r)=>r.right)))-x,
      height:Math.min(innerHeight,Math.max(...boxes.map((r)=>r.bottom)))-y};
    if (!['x','y','width','height'].every((k)=>Math.abs(rect[k]-expected.rect[k])<=tolerance) ||
      children.some((n)=>{if(!n.matches('img,video,canvas,svg')||!drawn(n))return false;const r=n.getBoundingClientRect();
        return Math.min(r.width,r.height)>=64&&r.width*r.height>=rect.width*rect.height*.15;})) {
      skipped.push({id:expected.id,reason:"geometry_or_composition_changed"}); continue;
    }
    ids.push(expected.id);
    for (const n of [node,...children]) {
      if (saved.has(n)) continue;
      saved.add(n);
      styles.push({node:n,value:n.style.getPropertyValue("visibility"),priority:n.style.getPropertyPriority("visibility")});
      n.style.setProperty("visibility","hidden","important");
    }
  }
  window.__gustoStructuralHidden = {token,styles,ids};
  return {ids,skipped};
}
module.exports = {persistentVisibilityDOM};
