// Offline extension of the existing five-fixed-pool report; no new capture.
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),sharp=require("sharp");
const {execFileSync}=require("node:child_process");
const root=path.resolve(process.argv[2]||"diagnostics/structural-shadow-reliability");
const esc=s=>String(s??"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const read=p=>JSON.parse(fs.readFileSync(p));
const table=(heads,rows)=>'<table><thead><tr>'+heads.map(s=>'<th>'+esc(s)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(s=>'<td>'+esc(s)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
async function main(){
  execFileSync(process.execPath,[path.join(__dirname,"renderStructuralFixedPoolShadowReport.script.js"),root],{stdio:"inherit"});
  const summaries=read(path.join(root,"summary.json"));
  for(const s of summaries){
    if(s.status!=="ready_for_vision"){
      s.registryStatus="unproven";s.registryVisits=0;s.registryCostMs=null;s.scoringMode="unavailable";s.evidencePositions=[];
      continue;
    }
    const dir=path.join(root,s.key,"run-1"),r=read(path.join(dir,"shadow-report.json")),g=r.reliabilityRegistry;
    assert.ok(g&&g.visits>0);assert.equal(g.positions.some(p=>p.origin!=="traversal"&&p.origin!=="fixed"),false);
    assert.equal(r.shadow.repeatability.identical,20);
    s.registryStatus=g.status;s.registryCostMs=g.cost.addedElapsedMs;s.registryAggregationMs=g.cost.aggregationElapsedMs;
    s.scoringMode=r.shadow.scoringSelection.mode;s.scoringPositions=r.shadow.scoringSelection.selectedIds.map(id=>r.shadow.pool.positions.find(p=>p.id===id).position);
    s.registryReasons=g.reasons;s.registryVisits=g.visits;
    s.evidencePositions=[...new Set(g.entries.filter(e=>e.status!=="reliable").map(e=>e.position))];
    const grouped=new Map();
    for(const e of g.entries){const key=[e.origin,e.position,e.elementId,e.status,e.reason].join(":");if(!grouped.has(key))grouped.set(key,{...e,count:0});grouped.get(key).count++;}
    const rows=[...grouped.values()].map(e=>[e.visitId,e.origin,e.position,e.status,e.elementId,e.tag,e.reason,e.mechanisms?.join(","),e.rect?JSON.stringify(e.rect):"—",e.point?`${e.point.x.toFixed(2)} / ${e.point.y.toFixed(2)}`:"—",e.count]);
    const section='<h2>Registre de fiabilité indépendant du scoring</h2><p class="alert">État '+esc(g.status)+' ; scoring seul '+esc(s.scoringMode)+' ; livraison shadow '+esc(s.proposed)+'. Aucune preuve issue des candidats facultatifs.</p><p>'+g.visits+' lectures aux visites existantes ; coût ajouté directement mesuré '+(g.cost.addedElapsedMs/1000).toFixed(3)+' s, dont DOM '+(g.cost.domElapsedMs/1000).toFixed(3)+' s. Agrégation hors capture '+Number(g.cost.aggregationElapsedMs||0).toFixed(2)+' ms.</p><p><a href="reliability-registry.json">Registre complet</a> · <a href="reliability-records.json">Mesures et inspections par visite</a> · <a href="reliability-proof.png">Témoin visuel représentatif</a></p><p>Les scores ci-dessus sont ceux du sélecteur inchangé ; le registre peut modifier uniquement l’éligibilité et les IDs de livraison shadow. Fiable signifie qu’aucune limite n’a été détectée dans la portée bornée inspectée, pas une certification universelle des cadrages non visités.</p>'+table(['Visite','Origine','Position réelle','État','Élément','Primitive','Raison','Mécanismes','Rectangle viewport','Point témoin','Nombre'],rows);
    const rawScores=table(['ID','Position','Retenu par scoring seul','L','D','V','R','G','Raison artistique/mesure'],r.shadow.scoringSelection.decisions.map(d=>[d.id,d.position,d.selected?"oui":"non",...["L","D","V","R","G"].map(k=>d.scores?Number(d.scores[k]).toFixed(4):"—"),d.reason]));
    const file=path.join(dir,"index.html");fs.writeFileSync(file,fs.readFileSync(file,"utf8").replace('</html>',section+'<h2>Scoring indépendant, avant verdict du registre</h2>'+rawScores+'</html>'));
    const evidence=g.entries.find(e=>e.status==="unreliable"&&e.point&&e.rect)||g.entries.find(e=>e.status!=="reliable"&&e.rect);
    const view=evidence?r.shadow.pool.positions.find(p=>p.position===evidence.position):r.shadow.pool.positions[0];
    const input=await sharp(path.join(dir,`${view.id}.webp`)).png().toBuffer();
    const meta=await sharp(input).metadata();
    const overlay=evidence?Buffer.from(`<svg width="${meta.width}" height="${meta.height}" xmlns="http://www.w3.org/2000/svg"><rect x="${evidence.rect.x}" y="${evidence.rect.y}" width="${evidence.rect.width}" height="${evidence.rect.height}" fill="none" stroke="#ff4c00" stroke-width="4"/>${evidence.point?`<circle cx="${evidence.point.x}" cy="${evidence.point.y}" r="9" fill="red"/>`:""}</svg>`):null;
    const picture=await sharp(input).composite(overlay?[{input:overlay}]:[]).png().toBuffer();
    const caption=Buffer.from(`<svg width="${meta.width}" height="120" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f4f1e9"/><text x="16" y="30" font-family="sans-serif" font-size="20">${esc(s.name)} — registre ${esc(g.status)} ; coût ${(g.cost.addedElapsedMs/1000).toFixed(3)} s</text><text x="16" y="65" font-family="sans-serif" font-size="18">${esc(evidence?`${evidence.origin} à ${evidence.position} px : ${evidence.reason}`:"Aucune preuve négative détectée")}</text><text x="16" y="97" font-family="sans-serif" font-size="16">Aperçu du pool au même cadrage réel ; rectangle orange / point rouge = mesure du registre.</text></svg>`);
    await sharp({create:{width:meta.width,height:meta.height+120,channels:3,background:"white"}}).composite([{input:caption,top:0,left:0},{input:picture,top:120,left:0}]).png().toFile(path.join(dir,"reliability-proof.png"));
  }
  fs.writeFileSync(path.join(root,"summary.json"),JSON.stringify(summaries,null,2));
  const file=path.join(root,"index.html"),section='<h2>Registre shadow — coût DOM directement mesuré</h2><p>Inspection dans l’évaluation existante : aucun aller-retour navigateur supplémentaire. Ce coût isole l’exécution DOM ; transport/scheduling de l’évaluation partagée et rendu des rapports ne sont pas attribués artificiellement au registre.</p>'+table(['Référence','Scoring seul','Registre','Livraison shadow','Visites existantes','Inspection DOM ajoutée s','Positions de preuve'],summaries.map(s=>[s.name,s.scoringMode,s.registryStatus,s.proposed,s.registryVisits,s.registryCostMs===null?'non mesurable':(s.registryCostMs/1000).toFixed(3),s.evidencePositions.join(" / ")||"aucune"]));
  fs.writeFileSync(file,fs.readFileSync(file,"utf8").replace('</html>',section+'</html>'));
  console.log(JSON.stringify(summaries.map(s=>({site:s.name,registry:s.registryStatus,costMs:s.registryCostMs,raw:s.scoringMode,shadow:s.proposed})),null,2));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
