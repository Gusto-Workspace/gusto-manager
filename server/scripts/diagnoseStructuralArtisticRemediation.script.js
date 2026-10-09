// Offline only: immutable archives in, new diagnostic files out. No HTTP,
// application, database, capture or provider dependency is imported.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {selectStructuralObservations,descriptor,distance}=require('../services/design-lab/structural-observation-selection');
const fixtures=require('../tests/helpers/structural-composition-fixtures');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,value)=>fs.writeFileSync(p,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
function diagnose({snapshot,protocol,run,historicalDiagnostic,earlierPool,out}) {
  fs.mkdirSync(out,{recursive:true});
  const source=read(snapshot),prepared=read(protocol),diagnostic=read(historicalDiagnostic);
  const tasta=prepared.sites.find(s=>s.title==='Tastavents'),cart=prepared.sites.find(s=>s.title==='Cartapani');
  const ref=source.refs.find(r=>String(r._id)===tasta.id);
  const call=id=>read(path.join(run,'calls',id,'parsed.json'));
  const a=call('S1-A'),b=call('S1-B'),c=call('S2-A');
  const comparison=tasta.metadata.captureCoverage.storyboard.panels.map(p=>{
    const range=p.visibleRangePx.map(n=>100*n/tasta.metadata.captureCoverage.totalHeight);
    const related=x=>x.structuralMoments.filter(m=>m.evidence.endPercent>=range[0]&&m.evidence.startPercent<=range[1])
      .map(m=>({order:m.order,range:[m.evidence.startPercent,m.evidence.endPercent],mode:m.layoutMode,geometry:m.geometry||null,
        observation:m.evidence.observation,level:m.evidence.level||null,scope:m.evidence.scope||null}));
    return {observationId:p.observationId,visibleRangePx:p.visibleRangePx,pagePercentRange:range,panelRect:p.rect,
      image:'../structural-b1-ab-background-20261008/runs/'+path.basename(run)+'/blind/S1/overview.webp',
      V1IntersectingAssertions:related(a),V2IntersectingAssertions:related(b)};
  });
  write(path.join(out,'panel-assertion-alignment.json'),comparison);
  const originalSelection=ref.captureCoverage.observationSelection;
  const history=diagnostic.captureDiagnostics.scoringSelection;
  const exactSelectedScoreMatch=originalSelection.selected.every(s=>{
    const d=history.decisions.find(d=>d.position===s.position);return d&&JSON.stringify(d.scores)===JSON.stringify(s.scores);
  });
  const archivedImagesMatch=diagnostic.views.map(v=>({id:v.id,archivedSha256:v.sha256,B1Sha256:tasta.inputAssets.find(a=>a.id===v.id)?.sha256,
    identical:v.sha256===tasta.inputAssets.find(a=>a.id===v.id)?.sha256}));
  write(path.join(out,'selection-diagnosis.json'),{
    appliedB1:{capturedAt:ref.captureCoverage.capturedAt,mode:originalSelection.mode,candidateCount:originalSelection.candidateCount,
      threshold:originalSelection.threshold,selected:originalSelection.selected.map(({descriptor,projectedDimensions,relations,...x})=>x)},
    appliedAttemptTraceAvailable:source.attempts.some(x=>String(x.referenceId)===tasta.id&&x.generationId===tasta.generation&&x.observationTrace),
    earlierDiagnostic:{capturedAt:diagnostic.captureCoverage.capturedAt,exactSelectedScoreMatch,archivedImagesMatch,
      hasCandidateDescriptors:history.decisions.some(d=>d.descriptor),hasRawMeasures:diagnostic.captureDiagnostics.pool.some(d=>d.measures),
      decisions:history.decisions.map(d=>({id:d.id,position:d.position,scores:d.scores,reliability:d.reliability,reason:d.reason}))},
    exactB1CounterfactualAvailable:false,
    limit:'Earlier diagnostic shares positions and selected scores; overview/entry hashes differ and its descriptors/raw measures are absent. The full older pool replay is a distinct capture, not an exact B1 counterfactual.'
  });
  const pool=read(earlierPool),old=selectStructuralObservations(pool),next=selectStructuralObservations(pool,{algorithmVersion:2});
  write(path.join(out,'earlier-pool-selection-comparison.json'),{scope:'same older raw pool; distinct capture from applied B1',sourceSha256:hash(fs.readFileSync(earlierPool)),
    poolPositions:pool.candidates.map(x=>({id:x.id,position:x.position,origin:x.origin})),old,next,
    changedNumericConstants:['threshold','weights','resolution','maxLocalViews'].filter(k=>JSON.stringify(old.config[k])!==JSON.stringify(next.config[k]))});
  const bad=c.structuralMoments.filter(m=>['staggeredColumns','offsetGrid'].includes(m.layoutMode)&&m.geometry.gridRegularity==='regular');
  const total=cart.metadata.captureCoverage.totalHeight;
  write(path.join(out,'cartapani-diagnosis.json'),{responseSha256:hash(fs.readFileSync(path.join(run,'calls/S2-A/parsed.json'))),
    preservedValidation:read(path.join(run,'calls/S2-A/validation.json')),contradictoryMoments:bad,
    rejectedPhase:{range:[54,68],rangePx:[.54*total,.68*total],panels:cart.metadata.captureCoverage.storyboard.panels.filter(p=>p.visibleRangePx[1]>=.54*total&&p.visibleRangePx[0]<=.68*total)},
    conclusions:{demonstrated:['Two label/regular contradictions, orders 6 and 7; validator stops at the first.',
      '54–68% includes repeated sampled states of a central typographic composition with peripheral images and the entry of the training card rail.',
      'The source schema allowed labels and regularity independently; the prompt already prohibited the observed combination.'],
      hypothetical:['Fusion of sampled states and rail entry likely explains the repeated-row story. The internal cause of the category choice remains unknown.']}});
  const names=['immersive','typography','quiet','gallery','gallery','centerPeripheral','editorial',...Array(16).fill('editorial')];
  const visualDir=path.join(out,'fixtures');fs.mkdirSync(visualDir);
  const visualFiles=[];
  for(const name of Object.keys(fixtures.fixtures)) {
    const svg=fixtures.svg(name);fs.writeFileSync(path.join(visualDir,`${name}.svg`),svg,{flag:'wx'});
    visualFiles.push({name,sha256:hash(svg),measures:fixtures.measures(name),descriptorV1:descriptor(fixtures.measures(name)),descriptorV2:descriptor(fixtures.measures(name),2)});
  }
  const synthetic=fixtures.input(names);
  write(path.join(out,'fixture-evidence.json'),{scope:'synthetic technical fixtures, no artistic score',files:visualFiles,
    old:selectStructuralObservations(synthetic),next:selectStructuralObservations(synthetic,{algorithmVersion:2}),
    galleryQuietDistance:distance(descriptor(fixtures.measures('gallery'),2),descriptor(fixtures.measures('quiet'),2))});
  const html=`<!doctype html><html lang="fr"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'unsafe-inline'"><title>Fixtures de composition</title><style>body{font:16px system-ui;background:#eee;margin:30px}main{display:grid;grid-template-columns:repeat(2,minmax(300px,1fr));gap:20px}figure{margin:0;background:white;padding:20px}img{width:100%}</style><h1>Fixtures spatiales synthétiques</h1><p>Les rectangles verts représentent des médias, les masses sombres du texte. Géométries connues, aucune identité de restaurant. Ces fixtures prouvent des distinctions techniques, pas une utilité artistique de 8/10.</p><main>${visualFiles.map(f=>`<figure><figcaption>${f.name}</figcaption><img src="fixtures/${f.name}.svg" alt="Composition ${f.name}"></figure>`).join('')}</main></html>`;
  fs.writeFileSync(path.join(out,'fixtures.html'),html,{flag:'wx'});
  write(path.join(out,'sources.json'),[snapshot,protocol,historicalDiagnostic,earlierPool,...['S1-A','S1-B','S2-A'].map(id=>path.join(run,'calls',id,'parsed.json'))].map(file=>({file,sha256:hash(fs.readFileSync(file))})));
  console.log(JSON.stringify({panelsCompared:comparison.length,contradictions:bad.length,earlierPoolSelected:{old:old.selectedIds,next:next.selectedIds},paidCalls:0,captures:0}));
}
if(require.main===module) {
  const server=path.resolve(__dirname,'..');
  diagnose({snapshot:'/private/tmp/gusto-structural-b1-audit-20261008/baseline-private.json',protocol:path.join(server,'docs/STRUCTURAL_B1_AB_PREPARED.json'),
    run:path.join(server,'diagnostics/structural-b1-ab-background-20261008/runs/2026-10-08T21-04-36-758Z-66b511e9'),
    historicalDiagnostic:path.join(server,'diagnostics/structural-vision-cleanup-2026-10-07/regression-tastavents/run-1/result.json'),
    earlierPool:path.join(server,'diagnostics/structural-shadow-reliability-2026-10-06-final/tastavents/run-1/shadow-input.json'),
    out:path.join(server,'diagnostics/structural-artistic-remediation-20261009')});
}
module.exports={diagnose};
