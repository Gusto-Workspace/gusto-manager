const { filterPresentationTags, sanitizeReferenceAnalysis } = require("./design-lab.service");

const ENGINE_VERSION = "v2";
const IMAGE_INPUT_LIMIT = 16;
const STYLE_FRAME_SIZE = "1024x1536";
const MAX_STYLE_ASSETS = 5;
const MIN_ANCHORS = 2;
const MAX_ANCHORS = 3;
const PREFERRED_MAX_HOME_SECTIONS = 7;
const PREFERRED_MIN_HOME_SECTIONS = 5;
const HOME_ELEMENTS = ["headline", "short_copy", "photography", "invitation", "cta"];
const PRIMARY_HOME_ELEMENTS = HOME_ELEMENTS.filter((element) => element !== "invitation");
const TEASER_HOME_ELEMENTS = ["invitation", "photography", "cta"];
const STOP_ROLES = new Set(["signatureGraphic", "illustration", "badge", "texture"]);
const DOCUMENTARY_FIELDS = ["restaurantSummary", "story", "positioning", "cuisine", "chef", "team", "services", "specialties", "values", "notableFacts", "location", "contact", "openingHours", "usefulContent"];

const own = (value) => JSON.parse(JSON.stringify(value));
const fail = (message) => Object.assign(new Error(message), { status: 502 });
const fatalCategory = (reason, stage) => {
  if (stage === "structural" || ["territory_fields_invalid", "primary_pages_invalid", "content_assignments_invalid", "homepage_moment_count_invalid", "homepage_moment_duplicate", "home_elements_invalid", "color_system_invalid"].includes(reason)) return "FATAL_STRUCTURE";
  if (stage === "referential" || ["destination_not_dedicated_page", "dedicated_topic_page_invalid", "visual_plan_section_mismatch"].includes(reason)) return "FATAL_REFERENTIAL";
  return "FATAL_BUSINESS_CONTRACT";
};
const validationFail = (message, { validationStage, fieldPath, reason, momentId = null, placement = null, destinationPageId = null, detailsSafe = null }) => Object.assign(fail(message), {
  code: "DIRECTIONS_V2_VALIDATION",
  validation: { category: fatalCategory(reason, validationStage), validationStage, fieldPath, momentId, placement, destinationPageId, reason, detailsSafe },
});
const architectureFail = (message, { fieldPath = "siteInformationArchitecture", momentId = null, placement = null, destinationPageId = null, reason, detailsSafe = null }) => validationFail(`Architecture V2 : ${message}`, {
  validationStage: "site_information_architecture", fieldPath, momentId, placement, destinationPageId, reason, detailsSafe,
});
const id = (value) => String(value?._id || value?.id || value || "");
const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const boundedPrompt = (parts, label) => {
  const prompt = parts.filter(Boolean).join("\n");
  if (prompt.length > 30000) throw fail(`Prompt ${label} trop long pour l'endpoint Images.`);
  return prompt;
};

function documentaryContext(project) {
  const restaurant = { name: project.name, ...own(project.brief || {}) };
  delete restaurant.existingWebsite;
  const context = project.brief?.existingWebsite && project.existingWebsiteContext
    ? Object.fromEntries(DOCUMENTARY_FIELDS.map((field) => [field, own(project.existingWebsiteContext[field] ?? null)]))
    : null;
  return { manualBrief: restaurant, existingWebsiteContext: context, rule: "Le brief manuel prime. Ancien site = faits et contenu uniquement ; ignorer tout design, couleurs, typographie, mise en page, images et CSS." };
}

function portfolioDivergence(summary, similarity = 50) {
  const count = Number(summary?.siteCount || 0);
  const frequent = (summary?.frequentPatterns || [])
    .filter((pattern) => Number(pattern.count) >= 2)
    .map((pattern) => ({ visualPattern: pattern.tag, siteCount: pattern.count }));
  const low = Number(similarity) < 35;
  return {
    role: low ? "counter_reference" : Number(similarity) > 65 ? "continuity_check" : "comparison_only",
    siteCount: count,
    divergenceConstraints: low ? [
      "Ne pas utiliser le Portfolio comme inspiration positive ni envoyer ses captures au modèle image.",
      ...frequent.map(({ visualPattern, siteCount }) => `Éviter l'automatisme Gusto « ${visualPattern} » (${siteCount}/${count} sites), sauf justification spécifique au restaurant ; explorer une autre solution visuelle.`),
    ] : [],
    comparisonPatterns: low ? [] : frequent,
  };
}

function eligibleAssets(project) {
  const seen = new Set();
  return (project.assets || []).filter((asset) => {
    if (asset.benchmarkExcluded || !asset.url || !asset.publicId || seen.has(asset.publicId)) return false;
    seen.add(asset.publicId);
    return true;
  });
}

function referenceCandidates(references, indexes = references.map((_reference, index) => index)) {
  return indexes.map((index) => {
    const reference = references[index];
    const cleaned = sanitizeReferenceAnalysis(reference);
    return {
      index,
      referenceId: id(reference),
      name: reference.artifactTypes?.length ? `Référence ${index + 1}` : reference.name,
      visualTags: filterPresentationTags(reference.visualTags, reference.artifactTypes),
      analysis: cleaned.analysis,
      characteristics: cleaned.characteristics,
      artifactTypesToIgnore: reference.artifactTypes || [],
      businessContextOnly: filterPresentationTags(reference.businessTags, reference.artifactTypes),
    };
  });
}

const short = (value, limit = 120) => {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  const slice = text.slice(0, limit);
  const punctuation = Math.max(slice.lastIndexOf(", "), slice.lastIndexOf("; "), slice.lastIndexOf(". "));
  const boundary = punctuation > limit * 0.6 ? punctuation : slice.lastIndexOf(" ");
  return slice.slice(0, boundary > 0 ? boundary : limit).replace(/[,;.]\s*$/, "").replace(/\s+(?:de|du|des|et|avec|pour|dans|sur|en|à)$/i, "").trim();
};

function compactReferenceCandidates(references) {
  return references.map((reference, index) => {
    const cleaned = sanitizeReferenceAnalysis(reference);
    const analysis = cleaned.analysis || {};
    const characteristics = cleaned.characteristics || {};
    return {
      index,
      name: reference.artifactTypes?.length ? `Référence ${index + 1}` : short(reference.name, 45),
      visualConcept: short([...(filterPresentationTags(reference.visualTags, reference.artifactTypes) || [])].slice(0, 5).join(", "), 80),
      compositionGrammar: short(characteristics.composition || analysis.composition, 65),
      rhythm: short(characteristics.pageRhythm || analysis.rhythm, 55),
      typographyTerritory: short(characteristics.typography || analysis.typography, 55),
      paletteTerritory: short(characteristics.colors || analysis.colors, 55),
      photographyTreatment: short(characteristics.photography || analysis.photography, 55),
      distinctiveMoves: short(analysis.originality || characteristics.shapes, 70),
      artifactTypesToIgnore: (reference.artifactTypes || []).slice(0, 5),
      antiCopyReminder: "Principes seuls ; ne pas copier.",
    };
  });
}

