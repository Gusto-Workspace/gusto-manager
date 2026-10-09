// Offline rendering of fresh dry-run outputs. Never an input to capture/scoring.
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const sharp = require("sharp"), { createHash } = require("node:crypto");
const { buildStructuralVisionRequest } = require("../services/design-lab/structural-reference.contract");
const root = path.resolve(process.argv[2] || "diagnostics/structural-shadow");
const sites = [ ["tastavents","Tastavents"], ["salterra","Salterra"], ["gucci","Gucci Osteria"],
  ["amici","Amici"], ["khufu","Khufu’s Bistro"] ];
const read = p => JSON.parse(fs.readFileSync(p));
const exists = p => fs.existsSync(p);
const escape = s => String(s ?? "—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const sec = n => Number.isFinite(n) ? (n/1000).toFixed(2) : "—";
const table = (headers,rows) => '<table><thead><tr>'+headers.map(h=>'<th>'+escape(h)+'</th>').join('')+'</tr></thead><tbody>'+
  rows.map(r=>'<tr>'+r.map(c=>'<td>'+escape(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
const yes = b => b === true ? "oui" : b === false ? "non" : "—";
const scores = s => s ? ["L","D","V","R","G"].map(k=>Number(s[k]).toFixed(4)) : Array(5).fill("—");
const css = 'body{font:16px/1.5 system-ui;background:#f4f1e9;color:#242424;margin:30px auto;padding:0 24px;max-width:1560px}h1,h2{line-height:1.2}table{border-collapse:collapse;width:100%;background:white;margin:20px 0}td,th{border:1px solid #ddd;padding:8px;text-align:left;vertical-align:top}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}.views{display:grid;grid-template-columns:1fr 1fr;gap:12px}img{width:100%;height:auto}figure{margin:0 0 20px;background:white;padding:8px}a{color:#155a82}.alert{padding:16px;background:#ffe5bc}@media(max-width:800px){.pair,.views{grid-template-columns:1fr}}';
const svg = (width,height,lines) => Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f4f1e9"/>${lines.map((line,i)=>`<text x="16" y="${30+i*26}" font-family="sans-serif" font-size="17" fill="#222">${escape(line)}</text>`).join('')}</svg>`);
async function pngBoard(directory,name,r,s) {
  const leftFile = ["storyboard-current.png","overview.webp","visionOverview.webp"].find(f=>exists(path.join(directory,f)));
  if(!leftFile || !exists(path.join(directory,"storyboard-phase-a.png"))) return false;
  const left = await sharp(path.join(directory,leftFile)).resize({width:720}).png().toBuffer();
  const right = await sharp(path.join(directory,"storyboard-phase-a.png")).resize({width:720}).png().toBuffer();
  const sizes = await Promise.all([left,right].map(b=>sharp(b).metadata()));
  const top = 150, macroHeight = Math.max(...sizes.map(m=>m.height));
  const currentLocals = (r.views || []).filter(v=>!["overview","visionOverview","desktop_full"].includes(v.id));
  const proposed = s.shadow.proposedViews;
  const rows = Math.ceil(Math.max(currentLocals.length,proposed.length)/2), tileHeight=270;
  const imageHeight = top+macroHeight+90+rows*tileHeight;
  const layers=[{input:svg(1480,top,[`${name} — capture produit actuelle / simulation Phase A`,
    `Actuel : ${s.current.mode} ; shadow : ${s.shadow.mode} ; équivalence stricte : NON`,
    'Droite : observations anciennes Phase A illustratives ; livraison Phase B NON exécutée.',
    `Capture actuelle ${sec(r.captureCoverage?.captureTiming?.elapsedMs || r.error?.captureTiming?.elapsedMs)} s ; estimation conditionnelle ${sec(s.estimate.estimatedCaptureMs)} s`]),left:0,top:0},
    {input:left,left:10,top},{input:right,left:750,top}];
  const yBase=top+macroHeight+90;
  layers.push({input:svg(1480,70,['Gauche : locales effectivement livrées. Droite : aperçu observé ou cadrage de fallback à recapturer.']),left:0,top:top+macroHeight+10});
  for(const [side,list] of [[0,currentLocals],[1,proposed]]) for(const [i,v] of list.entries()) {
    const x=side*740+10+(i%2)*360, y=yBase+Math.floor(i/2)*tileHeight;
    const file=side===0?v.file:v.observed?`${v.id}.webp`:null;
    const position=side===0?v.geometry?.scrollY:v.position;
    layers.push({input:svg(350,50,[`${v.id} — ${position ?? "?"} px`]),left:x,top:y});
    if(file&&exists(path.join(directory,file))) layers.push({input:await sharp(path.join(directory,file)).resize(350,219,{fit:"contain",background:"white"}).png().toBuffer(),left:x,top:y+50});
    else layers.push({input:svg(350,200,['Cadrage de fallback planifié','Livraison Phase B non exécutée','Capture fraîche requise']),left:x,top:y+50});
  }
  await sharp({create:{width:1480,height:imageHeight,channels:3,background:"white"}}).composite(layers).png().toFile(path.join(directory,"comparative.png"));
  return true;
}
function verification(directory,r) {
  assert.deepEqual(r.forbidden,{openai:0,mongo:0,cloudinary:0,externalWrites:0});
  if(r.status!=="ready_for_vision") return {guardsZero:true,productBlocked:true};
  const manifest=read(path.join(directory,"manifest.json")),request=read(path.join(directory,"vision-request.json"));
  const metadata=JSON.parse(request.input[0].content[0].text).localMetadata;
  const captures=manifest.views.map(v=>({type:v.id,url:v.url,sourceRect:v.sourceRect,viewport:v.viewport,detail:v.detail,
    progressPercent:r.captureCoverage.positions.find(p=>p.role===v.id)?.progressPercent}));
  const rebuilt=buildStructuralVisionRequest(captures,metadata,manifest);
  assert.deepEqual(rebuilt.content,request.input[0].content);assert.deepEqual(rebuilt.schema,request.text.format.schema);
  assert.equal(rebuilt.instructions,request.instructions);
  assert.doesNotMatch(JSON.stringify(metadata),/phaseAContext|observationTrace|shadow-report|shadowSelection/);
  for(const v of manifest.views) {
    const bytes=fs.readFileSync(path.join(directory,`${v.id}.webp`));
    assert.deepEqual(Buffer.from(v.url.split(',')[1],'base64'),bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),r.views.find(x=>x.id===v.id).sha256);
  }
  return {guardsZero:true,contractAndManifestAndBytesIdentical:true,shadowAbsentFromVision:true};
}
async function main(){
  const summaries=[];
  for(const [key,name] of sites){
    const directory=path.join(root,key,"run-1");
    if(!exists(path.join(directory,"result.json"))) continue;
    const r=read(path.join(directory,"result.json")),s=read(path.join(directory,"shadow-report.json"));
    const verified=verification(directory,r);fs.writeFileSync(path.join(directory,"verification.json"),JSON.stringify(verified,null,2));
    if(!s.shadow){summaries.push({key,name,current:r.status,shadow:s.mode,verified});continue;}
    if(s.current.selection) assert.deepEqual(s.shadow.selection.config,s.current.selection.config);
    const p=s.shadow.panelProof, f=s.shadow.fiveNearestObservedProof, c=s.current.fixedProof;
    const currentPositions=s.current.positions.map(v=>v.position).join(" / ");
    const proposedPositions=s.shadow.proposedViews.map(v=>v.position).join(" / ");
    const proofRows=[['Couverture panneaux haut / milieu / bas',`${yes(c.topCovered)} / ${yes(c.middleCovered)} / ${yes(c.bottomCovered)}`,`${yes(p.topCovered)} / ${yes(p.middleCovered)} / ${yes(p.bottomCovered)}`],
      ['Couverture continue et fin confirmée','validée par le parcours actuel',`${yes(p.complete)} ; ${p.gaps.length} intervalle manquant ; ${p.bottomConfirmations ?? 0} confirmations`],
      ['Signatures distinctes parmi les cinq contrôles',c.uniqueSignatures,f.uniqueSignatures],
      ['Triplet haut/milieu/bas distinct',yes(c.tripletDistinct),yes(f.tripletDistinct)],
      ['Prédicat sampled v2 réel sur cinq observations',yes(c.actualFixedGatePass),yes(f.actualFixedGatePass)],
      ['Géométrie : cadrages ciblés + hauteur + stabilité',yes(c.allFiveGeometryChecksPass),yes(f.allFiveGeometryChecksPass)],
      ['Cinq contrôles recapturés après parcours',yes(c.allFivePostTraversal),yes(f.allFivePostTraversal)],
      ['Équivalence complète de preuve','référence',yes(s.coverageComparison.strictlyEquivalent)]];
    const geometryRows=f.samples.map((v,i)=>[v.nominalRole,v.target,v.observationId,v.position,v.targetErrorPx,v.targetTolerancePx,yes(v.targetReached),`${yes(v.heightStable)} (écart ${v.heightErrorPx} px ; limite 8 px)`,yes(v.stabilized),yes(v.afterCompleteTraversal),yes(s.coverageComparison.signatures[i]?.same64PixelSignature)]);
    const scoreRows=selection=>(selection?.decisions||[]).map(v=>[v.id,v.position,yes(v.selected),...scores(v.scores),v.reason]);
    const imageCards=(views,side)=>views.map(v=>'<figure>'+ (v.observed===false?'<p>Cadrage de fallback planifié ; livraison Phase B non exécutée.</p>':'<a href="'+escape(side==='current'?v.file:`${v.id}.webp`)+'"><img loading="lazy" src="'+escape(side==='current'?v.file:`${v.id}.webp`)+'"></a>')+'<figcaption>'+escape(v.id)+' · '+escape(side==='current'?v.geometry?.scrollY:v.position)+' px'+(side==='shadow'?' · recapture finale requise':'')+'</figcaption></figure>').join('');
    const left=["storyboard-current.png","overview.webp","visionOverview.webp"].find(file=>exists(path.join(directory,file)));
    const boards=await pngBoard(directory,name,r,s);
    const html='<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>'+escape(name)+' — shadow</title><style>'+css+'</style><h1>'+escape(name)+' — produit actuel / shadow Phase A</h1><p class="alert"><strong>Équivalence stricte non démontrée.</strong> Le pipeline courant reste la vérité. Aucun lot Phase B exécuté, aucun gate modifié.</p><p>Actuel : '+escape(s.current.mode)+' ; positions '+escape(currentPositions)+'. Shadow : '+escape(s.shadow.mode)+' ; positions '+escape(proposedPositions)+'.</p><p>Raisons actuelles : '+escape(s.current.fallbackReasons.join(', ')||r.error?.message||'aucune')+'. Raisons shadow : '+escape(s.shadow.fallbackReasons.join(', ')||'aucune')+'. Répétabilité du sélecteur sur cette seule visite : '+s.shadow.repeatability.identical+'/20.</p><p>Durée actuelle '+sec(s.estimate.currentCaptureMs)+' s ; estimation '+sec(s.estimate.estimatedCaptureMs)+' s ; gain conditionnel '+sec(s.estimate.estimatedSavedMs)+' s. Coût de résolution des preuves manquantes exclu.</p><p><a href="shadow-report.json">Rapport complet et rounds de scores</a> · <a href="shadow-input.json">Mesures Phase A</a> · <a href="result.json">Capture produit et timings</a> · <a href="verification.json">Contrat inchangé</a>'+(boards?' · <a href="comparative.png">Planche PNG complète</a>':'')+'</p><h2>Preuve de couverture</h2>'+table(['Critère','Cinq fixes actuelles','Panneaux Phase A / cinq plus proches'],proofRows)+'<h2>Cadrages réels des contrôles Phase A</h2>'+table(['Rôle nominal','Cible px','Vue observée','Position px','Écart px','Tolérance px','Cible atteinte','Hauteur stable','Stabilisé','Après parcours','Même signature que fixe'],geometryRows)+'<p>Rôles nominaux uniquement pour comparer le gate. Les positions affichées sont réelles ; aucun viewport synthétique et aucun déplacement simulé.</p><h2>Storyboards</h2><div class="pair"><figure><h3>Actuel'+(!exists(path.join(directory,"storyboard-current.png"))?' — macro continuous':'')+'</h3>'+(left?'<a href="'+left+'"><img src="'+left+'"></a>':'<p>Capture bloquée.</p>')+'</figure><figure><h3>Phase A — '+p.observedPanelCount+' panneaux</h3><a href="storyboard-phase-a.png"><img src="storyboard-phase-a.png"></a></figure></div><h2>Locales livrées / observations proposées</h2><div class="pair"><div class="views">'+imageCards((r.views||[]).filter(v=>!["overview","visionOverview","desktop_full"].includes(v.id)),'current')+'</div><div class="views">'+imageCards(s.shadow.proposedViews,'shadow')+'</div></div><h2>Scores du pipeline actuel</h2>'+table(['ID','Position','Retenu','L','D','V','R','G','Raison'],scoreRows(s.current.selection))+'<h2>Scores shadow — tous les candidats réellement observés</h2>'+table(['ID','Position','Retenu','L','D','V','R','G','Raison'],scoreRows(s.shadow.selection))+'<p>En fallback, les cinq cadrages proposés sont des plans non mesurés : aucun score ne leur est inventé. Les scores des candidats restent ceux du sélecteur partagé.</p><h2>Informations manquantes</h2><ul>'+s.coverageComparison.missingEvidence.map(reason=>'<li>'+escape(reason)+'</li>').join('')+'</ul><p>OpenAI 0 / MongoDB 0 / Cloudinary 0 / écritures distantes 0. Les aperçus de droite utilisent les vrais pixels du parcours ; ils ne sont ni une recapture finale ni des entrées Vision.</p></html>';
    const fallbackContext = '<p>Contexte des scores de fallback : le shadow utilise un ensemble fixedIds vide, car ses cinq cadrages de livraison ne sont pas capturés. Les V/R/G des candidats fiables sont donc potentiels face à cet ensemble vide. Le pipeline actuel possède ses cinq contrôles réels. Aucun score de candidat ne constitue un score pour un cadrage planifié.</p>';
    fs.writeFileSync(path.join(directory,"index.html"),html.replace('<h2>Informations manquantes</h2>',fallbackContext+'<h2>Informations manquantes</h2>'));
    summaries.push({key,name,status:r.status,current:s.current.mode,currentPositions,shadow:s.shadow.mode,proposedPositions,
      currentFallback:s.current.fallbackReasons,shadowFallback:s.shadow.fallbackReasons,
      currentProof:c.actualFixedGatePass,phaseAPanelProof:p.complete,shadowFiveNumericProof:f.actualFixedGatePass,
      shadowGeometry:f.allFiveGeometryChecksPass,postTraversalProof:f.allFivePostTraversal,equivalent:false,
      repeatability:s.shadow.repeatability.identical,captureMs:s.estimate.currentCaptureMs,estimateMs:s.estimate.estimatedCaptureMs,savedMs:s.estimate.estimatedSavedMs,
      geometry:f.samples.map(v=>({target:v.target,position:v.position,error:v.targetErrorPx,tolerance:v.targetTolerancePx,pass:v.targetReached})),verified});
  }
  fs.writeFileSync(path.join(root,"summary.json"),JSON.stringify(summaries,null,2));
  const rows=summaries.map(s=>[s.name,s.current,s.shadow,s.currentPositions,s.proposedPositions,yes(s.phaseAPanelProof),yes(s.shadowFiveNumericProof),yes(s.shadowGeometry),`${s.repeatability??0}/20`,sec(s.savedMs)]);
  fs.writeFileSync(path.join(root,"index.html"),'<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>StructuralReference shadow — 5 références</title><style>'+css+'</style><h1>StructuralReference — benchmark shadow</h1><p class="alert"><strong>Pipeline produit conservé.</strong> Simulation à partir des seuls viewports Phase A mesurés. Gates, poids, seuil et budget inchangés. Aucun run Phase B ; aucun résultat shadow envoyé à Vision.</p><p><a href="RAPPORT.md">Rapport consolidé</a> · <a href="summary.json">Résumé chiffré</a> · <a href="TESTS.md">Tests</a></p>'+table(['Référence','Actuel','Shadow','Positions actuelles','Positions proposées','Couverture A','Gate numérique cinq','Cadrages cinq','Répétabilité','Gain estimé (s)'],rows)+'<ul>'+summaries.map(s=>'<li><a href="'+s.key+'/run-1/index.html">'+escape(s.name)+' — planche, scores et preuves</a></li>').join('')+'</ul><p>Les cinq contrôles A les plus proches ne sont pas renommés comme s’ils étaient aux positions fixes. Répétabilité = vingt sélections sur les mêmes mesures, une seule visite par référence. Les gains sont conditionnels à la résolution de la preuve post-parcours.</p><p>0 Vision / 0 MongoDB / 0 Cloudinary / 0 écriture distante.</p></html>');
  console.log(JSON.stringify(summaries.map(s=>({site:s.name,current:s.current,shadow:s.shadow,positions:s.proposedPositions,equivalent:s.equivalent})),null,2));
}
if (require.main === module) main().catch(error=>{console.error(error.stack);process.exitCode=1;});
module.exports = { verification };
