// Offline report only; shared product capture and selector produce all data.
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),sharp=require("sharp");
const {verification}=require("./renderStructuralShadowReport.script");
const root=path.resolve(process.argv[2]||"diagnostics/structural-shadow-fixed-pool");
const sites=[["tastavents","Tastavents"],["salterra","Salterra"],["gucci","Gucci Osteria"],["amici","Amici"],["khufu","Khufu’s Bistro"]];
const read=p=>JSON.parse(fs.readFileSync(p));
const esc=s=>String(s??"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const seconds=n=>Number.isFinite(n)?(n/1000).toFixed(2):"—";
const yes=v=>v?"oui":"non";
const table=(heads,rows)=>'<table><thead><tr>'+heads.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+esc(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
const css='body{font:16px/1.5 system-ui;background:#f4f1e9;color:#222;max-width:1600px;margin:30px auto;padding:20px}table{border-collapse:collapse;width:100%;background:white;margin:20px 0}th,td{padding:8px;border:1px solid #ccc;vertical-align:top;text-align:left}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}.views{display:grid;grid-template-columns:1fr 1fr;gap:12px}figure{margin:0 0 20px;background:white;padding:8px}img{width:100%;height:auto}.alert{padding:16px;background:#ffe0ac}a{color:#165c87}@media(max-width:800px){.pair,.views{grid-template-columns:1fr}}';
const svg=(w,h,lines)=>Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f4f1e9"/>${lines.map((s,i)=>`<text x="16" y="${30+i*27}" font-family="sans-serif" font-size="17">${esc(s)}</text>`).join('')}</svg>`);
async function board(dir,name,r,s){
  const left=await sharp(path.join(dir,"storyboard-current.png")).resize({width:720}).png().toBuffer();
  const right=await sharp(path.join(dir,"storyboard-proposed.png")).resize({width:720}).png().toBuffer();
  const ms=await Promise.all([left,right].map(b=>sharp(b).metadata()));
  const locals=r.views.filter(v=>!["overview","visionOverview","desktop_full"].includes(v.id)),proposed=s.shadow.proposedViews;
  const macroHeight=Math.max(...ms.map(m=>m.height)),base=190+macroHeight+70,rows=Math.ceil(Math.max(locals.length,proposed.length)/2);
  const layers=[{input:svg(1480,190,[`${name} — actuel / pool Phase A + cinq fixes`,
    `Actuel ${s.current.mode} ; proposé ${s.shadow.mode} ; cinq contrôles fixes conservés : ${yes(s.coverageComparison.strictlyEquivalent)}`,
    `Fallback de mesure conservé : ${yes(s.acceptance.measurementFallbackPreserved)} ; séquencement proposé NON exécuté`,
    'Droite : vrais aperçus observés, pas une livraison optimisée finale.',
    `Capture actuelle ${seconds(s.estimate.currentCaptureMs)} s ; estimation proposée ${seconds(s.estimate.estimatedCaptureMs)} s`]),left:0,top:0},
    {input:left,left:10,top:190},{input:right,left:750,top:190},
    {input:svg(1480,60,['Gauche : locales produit livrées. Droite : fixes réutilisables ou vues Phase A nécessitant une recapture.']),left:0,top:190+macroHeight+5}];
  for(const [side,list] of [[0,locals],[1,proposed]])for(const [i,v]of list.entries()){
    const x=side*740+10+(i%2)*360,y=base+Math.floor(i/2)*295;
    const p=side===0?v.geometry.scrollY:v.position,file=side===0?v.file:`${v.id}.webp`;
    layers.push({input:svg(350,70,[`${v.id} — ${p} px`,side===0?'Livrée':v.phaseBRecaptureRequired?'Phase A : recapture requise':'Fixe post-parcours : déjà validée']),left:x,top:y});
    layers.push({input:await sharp(path.join(dir,file)).resize(350,219,{fit:"contain",background:"white"}).png().toBuffer(),left:x,top:y+70});
  }
  await sharp({create:{width:1480,height:base+rows*295,channels:3,background:"white"}}).composite(layers).png().toFile(path.join(dir,"comparative.png"));
}
async function main(){
  const summary=[];
  for(const[key,name]of sites){
    const dir=path.join(root,key,"run-1"),r=read(path.join(dir,"result.json"));
    const shadowPath=path.join(dir,"shadow-report.json"),s=fs.existsSync(shadowPath)?read(shadowPath):{};
    const verified=verification(dir,r);fs.writeFileSync(path.join(dir,"verification.json"),JSON.stringify(verified,null,2));
    if(!s.shadow||r.status!=="ready_for_vision"){
      summary.push({key,name,status:r.status,current:"blocked",proposed:"shadow_unavailable",verified,coherent:false,blockReason:r.error?.message});
      fs.writeFileSync(path.join(dir,"index.html"),'<!doctype html><html lang="fr"><meta charset="utf-8"><style>'+css+'</style><h1>'+esc(name)+'</h1><p class="alert">Gate produit bloquant : '+esc(r.error?.message||"données shadow indisponibles")+'. Aucun verdict adaptatif simulé, aucune preuve de cinq fixes fabriquée.</p><a href="result.json">Résultat produit et diagnostic exact</a></html>');
      continue;
    }
    assert.equal(s.architecture,"phase_a_and_five_fixed");
    const input=read(path.join(dir,"shadow-input.json"));
    assert.deepEqual(s.current.selection.config,s.shadow.selection.config);
    assert.deepEqual(s.current.fixedProof,s.shadow.fiveNearestObservedProof);
    assert.ok(input.candidates.every(v=>["fixed","traversal"].includes(v.origin)));
    assert.equal(input.fixedIds.length,5);
    const currentPositions=s.current.positions.map(v=>v.position).join(" / "),proposedPositions=s.shadow.proposedViews.map(v=>v.position).join(" / ");
    const pools=s.shadow.pool.positions.map(v=>[v.id,v.position,v.origin,yes(v.afterCompleteTraversal),v.observedTotalHeight,
      s.shadow.selection.decisions.find(d=>d.id===v.id)?.reliability.reliable===false?'non fiable':'fiable']);
    const scoreRows=selection=>selection.decisions.map(v=>[v.id,v.position,yes(v.selected),...["L","D","V","R","G"].map(k=>v.scores?Number(v.scores[k]).toFixed(4):"—"),v.reason]);
    const proof=s.current.fixedProof.samples.map(v=>[v.nominalRole,v.target,v.position,v.targetErrorPx,v.targetTolerancePx,v.heightErrorPx,yes(v.stabilized),yes(v.afterCompleteTraversal),v.signature.slice(0,16)]);
    const omitted=s.acceptance.excludedUnreliableCandidates.map(v=>[v.id,v.position,v.reasons.join(", ")]);
    const cards=(list,current)=>list.map(v=>{const f=current?v.file:`${v.id}.webp`;return'<figure><a href="'+f+'"><img loading="lazy" src="'+f+'"></a><figcaption>'+esc(v.id)+' · '+esc(current?v.geometry.scrollY:v.position)+' px · '+(current?'livrée':v.phaseBRecaptureRequired?'aperçu A, recapture requise':'capture fixe déjà post-parcours ; nettoyage persistant éventuel')+'</figcaption></figure>';}).join('');
    await board(dir,name,r,s);
    fs.writeFileSync(path.join(dir,"index.html"),'<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>'+esc(name)+' — A + fixes</title><style>'+css+'</style><h1>'+esc(name)+' — shadow A + cinq fixes</h1><p class="alert">Produit inchangé. Preuve des cinq contrôles fixes conservée : '+yes(s.coverageComparison.strictlyEquivalent)+'. Fallback de mesure conservé : '+yes(s.acceptance.measurementFallbackPreserved)+'. Aucun séquencement optimisé exécuté.</p><p>Actuel '+esc(s.current.mode)+' : '+currentPositions+'. Proposé '+esc(s.shadow.mode)+' : '+proposedPositions+'.</p><p>Fallback actuel : '+esc(s.current.fallbackReasons.join(', ')||'aucun')+'. Proposé : '+esc(s.shadow.fallbackReasons.join(', ')||'aucun')+'.</p><p>Pool '+input.candidates.length+' viewports réels après déduplication ; aucune capture de rupture facultative utilisée. Répétabilité '+s.shadow.repeatability.identical+'/20 sur les mêmes mesures de cette visite.</p><p>Capture actuelle '+seconds(s.estimate.currentCaptureMs)+' s ; estimation '+seconds(s.estimate.estimatedCaptureMs)+' s ; gain '+seconds(s.estimate.estimatedSavedMs)+' s. '+s.estimate.freshDeliveryViews+' recapture(s) fraîche(s) prévue(s), '+s.estimate.reusedFixedViews+' fixe(s) réutilisable(s), '+s.estimate.plannedPersistentRecaptures+' nettoyage(s) persistant(s) estimé(s). Les coûts supplémentaires sont estimés séparément ; pas de temps optimisé mesuré.</p><p><a href="shadow-report.json">Scores, rounds, preuves et profil estimé</a> · <a href="shadow-input.json">Pool mesuré</a> · <a href="result.json">Produit et timings mesurés</a> · <a href="verification.json">Contrat inchangé</a> · <a href="comparative.png">Planche PNG complète</a></p><h2>Cinq contrôles fixes identiques, même visite</h2>'+table(['Rôle','Cible','Position','Écart position','Tolérance','Écart hauteur','Stable','Après parcours','Signature pixels'],proof)+'<p>Cette identité de preuve porte sur les cinq contrôles. Elle ne prouve pas la conservation des verdicts de fiabilité de candidats retirés du pool.</p><h2>Storyboards</h2><div class="pair"><figure><h3>Actuel</h3><a href="storyboard-current.png"><img src="storyboard-current.png"></a></figure><figure><h3>Proposé — parcours + cinq fixes</h3><a href="storyboard-proposed.png"><img src="storyboard-proposed.png"></a></figure></div><h2>Observations actuelles / proposées</h2><div class="pair"><div class="views">'+cards(r.views.filter(v=>!["overview","visionOverview","desktop_full"].includes(v.id)),true)+'</div><div class="views">'+cards(s.shadow.proposedViews,false)+'</div></div><h2>Pool réellement disponible</h2>'+table(['ID','Position px','Origine','Après parcours','Hauteur à la mesure','Fiabilité'],pools)+'<h2>Scores actuels</h2>'+table(['ID','Position','Retenu','L','D','V','R','G','Raison'],scoreRows(s.current.selection))+'<h2>Scores proposés</h2>'+table(['ID','Position','Retenu','L','D','V','R','G','Raison'],scoreRows(s.shadow.selection))+'<h2>Candidats actuels non fiables absents du pool proposé</h2>'+table(['ID','Position','Raisons'],omitted)+'<p>0 Vision / 0 MongoDB / 0 Cloudinary / 0 écritures distantes. Les aperçus proposés ne remplacent pas leurs futures recaptures et nettoyages.</p></html>');
    summary.push({key,name,status:r.status,current:s.current.mode,currentPositions,currentFallback:s.current.fallbackReasons,
      proposed:s.shadow.mode,proposedPositions,proposedFallback:s.shadow.fallbackReasons,poolCount:input.candidates.length,
      poolFixedCount:input.fixedIds.length,unchangedFixedProof:s.coverageComparison.strictlyEquivalent,
      measurementFallbackPreserved:s.acceptance.measurementFallbackPreserved,coherent:s.acceptance.simulationCoherent,
      excludedUnreliableCandidates:s.acceptance.excludedUnreliableCandidates,repeatability:s.shadow.repeatability.identical,
      captureMs:s.estimate.currentCaptureMs,estimateMs:s.estimate.estimatedCaptureMs,savedMs:s.estimate.estimatedSavedMs,
      freshDeliveryViews:s.estimate.freshDeliveryViews,reusedFixedViews:s.estimate.reusedFixedViews,
      proposedSequencingExecuted:false,verified});
  }
  fs.writeFileSync(path.join(root,"summary.json"),JSON.stringify(summary,null,2));
  const validation={references:summary.length,allFreshProductRunsPass:summary.length===5&&summary.every(s=>s.status==="ready_for_vision"),
    allFixedControlsUnchanged:summary.length===5&&summary.every(s=>s.unchangedFixedProof),
    allMeasurementFallbacksPreserved:summary.length===5&&summary.every(s=>s.measurementFallbackPreserved),
    simulationCoherent:summary.length===5&&summary.every(s=>s.coherent),proposedSequencingExecuted:false,
    measuredProposedCaptureMs:null,notExecutedReason:summary.some(s=>s.coherent===false)?"shadow_acceptance_failed":"not_executed_in_shadow"};
  fs.writeFileSync(path.join(root,"validation.json"),JSON.stringify(validation,null,2));
  fs.writeFileSync(path.join(root,"index.html"),'<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Shadow Phase A + cinq fixes</title><style>'+css+'</style><h1>StructuralReference — shadow parcours + cinq fixes</h1><p class="alert">Aucun basculement produit. Les cinq contrôles fixes sont conservés. La suppression des candidats supplémentaires peut changer la fiabilité globale : consulter le cas Gucci. Aucun timing du séquencement proposé mesuré si sa cohérence globale échoue.</p><p><a href="RAPPORT.md">Rapport consolidé</a> · <a href="TESTS.md">Tests</a> · <a href="summary.json">Résumé chiffré</a></p>'+table(['Référence','Actuel','Proposé','Pool réel','Positions actuelles','Positions proposées','Fixes inchangées','Fallback conservé','Capture actuelle s','Estimation s','Gain s'],summary.map(s=>[s.name,s.current,s.proposed,s.poolCount,s.currentPositions,s.proposedPositions,yes(s.unchangedFixedProof),yes(s.measurementFallbackPreserved),seconds(s.captureMs),seconds(s.estimateMs),seconds(s.savedMs)]))+'<ul>'+summary.map(s=>'<li><a href="'+s.key+'/run-1/index.html">'+esc(s.name)+' — planche et scores</a></li>').join('')+'</ul><p>0 Vision / 0 MongoDB / 0 Cloudinary. Répétabilité = vingt sélections sur les mesures d’une visite fraîche par référence.</p></html>');
  console.log(JSON.stringify(summary.map(s=>({site:s.name,actual:s.current,proposed:s.proposed,pool:s.poolCount,fixedProof:s.unchangedFixedProof,coherent:s.coherent,positions:s.proposedPositions})),null,2));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