function directionInputs(project, portfolioSummary, avoid = []) {
  const brandContinuity = project.creativeSettings?.brandContinuity || "reinvent";
  return {
    documentaryContext: documentaryContext(project),
    portfolio: portfolioDivergence(portfolioSummary, project.creativeSettings?.gustoSimilarity),
    clientAssets: eligibleAssets(project).map((asset) => ({ assetId: id(asset), name: asset.name, role: asset.role, signature: !!asset.signature })),
    creativeSettings: { ...own(project.creativeSettings || {}), brandContinuity },
    avoidExistingDirections: avoid,
  };
}

function buildCreativeTerritoriesRequest(project, references, portfolioSummary, { count = 3, avoid = [], targetSlot = "A" } = {}) {
  const payload = {
    ...directionInputs(project, portfolioSummary, avoid),
    compactReferences: compactReferenceCandidates(references),
    territoriesRequested: count,
  };
  const instructions = `Tu es directeur de création pour un site de restaurant. Trouve exactement ${count} territoire(s) créatif(s) ${count === 3 ? "A, B et C, réellement distincts" : "nouveau"} pour CE restaurant. Ce premier appel verrouille des IDÉES artistiques fortes et différentes, pas des directions détaillées. Pour chacun, donne une idée de marque, une thèse, personnalité, territoire visuel, orientation couleur conceptuelle, typographie, photographie, espace, différenciateur majeur et différence explicite avec les autres. Sélectionne 2 ou 3 likelyReferenceAnchors parmi les index des compactReferences, selon leurs PRINCIPES visuels ; n'imite ni marque, ni layout exact, ni artefact de présentation. Ne produis PAS brandSystem, visualSystem, siteInformationArchitecture, homepageBlueprint ou règles de sections détaillées. A/B/C doivent diverger en typographie, formes, photographie, espace, rythme et composition, pas seulement par couleur. Évite les directions génériques beige+serif, héro centré standard, alternance texte/photo et trois cartes. Le brief manuel prime ; existingWebsiteContext est documentaire seulement. Never infer visual inspiration from the existing website. Do not reproduce its layout, colors, typography or design language. Le Portfolio est ${payload.portfolio.role} et ses divergenceConstraints sont des contre-références, jamais des inspirations positives. Assets client = contenu réel, pas autorité automatique de palette. Réponds en français.`;
  return { instructions: count === 1 ? `${instructions} Pour cette régénération unitaire, l'ID du territoire est exactement ${targetSlot}.` : instructions, payload };
}

function buildDirectionExpansionRequest(project, references, portfolioSummary, territories, territoryId, { avoid = [] } = {}) {
  const territory = territories.find((item) => item.id === territoryId);
  if (!territory) throw fail(`Territoire ${territoryId} introuvable.`);
  const base = directionInputs(project, portfolioSummary, avoid);
  const payload = {
    ...base,
    yourTerritory: territory,
    reservedForOtherTerritories: territories.filter((item) => item.id !== territoryId).map(({ id: otherId, name, creativeThesis, visualTerritory, conceptualColorDirection, typographicTerritory, photographicTerritory, spatialTerritory, majorDifferentiator }) => ({ id: otherId, name, creativeThesis, visualTerritory, conceptualColorDirection, typographicTerritory, photographicTerritory, spatialTerritory, majorDifferentiator })),
    selectedReferenceDetails: referenceCandidates(references, territory.likelyReferenceAnchors),
  };
  const instructions = `Tu es directeur de création pour un site de restaurant. Développe UNE seule direction V2 complète à partir de YOUR TERRITORY (${territoryId}), en respectant son idée, sa thèse et ses systèmes typographique, photographique, spatial et chromatique. RESERVED FOR OTHER TERRITORIES décrit les territoires des autres directions : ne converge jamais vers eux. Produis brandSystem (identité), visualSystem (grammaire web), puis siteInformationArchitecture (répartition du contenu entre pages) AVANT tout plan de homepage. Déduis primaryPages et contentAssignments uniquement du brief et des faits documentaires disponibles ; n'invente pas un service. Pour chaque sujet, décide homepage_primary, homepage_teaser, dedicated_page, global_navigation, footer_only ou optional. La homepage est une introduction éditoriale mémorable ; elle ne recopie pas toutes les pages du site. Réserve à une page dédiée les menus/plats/prix, la réservation détaillée, le traiteur détaillé, le contact pratique, les horaires et les formulaires lorsqu'ils existent. Un sujet métier peut être teasé très brièvement sur la home avec CTA vers sa page ; ses détails vont dans dedicatedPageTopics, jamais dans homepageMoments. Préfère généralement 5 à 7 grands homepageMoments, sans quota : 4 ou 8 moments cohérents sont légitimes. Adapte les moments au brandSystem et au visualSystem, avec textes concis, espaces et rythme ; un moment peut être surtout visuel/typographique. Le premier est un hero. homepageMoments ne doivent référencer dans contentTopics que des sujets classés homepage_primary ou homepage_teaser ; les teasers ont destinationPageId correspondant à primaryPages. Ne crée ni widget de réservation, ni mini-menu, ni formulaire. rhythmMap et sectionClimatePlan référencent exactement les IDs des homepageMoments. Documentaire = faits seulement ; le brief manuel prime. Never infer visual inspiration from the existing website. Do not reproduce its layout, colors, typography or design language. Le Portfolio est ${payload.portfolio.role} ; à faible similarité, applique ses divergenceConstraints comme contre-références, jamais comme inspirations positives. DesignReference = inspirations visuelles positives ; utilise exactement 2 ou 3 referenceAnchors parmi les index de selectedReferenceDetails, avec raison et principes précis. Les businessTags des références ne sont que du contexte. Ignore tout artefact de planche. Assets client = vrais contenus, pas automatiquement autorité de palette. Continuité de marque = ${base.creativeSettings.brandContinuity}: reinvent signifie conserver éventuellement la forme du logo mais pas ses couleurs ; evolve autorise des éléments choisis ; preserve peut conserver la palette. Toute couleur principale a un rôle, un usage, une fréquence et une provenance explicite ; aucune provenance inventée à partir des pixels non vus. SignatureMoves: privilégie 2 à 4 gestes et 1 à 2 occurrences, mais une identité minimaliste ou une répétition justifiée peut demander moins ou plus. Évite les accolades/guillemets géants, filets répétés, beige+serif automatique, alternance texte/photo, trois cartes et effets décoratifs gratuits. La répétition de climat ou de layout peut créer calme et continuité ; évite seulement une monotonie non intentionnelle. Ne force aucune alternance. Privilégie composition, échelle, espace, contraste et rapport texte/image. Réponds en français.`;
  const placementContract = [
    "CONTRAT DE PLACEMENT (siteInformationArchitecture) : homepage_primary = moment autonome et concis, même très court (hero, manifeste, présentation de la maison). Il peut n'exister que sur la home ; destination null s'il ne mène à aucune page.",
    "homepage_teaser ne signifie JAMAIS « contenu court » : c'est l'aperçu d'un sujet développé sur une primaryPage dédiée. L'affectation targetPageId et le moment destinationPageId contiennent le même ID de page dédiée ; ses détails vont uniquement dans dedicatedPageTopics.",
    "Chaque homepageMoment a des contentTopics d'une seule classification, jamais un mélange primary/teaser. Le hero porte homepage_primary ; un hero ou un manifeste n'est pas un teaser du seul fait de sa brièveté. dedicated_page, global_navigation, footer_only et optional restent hors homepageMoments.",
    "homepage_primary exige contentScope=primary et au moins une primitive parmi headline, short_copy, photography, cta, librement combinées. Aucun headline ni CTA obligatoire, même pour le hero ; une photo seule ou photo + texte bref peut être intentionnelle. homepage_teaser exige contentScope=teaser_only, homeElements=invitation et cta avec photography facultative. Aucun élément fonctionnel détaillé n'est permis sur la home.",
    "Pour un teaser, contentIntent reste vide car les détails ne passent pas par ce champ. Exprime son intention courte dans editorialIntent={kind: invitation, headlineIdea (120 caractères maximum), tone (80), ctaLabel (60, non vide)}. Une headline comme « Le goût du partage » est autorisée. Ce slot éditorial ne contient ni liste de prestations ni fonctionnalité ; les détails restent dans dedicatedPageTopics. Pour un primary, editorialIntent peut être null. Réservation : invitation et CTA Réserver vers booking ; disponibilité, convives, créneaux et formulaire restent dédiés. Traiteur : invitation, photo facultative et CTA ; prestations, formules et devis restent dédiés.",
    "Ne crée aucune route fictive. La home présente, séduit et oriente ; les pages dédiées développent.",
  ].join(" ");
  const validationContract = "CONTRAT DE VALIDATION : exactement une primaryPage homepage, IDs de pages/sujets/moments uniques et non vides ; au moins un homepageMoment exploitable, momentRole=hero uniquement pour le premier, momentRole=section pour tous les suivants, aucun footer parmi eux. Pour un homepage_teaser, contentIntent est vide ; editorialIntent décrit uniquement une invitation courte, sa tonalité et son CTA, jamais un contenu détaillé. Pour un homepage_primary, contentIntent reste une intention éditoriale courte. Toute destination de teaser ou de dedicated_page est l'ID d'une primaryPage dedicated existante ; dedicatedPageTopics ne vise que ces pages. rhythmMap et sectionClimatePlan couvrent une fois chacun exactement les IDs des moments. GUIDANCE ARTISTIQUE NON BLOQUANTE : 5 à 7 moments et trois climats/layouts sont des repères, pas un template. Une répétition voisine peut être volontaire ; ne crée aucune diversité artificielle. Deux ou trois referenceAnchors uniques choisis dans selectedReferenceDetails, avec pourquoi et principes. 3 à 5 traits, au plus 3 gestes graphiques, des antiPatterns et 2 à 4 signatures avec 1 ou 2 occurrences sont conseillés ; moins ou plus peut être justifié. maxOccurrences est un entier non négatif. Les six rôles couleur obligatoires ont hex #RRGGBB, rôle, usage et provenance justifiée ; en mode reinvent, jamais clientBrandConstraint. Le territoire ne doit pas reproduire la structure des deux autres directions.";
  return { instructions: `${instructions}\n${placementContract}\n${validationContract}`, payload };
}

