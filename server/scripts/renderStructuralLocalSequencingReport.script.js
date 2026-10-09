// Offline report: previous results are comparisons only, never capture input.
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),sharp=require("sharp");
const {verification}=require("./renderStructuralShadowReport.script");
const root=path.resolve(process.argv[2]);
const baseline=path.resolve(process.argv[3]);
const sites=[["tastavents","Tastavents"],["salterra","Salterra"],["gucci","Gucci Osteria"],["amici","Amici"],["khufu","Khufu’s Bistro"]];
const read=p=>JSON.parse(fs.readFileSync(p));
const diagnostics=r=>r.captureDiagnostics||r.localExperiment;
const sequencingLabel=r=>r.captureDiagnostics?"pipeline produit en dry-run":"expérimental local historique";
const esc=s=>String(s??"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const sec=n=>(n/1000).toFixed(2);
const table=(headers,rows)=>'<table><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+esc(c)+'</td>').join('')+'</tr>').join('')+'</table>';
const css='body{font:16px/1.5 system-ui;background:#f4f1e9;max-width:1600px;margin:24px auto;padding:24px}table{border-collapse:collapse;width:100%;margin:18px 0;background:white}th,td{border:1px solid #ccc;padding:8px;text-align:left}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}.locals{display:grid;grid-template-columns:1fr 1fr;gap:12px}img{width:100%;height:auto}figure{margin:0}a{color:#165c87}';
const svg=(w,h,lines)=>Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f4f1e9"/>${lines.map((s,i)=>`<text x="16" y="${30+i*26}" font-family="sans-serif" font-size="17">${esc(s)}</text>`).join('')}</svg>`);
const localViews=r=>r.views.filter(v=>v.id!=="overview");
async function board(dir,oldDir,name,r,old){
  const images=await Promise.all([path.join(oldDir,"storyboard-current.png"),path.join(dir,"storyboard-current.png")].map(p=>sharp(p).resize({width:720}).png().toBuffer()));
  const heights=await Promise.all(images.map(b=>sharp(b).metadata()));
  const h=Math.max(...heights.map(m=>m.height)),base=150+h+70;
  const rows=Math.ceil(Math.max(localViews(r).length,localViews(old).length)/2);
  const layers=[{input:svg(1480,150,[`${name} — courant précédent / séquencement local réellement exécuté`,
    `Capture mesurée : ${sec(old.capturePerformance.elapsedMs)} s / ${sec(r.capturePerformance.elapsedMs)} s`,
    `Décision : ${old.captureCoverage.observationSelection.mode} / ${r.captureCoverage.observationSelection.mode} ; registre ${diagnostics(r).registry.status}`,
    'Visites fraîches distinctes : comparer la structure, pas une identité des pixels du site vivant.']),left:0,top:0},
    {input:images[0],left:10,top:150},{input:images[1],left:750,top:150},
    {input:svg(1480,60,['Observations réellement livrées dans chaque dry-run, après validation et nettoyage.']),left:0,top:150+h+5}];
  for(const [side,result,folder] of [[0,old,oldDir],[1,r,dir]]) for(const [i,v]of localViews(result).entries()){
    const x=side*740+10+(i%2)*360,y=base+Math.floor(i/2)*300;
    layers.push({input:svg(350,70,[`${v.id} — ${v.geometry.scrollY} px`,side===0?'Courant précédent':sequencingLabel(r)]),left:x,top:y});
    layers.push({input:await sharp(path.join(folder,v.file)).resize(350,219,{fit:"contain",background:"white"}).png().toBuffer(),left:x,top:y+70});
  }
  await sharp({create:{width:1480,height:base+rows*300,channels:3,background:"white"}}).composite(layers).png().toFile(path.join(dir,"comparative.png"));
}
function validate(dir,r){
  const v=verification(dir,r);
  if(r.status!=="ready_for_vision")return {...v,passed:false};
  const e=diagnostics(r),shadow=read(path.join(dir,"shadow-report.json"));
  assert.ok(e?.sequencing==="phase_a_fixed_pool_v1"||e?.localOnly);assert.equal(r.captureCoverage.version,3);assert.equal(r.captureCoverage.captureStrategy,"sampled");
  assert.equal(e.fixedControls.length,5);
  assert.ok(shadow.current.fixedProof.actualFixedGatePass&&shadow.current.fixedProof.allFiveGeometryChecksPass&&shadow.current.fixedProof.allFivePostTraversal);
  assert.deepEqual(e.fixedControls.map(x=>[x.position,x.signature]),shadow.current.fixedProof.samples.map(x=>[x.position,x.signature]));
  assert.ok(e.pool.every(c=>["traversal","fixed"].includes(c.origin)));
  assert.equal(r.capturePerformance.operations.filter(o=>o.phase==="fixed_samples"&&o.operation==="screenshot").reduce((s,o)=>s+o.count,0),5);
  assert.equal(r.captureCoverage.optionalCandidateBudget.captured,0);
  assert.ok(!r.capturePerformance.operations.some(o=>o.phase==="optional_boundary_candidates"));
  if(e.registry.status!=="reliable") {
    assert.equal(e.selection.mode,"fixed_fallback");
    assert.deepEqual(r.captureCoverage.positions.map(p=>p.position),e.fixedControls.map(p=>p.position));
  }
  const metadata=JSON.parse(read(path.join(dir,"vision-request.json")).input[0].content[0].text).localMetadata;
  assert.doesNotMatch(JSON.stringify(metadata),/localExperiment|captureDiagnostics|reliabilityRecords|scoringSelection|removedCandidateCaptures/);
  assert.ok(e.deliveries.every(d=>d.source==="validated_post_traversal_fixed"||d.source==="validated_final_recapture"));
  for(const [i,d]of e.deliveries.entries()){
    const candidate=e.pool.find(c=>c.id===d.id);
    assert.ok(candidate);
    if(candidate.origin==="traversal")assert.ok(d.recaptured&&d.freshnessRequired&&d.geometryRestored);
    assert.equal(r.captureCoverage.positions[i].position,d.position);
    assert.equal(r.views.find(v=>v.id===`observation${i+1}`).geometry.scrollY,d.position);
  }
  const actualRecaptureScreenshots=r.capturePerformance.operations.filter(o=>o.operation==="screenshot"&&
    ["final_observation_recapture","persistent_layer_recapture"].includes(o.phase)).reduce((s,o)=>s+o.count,0);
  assert.equal(e.finalRecaptures,actualRecaptureScreenshots);
  assert.ok(r.capturePerformance.elapsedMs<120000);
  return {...v,passed:true,fiveFixedControlsPreserved:true,noCandidateTour:true,finalObservationsActuallyFresh:true,
    actualGeometryMatchesManifest:true,experimentalDiagnosticsExcludedFromContract:true};
}
async function main(){
  const summaries=[];
  for(const[key,name]of sites){
    const dir=path.join(root,key,"run-1"),oldDir=path.join(baseline,key,"run-1");
    if(!fs.existsSync(path.join(dir,"result.json")))continue;
    const r=read(path.join(dir,"result.json")),old=read(path.join(oldDir,"result.json")),verified=validate(dir,r);
    fs.writeFileSync(path.join(dir,"verification.json"),JSON.stringify(verified,null,2));
    if(!verified.passed){summaries.push({key,name,status:r.status,passed:false,error:r.error});continue;}
    const e=diagnostics(r),profile=r.capturePerformance;
    assert.deepEqual(e.scoringSelection.config,old.captureCoverage.observationSelection.config);
    if(key==="gucci")assert.ok(e.registry.entries.some(x=>x.status==="unreliable"&&x.origin==="traversal"&&x.position!==3310));
    const screenshotCount=p=>p.operations.filter(o=>o.operation==="screenshot").reduce((s,o)=>s+o.count,0);
    const summary={key,name,status:r.status,passed:true,captureMs:profile.elapsedMs,
      browserAndPreparationMs:r.pipelinePerformance.elapsedMs,contractPreparationMs:r.pipelinePerformance.contractPreparationMs,
      wallMs:Date.parse(r.finishedAt)-Date.parse(r.startedAt),remainingBudgetMs:r.captureCoverage.captureTiming.remainingMs,
      phases:profile.phases,registry:e.registry.status,registryAddedMs:e.registry.cost.addedElapsedMs,
      mode:e.selection.mode,positions:r.captureCoverage.positions.map(p=>p.position),fallbackReasons:e.selection.fallbackReasons,
      normalSequencing:Boolean(r.captureDiagnostics),poolCount:e.pool.length,removedPotentialCandidateCaptures:e.removedCandidateCaptures??"non calculé",
      baselineCandidateCaptures:old.captureCoverage.optionalCandidateBudget.captured,
      currentScreenshotCount:screenshotCount(old.capturePerformance),experimentalScreenshotCount:screenshotCount(profile),
      netScreenshotsSaved:screenshotCount(old.capturePerformance)-screenshotCount(profile),
      finalRecaptures:e.finalRecaptures,freshnessRecaptures:e.freshnessRecaptures,
      deliveredObservations:r.captureCoverage.positions.length,
      baselineCaptureMs:old.capturePerformance.elapsedMs,baselineMode:old.captureCoverage.observationSelection.mode,
      savedCaptureMs:old.capturePerformance.elapsedMs-profile.elapsedMs,verified};
    summaries.push(summary);
    await board(dir,oldDir,name,r,old);
    const views=(folder,result)=>localViews(result).map(v=>'<figure><a href="'+folder+'/'+v.file+'"><img loading="lazy" src="'+folder+'/'+v.file+'"></a><figcaption>'+esc(v.id)+' · '+v.geometry.scrollY+' px</figcaption></figure>').join('');
    const oldRelative=path.relative(dir,oldDir);
    fs.writeFileSync(path.join(dir,"index.html"),'<!doctype html><html lang="fr"><meta charset="utf-8"><style>'+css+'</style><h1>'+esc(name)+' — '+sequencingLabel(r)+'</h1><p>0 Vision / 0 MongoDB / 0 Cloudinary.</p><p>Capture réelle '+sec(summary.captureMs)+' s ; marge '+sec(summary.remainingBudgetMs)+' s ; '+esc(summary.mode)+' ; registre '+esc(summary.registry)+'. Positions '+summary.positions.join(' / ')+'.</p><p>Fallback : '+esc(summary.fallbackReasons.join(', ')||'aucun')+'. '+(e.removedCandidateCaptures??'non calculé')+' positions facultatives supprimées (le run précédent en capturait '+summary.baselineCandidateCaptures+'). Recaptures finales '+e.finalRecaptures+', dont fraîcheur '+e.freshnessRecaptures+'. Les nettoyages persistants et la fraîcheur sont combinés dans une même recapture quand ils concernent la même vue.</p><p><a href="comparative.png">Planche complète</a> · <a href="result.json">Résultat, registre, scores et timings</a> · <a href="verification.json">Contrat/manifeste/preuves</a></p><h2>Phases réellement mesurées</h2>'+table(['Phase','Secondes'],Object.entries(profile.phases).map(([k,v])=>[k,sec(v)]))+'<h2>Cinq contrôles fixes conservés</h2>'+table(['Position','Hauteur','Post-parcours','Signature pixels'],e.fixedControls.map(v=>[v.position,v.observedTotalHeight,v.afterCompleteTraversal,v.signature]))+'<h2>Scores L/D/V/R/G inchangés</h2>'+table(['ID','Position','Scoring','L','D','V','R','G','Raison'],e.scoringSelection.decisions.map(d=>[d.id,d.position,d.selected,...['L','D','V','R','G'].map(k=>d.scores?d.scores[k].toFixed(4):'—'),d.reason]))+'<h2>Livraison et fraîcheur</h2>'+table(['ID','Position','Provenance','Recapture','Fraîcheur','Couches nettoyées'],e.deliveries.map(d=>[d.id,d.position,d.source,d.recaptured,d.freshnessRequired||false,(d.suppressedLayers||[]).join(', ')]))+'<h2>Storyboards — précédent / exécution locale</h2><div class="pair"><img src="'+oldRelative+'/storyboard-current.png"><img src="storyboard-current.png"></div><h2>Observations effectivement livrées</h2><div class="pair"><div class="locals">'+views(oldRelative,old)+'</div><div class="locals">'+views('.',r)+'</div></div></html>');
  }
  const repeats=[];
  for(let i=1;i<=3;i++){
    const dir=path.join(root,"tastavents-repeat",`run-${i}`);
    if(!fs.existsSync(path.join(dir,"result.json")))continue;
    const r=read(path.join(dir,"result.json")),verified=validate(dir,r);
    fs.writeFileSync(path.join(dir,"verification.json"),JSON.stringify(verified,null,2));
    repeats.push({run:i,passed:verified.passed,mode:r.captureCoverage?.observationSelection.mode,registry:diagnostics(r)?.registry.status,
      positions:r.captureCoverage?.positions.map(p=>p.position),captureMs:r.capturePerformance?.elapsedMs,
      wallMs:Date.parse(r.finishedAt)-Date.parse(r.startedAt),phases:r.capturePerformance?.phases,
      remainingBudgetMs:r.captureCoverage?.captureTiming.remainingMs,recaptures:diagnostics(r)?.finalRecaptures,verified});
  }
  fs.writeFileSync(path.join(root,"summary.json"),JSON.stringify({references:summaries,tastaventsFreshConsecutive:repeats},null,2));
  const gucci=summaries.find(s=>s.key==="gucci");
  const report=[
    '# StructuralReference — séquencement local mesuré, 6 octobre 2026',
    '',
    summaries.some(s=>s.normalSequencing)
      ? 'Le dry-run exécute le pipeline produit normal. Les rapports localExperiment décrivent uniquement les visites historiques avant bascule. Aucune donnée précédente n’entre dans les nouvelles captures. 0 Vision/OpenAI, 0 MongoDB, 0 Cloudinary, 0 écritures distantes.'
      : 'Résultats historiques du mode expérimental avant bascule produit. Aucune donnée précédente n’entre dans ces visites. 0 Vision/OpenAI, 0 MongoDB, 0 Cloudinary, 0 écritures distantes.',
    '',
    '## Visites réellement exécutées',
    '',
    '| Référence | Capture s | Total service s | Marge capture s | Registre | Décision | Positions livrées px |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...summaries.map(s=>`| ${s.name} | ${sec(s.captureMs)} | ${sec(s.browserAndPreparationMs)} | ${sec(s.remainingBudgetMs)} | ${s.registry} | ${s.mode} | ${(s.positions||[]).join(' / ')} |`),
    '',
    'Le total service inclut navigation, warm-up, parcours, contrôles, livraison, fermeture navigateur et préparation WebP ; la préparation du contrat est comptée séparément dans le JSON. La capture conserve son plafond de 120 s et sa marge réelle. Ces temps sont mesurés, pas simulés.',
    '',
    '## Détail des phases de capture (secondes)',
    '',
    '| Référence | Identification | Phase A | 5 fixes | Storyboard / sélection / registre | Recapture de fraîcheur (nettoyage inclus) | Nettoyage persistant séparé | Finalisation |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...summaries.map(s=>{const p=s.phases||{};return `| ${s.name} | ${sec(p.identify_scroller||0)} | ${sec(p.mandatory_traversal||0)} | ${sec(p.fixed_samples||0)} | ${sec(p.storyboard_and_selection||0)} | ${sec(p.final_observation_recapture||0)} | ${sec(p.persistent_layer_recapture||0)} | ${sec(p.finalization||0)} |`;}),
    '',
    'Le registre est collecté pendant A et les fixes : son temps DOM est déjà inclus dans ces phases, sans nouvelle évaluation/visite navigateur. Le détail de chaque scroll, sanitation, image gate, stabilisation/gel/intégrité, screenshot et collecte reste dans `result.json → capturePerformance.operations/events`. Aucune phase de tournée des candidats facultatifs n’existe.',
    '',
    '## Comparaison au pipeline courant précédent',
    '',
    '| Référence | Capture précédente s | Capture expérimentale s | Gain observé s | Candidats HD précédemment capturés | Cadrages facultatifs omis | Screenshots totaux précédent → expérimental | Recaptures finales HD (fraîcheur) |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...summaries.map(s=>`| ${s.name} | ${sec(s.baselineCaptureMs)} | ${sec(s.captureMs)} | ${sec(s.savedCaptureMs)} | ${s.baselineCandidateCaptures} | ${s.removedPotentialCandidateCaptures} | ${s.currentScreenshotCount} → ${s.experimentalScreenshotCount} | ${s.finalRecaptures} (${s.freshnessRecaptures}) |`),
    '',
    'Le benchmark précédent est `structural-shadow-reliability-2026-10-06-final` : vraies captures du pipeline courant avec le même registre diagnostique. Il sert uniquement de comparaison. Les cadrages omis comptent toutes les positions que la tournée aurait envisagées ; le run courant pouvait s’arrêter avant de les capturer pour budget. Le gain observé entre visites vivantes n’est pas une mesure causale à contenu/réseau constants. Les storyboards expérimentaux ont moins de panneaux parce qu’ils excluent les cadrages facultatifs, tout en conservant haut/milieu/bas et l’intégralité du parcours.',
    '',
    '## Décisions, preuves et limitations',
    '',
    '- Tastavents : registre reliable, adaptive, pool réellement observé de 23 viewports ; la locale 0 vient de la fixe post-parcours, 10530 est réellement recapturée/revalidée. Le footer n’a aucun bonus.',
    '- Salterra : cette unique nouvelle visite donne unreliable à 10530, couverture 9/11 = 0,8181818 < 0,85. Le scoring seul refuse aussi l’adaptatif. Hauteur 11987 contre 11597 auparavant ; aucun seuil ni gate modifié et aucune nouvelle visite pour obtenir le résultat attendu. Les cinq fixes sont livrées ; quatre recaptures nettoient le panneau persistant, le header restant conservé. L’aperçu de presse montre un média non rendu ; les traces ne permettent pas d’attribuer précisément les deux cellules non couvertes à ce seul média ni d’expliquer causalement toute la variation de hauteur. Aucun probe ajouté. La capacité adaptive Salterra en conditions reliable est préservée par le branchement générique, mais non démontrée par cette visite non fiable.',
    `- Gucci : ${gucci?.registry||'non terminé'}, fallback via la preuve intrinsèque SVG/textPath de Phase A à 2925, hors de l’emprise décrite. Aucune visite à 3310. Les cinq fixes sont réutilisées. Les tentatives de nettoyage persistent restent contrôlées ; elles refusent le masquage pour geometry_or_composition_changed et ne produisent aucun nouveau screenshot. Un passage dans la routine de recapture ne signifie pas qu’un screenshot a été produit : le booléen recaptured et le compteur screenshot font foi.`,
    '- Amici et Khufu’s Bistro : unproven, fallbacks de géométrie non certifiable conservés ; cinq fixes réutilisées sans recapture finale. La vraie galerie Khufu’s et son gel contrôlé restent présents.',
    '- Les cinq contrôles fixes exécutent le même bloc applicatif : positions historiques, screenshots PNG, signatures pixels 64×64, contrôles de hauteur/cadrage/diversité et gates inchangés. Les tests synthétiques démontrent l’identité des signatures entre séquencements sur la même fixture ; l’identité pixel entre visites différentes d’un site vivant n’est pas revendiquée.',
    '- Contrats/manifeste/octet WebP reconstruits à l’identique avec le builder applicatif ; v3, IDs observationN, positions réelles et sources fraîches vérifiés. Au plus cinq locales + un storyboard. Diagnostics exclus du contrat ; le service dry-run local refuse toujours un run persistant. Le séquencement validé ne dépend plus d’une capacité expérimentale.',
    '',
    '## Trois Tastavents frais consécutifs, après les cinq visites',
    '',
    '| Run | Capture s | Total hors rendu des rapports s | Marge s | Décision / registre | Positions px | Recaptures finales |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...repeats.map(s=>`| ${s.run} | ${sec(s.captureMs)} | ${sec(s.wallMs)} | ${sec(s.remainingBudgetMs)} | ${s.mode} / ${s.registry} | ${(s.positions||[]).join(' / ')} | ${s.recaptures} |`),
    '',
    'Chaque run crée un navigateur/parcours/captures neufs ; aucun retry automatique, mesure ni pixel préenregistré. Les diagnostics offline conservent aussi la répétabilité 20/20 du sélecteur sur les mêmes mesures de chaque visite, distincte de ces trois visites fraîches.',
    '',
    'Planches PNG et pages détaillées : `index.html`, puis chaque référence `run-1/index.html`. Registres, preuves fixes, scores, manifestes et profils complets dans les mêmes dossiers. Tests et vérifications finales : `TESTS.md`. Aucun basculement produit ni analyse payante autorisé par ce rapport.',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(root,"RAPPORT.md"),report);
  fs.writeFileSync(path.join(root,"index.html"),'<!doctype html><html lang="fr"><meta charset="utf-8"><style>'+css+'</style><h1>StructuralReference — séquencement local mesuré</h1><p>0 Vision / 0 MongoDB / 0 Cloudinary. Les rapports expérimentaux historiques sont distingués des dry-runs produit. Les comparaisons utilisent le benchmark courant précédent ; aucune donnée précédente n’entre dans ces visites fraîches.</p><p><a href="RAPPORT.md">Rapport end-to-end</a> · <a href="summary.json">Résultats chiffrés</a></p>'+table(['Référence','Capture s','Marge s','Registre','Décision','Positions','Tournée précédente / supprimée','Recaptures finales','Capture précédente s'],summaries.map(s=>[s.name,sec(s.captureMs),sec(s.remainingBudgetMs),s.registry,s.mode,(s.positions||[]).join(' / '),s.baselineCandidateCaptures+' / '+s.removedPotentialCandidateCaptures,s.finalRecaptures,sec(s.baselineCaptureMs)]))+'<ul>'+summaries.map(s=>'<li><a href="'+s.key+'/run-1/index.html">'+esc(s.name)+' — planches, preuves, scores et phases</a></li>').join('')+'</ul><h2>Trois Tastavents frais consécutifs</h2>'+table(['Run','Capture s','Marge s','Mode','Registre','Positions','Recaptures'],repeats.map(s=>[s.run,sec(s.captureMs),sec(s.remainingBudgetMs),s.mode,s.registry,s.positions?.join(' / '),s.recaptures]))+'</html>');
  console.log(JSON.stringify({references:summaries,tastaventsFreshConsecutive:repeats},null,2));
}
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={validate};
