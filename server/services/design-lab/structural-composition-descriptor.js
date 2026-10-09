// Numeric geometry, not a classifier of artistic meaning. No text content,
// domain, colour, image identity or page position enters these features.
const clip = n => Math.max(0, Math.min(1, n));
const average = values => values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;
function compositionFeatures(measures, legacy, unionArea) {
  const {width,height}=measures.viewport, screenArea=width*height;
  const images=measures.masses.filter(r=>r.kind==='image');
  const lines=measures.lines;
  const textMasses=measures.masses.filter(r=>r.kind==='text');
  const rectArea=r=>Math.max(0,r.width)*Math.max(0,r.height);
  const largest=rects=>clip(Math.max(0,...rects.map(rectArea))/screenArea);
  const fields={text:legacy.occupation.slice(0,64),image:legacy.occupation.slice(64,128),void:legacy.occupation.slice(128,192)};
  const central=(v,index)=>Math.floor(index/8)>=2&&Math.floor(index/8)<6&&index%8>=2&&index%8<6;
  const topology=Object.values(fields).flatMap(v=>[average(v.filter(central)),average(v.filter((n,i)=>!central(n,i)))]);
  const offsets=[];
  for(const group of measures.groups||[]) {
    const sorted=[...group.members].sort((a,b)=>a.x-b.x||a.y-b.y);
    for(let i=1;i<sorted.length;i++) {
      const a=sorted[i-1],b=sorted[i];
      if(Math.min(a.y+a.height,b.y+b.height)>Math.max(a.y,b.y)&&b.x>=a.x+a.width)
        offsets.push(clip(Math.abs(a.y-b.y)/height));
    }
  }
  const overlaps=[];
  for(const t of textMasses) for(const image of images) {
    const x=Math.max(t.x,image.x),y=Math.max(t.y,image.y);
    const w=Math.max(0,Math.min(t.x+t.width,image.x+image.width)-x);
    const h=Math.max(0,Math.min(t.y+t.height,image.y+image.height)-y);
    if(w&&h)overlaps.push({x,y,width:w,height:h});
  }
  return {
    coverage:Object.values(fields).map(average),
    massScale:[largest(images),largest(textMasses),clip(Math.max(0,...lines.map(r=>r.fontSize||r.height))/height)],
    topology,
    grouping:[average(offsets)],
    layering:[clip(unionArea(overlaps)/screenArea)]
  };
}
function compositionDistance(a,b) {
  // Each dimension is a spatial witness in natural [0,1] units. A change of
  // mass scale must not be diluted by unrelated, unchanged font/void signals.
  // L-infinity also deliberately increases sensitivity: optical validation
  // is required before enabling this experimental metric in production.
  return Math.max(0,...Object.keys(a).flatMap(key=>a[key].map((n,i)=>Math.abs(n-b[key][i]))));
}
function presentGeometryDistance(a,b) {
  const groups=[];
  for(let offset=0;offset<a.length;offset+=6) {
    const x=a.slice(offset,offset+6),y=b.slice(offset,offset+6);
    if(x[0]||y[0])groups.push(average(x.map((n,i)=>Math.abs(n-y[i]))));
  }
  return average(groups);
}
module.exports={compositionFeatures,compositionDistance,presentGeometryDistance};