function validateCreativeTerritories(territories, references, count = 3, targetSlot = "A") {
  const ids = count === 3 ? ["A", "B", "C"] : [targetSlot];
  if (!Array.isArray(territories) || territories.length !== count || territories.some((item, index) => item.id !== ids[index])) throw validationFail(`OpenAI doit fournir exactement ${count} territoire(s) dans l'ordre ${ids.join("/")}.`, { validationStage: "structural", fieldPath: "territories", reason: "territory_count_or_ids_invalid" });
  for (const territory of territories) {
    const anchors = territory.likelyReferenceAnchors;
    const required = ["name", "brandIdea", "creativeThesis", "visualTerritory", "conceptualColorDirection", "typographicTerritory", "photographicTerritory", "spatialTerritory", "majorDifferentiator", "explicitDifferenceFromOthers"];
    if (required.some((field) => !String(territory[field] || "").trim())) throw validationFail(`Territoire ${territory.id} incomplet.`, { validationStage: "structural", fieldPath: `territories.${territory.id}`, reason: "territory_fields_invalid" });
    if (!Array.isArray(anchors) || anchors.length < MIN_ANCHORS || anchors.length > MAX_ANCHORS || new Set(anchors).size !== anchors.length || anchors.some((index) => !Number.isInteger(index) || !references[index]?.image?.url)) throw validationFail(`Territoire ${territory.id} : références invalides.`, { validationStage: "referential", fieldPath: `territories.${territory.id}.likelyReferenceAnchors`, reason: "territory_anchors_invalid" });
  }
  const fields = ["visualTerritory", "conceptualColorDirection", "typographicTerritory", "photographicTerritory", "spatialTerritory"];
  const alike = (left, right) => {
    const a = new Set(normalize(left).split(/[^a-z]+/).filter((term) => term.length > 3));
    const b = new Set(normalize(right).split(/[^a-z]+/).filter((term) => term.length > 3));
    if (!a.size || !b.size) return false;
    return [...a].filter((term) => b.has(term)).length / Math.max(a.size, b.size) >= 0.75;
  };
  const similar = territories.some((left, index) => territories.slice(index + 1).some((right) => fields.filter((field) => alike(left[field], right[field])).length >= 3));
  return territories.map((territory) => ({ ...territory, qualityWarnings: [
    ...(similar ? [{ code: "territories_too_similar", fieldPath: "territories", message: "Les territoires partagent plusieurs axes artistiques ; vérifier leur différenciation." }] : []),
    ...((territory.brandPersonality || []).length < 3 ? [{ code: "territory_personality_under_preferred_count", fieldPath: "brandPersonality", message: "Moins de trois traits de personnalité explicités." }] : []),
  ] }));
}

