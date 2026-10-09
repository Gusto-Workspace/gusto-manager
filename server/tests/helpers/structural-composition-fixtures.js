const rect=(kind,x,y,width,height,fontSize=0)=>({kind,x,y,width,height,fontSize});
const images=(n,width,height,y=0)=>Array.from({length:n},(_,i)=>rect('image',i*1200/n,y,width,height));
const fixtures={
  immersive:[rect('image',0,0,1200,800),rect('text',350,280,500,180,90)],
  quiet:[rect('text',450,330,300,60,20)],
  typography:[rect('text',100,230,1000,300,180),...images(3,100,100,600)],
  gallery:images(4,290,800),
  editorial:[rect('image',70,80,450,630),rect('text',640,250,450,160,28)],
  centerPeripheral:[rect('text',300,280,600,180,72),rect('image',0,50,130,180),rect('image',1060,580,130,180)],
  regular:[0,1,2].flatMap(i=>[rect('image',40+i*400,150,320,380),rect('text',40+i*400,570,320,60,20)]),
  offset:[0,1,2].flatMap(i=>[rect('image',40+i*400,30+i*130,320,380),rect('text',40+i*400,450+i*130,320,60,20)]),
  layered:[rect('image',400,80,400,620),rect('text',100,260,1000,250,140)]
};
function measures(name) {
  const masses=structuredClone(fixtures[name]).map((r,i)=>({...r,domOrder:i+1,group:i+1,fullArea:r.width*r.height}));
  const groups=['regular','offset'].includes(name)?[{x:40,y:0,width:1120,height:800,domOrder:0,members:masses.filter(r=>r.kind==='image')}]:[];
  return {viewport:{width:1200,height:800},masses,lines:masses.filter(r=>r.kind==='text'),groups,unknown:[],
    truncated:false,relationsKnown:true,measuredCoverage:1,positioned:[]};
}
function input(names) {
  const candidates=names.map((name,i)=>({id:`sample${i+1}`,position:i*1000,domOrder:i,visibleRangePx:[i*1000,i*1000+800],visibleHeight:800,stabilized:true,measures:measures(name)}));
  return {candidates,totalHeight:(names.length-1)*1000+800,reachedEnd:true,fixedIds:candidates.slice(0,5).map(c=>c.id),
    storyboard:{width:720,height:Math.ceil(names.length/3)*180,complete:true,panels:candidates.map((c,i)=>({observationId:c.id,position:c.position,visibleRangePx:c.visibleRangePx,scale:.2,rect:{x:i%3*240,y:Math.floor(i/3)*180,width:240,height:160}}))}};
}
function svg(name) {
  const items=fixtures[name].map(r=>r.kind==='image'?`<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="#637866"/><path d="M${r.x} ${r.y}l${r.width} ${r.height}m0 -${r.height}l-${r.width} ${r.height}" stroke="#b8cbb3"/>`:
    `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="#44392d" opacity=".8"/><text x="${r.x+5}" y="${r.y+Math.min(r.height,r.fontSize)}" fill="#f6e8c5" font-size="${r.fontSize}" font-family="serif">MMMM</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#f4eedf"/>${items}</svg>`;
}
module.exports={fixtures,measures,input,svg};
