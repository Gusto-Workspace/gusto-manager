// Opt-in experimental contract. V1/V2 remain byte-identical for replay.
const ARTISTIC_EXPERIMENT_VERSION=3;
const OFFSETS=['staggeredColumns','offsetGrid'];
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const totalHeight=(captures,metadata)=>metadata.captureCoverage?.totalHeight||metadata.documentHeight||captures.find(c=>c.type==='desktop_full')?.sourceRect?.height;
const anchorsFor=(captures,metadata,manifest)=>{
  const panels=metadata.captureCoverage?.storyboard?.panels||[];
  return manifest.views.flatMap(v=>v.id==='overview'&&panels.length
    ? panels.map(p=>({viewId:v.id,observationId:p.observationId,range:p.visibleRangePx}))
    : [{viewId:v.id,observationId:v.id,range:v.geometry?.visibleRangePx||[0,totalHeight(captures,metadata)]}]);
};
function schemaV3(base, modes) {
  const schema=structuredClone(base);
  schema.properties.analysisVersion={type:'integer',minimum:3,maximum:3};
  const p=schema.properties.structuralMoments.items.properties;
  p.evidence.properties.anchors={type:'array',minItems:1,maxItems:6,items:object({
    viewId:{type:'string',enum:['overview']},observationId:{type:'string',enum:['overview']},
    startPercent:structuredClone(p.evidence.properties.startPercent),endPercent:structuredClone(p.evidence.properties.endPercent),
    dominantMass:structuredClone(p.geometry.properties.dominantMass),
    imageTextRelationship:structuredClone(p.geometry.properties.imageTextRelationship)
  })};
  p.evidence.required.push('anchors');
  // Geometry/evidence precede the label in the emitted key order. anyOf makes
  // the observed label/regular contradiction unrepresentable in this schema.
  const {layoutMode,...rest}=p;
  const branch=offset=>{
    const value=object({...structuredClone(rest),layoutMode:{...layoutMode,enum:modes.filter(m=>OFFSETS.includes(m)===offset)}});
    if(offset)value.properties.geometry.properties.gridRegularity.enum=['offset'];
    return value;
  };
  schema.properties.structuralMoments.items={anyOf:[branch(false),branch(true)]};
  const {analysisVersion,structuralMoments,rhythmSequence,globalRelations,...summary}=schema.properties;
  schema.properties={analysisVersion,structuralMoments,rhythmSequence,globalRelations,...summary};
  schema.required=Object.keys(schema.properties);
  return schema;
}
function configureV3(schema,captures,metadata,manifest) {
  const anchors=anchorsFor(captures,metadata,manifest);
  const total=totalHeight(captures,metadata);
  if(!(total>0)||anchors.some(a=>typeof a.observationId!=='string'||!a.observationId||!Array.isArray(a.range)||a.range.length!==2||
    !a.range.every(Number.isFinite)||a.range[0]<0||a.range[1]>total||a.range[0]>=a.range[1]))
    throw Object.assign(Error('Géométrie des ancres V3 manquante.'),{status:422,code:'missing_structural_anchor_geometry'});
  for(const s of schema.properties.structuralMoments.items.anyOf) {
    s.properties.evidence.properties.sourceViews.items.enum=manifest.viewOrder;
    s.properties.evidence.properties.anchors.items.properties.viewId.enum=manifest.viewOrder;
    s.properties.evidence.properties.anchors.items.properties.observationId.enum=[...new Set(anchors.map(a=>a.observationId))];
  }
  return anchors;
}
const instructionsV3=`
V3 — ANCRAGE AVANT SYNTHÈSE. Pour chaque assertion structurante, repère le panneau exact et sa plage absolute_page_pixels ; les identifiants autorisés sont dans localMetadata.captureCoverage.storyboard.panels. L’overview est une collection d’observations, jamais une bande continue. Les proportions, la masse dominante et le rapport centre/périphérie se lisent dans les pixels du panneau, pas dans son rang. Les ancres sont de brefs points de vérification factuels, pas un compte rendu de raisonnement.
Avant de décrire un moment, vérifie dans ses anchors : grande typographie devant/derrière de petits médias ; texte central avec images périphériques ; images contiguës remplissant le champ ; texte isolé entouré de vide. Ne confonds pas un grand texte avec une collection d’images, ni une galerie dense avec une pause éditoriale. Une masse typographique peut dominer malgré une photo de fond. Une étiquette inconnue ne dispense pas de décrire le rapport réellement visible.
Chaque anchor cite viewId et observationId exacts, une plage de page intersectant les pixels visibles et le moment, dominantMass et imageTextRelationship réellement observés. Une locale ne prouve que son rectangle. L’absence d’image dans un fragment ne prouve pas son absence dans une phase longue. wholeMoment/direct exige des ancres concordantes couvrant le moment ; sinon localFragment, sampledStates ou inferred/unknown. Ne transforme pas deux états recouvrants d’un même dispositif en nouvelles sections. Une différence d’image ou de texte dans un dispositif stable ne prouve pas une nouvelle composition ni une animation.
Vérifie ensuite la succession des dominances contre les ancres et leurs positions. Si une portion contient des organisations substantiellement différentes, situe une frontière si elle est observée ; sinon décris la variation avec une géométrie unknown, sans inventer une grille ou équilibrer artificiellement plusieurs états. Les globalRelations et principes ne peuvent affirmer plus que leurs moments et ancres : vérifie proches et éloignés, centres/périphéries, reprises d’échelle et bascules de densité avant la synthèse.
CLASSIFICATION APRÈS GÉOMÉTRIE ET PREUVES. staggeredColumns/offsetGrid exigent un décalage spatial observable et gridRegularity offset ; une rangée régulière, des cartes répétées ou des cadres vus à plusieurs scrolls ne suffisent pas. En cas de décalage non vérifiable préfère other et unknown. imagePlacement absent interdit dominantMass image et une relation image/texte superposée ; overlapping exige overlap present. balanced désigne deux masses coprésentes, pas la moyenne d’états tantôt textuels tantôt photographiques. Ne remplace pas une relation exacte par une catégorie prestigieuse. Pas de réparation implicite des champs pour satisfaire un contrôle ; reviens aux preuves ou déclare l’incertitude.
Les principes doivent provenir de relations vérifiées ; leur condition d’emploi doit dire quand le mécanisme spatial fonctionne. Ne transforme pas une incertitude de capture ou un rectangle externe indisponible en intention artistique. Plus de texte, de moments ou de propriétés ne signifie pas une meilleure compréhension. Aucun score artistique auto-attribué.`;
function validateV3(value,captures,metadata,manifest,invalid) {
  const available=anchorsFor(captures,metadata,manifest);
  const total=totalHeight(captures,metadata);
  const intersects=(a,b)=>a[1]>=b[0]-2&&a[0]<=b[1]+2;
  for(const [i,m] of value.structuralMoments.entries()) {
    const prefix=`structuralMoments.${i}`,g=m.geometry,e=m.evidence;
    if(g.imagePlacement==='absent'&&(g.dominantMass==='image'||!['absent','unknown'].includes(g.imageTextRelationship)))
      invalid(`${prefix}.geometry`,{reason:'absent_image_contradiction'});
    if(g.textPlacement==='absent'&&(g.dominantMass==='text'||!['absent','unknown'].includes(g.imageTextRelationship)))
      invalid(`${prefix}.geometry`,{reason:'absent_text_contradiction'});
    if(g.imageTextRelationship==='overlapping'&&g.overlap!=='present')
      invalid(`${prefix}.geometry.overlap`,{reason:'overlap_contradiction'});
    const ranges=[],seen=new Set();
    for(const [j,a] of e.anchors.entries()) {
      const source=available.find(s=>s.viewId===a.viewId&&s.observationId===a.observationId);
      const key=`${a.viewId}:${a.observationId}`;
      if(!source||!e.sourceViews.includes(a.viewId)||seen.has(key))
        invalid(`${prefix}.evidence.anchors.${j}`,{reason:'unknown_duplicate_or_uncited_anchor'});
      seen.add(key);
      const range=[a.startPercent,a.endPercent],moment=[e.startPercent,e.endPercent];
      const visible=source.range.map(n=>100*n/total);
      if(a.startPercent>=a.endPercent||!intersects(range,moment)||
        range[0]<visible[0]-2||range[1]>visible[1]+2||range[0]<moment[0]-2||range[1]>moment[1]+2)
        invalid(`${prefix}.evidence.anchors.${j}`,{reason:'anchor_outside_recorded_pixels'});
      ranges.push(range);
      if(e.scope==='wholeMoment'&&e.level==='direct'&&g.dominantMass!=='unknown'&&
        a.dominantMass!=='unknown'&&a.dominantMass!==g.dominantMass)
        invalid(`${prefix}.geometry.dominantMass`,{reason:'whole_moment_dominance_contradiction'});
    }
    if(e.sourceViews.some(v=>!e.anchors.some(a=>a.viewId===v)))
      invalid(`${prefix}.evidence.sourceViews`,{reason:'source_without_anchor'});
    if(e.scope==='wholeMoment'&&e.level==='direct') {
      let end=e.startPercent;
      for(const range of ranges.sort((a,b)=>a[0]-b[0])) {
        if(range[0]>end+2)invalid(`${prefix}.evidence.scope`,{reason:'unobserved_gap_in_whole_moment'});
        end=Math.max(end,range[1]);
      }
      if(end<e.endPercent-2)invalid(`${prefix}.evidence.scope`,{reason:'fragment_generalized_to_whole_moment'});
    }
  }
  for(const [i,r] of value.globalRelations.entries())if(r.level==='direct'&&r.moments.some(n=>value.structuralMoments[n-1].evidence.level!=='direct'))
    invalid(`globalRelations.${i}.level`,{reason:'relation_exceeds_moment_evidence'});
}
module.exports={ARTISTIC_EXPERIMENT_VERSION,schemaV3,configureV3,validateV3,instructionsV3};