function validateDirectionsV2(directions, references, count = 3, { portfolioConstraints = [], brandContinuity = "reinvent", allowedReferenceIndexes = null } = {}) {
  if (!Array.isArray(directions) || directions.length !== count) throw validationFail(`OpenAI doit fournir exactement ${count} directions V2.`, { validationStage: "structural", fieldPath: "directions", reason: "direction_count_invalid" });
  const mapped = directions.map((direction) => {
    // Server-owned advice is rebuilt on every validation, never trusted from model output.
    const qualityWarnings = [];
    const warn = (code, fieldPath, message) => qualityWarnings.push({ code, fieldPath, message });
    const anchors = direction.visualSystem?.referenceAnchors || [];
    if (anchors.length < MIN_ANCHORS || anchors.length > MAX_ANCHORS) throw validationFail("Une direction V2 exige 2 ou 3 referenceAnchors.", { validationStage: "referential", fieldPath: "visualSystem.referenceAnchors", reason: "reference_anchor_count_invalid" });
    if (new Set(anchors.map((anchor) => anchor.referenceIndex)).size !== anchors.length) throw validationFail("ReferenceAnchors dupliquées.", { validationStage: "referential", fieldPath: "visualSystem.referenceAnchors", reason: "reference_anchor_duplicate" });
    for (const [index, anchor] of anchors.entries()) if (!Number.isInteger(anchor.referenceIndex) || !references[anchor.referenceIndex]?.image?.url || (allowedReferenceIndexes && !allowedReferenceIndexes.includes(anchor.referenceIndex)) || !String(anchor.why || "").trim() || !Array.isArray(anchor.principles) || !anchor.principles.some((principle) => String(principle || "").trim())) throw validationFail("ReferenceAnchor invalide, non pressentie ou sans image.", { validationStage: "referential", fieldPath: `visualSystem.referenceAnchors[${index}]`, reason: "reference_anchor_invalid" });
    const architecture = direction.siteInformationArchitecture || {};
    const pages = architecture.primaryPages || [];
    const assignments = architecture.contentAssignments || [];
    const sections = architecture.homepageMoments || [];
    const pageIds = new Set(pages.map((page) => page.id));
    if (!String(architecture.homepageRole || "").trim() || pages.some((page) => !String(page.id || "").trim()) || pages.filter((page) => page.role === "homepage").length !== 1 || pageIds.size !== pages.length) throw architectureFail("pages principales invalides.", { fieldPath: "siteInformationArchitecture.primaryPages", reason: "primary_pages_invalid" });
    if (assignments.length === 0 || assignments.some((item) => !normalize(item.topic).trim()) || new Set(assignments.map((item) => normalize(item.topic))).size !== assignments.length) throw architectureFail("affectations de contenu absentes ou dupliquées.", { fieldPath: "siteInformationArchitecture.contentAssignments", reason: "content_assignments_invalid" });
    const byTopic = new Map(assignments.map((item) => [normalize(item.topic), item]));
    for (const [assignmentIndex, assignment] of assignments.entries()) {
      if (!["homepage_teaser", "dedicated_page"].includes(assignment.classification)) continue;
      const moment = sections.find((section) => section.contentTopics?.some((topic) => normalize(topic) === normalize(assignment.topic)));
      const target = String(assignment.targetPageId || "").trim();
      const detail = { fieldPath: `siteInformationArchitecture.contentAssignments[${assignmentIndex}].targetPageId`, momentId: moment?.id || null, placement: assignment.classification, destinationPageId: target || null };
      if (!target) throw architectureFail(`page dédiée absente pour ${assignment.topic}.`, { ...detail, reason: `${assignment.classification}_requires_destination` });
      if (!pages.some((page) => page.id === target && page.role === "dedicated")) throw architectureFail(`destination non dédiée pour ${assignment.topic}.`, { ...detail, reason: "destination_not_dedicated_page" });
    }
    if (!sections.length) throw architectureFail("la homepage exige au moins un moment exploitable.", { fieldPath: "siteInformationArchitecture.homepageMoments", reason: "homepage_moment_count_invalid" });
    if (sections.length < PREFERRED_MIN_HOME_SECTIONS || sections.length > PREFERRED_MAX_HOME_SECTIONS) warn("homepage_moment_count_outside_preferred_range", "siteInformationArchitecture.homepageMoments", "5–7 moments sont une cible conseillée ; ce découpage reste exploitable.");
    if (sections.some((section) => !String(section.id || "").trim()) || new Set(sections.map((section) => section.id)).size !== sections.length) throw architectureFail("sections sans ID ou dupliquées.", { fieldPath: "siteInformationArchitecture.homepageMoments", reason: "homepage_moment_duplicate" });
    if (sections[0].momentRole !== "hero") throw architectureFail("la première section doit être l'ouverture/hero.", { fieldPath: "siteInformationArchitecture.homepageMoments[0].momentRole", momentId: sections[0].id, reason: "homepage_hero_missing" });
    const duplicateHero = sections.slice(1).find((section) => section.momentRole !== "section");
    if (duplicateHero) throw architectureFail("hero ou rôle hors section dupliqué dans les séquences.", { fieldPath: "siteInformationArchitecture.homepageMoments", momentId: duplicateHero.id, reason: "homepage_hero_or_footer_duplicate" });
    for (const [sectionIndex, section] of sections.entries()) {
      const destination = String(section.destinationPageId || "").trim();
      const fieldPath = `siteInformationArchitecture.homepageMoments[${sectionIndex}]`;
      const detail = { fieldPath, momentId: section.id, placement: section.placement, destinationPageId: destination || null };
      const topics = Array.isArray(section.contentTopics) ? section.contentTopics.map((topic) => byTopic.get(normalize(topic))) : [];
      if (!topics.length || topics.some((assignment) => !["homepage_primary", "homepage_teaser"].includes(assignment?.classification))) throw architectureFail(`contenu hors homepage dans ${section.id}.`, { ...detail, fieldPath: `${fieldPath}.contentTopics`, reason: "topic_not_on_homepage" });
      if (!["homepage_primary", "homepage_teaser"].includes(section.placement) || topics.some((assignment) => assignment.classification !== section.placement)) throw architectureFail(`placement incohérent dans ${section.id}.`, { ...detail, fieldPath: `${fieldPath}.placement`, reason: "homepage_moment_placement_mismatch" });
      if (section.momentRole === "hero" && section.placement !== "homepage_primary") throw architectureFail(`hero non primaire dans ${section.id}.`, { ...detail, fieldPath: `${fieldPath}.placement`, reason: "hero_must_be_homepage_primary" });
      const expectedScope = section.placement === "homepage_teaser" ? "teaser_only" : "primary";
      if (section.contentScope !== expectedScope) throw architectureFail(`portée de contenu incohérente dans ${section.id}.`, { ...detail, fieldPath: `${fieldPath}.contentScope`, reason: "home_content_scope_mismatch" });
      if (section.placement === "homepage_teaser" && section.contentIntent !== "") throw architectureFail(`intention détaillée interdite dans le teaser ${section.id}.`, { ...detail, fieldPath: `${fieldPath}.contentIntent`, reason: "teaser_content_intent_must_be_empty" });
      if (section.placement === "homepage_teaser") {
        const editorial = section.editorialIntent;
        if (!editorial || editorial.kind !== "invitation" || Object.keys(editorial).some((key) => !["kind", "headlineIdea", "tone", "ctaLabel"].includes(key)) || [["headlineIdea", 120], ["tone", 80], ["ctaLabel", 60]].some(([key, limit]) => typeof editorial[key] !== "string" || editorial[key].length > limit) || !editorial.ctaLabel.trim()) throw architectureFail(`intention éditoriale de teaser invalide dans ${section.id}.`, { ...detail, fieldPath: `${fieldPath}.editorialIntent`, reason: "teaser_editorial_intent_invalid" });
      }
      const elements = section.homeElements;
      const allowed = section.placement === "homepage_teaser" ? TEASER_HOME_ELEMENTS : PRIMARY_HOME_ELEMENTS;
      const required = section.placement === "homepage_teaser" ? ["invitation", "cta"] : [];
      const disallowedElement = Array.isArray(elements) && elements.some((element) => !allowed.includes(element));
      if (!Array.isArray(elements) || !elements.length || disallowedElement || required.some((element) => !elements.includes(element))) throw architectureFail(`éléments de home invalides dans ${section.id}.`, { ...detail, fieldPath: `${fieldPath}.homeElements`, reason: section.placement === "homepage_teaser" && disallowedElement ? "dedicated_page_detail_not_allowed_in_home_teaser" : "home_elements_invalid", detailsSafe: { homeElements: Array.isArray(elements) ? elements.slice(0, 8).map((element) => HOME_ELEMENTS.includes(element) ? element : "[invalid]") : [] } });
      if (section.placement === "homepage_teaser" && !destination) throw architectureFail(`teaser sans page dédiée dans ${section.id}.`, { ...detail, fieldPath: `${fieldPath}.destinationPageId`, reason: "homepage_teaser_requires_destination" });
      if (destination && !pages.some((page) => page.id === destination && page.role === "dedicated")) throw architectureFail(`destination invalide dans ${section.id}.`, { ...detail, fieldPath: `${fieldPath}.destinationPageId`, reason: "destination_not_dedicated_page" });
      if (section.placement === "homepage_teaser" && topics.some((assignment) => assignment.targetPageId !== destination)) throw architectureFail(`destination du teaser incohérente dans ${section.id}.`, { ...detail, fieldPath: `${fieldPath}.destinationPageId`, reason: "homepage_teaser_destination_mismatch" });
    }
    if ((architecture.dedicatedPageTopics || []).some((item) => !pages.some((page) => page.id === item.pageId && page.role === "dedicated"))) throw architectureFail("sujet dédié sans page.", { fieldPath: "siteInformationArchitecture.dedicatedPageTopics", reason: "dedicated_topic_page_invalid" });
    const ids = new Set(sections.map((section) => section.id));
    for (const plan of [direction.visualSystem?.rhythmMap, direction.visualSystem?.sectionClimatePlan]) {
      if (!Array.isArray(plan) || plan.length !== sections.length || new Set(plan.map((item) => item.sectionId)).size !== sections.length || plan.some((item) => !ids.has(item.sectionId))) throw validationFail("Rythme ou climats V2 incohérents avec les sections.", { validationStage: "visual_system", fieldPath: plan === direction.visualSystem?.rhythmMap ? "visualSystem.rhythmMap" : "visualSystem.sectionClimatePlan", reason: "visual_plan_section_mismatch" });
    }
    const adjacentRepeat = sections.find((section, index) => index && section.layoutMode === sections[index - 1].layoutMode && section.climate === sections[index - 1].climate);
    if (adjacentRepeat) warn("adjacent_rhythm_repeated", "siteInformationArchitecture.homepageMoments", "Des moments voisins partagent climat et layout ; vérifier que cette continuité est intentionnelle.");
    if ((direction.brandSystem?.graphicLanguage || []).length > 3) warn("graphic_language_outside_preferred_range", "brandSystem.graphicLanguage", "Plus de trois gestes graphiques : vérifier leur nécessité.");
    const signatures = direction.visualSystem?.signatureMoves || [];
    if (signatures.length < 2 || signatures.length > 4) warn("signature_count_outside_preferred_range", "visualSystem.signatureMoves", "2–4 signatures sont conseillées, sans imposer des effets à une direction minimaliste.");
    if ((direction.brandSystem?.brandPersonality || []).length < 3 || (direction.brandSystem?.brandPersonality || []).length > 5) warn("personality_outside_preferred_range", "brandSystem.brandPersonality", "3–5 traits sont conseillés pour préciser la personnalité.");
    if (!(direction.visualSystem?.antiPatterns || []).length) warn("antipatterns_missing", "visualSystem.antiPatterns", "Aucun anti-pattern explicité.");
    if (signatures.some((move) => !Number.isInteger(move.maxOccurrences) || move.maxOccurrences < 0)) throw validationFail("Limite de signature inexploitable.", { validationStage: "structural", fieldPath: "visualSystem.signatureMoves", reason: "signature_occurrences_invalid" });
    if (signatures.some((move) => move.maxOccurrences === 0 || move.maxOccurrences > 2)) warn("signature_occurrences_outside_preferred_range", "visualSystem.signatureMoves", "Vérifier les signatures inutilisées ou répétées ; 1–2 occurrences sont une préférence.");
    if (new Set(sections.map((section) => section.climate)).size < 3) warn("low_climate_diversity", "siteInformationArchitecture.homepageMoments", "Moins de trois climats ; un langage calme peut être intentionnel.");
    if (new Set(sections.map((section) => section.layoutMode)).size < 3) warn("low_layout_diversity", "siteInformationArchitecture.homepageMoments", "Moins de trois layouts ; une séquence éditoriale peut être intentionnelle.");
    const colors = Object.entries(direction.brandSystem?.colorSystem || {}).filter(([, value]) => value && typeof value === "object");
    if (colors.length < 6 || colors.some(([, color]) => !color.role || !color.sourceType || !color.sourceExplanation || !color.usage || !/^#[\da-f]{6}$/i.test(color.hex))) throw validationFail("Provenance ou rôles de couleur V2 incomplets.", { validationStage: "brand_system", fieldPath: "brandSystem.colorSystem", reason: "color_system_invalid" });
    if (brandContinuity === "reinvent" && colors.some(([, color]) => color.sourceType === "clientBrandConstraint")) throw validationFail("En mode reinvent, les couleurs existantes ne sont pas des contraintes de marque.", { validationStage: "brand_system", fieldPath: "brandSystem.colorSystem", reason: "reinvent_brand_color_constraint" });
    return {
      ...direction,
      siteInformationArchitecture: { ...architecture, homepageMoments: sections.map((section) => ({ ...section, homeElements: [...new Set(section.homeElements)] })) },
      qualityWarnings,
      engineVersion: ENGINE_VERSION,
      referencesUsed: anchors.map((anchor) => references[anchor.referenceIndex]._id),
      visualSystem: {
        ...direction.visualSystem,
        referenceAnchors: anchors.map(({ referenceIndex, ...anchor }) => ({ ...anchor, referenceId: references[referenceIndex]._id })),
        divergenceConstraints: [...new Set([...(direction.visualSystem.divergenceConstraints || []), ...portfolioConstraints])],
      },
    };
  });
  return mapped;
}

function directionsStructurallySimilar(directions) {
  if (directions.length < 2) return false;
  const similarField = (left, right) => {
    if (left === right && left) return true;
    const terms = (value) => new Set(value.split(/[^a-z]+/).filter((term) => term.length > 3));
    const a = terms(left), b = terms(right);
    if (a.size < 2 || b.size < 2) return false;
    const shared = [...a].filter((term) => b.has(term)).length;
    return shared / Math.max(a.size, b.size) >= 0.75;
  };
  const signature = (direction) => {
    const b = direction.brandSystem || {}, v = direction.visualSystem || {};
    return [b.typographicVoice, b.shapeLanguage, b.photographicLanguage, b.spatialLanguage, v.layoutGrammar, (direction.siteInformationArchitecture?.homepageMoments || []).map((s) => `${s.layoutMode}:${s.climate}`).join("|")].map(normalize);
  };
  return directions.some((left, index) => directions.slice(index + 1).some((right) => {
    const a = signature(left), b = signature(right);
    return a.filter((value, i) => similarField(value, b[i])).length >= 3;
  }));
}

function assertStyleFrameApproved(direction, frameId = direction.approvedStyleFrameId) {
  if (direction.engineVersion !== ENGINE_VERSION) throw Object.assign(new Error("Direction d'un ancien moteur non prise en charge."), { status: 409 });
  const frame = (direction.styleFrames || []).find((item) => id(item) === id(frameId));
  if (!frame?.approvedAt) throw Object.assign(new Error("Validez un Style Frame avant de générer la homepage."), { status: 409 });
  return frame;
}

function selectStyleFrameMoments(direction) {
  const all = direction.siteInformationArchitecture?.homepageMoments || [];
  if (all.length < 3 || new Set(all.map((moment) => moment.id)).size !== all.length)
    throw fail("Trois moments homepage distincts sont requis pour le Style Frame.");
  const visual = direction.visualSystem || {};
  const moments = all.map((moment, index) => ({
    ...own(moment), sourceIndex: index,
    climate: visual.sectionClimatePlan?.find((item) => item.sectionId === moment.id)?.climate || moment.climate,
    surface: visual.sectionClimatePlan?.find((item) => item.sectionId === moment.id)?.surface || moment.surface,
    intensity: visual.rhythmMap?.find((item) => item.sectionId === moment.id)?.intensity || moment.intensity,
    rhythmRationale: visual.rhythmMap?.find((item) => item.sectionId === moment.id)?.rationale || "",
  }));
  const signatures = (moment) => (visual.signatureMoves || []).filter((move) =>
    (moment.signatureMovesAllowed || []).includes(move.description) ||
    (move.allowedContexts || []).some((context) => [moment.id, moment.momentRole, moment.climate, moment.layoutMode].includes(context)));
  const photo = (moment) => (moment.homeElements || []).includes("photography") || (moment.assetNeeds || []).some((role) => role !== "logo");
  const words = (value) => new Set(normalize(typeof value === "string" ? value : JSON.stringify(value || "")).split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3 && !["dans", "avec", "pour", "sans", "plus", "cette", "comme", "entre"].includes(word)));
  const grammarWords = words([visual.layoutGrammar, direction.brandSystem?.spatialLanguage].join(" "));
  const grammarAffinity = (moment) => {
    const momentWords = words(`${moment.layoutMode} ${moment.contentIntent || ""} ${moment.climate}`);
    const shared = [...grammarWords].filter((word) => momentWords.has(word)).length;
    return shared / Math.max(1, Math.min(grammarWords.size, momentWords.size));
  };
  const contrast = (a, b) => ["climate", "layoutMode", "surface", "intensity"].reduce((score, key) =>
    score + (a[key] && b[key] && a[key] !== b[key] ? ({ climate: 4, layoutMode: 4, surface: 2, intensity: 2 })[key] : 0), 0) + (photo(a) !== photo(b) ? 2 : 0);
  // Preserve the site's reading order. A hero near the end cannot be followed
  // by two interior samples, so use the first opening moment in that case.
  const hero = moments.findIndex((moment) => moment.momentRole === "hero");
  const entry = moments[hero >= 0 && hero <= moments.length - 3 ? hero : 0];
  const candidates = moments.filter((moment) => moment.sourceIndex > entry.sourceIndex);
  let best;
  for (let b = 0; b < candidates.length - 1; b++) {
    for (let c = b + 1; c < candidates.length; c++) {
      const interior = candidates[b], variation = candidates[c];
      const grammarFrequency = moments.filter((moment) => moment.layoutMode === interior.layoutMode).length;
      const signatureCount = new Set([entry, interior, variation].flatMap((moment) => signatures(moment).map((move) => move.description))).size;
      const score = (interior.placement === "homepage_primary" ? 4 : 0) + (photo(interior) ? 3 : 0)
        + grammarFrequency + grammarAffinity(interior) * 4 + contrast(entry, interior) + contrast(interior, variation) * 2
        + contrast(entry, variation) + signatureCount * 3;
      if (!best || score > best.score) best = { score, interior, variation };
    }
  }
  const selected = [entry, best.interior, best.variation];
  return {
    moments: selected,
    coverage: {
      selectedMomentIds: selected.map((moment) => moment.id),
      reasonPerMoment: selected.map((moment, index) => ({ momentId: moment.id, role: ["entry", "interior_grammar", "contrasting_climate"][index],
        reason: `${["Entrée dans le système", "Grammaire intérieure représentative", "Variation de climat et de composition"][index]} : ${moment.layoutMode}, ${moment.climate}, ${moment.intensity}. ${moment.rhythmRationale}`,
        signatureMoves: signatures(moment).map((move) => move.description) })),
      visualSystemAspectsCovered: ["typographicVoice", "surfaces/colors", "spatialLanguage", "layoutGrammar", "rhythm", "brandContinuity",
        ...(selected.some(photo) ? ["photography"] : []),
        ...(selected.some((moment) => signatures(moment).length) ? ["signatureMoves"] : []),
        ...(new Set(selected.map((moment) => moment.intensity)).size > 1 ? ["densityVariation"] : [])],
    },
  };
}

function styleFramePlan(project, direction, references, { mode = "new_proposal", currentFrame = null, feedback = "" } = {}) {
  if (!["new_proposal", "refine"].includes(mode) || typeof feedback !== "string" || feedback.length > 1500)
    throw Object.assign(new Error("Mode ou feedback Style Frame invalide (1500 caractères maximum)."), { status: 400 });
  if (mode === "refine" && !currentFrame?.image?.url)
    throw Object.assign(new Error("Style Frame à affiner introuvable."), { status: 400 });
  if (direction.engineVersion !== ENGINE_VERSION) throw Object.assign(new Error("Direction d'un ancien moteur non prise en charge."), { status: 409 });
  const selected = selectStyleFrameMoments(direction);
  const anchors = direction.visualSystem?.referenceAnchors || [];
  if (anchors.length < MIN_ANCHORS || anchors.length > MAX_ANCHORS) throw fail("ReferenceAnchors V2 manquantes.");
  const byId = new Map(references.map((reference) => [id(reference), reference]));
  const chosenRefs = anchors.map((anchor) => byId.get(id(anchor.referenceId)));
  if (chosenRefs.some((ref) => !ref?.image?.url)) throw fail("Image de référence V2 introuvable.");
  const priority = { logo: 0, chef: 1, food: 2, restaurantInterior: 3, restaurantExterior: 4, terrace: 5, other: 6 };
  const needs = new Set(selected.moments.flatMap((moment) => moment.assetNeeds || []));
  const rankedAssets = eligibleAssets(project).filter((asset) => !STOP_ROLES.has(asset.role))
    .sort((a, b) => Number(needs.has(b.role)) - Number(needs.has(a.role)) || (priority[a.role] ?? 9) - (priority[b.role] ?? 9) || Number(!!b.signature) - Number(!!a.signature));
  const clientAssets = [];
  const usedRoles = new Set();
  for (const asset of rankedAssets) {
    if (usedRoles.has(asset.role)) continue;
    clientAssets.push(asset);
    usedRoles.add(asset.role);
    if (clientAssets.length === MAX_STYLE_ASSETS) break;
  }
  for (const asset of rankedAssets) {
    if (clientAssets.length === MAX_STYLE_ASSETS) break;
    if (!clientAssets.includes(asset)) clientAssets.push(asset);
  }
  const inputs = [
    ...(mode === "refine" ? [{ kind: "CURRENT_STYLE_FRAME_TO_REFINE", frameId: id(currentFrame), name: "Style Frame actuel à affiner", image: own(currentFrame.image) }] : []),
    ...clientAssets.map((asset) => ({ kind: "CLIENT_ASSET", assetId: id(asset), name: asset.name, role: asset.role, image: asset })),
    ...chosenRefs.map((reference, index) => ({ kind: "VISUAL_REFERENCE", referenceId: id(reference), name: reference.name, principles: anchors[index].principles, image: reference.image })),
  ];
  if (inputs.length > IMAGE_INPUT_LIMIT) throw fail("Trop d'images pour le Style Frame.");
  const prompt = boundedPrompt([
    "Create ONE high-fidelity continuous vertical slice of a desktop website, portrait 1024x1536. Show exactly THREE representative visual moments at a realistic, readable website scale: first impact, interior grammar, then a contrasting climate with continuous brand identity.",
    "This is not a full homepage, miniature homepage, compressed 6-8-section page, three independent cards, three pasted mockups, poster or abstract moodboard. Do not try to show everything, add every service/page or invent a complete functional mini-navigation. Transitions must join one continuous web composition.",
    `Restaurant: ${project.name}.`,
    `BRAND_SYSTEM: ${JSON.stringify(direction.brandSystem)}`,
    `VISUAL_SYSTEM: ${JSON.stringify({ ...own(direction.visualSystem), rhythmMap: (direction.visualSystem.rhythmMap || []).filter((item) => selected.coverage.selectedMomentIds.includes(item.sectionId)), sectionClimatePlan: (direction.visualSystem.sectionClimatePlan || []).filter((item) => selected.coverage.selectedMomentIds.includes(item.sectionId)) })}`,
    `SELECTED_MOMENTS_IN_READING_ORDER: ${JSON.stringify(selected.moments)}`,
    `STYLE_FRAME_COVERAGE: ${JSON.stringify(selected.coverage)}`,
    `CREATIVE_SETTINGS: ${JSON.stringify(project.creativeSettings)}`,
    `DIVERGENCE_CONSTRAINTS: ${JSON.stringify(direction.visualSystem?.divergenceConstraints || [])}`,
    `ANTI_PATTERNS: ${JSON.stringify(direction.visualSystem?.antiPatterns || [])}`,
    "SOURCE IMAGES IN UPLOAD ORDER:",
    ...inputs.map((input, index) => `IMAGE ${index + 1} — ${input.kind} — ${input.name} — ${input.role || (input.principles || []).join(", ")}`),
    "CLIENT_ASSET images show the real restaurant. Preserve recognizable content. A logo's FORM may be retained; its pixels do not dictate palette in reinvent mode. Do not copy historical logo colors unless colorSystem expressly allows them.",
    "VISUAL_REFERENCE images provide visual grammar only. Extract visual grammar, not layout identity. Never copy a reference's logo, text, brand, exact layout or recognizable page. Ignore presentation artifacts and device mockups.",
    "Evaluate the system through these three moments: convincing entry AND interior; recognizable identity across compositions; coherent photography/type/negative space; palette across surfaces; non-mechanical rhythm; elegant signature moves beyond the hero; personality even with the logo hidden. These are creative goals, not server rejection rules. Never invent dishes, people or scenes: a person may appear only if present in a supplied CLIENT_ASSET.",
    "Do not imitate any Gusto Portfolio screenshot; none is supplied. No repeated braces, giant quotes, stock restaurant template, generic cream-and-serif luxury, uniform cards or decoration for its own sake.",
  ], "Style Frame");
  const refinement = mode === "refine" ? `\nCURRENT_STYLE_FRAME_TO_REFINE is the existing result to correct, not a new visual reference. Preserve what works and the same Brand/Visual System; change only what the human feedback requests while presenting the three selected moments.\nHUMAN_REFINEMENT_FEEDBACK: ${feedback.trim() || "Refine execution and the three-moment coverage without changing the direction."}` : "";
  return { endpoint: "/v1/images/edits", size: STYLE_FRAME_SIZE, mode, inputs, moments: selected.moments,
    styleFrameCoverage: selected.coverage, refinementFeedback: mode === "refine" ? feedback.trim() : "", prompt: boundedPrompt([prompt, refinement], "Style Frame"), officialPrompt: prompt };
}

function sectionAssetScore(asset, section) {
  const need = section.assetNeeds || [];
  const role = asset.role || "other";
  if (!need.includes(role)) return -1;
  let score = (need.length - need.indexOf(role)) * 100;
  const name = normalize(asset.name), purpose = normalize(`${section.purpose} ${section.contentIntent}`);
  if (role === "food" && /traiteur/.test(purpose) === /traiteur/.test(name)) score += 40;
  if (role === "other" && /montauban|tarn|quai|lieu/.test(purpose) && /montauban|tarn|quai/.test(name)) score += 40;
  if (asset.signature) score += 1;
  return score;
}

function homepageV2Plan(project, direction, { parent = null, instruction = "", previewOnly = false } = {}) {
  const frame = previewOnly
    ? (direction.styleFrames || []).find((item) => id(item) === id(parent?.styleFrameId || direction.approvedStyleFrameId)) || null
    : assertStyleFrameApproved(direction, parent?.styleFrameId || direction.approvedStyleFrameId);
  const sourceSections = parent?.generationStrategy?.homepageBlueprint?.sections || direction.siteInformationArchitecture?.homepageMoments;
  if (!Array.isArray(sourceSections) || !sourceSections.length) throw fail("Plan homepage V2 invalide.");
  const homeArchitecture = {
    homepageRole: direction.siteInformationArchitecture?.homepageRole,
    primaryPages: (direction.siteInformationArchitecture?.primaryPages || []).map(({ id: pageId, label }) => ({ id: pageId, label })),
  };
  const available = eligibleAssets(project);
  const owned = new Set();
  const sections = sourceSections.map((source, index) => {
    const section = { ...own(source), assetNeeds: source.assetNeeds || [], assignedAssets: [] };
    if (section.placement === "homepage_teaser") {
      const destination = homeArchitecture.primaryPages.find((page) => page.id === section.destinationPageId);
      section.purpose = destination?.label || "Page dédiée";
      section.contentIntent = "Invitation courte à découvrir cette page, avec un seul CTA ; aucun détail fonctionnel.";
      // Only the structured editorial slot crosses into the image prompt, not dedicated details.
      const editorial = section.editorialIntent;
      section.editorialIntent = editorial ? { kind: editorial.kind, headlineIdea: editorial.headlineIdea, tone: editorial.tone, ctaLabel: editorial.ctaLabel } : null;
      section.contentTopics = [section.purpose];
    }
    const existing = source.assignedAssets || [];
    if (parent && existing.length) {
      section.assignedAssets = existing;
      existing.forEach((item) => owned.add(id(item.assetId)));
    } else {
      for (const role of [...new Set(section.assetNeeds)].slice(0, 3)) {
        const match = available.filter((asset) => !owned.has(id(asset)) && asset.role === role)
          .map((asset) => ({ asset, score: sectionAssetScore(asset, section) }))
          .filter((candidate) => candidate.score > 0)
          .sort((a, b) => b.score - a.score)[0]?.asset;
        if (!match) continue;
        owned.add(id(match));
        section.assignedAssets.push({ assetId: id(match), name: match.name, role: match.role, usage: section.assignedAssets.length ? "supporting" : "primary" });
      }
    }
    section.priority = section.priority || (index === 0 ? "high" : "normal");
    section.estimatedHeight = Number(section.estimatedHeight) || (index === 0 ? 900 : 650);
    section.alreadyRendered = false;
    section.futureState = index === 0 ? "opening" : "pending";
    return section;
  });
  const chapterSize = Math.ceil(sections.length / 3);
  const chapterCount = Math.ceil(sections.length / chapterSize);
  const chapters = [];
  for (let offset = 0; offset < sections.length; offset += chapterSize) {
    const index = chapters.length;
    const ownSections = sections.slice(offset, offset + chapterSize);
    const previous = sections.slice(0, offset);
    const future = sections.slice(offset + chapterSize);
    const renderOnly = [
      ...(index === 0 ? ["header/navigation unique"] : []),
      ...ownSections.map((section) => `${section.id}: ${section.purpose} — ${section.contentIntent}${section.destinationPageId ? ` — CTA vers ${section.destinationPageId}` : ""}`),
      ...(offset + chapterSize >= sections.length ? ["footer calme et compact, informations confirmées uniquement"] : []),
    ];
    const forbiddenContent = [
      ...(index ? ["navigation", "header", "hero", "logo du header", "promesse d'ouverture"] : []),
      ...previous.map((section) => `${section.id}: ${section.purpose} — ${section.contentIntent}`),
      ...future.map((section) => `${section.id}: ${section.purpose} — ${section.contentIntent}`),
      ...(index < chapterCount - 1 ? ["footer"] : []),
      "calendrier, nombre de personnes et formulaire complet de réservation",
      "menu complet, détail exhaustif du traiteur et mini-page contact",
    ];
    const assets = ownSections.flatMap((section) => section.assignedAssets).map((entry) => available.find((asset) => id(asset) === id(entry.assetId))).filter(Boolean);
    const size = { width: 1024, height: 1536 };
    const prompt = boundedPrompt([
      `DESKTOP WEBSITE HOMEPAGE V2 — CHAPTER ${index + 1}/${chapterCount} — ${size.width}x${size.height}.`,
      `APPROVED STYLE FRAME is IMAGE 1 and is the primary visual contract. Preserve its palette, type hierarchy, image treatment, spacing and depth; extend without cloning its opening.`,
      `RENDER_ONLY: ${JSON.stringify(renderOnly)}`,
      `FORBIDDEN_CONTENT: ${JSON.stringify(forbiddenContent)}`,
      `ALREADY_RENDERED: ${JSON.stringify(previous.map((s) => ({ id: s.id, purpose: s.purpose, assets: s.assignedAssets, climate: s.climate, layoutMode: s.layoutMode })))}`,
      `FUTURE_SECTIONS: ${JSON.stringify(future.map((s) => ({ id: s.id, purpose: s.purpose })))}`,
      `ASSET_OWNERSHIP: ${JSON.stringify(ownSections.map((s) => ({ sectionId: s.id, assets: s.assignedAssets })))}`,
      `IMAGE_INPUTS: IMAGE 1 STYLE_FRAME_APPROVED; ${parent ? "IMAGE 2 PARENT_CHAPTER; " : index ? "IMAGE 2 PREVIOUS_CHAPTER; " : ""}${index ? "IMAGE 3 OVERLAP_STRIP; " : ""}${assets.map((asset, assetIndex) => `IMAGE ${assetIndex + (index ? 4 : parent ? 3 : 2)} CLIENT_ASSET ${asset.name} (${asset.role})`).join("; ")}`,
      `BRAND_SYSTEM: ${JSON.stringify(direction.brandSystem)}`,
      `VISUAL_SYSTEM: ${JSON.stringify(direction.visualSystem)}`,
      `SITE_INFORMATION_ARCHITECTURE: ${JSON.stringify(homeArchitecture)}`,
      `GLOBAL_HOMEPAGE_BLUEPRINT: ${JSON.stringify(sections.map((s) => ({ id: s.id, purpose: s.purpose, contentIntent: s.contentIntent, editorialIntent: s.editorialIntent, momentRole: s.momentRole, placement: s.placement, contentScope: s.contentScope, homeElements: s.homeElements, destinationPageId: s.destinationPageId, climate: s.climate, layoutMode: s.layoutMode, intensity: s.intensity, estimatedHeight: s.estimatedHeight, assignedAssets: s.assignedAssets })))}`,
      "Render only the homepage moments in GLOBAL_HOMEPAGE_BLUEPRINT. A teaser contains only a short editorial invitation using editorialIntent (headline idea, tone and CTA) to its destination page; any dedicated-page detail is outside this prompt. Header only chapter 1; footer only final chapter. One primary image use per asset. No full booking widget, full menu, service details, contact form, invented prices, opening hours, testimonials or identity. Keep text concise and factual. Avoid automatic template rows, three-card grids and gratuitous ornament. Follow the approved rhythm, including intentional adjacent repetition; never force alternation.",
      instruction ? `VARIATION_REQUEST: ${instruction}` : "",
    ], `homepage chapitre ${index + 1}`);
    chapters.push({ index, sections: ownSections, sectionsAlreadyRendered: previous, futureSections: future, renderOnly, forbiddenContent, assets, size, prompt });
  }
  const overlapPx = chapters.length > 1 ? 128 : 0;
  return {
    strategy: chapters.length === 1 ? "single" : "vertical_chapters",
    engineVersion: ENGINE_VERSION,
    styleFrameId: id(frame),
    styleFrame: frame,
    overlapPx,
    homepageBlueprint: { engineVersion: ENGINE_VERSION, sections, assetOwnership: sections.flatMap((section) => section.assignedAssets.map((asset) => ({ assetId: asset.assetId, sectionId: section.id }))), rhythmMap: direction.visualSystem.rhythmMap, sectionClimatePlan: direction.visualSystem.sectionClimatePlan },
    segments: chapters,
    width: 1024,
    height: chapters.length * 1536 - (chapters.length - 1) * overlapPx,
  };
}

module.exports = { HOME_ELEMENTS, PRIMARY_HOME_ELEMENTS, TEASER_HOME_ELEMENTS, ENGINE_VERSION, IMAGE_INPUT_LIMIT, STYLE_FRAME_SIZE, buildCreativeTerritoriesRequest, buildDirectionExpansionRequest, validateCreativeTerritories, validateDirectionsV2, directionsStructurallySimilar, documentaryContext, portfolioDivergence, eligibleAssets, compactReferenceCandidates, referenceCandidates, styleFramePlan, assertStyleFrameApproved, homepageV2Plan };
