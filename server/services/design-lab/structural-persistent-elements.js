/* global window, document, getComputedStyle, innerWidth, innerHeight */
// Only verified peripheral controls are hidden for a single screenshot.
// Never remove DOM, alter layout, stop motion, or hide a structural landmark.
function persistentVisibilityDOM({ mode, token, elements = [], tolerance = 2,
  stateKey = '__gustoStructuralHidden', registryKey = '__gustoStructuralPositioned' }) {
  // A visibility mutation can itself create a discrete CSS transition. Finish
  // only this property on the certified layer; never stop layout/transform,
  // autoplay, or existing page animations. Repeat for the restoring mutation.
  const finishVisibilityTransitions=node=>{
    getComputedStyle(node).visibility;
    let count=0;
    for(const animation of node.getAnimations())if(animation.transitionProperty==='visibility'&&animation.effect?.target===node&&animation.playState!=='finished'){
      animation.finish();count++;
    }
    return count;
  };
  const current = window[stateKey];
  if (mode === "restore") {
    if (!current || current.token !== token) return {ids:[],stylesRestored:false};
    const exact=[];
    for (const entry of current.styles) {
      const { node, value, priority, attribute, properties }=entry;
      // Restore the original serialization too, without overwriting unrelated
      // style changes made by the live page during the transaction.
      const otherProperties=properties.filter(([key])=>key!=="visibility");
      const unchanged = [...node.style].filter(key=>key!=="visibility").length === otherProperties.length && otherProperties.every(([key, val, pri]) =>
        node.style.getPropertyValue(key) === val && node.style.getPropertyPriority(key) === pri);
      if (unchanged) {
        exact.push({node,attribute});
      }
      if (value) node.style.setProperty("visibility", value, priority);
      else node.style.removeProperty("visibility");
    }
    const stylesRestored=current.styles.every(({node,value,priority})=>node.isConnected&&
      node.style.getPropertyValue('visibility')===value&&node.style.getPropertyPriority('visibility')===priority);
    for(const {node,attribute}of exact){if(attribute===null)node.removeAttribute('style');else node.setAttribute('style',attribute);}
    for(const sheet of current.sheets||[])sheet.remove();
    for(const {node,value}of current.attributes||[]){
      if(value===null)node.removeAttribute('data-gusto-structural-pseudo-mask');
      else node.setAttribute('data-gusto-structural-pseudo-mask',value);
    }
    const visibilityTransitionsFinished=current.styles.reduce((sum,{node})=>sum+finishVisibilityTransitions(node),0);
    delete window[stateKey];
    return {ids:current.ids,stylesRestored,visibilityTransitionsFinished};
  }
  if (mode === "verify") {
    if (!current || current.token !== token) return { valid:false, reason:"visibility_transaction_missing" };
    const violations=[];
    for(const {node}of current.styles){
      const detail=(kind,css)=>({tag:node.tagName,kind,visibility:css?.visibility,
        content:css?.content,transitionProperty:css?.transitionProperty,transitionDuration:css?.transitionDuration});
      if(!node.isConnected){violations.push({tag:node.tagName,kind:"disconnected"});continue;}
      const css=getComputedStyle(node);
      if(css.visibility!=="hidden")violations.push(detail("element",css));
      for(const pseudo of ["::before","::after"]){const s=getComputedStyle(node,pseudo);
        if(!["none","normal"].includes(s.content)&&s.visibility!=="hidden")violations.push(detail(pseudo,s));}
    }
    return {valid:!violations.length,ids:current.ids,reason:violations.length?"painted_descendant_not_hidden":null,violations};
  }
  if (current) throw new Error("Persistent screenshot visibility already active");
  const styles = [], ids = [], skipped = [], saved = new Set(),attributes=[],sheets=[],roots=new Set();
  for (const expected of elements) {
    const node = window[registryKey]?.elements.get(expected.id);
    if (!node?.isConnected || `persistent${window[registryKey]?.nodes.get(node)}` !== expected.id) {
      skipped.push({ id:expected.id, reason:"element_disappeared" }); continue;
    }
    const children = [], scopes = [node];
    while(scopes.length){const scope=scopes.pop();if(scope.shadowRoot)scopes.push(scope.shadowRoot);
      for(const child of scope.children||[]){children.push(child);scopes.push(child);}}
    const drawn = (n) => {for(let p=n;p;p=p.assignedSlot||p.parentElement||p.getRootNode().host){const s=getComputedStyle(p);
      if(s.display==='none'||['hidden','collapse'].includes(s.visibility)||Number(s.opacity)<=.01)return false;}
      const r=n.getBoundingClientRect();return r.width>0&&r.height>0;};
    const landmark = (n) => n.matches('header,nav,main,footer,section,article,h1,[role="navigation"],[role="main"]') ||
      (n.matches('[role="banner"]') && n.getBoundingClientRect().top<=innerHeight*.15 && n.getBoundingClientRect().width>=innerWidth*.6);
    const css = getComputedStyle(node);
    if (children.length > 128 || !["fixed","sticky"].includes(css.position) ||
      landmark(node) ||
      children.some(n=>landmark(n)&&drawn(n))) {
      skipped.push({id:expected.id,reason:"structural_or_changed_layer"}); continue;
    }
    const own = node.getBoundingClientRect();
    // Certify painted extents, including rectangular ancestor overflow. A
    // clipped control label is not a visible protrusion of the widget. Follow
    // containing blocks so escaped fixed/absolute descendants are not clipped
    // by an unrelated ancestor. Unsupported clipping is never guessed.
    const painted = (n) => {
      if(!drawn(n))return null;
      const raw=n.getBoundingClientRect();let left=Math.max(0,raw.left),right=Math.min(innerWidth,raw.right),
        top=Math.max(0,raw.top),bottom=Math.min(innerHeight,raw.bottom),escaped=null;
      for(let p=n;p;p=p.assignedSlot||p.parentElement||p.getRootNode().host){
        const s=getComputedStyle(p),b=p.getBoundingClientRect();
        if(s.clipPath!=="none"||s.clip!=="auto")return null;
        const containing=s.transform!=="none"||s.perspective!=="none"||s.filter!=="none"||
          /paint|layout|strict|content/.test(s.contain)||/transform|perspective|filter/.test(s.willChange);
        const applies=!escaped||containing||(escaped==="absolute"&&s.position!=="static");
        if(applies)escaped=null;
        if(p!==n&&applies&&/(hidden|clip|scroll|auto)/.test(s.overflowX)){left=Math.max(left,b.left);right=Math.min(right,b.right);}
        if(p!==n&&applies&&/(hidden|clip|scroll|auto)/.test(s.overflowY)){top=Math.max(top,b.top);bottom=Math.min(bottom,b.bottom);}
        if(["absolute","fixed"].includes(s.position))escaped=s.position;
      }
      return right>left&&bottom>top?{left,right,top,bottom}:null;
    };
    if([node,...children].some(n=>drawn(n)&&(getComputedStyle(n).clipPath!=="none"||getComputedStyle(n).clip!=="auto"))){
      skipped.push({id:expected.id,reason:"unsupported_mask_clipping"});continue;
    }
    const boxes = [...(own.width > 0 && own.height > 0 ? [own] : []),...children
      .map(painted).filter(Boolean)];
    if (!boxes.length) { skipped.push({id:expected.id,reason:"no_visible_geometry"}); continue; }
    const x=Math.max(0,Math.min(...boxes.map((r)=>r.left))), y=Math.max(0,Math.min(...boxes.map((r)=>r.top)));
    const rect={x,y,width:Math.min(innerWidth,Math.max(...boxes.map((r)=>r.right)))-x,
      height:Math.min(innerHeight,Math.max(...boxes.map((r)=>r.bottom)))-y};
    if (!['x','y','width','height'].every((k)=>Math.abs(rect[k]-expected.rect[k])<=tolerance) ||
      children.some((n)=>{if(!n.matches('img,video,canvas,svg')||!drawn(n))return false;const r=n.getBoundingClientRect();
        return Math.min(r.width,r.height)>=64&&r.width*r.height>=rect.width*rect.height*.15;})) {
      skipped.push({id:expected.id,reason:"geometry_or_composition_changed",expected:expected.rect,actual:rect}); continue;
    }
    ids.push(expected.id);
    for (const n of [node,...children]) {
      if (saved.has(n)) continue;
      saved.add(n);
      styles.push({node:n,attribute:n.getAttribute("style"),properties:[...n.style].map(key=>[key,n.style.getPropertyValue(key),n.style.getPropertyPriority(key)]),value:n.style.getPropertyValue("visibility"),priority:n.style.getPropertyPriority("visibility")});
      attributes.push({node:n,value:n.getAttribute('data-gusto-structural-pseudo-mask')});
      n.setAttribute('data-gusto-structural-pseudo-mask',token);
      roots.add(n.getRootNode());
      n.style.setProperty("visibility","hidden","important");
    }
  }
  // Pseudo-elements may explicitly override inherited visibility. Scope the
  // temporary rule to exactly these certified nodes, in their own document or
  // open shadow root. The verifier still refuses any painted escape.
  for(const root of roots){
    const sheet=document.createElement('style');
    const marker=`[data-gusto-structural-pseudo-mask="${token}"]`;
    const selector=marker+`:not(#gusto-unused-${token})`.repeat(8);
    sheet.textContent=`${selector}::before,${selector}::after{visibility:hidden!important}`;
    (root===document?document.head:root).appendChild(sheet);sheets.push(sheet);
  }
  window[stateKey] = {token,styles,ids,attributes,sheets};
  const visibilityTransitionsFinished=styles.reduce((sum,{node})=>sum+finishVisibilityTransitions(node),0);
  return {ids,skipped,visibilityTransitionsFinished};
}
module.exports = {persistentVisibilityDOM};
