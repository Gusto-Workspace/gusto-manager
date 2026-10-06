const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const sharp = require("sharp");
const fs = require("node:fs");
const path = require("node:path");
const SiteProject = require("../models/site-project.model");
const openai = require("../services/design-lab/openai.service");
const designLab = require("../services/design-lab/design-lab.service");
const DesignReference = require("../models/design-reference.model");
const GustoPortfolioSite = require("../models/gusto-portfolio-site.model");
const {
  buildCreativeTerritoriesRequest,
  buildDirectionExpansionRequest,
  validateCreativeTerritories,
  validateDirectionsV2,
  directionsStructurallySimilar,
  styleFramePlan,
  homepageV2Plan,
  portfolioDivergence,
  HOME_ELEMENTS,
} = require("../services/design-lab/design-engine-v2.service");
const { checkpointIdentity, VALIDATOR_VERSION } = require("../services/design-lab/directions-checkpoint.service");
const { seedVersionedFixture } = require("./helpers/direction-versions.fixture");
const { activeDirections, promoteDirectionSet } = require("../services/design-lab/direction-versioning.service");
const { buildApprovalSnapshot } = require("../services/design-lab/approval.service");
const { assembleChapters } = require("../services/design-lab/image-assembly.service");

const source = (name) => ({ url: `https://res.cloudinary.com/demo/image/upload/${name}.webp`, publicId: `gusto/design-lab/references/${name}` });
function fixture() {
  const project = new SiteProject({
    name: "Maison test", slug: "maison-test", status: "brief_ready",
    brief: { story: "Maison familiale depuis 1992", existingWebsite: "https://old.example", notes: "Cuisine contemporaine" },
    existingWebsiteContext: { restaurantSummary: "Cuisine de saison", story: "Histoire documentaire", sourcePages: [{ url: "https://old.example", pageType: "home" }] },
    creativeSettings: { creativity: 80, gustoSimilarity: 15, compositionFreedom: 85, visualDensity: 55, brandContinuity: "reinvent", styles: ["Éditorial"] },
  });
  const add = (name, role, benchmarkExcluded = false) => project.assets.push({ name, role, benchmarkExcluded, url: source(name).url, publicId: `gusto/design-lab/projects/test/assets/${name}` });
  add("logo", "logo"); add("chef", "chef"); add("plat", "food"); add("traiteur", "food"); add("enseigne", "restaurantExterior"); add("graphique-exclu", "signatureGraphic", true);
  const references = ["REF A", "REF B", "REF C"].map((name, index) => ({ _id: new mongoose.Types.ObjectId(), name, image: source(`ref-${index}`), visualTags: ["éditorial"], businessTags: ["restaurant japonais"], analysis: { colors: "rouge" }, characteristics: { composition: "asymétrique" } }));
  return { project, references };
}

function v2Direction(references, variant = 0) {
  const families = ["sans-serif ouverte", "grotesque condensée", "serif géométrique"];
  const colors = Object.fromEntries(["baseSurface", "alternateSurface", "contrastSurface", "accentPrimary", "accentSecondary", "primaryText", "inverseText"].map((role) => [role, { name: `${role}-${variant}`, hex: "#112233", role, approximateFrequency: "ponctuel", usage: "surface ou texte selon rôle", allowedSurfaces: ["home"], pairings: ["base"], forbiddenUses: ["fond global"], sourceType: "creativeDecision", sourceExplanation: "Décision artistique documentée" }]));
  const sections = [
    ["hero", "Ouverture", "photographicImmersive", "asymmetricEditorial", ["logo", "chef"]],
    ["story", "Histoire", "quietNeutral", "quietText", ["chef"]],
    ["cuisine", "Cuisine de saison", "darkContrast", "fullBleedPhotography", ["food"]],
    ["manifesto", "Manifeste", "typographicStatement", "oversizedTypography", []],
    ["catering", "Traiteur", "lightEditorial", "offsetGrid", ["food"]],
    ["location", "Lieu et accès", "functionalMinimal", "staggeredColumns", ["restaurantExterior"]],
  ].map(([id, purpose, climate, layoutMode, assetNeeds], index) => ({ id, purpose, contentIntent: id === "catering" ? "" : purpose, editorialIntent: id === "catering" ? { kind: "invitation", headlineIdea: "Le goût du partage", tone: "chaleureux", ctaLabel: "Découvrir le traiteur" } : null, contentTopics: [id], momentRole: index ? "section" : "hero", placement: id === "catering" ? "homepage_teaser" : "homepage_primary", contentScope: id === "catering" ? "teaser_only" : "primary", homeElements: id === "catering" ? ["invitation", "photography", "cta"] : ["headline", ...(assetNeeds.length ? ["photography"] : ["short_copy"])], destinationPageId: id === "catering" ? "catering" : null, priority: index ? "normal" : "high", estimatedHeight: index ? 600 : 900, climate, surface: "variable", layoutMode, intensity: index ? "calme" : "fort", assetNeeds, signatureMovesAllowed: [] }));
  return {
    name: `Direction ${variant}`, concept: `Concept ${variant}`, artisticIntent: `Intention ${variant}`, whyItFitsRestaurant: "Spécifique à la maison", differenceFromOtherDirections: "Rythme différent",
    brandSystem: { brandIdea: `Idée ${variant}`, brandPersonality: ["vivant", "précis", "local"], colorSystem: { ...colors, imageTreatment: "naturel" }, typographicVoice: families[variant], shapeLanguage: `forme ${variant}`, photographicLanguage: `cadrage ${variant}`, materialLanguage: "", graphicLanguage: ["décalage"], iconography: "aucune", spatialLanguage: `espace ${variant}`, editorialVoice: "direct", brandDo: ["respirer"], brandDont: ["décorer"] },
    visualSystem: { designThesis: `Thèse ${variant}`, layoutGrammar: `grammaire ${variant}`, rhythmMap: sections.map((s) => ({ sectionId: s.id, intensity: s.intensity, rationale: "rythme" })), sectionClimatePlan: sections.map((s) => ({ sectionId: s.id, climate: s.climate, surface: s.surface })), photographySystem: "photos authentiques", typographySystem: "hiérarchie", signatureMoves: [{ description: "crop", purpose: "impact", allowedContexts: ["hero"], maxOccurrences: 1, forbiddenMisuse: "répétition" }, { description: "décalage", purpose: "rythme", allowedContexts: ["story"], maxOccurrences: 1, forbiddenMisuse: "systématique" }], antiPatterns: ["trois cartes", "template WordPress"], referenceAnchors: [{ referenceIndex: 0, why: "Rythme", principles: ["respiration"] }, { referenceIndex: variant === 2 ? 2 : 1, why: "Composition", principles: ["asymétrie"] }], divergenceConstraints: ["Éviter titres serif contrastés"] },
    siteInformationArchitecture: {
      primaryPages: [
        { id: "home", label: "Accueil", role: "homepage", purpose: "Présenter la maison" },
        { id: "menu", label: "Carte", role: "dedicated", purpose: "Détail des plats" },
        { id: "catering", label: "Traiteur", role: "dedicated", purpose: "Prestations" },
        { id: "booking", label: "Réservation", role: "dedicated", purpose: "Réserver" },
        { id: "contact", label: "Contact", role: "dedicated", purpose: "Informations pratiques" },
      ],
      homepageRole: "Introduction éditoriale et orientation vers les pages dédiées",
      contentAssignments: [
        ...sections.map((section) => ({ topic: section.id, classification: section.id === "catering" ? "homepage_teaser" : "homepage_primary", targetPageId: section.destinationPageId, reason: "Moment d'accueil" })),
        { topic: "détails de la carte", classification: "dedicated_page", targetPageId: "menu", reason: "Liste complète réservée à la page Carte" },
        { topic: "formulaire de réservation", classification: "dedicated_page", targetPageId: "booking", reason: "Flux dédié" },
        { topic: "coordonnées complètes", classification: "footer_only", targetPageId: "contact", reason: "Informations pratiques" },
      ],
      homepageMoments: sections,
      dedicatedPageTopics: [
        { topic: "détails de la carte", pageId: "menu", detailToReserve: "plats et prix" },
        { topic: "traiteur détaillé", pageId: "catering", detailToReserve: "offres et conditions" },
        { topic: "formulaire de réservation", pageId: "booking", detailToReserve: "calendrier et formulaire" },
      ],
    },
  };
}

function creativeTerritory(id, anchors, variant = 0) {
  return {
    id, name: `Territoire ${id}`, brandIdea: `Idée ${id}`, creativeThesis: `Thèse ${id}`,
    brandPersonality: ["vif", "précis", "local"],
    visualTerritory: ["Composition éditoriale asymétrique", "Grille géométrique modulaire", "Mise en page immersive organique"][variant],
    conceptualColorDirection: ["rouge franc et ivoire", "bleu acier et blanc", "vert sombre et or"][variant],
    typographicTerritory: ["serif expressive", "grotesque condensée", "sans-serif humaniste"][variant],
    photographicTerritory: ["portraits intimes", "natures mortes cadrées", "reportage immersif"][variant],
    spatialTerritory: ["grandes marges irrégulières", "grille serrée", "espaces fluides généreux"][variant],
    majorDifferentiator: `Différenciateur ${id}`, likelyReferenceAnchors: anchors,
    explicitDifferenceFromOthers: `Le territoire ${id} réserve ses propres formes et son propre rythme.`,
  };
}

const mockStructuredResponse = (value) => ({ ok: true, status: 200, json: async () => ({ output: [{ content: [{ type: "output_text", text: JSON.stringify(value) }] }] }) });

function assertStructuredSchema(value, schema, location = "$", errors = []) {
  if (schema.anyOf) {
    const candidates = schema.anyOf.map((candidate) => {
      const failures = [];
      assertStructuredSchema(value, candidate, location, failures);
      return failures;
    });
    if (candidates.every((failures) => failures.length)) errors.push(`${location}: aucune variante anyOf valide`);
    return errors;
  }
  if (schema.type === "null") {
    if (value !== null) errors.push(`${location}: null attendu`);
  } else if (schema.type === "string") {
    if (typeof value !== "string") errors.push(`${location}: chaîne attendue`);
    else if (schema.maxLength && value.length > schema.maxLength) errors.push(`${location}: chaîne trop longue`);
  } else if (schema.type === "integer") {
    if (!Number.isInteger(value)) errors.push(`${location}: entier attendu`);
  } else if (schema.type === "array") {
    if (!Array.isArray(value)) errors.push(`${location}: tableau attendu`);
    else value.forEach((item, index) => assertStructuredSchema(item, schema.items, `${location}[${index}]`, errors));
  } else if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) errors.push(`${location}: objet attendu`);
    else {
      for (const key of schema.required || []) {
        if (!Object.hasOwn(value, key)) errors.push(`${location}.${key}: champ requis`);
      }
      for (const [key, item] of Object.entries(value)) {
        if (!schema.properties[key]) {
          if (schema.additionalProperties === false) errors.push(`${location}.${key}: champ interdit`);
        } else assertStructuredSchema(item, schema.properties[key], `${location}.${key}`, errors);
      }
    }
  }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${location}: valeur hors enum`);
  return errors;
}

function preflightDirections(references) {
  const identities = [
    { name: "La Maison en mouvement", idea: "Maison familiale contemporaine", type: "sans-serif humaniste ouverte", shape: "formes libres et découpes nettes", photo: "reportage humain en lumière naturelle", space: "grandes respirations asymétriques", layout: "composition éditoriale à ruptures mesurées", palette: ["#F5F0E7", "#E7D7C4", "#23362F", "#C45438", "#172921", "#FFF9EF"] },
    { name: "L'Atelier des Quais", idea: "Table de saison précise et directe", type: "grotesque condensée affirmée", shape: "cadres modulaires anguleux", photo: "natures mortes culinaires cadrées", space: "grille dense et séquences courtes", layout: "modules géométriques et contraste d'échelle", palette: ["#F2EEE4", "#D7E0E1", "#193B4A", "#D67331", "#132B35", "#FFFFFF"] },
    { name: "Les Saisons de la Maison", idea: "Hospitalité chaleureuse et saisonnière", type: "serif souple expressive", shape: "arcs discrets et lignes organiques", photo: "portraits et détails de cuisine immersifs", space: "séquences amples et pauses visuelles", layout: "narration libre à blocs décalés", palette: ["#FAF1E3", "#EAD7BC", "#393529", "#9E492E", "#26251F", "#FFF8ED"] },
  ];
  return identities.map((identity, index) => {
    const direction = v2Direction(references, index);
    direction.name = identity.name;
    direction.concept = identity.idea;
    direction.artisticIntent = `Faire ressentir ${identity.idea.toLowerCase()} sans copier une référence.`;
    direction.brandSystem.brandIdea = identity.idea;
    direction.brandSystem.typographicVoice = identity.type;
    direction.brandSystem.shapeLanguage = identity.shape;
    direction.brandSystem.photographicLanguage = identity.photo;
    direction.brandSystem.spatialLanguage = identity.space;
    direction.visualSystem.designThesis = identity.idea;
    direction.visualSystem.layoutGrammar = identity.layout;
    direction.visualSystem.referenceAnchors = (index === 1 ? [1, 2] : index === 2 ? [0, 2] : [0, 1])
      .map((referenceIndex) => ({ referenceIndex, why: "Composition et rythme pertinents", principles: ["espace", "typographie"] }));
    const roles = ["baseSurface", "alternateSurface", "contrastSurface", "accentPrimary", "primaryText", "inverseText"];
    roles.forEach((role, roleIndex) => {
      direction.brandSystem.colorSystem[role] = {
        name: `${role} ${identity.name}`, hex: identity.palette[roleIndex], role,
        approximateFrequency: role === "baseSurface" ? "dominante" : "ponctuelle",
        usage: `Usage contrôlé : ${role}`, allowedSurfaces: ["accueil", "pages dédiées"],
        pairings: ["baseSurface"], forbiddenUses: ["décoration systématique"],
        sourceType: "creativeDecision", sourceExplanation: `Choix du territoire ${identity.name}`,
      };
    });
    direction.brandSystem.colorSystem.accentSecondary = index === 1 ? null : {
      ...direction.brandSystem.colorSystem.accentPrimary,
      name: `Accent secondaire ${identity.name}`, role: "accentSecondary", hex: index === 0 ? "#B4865A" : "#957A4A",
    };
    const architecture = direction.siteInformationArchitecture;
    const hero = architecture.homepageMoments[0];
    hero.id = "hero-maison";
    hero.purpose = `Présenter ${identity.idea.toLowerCase()}`;
    hero.contentIntent = "Promesse brève et image héroïque de la maison";
    direction.visualSystem.rhythmMap[0].sectionId = hero.id;
    direction.visualSystem.sectionClimatePlan[0].sectionId = hero.id;
    architecture.homepageMoments.find((moment) => moment.id === "manifesto").contentIntent = "Manifeste de la maison en quelques mots";
    architecture.homepageMoments.find((moment) => moment.id === "catering").contentIntent = "";
    architecture.homepageMoments.push({
      id: "reservation", purpose: "Invitation à réserver", contentIntent: "", editorialIntent: { kind: "invitation", headlineIdea: "On se retrouve à table ?", tone: "accueillant", ctaLabel: "Réserver" },
      contentTopics: ["reservation"], momentRole: "section", placement: "homepage_teaser", contentScope: "teaser_only", homeElements: ["invitation", "cta"], destinationPageId: "booking",
      priority: "normal", estimatedHeight: 340, climate: "reservationContrast", surface: "contrastSurface",
      layoutMode: "compactCallToAction", intensity: "calme", assetNeeds: [], signatureMovesAllowed: [],
    });
    architecture.contentAssignments.push(
      { topic: "reservation", classification: "homepage_teaser", targetPageId: "booking", reason: "Orientation vers la page Réservation" },
      { topic: "navigation principale", classification: "global_navigation", targetPageId: null, reason: "Navigation globale" },
      { topic: "actualités ponctuelles", classification: "optional", targetPageId: null, reason: "Hors parcours principal" },
    );
    direction.visualSystem.rhythmMap.push({ sectionId: "reservation", intensity: "calme", rationale: "Clore par un appel simple" });
    direction.visualSystem.sectionClimatePlan.push({ sectionId: "reservation", climate: "reservationContrast", surface: "contrastSurface" });
    return direction;
  });
}

test("sources V2 séparées : documentaire sans URL/style, Portfolio contre-référence, assets autorisés", () => {
  const { project, references } = fixture();
  const summary = { siteCount: 7, frequentPatterns: [{ tag: "Titres serif contrastés", count: 5 }] };
  const request = buildCreativeTerritoriesRequest(project, references, summary);
  assert.equal(request.payload.documentaryContext.manualBrief.existingWebsite, undefined);
  assert.equal(request.payload.documentaryContext.existingWebsiteContext.restaurantSummary, "Cuisine de saison");
  assert.equal(request.payload.documentaryContext.existingWebsiteContext.sourcePages, undefined);
  assert.equal(request.payload.portfolio.role, "counter_reference");
  assert.match(request.payload.portfolio.divergenceConstraints.join(" "), /Titres serif contrastés/);
  assert.deepEqual(request.payload.portfolio.comparisonPatterns, []);
  assert.ok(request.payload.compactReferences.every((ref) => !ref.image && !ref.analysis && !ref.characteristics));
  assert.ok(request.payload.compactReferences.every((ref) => JSON.stringify(ref).length < 900));
  assert.ok(request.payload.clientAssets.every((asset) => asset.name !== "graphique-exclu"));
  assert.equal(request.payload.creativeSettings.brandContinuity, "reinvent");
  assert.match(request.instructions, /Never infer visual inspiration from the existing website/);
  assert.equal(portfolioDivergence(summary, 80).role, "continuity_check");
  const territories = [creativeTerritory("A", [0, 1]), creativeTerritory("B", [1, 2], 1), creativeTerritory("C", [0, 2], 2)];
  const expansion = buildDirectionExpansionRequest(project, references, summary, territories, "B");
  assert.deepEqual(expansion.payload.selectedReferenceDetails.map((item) => item.index), [1, 2]);
  assert.deepEqual(expansion.payload.reservedForOtherTerritories.map((item) => item.id), ["A", "C"]);
  assert.ok(expansion.payload.selectedReferenceDetails.every((item) => item.analysis));
  assert.ok(!JSON.stringify(expansion.payload).includes("https://old.example"));
  assert.match(expansion.instructions, /homepage_teaser ne signifie JAMAIS « contenu court »/);
  assert.match(expansion.instructions, /hero ou un manifeste n'est pas un teaser/);
});

test("directions V2 : anchors, provenance, diversité structurelle et plan non uniforme", () => {
  const { references } = fixture();
  const result = validateDirectionsV2([0, 1, 2].map((index) => v2Direction(references, index)), references);
  assert.equal(result.length, 3);
  assert.ok(result.every((direction) => direction.engineVersion === "v2"));
  assert.ok(result.every((direction) => direction.referencesUsed.length === 2));
  assert.ok(result.every((direction) => direction.brandSystem.colorSystem.baseSurface.sourceExplanation));
  assert.equal(directionsStructurallySimilar(result), false);
  assert.equal(directionsStructurallySimilar([result[0], result[0]]), true);
  const bad = v2Direction(references);
  bad.siteInformationArchitecture.homepageMoments[1].climate = bad.siteInformationArchitecture.homepageMoments[0].climate;
  bad.siteInformationArchitecture.homepageMoments[1].layoutMode = bad.siteInformationArchitecture.homepageMoments[0].layoutMode;
  assert.ok(validateDirectionsV2([bad], references, 1)[0].qualityWarnings.some((warning) => warning.code === "adjacent_rhythm_repeated"));
});

test("territoires : exactement A/B/C, axes distincts et 2 à 3 anchors valides", () => {
  const { references } = fixture();
  const territories = [creativeTerritory("A", [0, 1]), creativeTerritory("B", [1, 2], 1), creativeTerritory("C", [0, 2], 2)];
  assert.equal(validateCreativeTerritories(territories, references).length, 3);
  assert.throws(() => validateCreativeTerritories(territories.slice(0, 2), references), /exactement 3/);
  assert.ok(validateCreativeTerritories([territories[0], creativeTerritory("B", [0, 1]), creativeTerritory("C", [0, 1])], references).every((territory) => territory.qualityWarnings.some((warning) => warning.code === "territories_too_similar")));
  assert.throws(() => validateCreativeTerritories([{ ...territories[0], likelyReferenceAnchors: [0, 0] }], references, 1), /références invalides/);
  assert.throws(() => validateCreativeTerritories([{ ...territories[0], likelyReferenceAnchors: [0, 1, 2, 3] }], references, 1), /références invalides/);
  assert.throws(() => validateCreativeTerritories([{ ...territories[0], name: "" }], references, 1), (error) => error.validation.category === "FATAL_STRUCTURE" && error.validation.reason === "territory_fields_invalid");
  assert.ok(validateCreativeTerritories([{ ...territories[0], brandPersonality: [] }], references, 1)[0].qualityWarnings.some((warning) => warning.code === "territory_personality_under_preferred_count"));
  assert.throws(() => validateDirectionsV2([v2Direction(references)], references, 1, { allowedReferenceIndexes: [1, 2] }), /non pressentie/);
});

test("architecture V2 : les détails métier restent sur les pages dédiées", () => {
  const { project, references } = fixture();
  project.brief.services = ["Réservation", "Traiteur", "Carte détaillée", "Contact"];
  const direction = validateDirectionsV2([v2Direction(references)], references, 1)[0];
  project.directions.push(direction);
  const saved = project.directions[0];
  assert.deepEqual(saved.siteInformationArchitecture.primaryPages.map((page) => page.id), ["home", "menu", "catering", "booking", "contact"]);
  assert.ok(saved.siteInformationArchitecture.dedicatedPageTopics.some((item) => item.pageId === "booking"));
  assert.equal(saved.siteInformationArchitecture.homepageMoments.find((item) => item.id === "catering").placement, "homepage_teaser");
  assert.ok(!saved.siteInformationArchitecture.homepageMoments.some((item) => /formulaire|détails de la carte/i.test(item.contentIntent)));
  saved.styleFrames.push({ image: source("frame"), prompt: "style", approvedAt: new Date() });
  saved.approvedStyleFrameId = saved.styleFrames[0]._id;
  const plan = homepageV2Plan(project, saved);
  assert.deepEqual(plan.homepageBlueprint.sections.map((item) => item.id), saved.siteInformationArchitecture.homepageMoments.map((item) => item.id));
  assert.ok(plan.segments.every((segment) => segment.prompt.includes("SITE_INFORMATION_ARCHITECTURE")));
  assert.ok(plan.segments.every((segment) => !segment.prompt.includes("detailToReserve")));
  assert.ok(plan.homepageBlueprint.sections.every((item) => !/formulaire de réservation|détails de la carte/.test(item.contentIntent)));
});

test("architecture V2 : refuse l'introduction d'un sujet réservé dans les moments de homepage", () => {
  const { references } = fixture();
  const direction = v2Direction(references);
  direction.siteInformationArchitecture.homepageMoments[2].contentTopics = ["détails de la carte"];
  assert.throws(() => validateDirectionsV2([direction], references, 1), /contenu hors homepage/);
  direction.siteInformationArchitecture.homepageMoments[2].contentTopics = ["cuisine"];
  direction.siteInformationArchitecture.homepageMoments[4].destinationPageId = null;
  assert.throws(() => validateDirectionsV2([direction], references, 1), /teaser sans page dédiée/);
});

test("architecture V2 : hero et manifeste autonomes, teasers et pages dédiées explicites", () => {
  const { project, references } = fixture();
  const direction = v2Direction(references);
  const architecture = direction.siteInformationArchitecture;
  const hero = architecture.homepageMoments[0];
  hero.id = "hero-maison";
  direction.visualSystem.rhythmMap[0].sectionId = hero.id;
  direction.visualSystem.sectionClimatePlan[0].sectionId = hero.id;
  assert.equal(hero.placement, "homepage_primary");
  assert.equal(hero.destinationPageId, null);
  assert.equal(architecture.homepageMoments.find((moment) => moment.id === "manifesto").destinationPageId, null);
  const booking = architecture.homepageMoments.find((moment) => moment.id === "location");
  booking.id = "reservation";
  booking.contentTopics = ["reservation"];
  booking.placement = "homepage_teaser";
  booking.contentScope = "teaser_only";
  booking.homeElements = ["invitation", "cta"];
  booking.contentIntent = "";
  booking.editorialIntent = { kind: "invitation", headlineIdea: "À table", tone: "direct", ctaLabel: "Réserver" };
  booking.destinationPageId = "booking";
  direction.visualSystem.rhythmMap.at(-1).sectionId = booking.id;
  direction.visualSystem.sectionClimatePlan.at(-1).sectionId = booking.id;
  const assignment = architecture.contentAssignments.find((item) => item.topic === "location");
  assignment.topic = "reservation";
  assignment.classification = "homepage_teaser";
  assignment.targetPageId = "booking";
  const validated = validateDirectionsV2([direction], references, 1)[0];
  assert.deepEqual(validated.siteInformationArchitecture.homepageMoments.filter((moment) => moment.placement === "homepage_teaser").map((moment) => moment.destinationPageId), ["catering", "booking"]);
  assert.ok(validated.siteInformationArchitecture.contentAssignments.some((item) => item.topic === "détails de la carte" && item.classification === "dedicated_page" && item.targetPageId === "menu"));
  assert.ok(validated.siteInformationArchitecture.contentAssignments.some((item) => item.classification === "footer_only"));
  project.directions.push(validated);
  const saved = project.directions[0];
  saved.styleFrames.push({ image: source("frame"), prompt: "style", approvedAt: new Date() });
  saved.approvedStyleFrameId = saved.styleFrames[0]._id;
  const plan = homepageV2Plan(project, saved);
  assert.deepEqual(plan.homepageBlueprint.sections.map((moment) => moment.id), architecture.homepageMoments.map((moment) => moment.id));
  assert.ok(!plan.homepageBlueprint.sections.some((moment) => moment.contentTopics.includes("formulaire de réservation")));
  assert.ok(plan.segments.every((segment) => !segment.renderOnly.some((item) => /formulaire de réservation/.test(item))));
});

test("architecture V2 : destinations manquantes et placements mélangés sont rejetés avec diagnostic", () => {
  const { references } = fixture();
  const check = (mutate, reason, momentId) => {
    const direction = v2Direction(references);
    mutate(direction.siteInformationArchitecture);
    assert.throws(() => validateDirectionsV2([direction], references, 1), (error) => {
      assert.equal(error.status, 502);
      assert.equal(error.validation.validationStage, "site_information_architecture");
      assert.equal(error.validation.reason, reason);
      assert.equal(error.validation.momentId, momentId);
      return true;
    });
  };
  check((architecture) => { architecture.homepageMoments[4].destinationPageId = null; }, "homepage_teaser_requires_destination", "catering");
  check((architecture) => { architecture.contentAssignments.find((item) => item.topic === "catering").targetPageId = null; }, "homepage_teaser_requires_destination", "catering");
  check((architecture) => { architecture.contentAssignments.find((item) => item.topic === "détails de la carte").targetPageId = null; }, "dedicated_page_requires_destination", null);
  check((architecture) => { architecture.homepageMoments[0].contentTopics.push("catering"); }, "homepage_moment_placement_mismatch", "hero");
  check((architecture) => { architecture.homepageMoments[4].destinationPageId = "booking"; }, "homepage_teaser_destination_mismatch", "catering");
});

test("matrice de contrat V2 : chaque branche métier rejette son cas limite", async (t) => {
  const { references } = fixture();
  const cases = [
    ["anchors absentes", "reference_anchor_count_invalid", (d) => { d.visualSystem.referenceAnchors = d.visualSystem.referenceAnchors.slice(0, 1); }],
    ["anchors dupliquées", "reference_anchor_duplicate", (d) => { d.visualSystem.referenceAnchors[1].referenceIndex = 0; }],
    ["anchor hors sélection", "reference_anchor_invalid", (d) => { d.visualSystem.referenceAnchors[1].referenceIndex = 99; }],
    ["anchor sans explication", "reference_anchor_invalid", (d) => { d.visualSystem.referenceAnchors[1].why = ""; }],
    ["anchor sans principe", "reference_anchor_invalid", (d) => { d.visualSystem.referenceAnchors[1].principles = []; }],
    ["pages sans accueil unique", "primary_pages_invalid", (d) => { d.siteInformationArchitecture.primaryPages[1].role = "homepage"; }],
    ["ID de page vide", "primary_pages_invalid", (d) => { d.siteInformationArchitecture.primaryPages[1].id = ""; }],
    ["rôle de homepage vide", "primary_pages_invalid", (d) => { d.siteInformationArchitecture.homepageRole = ""; }],
    ["sujets dupliqués", "content_assignments_invalid", (d) => { d.siteInformationArchitecture.contentAssignments[1].topic = "hero"; }],
    ["sujet vide", "content_assignments_invalid", (d) => { d.siteInformationArchitecture.contentAssignments[1].topic = ""; }],
    ["aucune affectation", "content_assignments_invalid", (d) => { d.siteInformationArchitecture.contentAssignments = []; }],
    ["teaser sans page affectée", "homepage_teaser_requires_destination", (d) => { d.siteInformationArchitecture.contentAssignments.find((a) => a.topic === "catering").targetPageId = null; }],
    ["page dédiée sans destination", "dedicated_page_requires_destination", (d) => { d.siteInformationArchitecture.contentAssignments.find((a) => a.topic === "détails de la carte").targetPageId = null; }],
    ["affectation vers accueil", "destination_not_dedicated_page", (d) => { d.siteInformationArchitecture.contentAssignments.find((a) => a.topic === "catering").targetPageId = "home"; }],
    ["moment dupliqué", "homepage_moment_duplicate", (d) => { d.siteInformationArchitecture.homepageMoments[1].id = "hero"; }],
    ["ID de moment vide", "homepage_moment_duplicate", (d) => { d.siteInformationArchitecture.homepageMoments[1].id = ""; }],
    ["premier moment sans rôle hero", "homepage_hero_missing", (d) => { d.siteInformationArchitecture.homepageMoments[0].momentRole = "section"; }],
    ["second hero", "homepage_hero_or_footer_duplicate", (d) => { d.siteInformationArchitecture.homepageMoments[1].momentRole = "hero"; }],
    ["page dédiée dans la home", "topic_not_on_homepage", (d) => { d.siteInformationArchitecture.homepageMoments[2].contentTopics = ["détails de la carte"]; }],
    ["footer dans la home", "topic_not_on_homepage", (d) => { d.siteInformationArchitecture.homepageMoments[2].contentTopics = ["coordonnées complètes"]; }],
    ["navigation dans la home", "topic_not_on_homepage", (d) => { d.siteInformationArchitecture.contentAssignments.push({ topic: "navigation", classification: "global_navigation", targetPageId: null, reason: "Nav" }); d.siteInformationArchitecture.homepageMoments[2].contentTopics = ["navigation"]; }],
    ["primary + teaser mélangés", "homepage_moment_placement_mismatch", (d) => { d.siteInformationArchitecture.homepageMoments[0].contentTopics.push("catering"); }],
    ["hero court classé teaser", "hero_must_be_homepage_primary", (d) => { const a = d.siteInformationArchitecture; a.contentAssignments.find((item) => item.topic === "hero").classification = "homepage_teaser"; a.contentAssignments.find((item) => item.topic === "hero").targetPageId = "contact"; a.homepageMoments[0].placement = "homepage_teaser"; a.homepageMoments[0].contentScope = "teaser_only"; a.homepageMoments[0].homeElements = ["invitation", "cta"]; a.homepageMoments[0].contentIntent = ""; a.homepageMoments[0].destinationPageId = "contact"; }],
    ["mauvaise portée teaser", "home_content_scope_mismatch", (d) => { d.siteInformationArchitecture.homepageMoments[4].contentScope = "primary"; }],
    ["réservation détaillée dans teaser", "teaser_content_intent_must_be_empty", (d) => { const a = d.siteInformationArchitecture; a.homepageMoments[4].contentIntent = "Calendrier, créneaux et nombre de convives"; }],
    ["traiteur détaillé dans teaser", "teaser_content_intent_must_be_empty", (d) => { d.siteInformationArchitecture.homepageMoments[4].contentIntent = "Prestations, cocktails, mariages et devis"; }],
    ["formulaire dans éléments teaser", "dedicated_page_detail_not_allowed_in_home_teaser", (d) => { d.siteInformationArchitecture.homepageMoments[4].homeElements.push("form"); }],
    ["éléments teaser sans CTA", "home_elements_invalid", (d) => { d.siteInformationArchitecture.homepageMoments[4].homeElements = ["invitation"]; }],
    ["éléments primary invalides", "home_elements_invalid", (d) => { d.siteInformationArchitecture.homepageMoments[0].homeElements = ["invitation", "cta"]; }],
    ["teaser sans CTA de destination", "homepage_teaser_requires_destination", (d) => { d.siteInformationArchitecture.homepageMoments[4].destinationPageId = null; }],
    ["moment vers page accueil", "destination_not_dedicated_page", (d) => { d.siteInformationArchitecture.homepageMoments[4].destinationPageId = "home"; }],
    ["destination valide mais différente", "homepage_teaser_destination_mismatch", (d) => { d.siteInformationArchitecture.homepageMoments[4].destinationPageId = "booking"; }],
    ["sujet dédié vers page inconnue", "dedicated_topic_page_invalid", (d) => { d.siteInformationArchitecture.dedicatedPageTopics[0].pageId = "unknown"; }],
    ["carte de rythme incomplète", "visual_plan_section_mismatch", (d) => { d.visualSystem.rhythmMap.pop(); }],
    ["plan des climats incohérent", "visual_plan_section_mismatch", (d) => { d.visualSystem.sectionClimatePlan[1].sectionId = "inconnu"; }],
    ["hex couleur invalide", "color_system_invalid", (d) => { d.brandSystem.colorSystem.baseSurface.hex = "rouge"; }],
    ["provenance couleur absente", "color_system_invalid", (d) => { d.brandSystem.colorSystem.baseSurface.sourceExplanation = ""; }],
    ["rôles couleur insuffisants", "color_system_invalid", (d) => { d.brandSystem.colorSystem.accentSecondary = null; d.brandSystem.colorSystem.baseSurface = null; }],
    ["couleur héritée en reinvent", "reinvent_brand_color_constraint", (d) => { d.brandSystem.colorSystem.baseSurface.sourceType = "clientBrandConstraint"; }],
  ];
  for (const [name, reason, mutate] of cases) await t.test(name, () => {
    const direction = v2Direction(references);
    mutate(direction);
    assert.throws(() => validateDirectionsV2([direction], references, 1), (error) => {
      assert.equal(error.code, "DIRECTIONS_V2_VALIDATION");
      assert.equal(error.validation.reason, reason);
      assert.ok(error.validation.fieldPath);
      return true;
    });
  });
  assert.ok(cases.length >= 39);
});

function syncVisualPlans(direction) {
  const moments = direction.siteInformationArchitecture.homepageMoments;
  direction.visualSystem.rhythmMap = moments.map((s) => ({ sectionId: s.id, intensity: s.intensity, rationale: "Séquence intentionnelle" }));
  direction.visualSystem.sectionClimatePlan = moments.map((s) => ({ sectionId: s.id, climate: s.climate, surface: s.surface }));
}

const subsets = (values) => Array.from({ length: 2 ** values.length }, (_, mask) => values.filter((_value, index) => mask & (1 << index)));

test("matrice générative homeElements : 256 combinaisons rôle × placement × portée × primitives", async (t) => {
  const { project, references } = fixture();
  const momentSchema = openai.directionPipelineSchemas.expansion.properties.direction.properties.siteInformationArchitecture.properties.homepageMoments.items;
  const enums = momentSchema.properties;
  assert.deepEqual(enums.homeElements.items.enum, HOME_ELEMENTS);
  let accepted = 0, rejected = 0;
  for (const role of enums.momentRole.enum) for (const placement of enums.placement.enum) for (const scope of enums.contentScope.enum) {
    await t.test(`${role} × ${placement} × ${scope}`, () => {
      for (const elements of subsets(enums.homeElements.items.enum)) {
        const direction = v2Direction(references);
        const moment = direction.siteInformationArchitecture.homepageMoments[role === "hero" ? 0 : 1];
        moment.placement = placement; moment.contentScope = scope; moment.homeElements = elements;
        moment.destinationPageId = placement === "homepage_teaser" ? "catering" : null;
        moment.contentIntent = placement === "homepage_teaser" ? "" : "Séquence éditoriale autonome";
        moment.editorialIntent = placement === "homepage_teaser" ? { kind: "invitation", headlineIdea: "Le goût du partage", tone: "calme", ctaLabel: "Découvrir" } : null;
        const assignment = direction.siteInformationArchitecture.contentAssignments.find((a) => a.topic === moment.contentTopics[0]);
        assignment.classification = placement; assignment.targetPageId = moment.destinationPageId;
        // Independent role/meaning oracle: no composition recipe, only scope and primitive semantics.
        let reason = null;
        if (role === "hero" && placement === "homepage_teaser") reason = "hero_must_be_homepage_primary";
        else if (scope !== (placement === "homepage_teaser" ? "teaser_only" : "primary")) reason = "home_content_scope_mismatch";
        else if (placement === "homepage_teaser" && elements.some((element) => ["headline", "short_copy"].includes(element))) reason = "dedicated_page_detail_not_allowed_in_home_teaser";
        else if (!elements.length || (placement === "homepage_primary" && elements.includes("invitation")) || (placement === "homepage_teaser" && (!elements.includes("invitation") || !elements.includes("cta")))) reason = "home_elements_invalid";
        if (reason) {
          assert.throws(() => validateDirectionsV2([direction], references, 1), (error) => error.validation?.reason === reason, JSON.stringify(elements));
          rejected += 1;
        } else {
          const [valid] = validateDirectionsV2([direction], references, 1);
          const plan = homepageV2Plan(project, valid, { previewOnly: true });
          assert.deepEqual(plan.homepageBlueprint.sections.find((s) => s.id === moment.id).homeElements, elements);
          accepted += 1;
        }
      }
    });
  }
  assert.equal(accepted, 32); assert.equal(rejected, 224);
});

test("primitives : doublons normalisés, inconnus et détails fonctionnels bloqués", () => {
  const { references } = fixture();
  for (const index of [0, 1, 4]) {
    const direction = v2Direction(references);
    const moment = direction.siteInformationArchitecture.homepageMoments[index];
    const initial = [...moment.homeElements];
    moment.homeElements.push(...initial);
    const [valid] = validateDirectionsV2([direction], references, 1);
    assert.deepEqual(valid.siteInformationArchitecture.homepageMoments[index].homeElements, initial);
    for (const element of ["form", "calendar", "guest_count", "time_slots", "service_list", "menu", "unknown"]) {
      const bad = v2Direction(references);
      bad.siteInformationArchitecture.homepageMoments[index].homeElements.push(element);
      assert.throws(() => validateDirectionsV2([bad], references, 1), (error) => error.validation?.reason === (index === 4 ? "dedicated_page_detail_not_allowed_in_home_teaser" : "home_elements_invalid"));
      assert.ok(assertStructuredSchema({ direction: bad }, openai.directionPipelineSchemas.expansion).length);
    }
  }
});

test("autres primitives : toutes les combinaisons de rôles d'assets sont libres", () => {
  const { references } = fixture();
  const enums = openai.directionPipelineSchemas.expansion.properties.direction.properties.siteInformationArchitecture.properties.homepageMoments.items.properties.assetNeeds.items.enum;
  assert.equal(enums.length, 8);
  for (const roles of subsets(enums)) {
    const direction = v2Direction(references);
    direction.siteInformationArchitecture.homepageMoments[2].assetNeeds = roles;
    assert.deepEqual(assertStructuredSchema({ direction }, openai.directionPipelineSchemas.expansion), []);
    assert.deepEqual(validateDirectionsV2([direction], references, 1)[0].siteInformationArchitecture.homepageMoments[2].assetNeeds, roles);
  }
  const direction = v2Direction(references);
  direction.siteInformationArchitecture.homepageMoments.forEach((s) => { s.climate = "calme inédit"; s.layoutMode = "composition libre"; s.signatureMovesAllowed = ["geste libre", "geste libre"]; });
  direction.brandSystem.graphicLanguage = ["un", "deux", "trois", "quatre"];
  direction.visualSystem.signatureMoves = [];
  syncVisualPlans(direction);
  assert.deepEqual(assertStructuredSchema({ direction }, openai.directionPipelineSchemas.expansion), []);
  assert.ok(validateDirectionsV2([direction], references, 1)[0].qualityWarnings.length);
});

test("autres enums : provenance × continuité de marque et combinaisons de références", () => {
  const { references } = fixture();
  const schema = openai.directionPipelineSchemas.expansion.properties.direction.properties;
  const sources = schema.brandSystem.properties.colorSystem.properties.baseSurface.properties.sourceType.enum;
  const continuity = SiteProject.schema.path("creativeSettings.brandContinuity").enumValues;
  for (const mode of continuity) for (const sourceType of sources) {
    const direction = v2Direction(references);
    direction.brandSystem.colorSystem.baseSurface.sourceType = sourceType;
    if (mode === "reinvent" && sourceType === "clientBrandConstraint") assert.throws(() => validateDirectionsV2([direction], references, 1, { brandContinuity: mode }), (error) => error.validation.reason === "reinvent_brand_color_constraint");
    else assert.equal(validateDirectionsV2([direction], references, 1, { brandContinuity: mode }).length, 1);
  }
  for (const indexes of subsets(references.map((_ref, index) => index))) {
    const direction = v2Direction(references);
    direction.visualSystem.referenceAnchors = indexes.map((referenceIndex) => ({ referenceIndex, why: "Grammaire", principles: ["rythme"] }));
    if (indexes.length < 2) assert.throws(() => validateDirectionsV2([direction], references, 1), (error) => error.validation.reason === "reference_anchor_count_invalid");
    else assert.equal(validateDirectionsV2([direction], references, 1)[0].referencesUsed.length, indexes.length);
  }
});

test("audit artistique A–J : liberté de composition, contrat métier et exploitation aval", async (t) => {
  const { project, references } = fixture();
  const cases = [
    ["A : quatre moments forts et calmes", null, (d) => {
      d.siteInformationArchitecture.homepageMoments = d.siteInformationArchitecture.homepageMoments.filter((s) => ["hero", "story", "cuisine", "catering"].includes(s.id));
      d.siteInformationArchitecture.homepageMoments.forEach((s) => { s.climate = "quietNeutral"; s.layoutMode = "quietText"; });
    }, "homepage_moment_count_outside_preferred_range"],
    ["B : six moments variés", null, () => {}, null],
    ["C : huit moments courts", null, (d) => {
      for (const [id, purpose] of [["origins", "Les producteurs"], ["seasons", "La saison du moment"]]) {
        d.siteInformationArchitecture.homepageMoments.push({ ...d.siteInformationArchitecture.homepageMoments[3], id, purpose, contentIntent: purpose, contentTopics: [id], estimatedHeight: 260 });
        d.siteInformationArchitecture.contentAssignments.push({ topic: id, classification: "homepage_primary", targetPageId: null, reason: "Moment éditorial bref" });
      }
    }, "homepage_moment_count_outside_preferred_range"],
    ["D : même climat, layouts différents", null, (d) => { d.siteInformationArchitecture.homepageMoments[1].climate = d.siteInformationArchitecture.homepageMoments[0].climate; }, null],
    ["E : même climat et layout assumés", null, (d) => {
      const s = d.siteInformationArchitecture.homepageMoments; s[1].climate = s[0].climate; s[1].layoutMode = s[0].layoutMode;
    }, "adjacent_rhythm_repeated"],
    ["F : minimalisme avec deux signatures", null, (d) => { d.brandSystem.graphicLanguage = []; }, null],
    ["G : traiteur, intention éditoriale courte", null, (d) => {
      d.siteInformationArchitecture.homepageMoments[4].editorialIntent = { kind: "invitation", headlineIdea: "Le goût du partage", tone: "généreux", ctaLabel: "Découvrir le traiteur" };
    }, null],
    ["H : traiteur, détails de prestations", "dedicated_page_detail_not_allowed_in_home_teaser", (d) => {
      d.siteInformationArchitecture.homepageMoments[4].homeElements.push("service_list");
    }],
    ["I : réservation, invitation et CTA", null, (d) => {
      const s = d.siteInformationArchitecture.homepageMoments[4];
      s.destinationPageId = "booking"; s.homeElements = ["invitation", "cta"];
      s.editorialIntent = { kind: "invitation", headlineIdea: "On se retrouve à table ? Sans calendrier ni formulaire.", tone: "accueillant", ctaLabel: "Réserver" };
      d.siteInformationArchitecture.contentAssignments.find((a) => a.topic === "catering").targetPageId = "booking";
    }, null],
    ["J : réservation, formulaire et créneaux", "dedicated_page_detail_not_allowed_in_home_teaser", (d) => {
      d.siteInformationArchitecture.homepageMoments[4].homeElements.push("form", "time_slots");
    }],
  ];
  for (const [name, fatal, mutate, warning] of cases) await t.test(name, () => {
    const direction = v2Direction(references);
    mutate(direction); syncVisualPlans(direction);
    if (fatal) {
      assert.throws(() => validateDirectionsV2([direction], references, 1), (error) => error.validation.reason === fatal && error.validation.category === "FATAL_BUSINESS_CONTRACT");
      assert.ok(assertStructuredSchema({ direction }, openai.directionPipelineSchemas.expansion).length);
      return;
    }
    assert.deepEqual(assertStructuredSchema({ direction }, openai.directionPipelineSchemas.expansion), []);
    const [valid] = validateDirectionsV2([direction], references, 1);
    if (warning) assert.ok(valid.qualityWarnings.some((item) => item.code === warning));
    else assert.deepEqual(valid.qualityWarnings, []);
    const plan = homepageV2Plan(project, valid, { previewOnly: true });
    assert.equal(plan.segments.flatMap((chapter) => chapter.sections).length, direction.siteInformationArchitecture.homepageMoments.length);
    assert.equal(new Set(plan.segments.flatMap((chapter) => chapter.sections.map((s) => s.id))).size, direction.siteInformationArchitecture.homepageMoments.length);
    const final = plan.segments.at(-1);
    assert.ok(final.renderOnly.some((item) => item.startsWith("footer")));
    assert.ok(!final.forbiddenContent.includes("footer"));
    assert.ok(plan.segments.slice(0, -1).every((chapter) => chapter.forbiddenContent.includes("footer")));
    assert.match(final.prompt, new RegExp(`CHAPTER ${plan.segments.length}/${plan.segments.length}`));
    if (name.startsWith("G")) assert.ok(plan.segments.some((chapter) => chapter.prompt.includes("Le goût du partage")));
    if (name.startsWith("I")) assert.ok(plan.segments.some((chapter) => chapter.prompt.includes("Sans calendrier ni formulaire")));
  });
});

test("guidance artistique : quotas non bloquants et warnings reconstruits", async (t) => {
  const { references } = fixture();
  const cases = [
    ["signature_count_outside_preferred_range", (d) => { d.visualSystem.signatureMoves = []; }],
    ["signature_count_outside_preferred_range", (d) => { d.visualSystem.signatureMoves.pop(); }],
    ["signature_count_outside_preferred_range", (d) => { d.visualSystem.signatureMoves.push(...d.visualSystem.signatureMoves, d.visualSystem.signatureMoves[0]); }],
    ["graphic_language_outside_preferred_range", (d) => { d.brandSystem.graphicLanguage = ["a", "b", "c", "d"]; }],
    ["personality_outside_preferred_range", (d) => { d.brandSystem.brandPersonality = ["calme"]; }],
    ["personality_outside_preferred_range", (d) => { d.brandSystem.brandPersonality = ["a", "b", "c", "d", "e", "f"]; }],
    ["antipatterns_missing", (d) => { d.visualSystem.antiPatterns = []; }],
    ["signature_occurrences_outside_preferred_range", (d) => { d.visualSystem.signatureMoves[0].maxOccurrences = 0; }],
    ["signature_occurrences_outside_preferred_range", (d) => { d.visualSystem.signatureMoves[0].maxOccurrences = 3; }],
    ["low_climate_diversity", (d) => { d.siteInformationArchitecture.homepageMoments.forEach((s) => { s.climate = "calme"; }); }],
    ["low_layout_diversity", (d) => { d.siteInformationArchitecture.homepageMoments.forEach((s) => { s.layoutMode = "éditorial"; }); }],
  ];
  for (const [code, mutate] of cases) await t.test(code, () => {
    const direction = v2Direction(references); mutate(direction);
    assert.ok(validateDirectionsV2([direction], references, 1)[0].qualityWarnings.some((warning) => warning.code === code));
  });
  const pristine = v2Direction(references);
  pristine.qualityWarnings = [{ code: "obsolete" }];
  assert.deepEqual(validateDirectionsV2([pristine], references, 1)[0].qualityWarnings, []);
});

test("contrat fatal : vide, occurrences inexploitables et intention teaser hors structure", async (t) => {
  const { references } = fixture();
  const cases = [
    ["homepage_moment_count_invalid", (d) => { d.siteInformationArchitecture.homepageMoments = []; }],
    ["signature_occurrences_invalid", (d) => { d.visualSystem.signatureMoves[0].maxOccurrences = -1; }],
    ["signature_occurrences_invalid", (d) => { d.visualSystem.signatureMoves[0].maxOccurrences = 1.5; }],
    ["teaser_editorial_intent_invalid", (d) => { d.siteInformationArchitecture.homepageMoments[4].editorialIntent = null; }],
    ["teaser_editorial_intent_invalid", (d) => { d.siteInformationArchitecture.homepageMoments[4].editorialIntent.kind = "service_details"; }],
    ["teaser_editorial_intent_invalid", (d) => { d.siteInformationArchitecture.homepageMoments[4].editorialIntent.services = ["Mariages", "Cocktails"]; }],
    ["teaser_editorial_intent_invalid", (d) => { d.siteInformationArchitecture.homepageMoments[4].editorialIntent.headlineIdea = "a".repeat(121); }],
    ["teaser_editorial_intent_invalid", (d) => { d.siteInformationArchitecture.homepageMoments[4].editorialIntent.ctaLabel = ""; }],
  ];
  for (const [reason, mutate] of cases) await t.test(reason, () => {
    const direction = v2Direction(references); mutate(direction);
    assert.throws(() => validateDirectionsV2([direction], references, 1), (error) => error.validation?.reason === reason && error.validation.category.startsWith("FATAL_"));
  });
});

test("matrice placement × destination × portée : seules les combinaisons prévues passent", () => {
  const { references } = fixture();
  const variants = [
    { placement: "homepage_primary", destination: null, scope: "primary", expected: "valid" },
    { placement: "homepage_primary", destination: "contact", scope: "primary", expected: "valid" },
    { placement: "homepage_primary", destination: null, scope: "teaser_only", expected: "home_content_scope_mismatch" },
    { placement: "homepage_teaser", destination: "catering", scope: "teaser_only", expected: "valid" },
    { placement: "homepage_teaser", destination: null, scope: "teaser_only", expected: "homepage_teaser_requires_destination" },
    { placement: "homepage_teaser", destination: "catering", scope: "primary", expected: "home_content_scope_mismatch" },
    { placement: "homepage_teaser", destination: "booking", scope: "teaser_only", expected: "homepage_teaser_destination_mismatch" },
  ];
  for (const variant of variants) {
    const direction = v2Direction(references);
    const architecture = direction.siteInformationArchitecture;
    const moment = architecture.homepageMoments[4];
    const assignment = architecture.contentAssignments.find((item) => item.topic === "catering");
    moment.placement = variant.placement;
    moment.destinationPageId = variant.destination;
    moment.contentScope = variant.scope;
    moment.contentIntent = variant.placement === "homepage_teaser" ? "" : "Présentation concise";
    moment.editorialIntent = variant.placement === "homepage_teaser" ? { kind: "invitation", headlineIdea: "Bienvenue", tone: "direct", ctaLabel: "Découvrir" } : null;
    moment.homeElements = variant.placement === "homepage_teaser" ? ["invitation", "cta"] : ["headline", "short_copy"];
    assignment.classification = variant.placement;
    assignment.targetPageId = variant.placement === "homepage_primary" ? variant.destination : "catering";
    if (variant.expected === "valid") assert.equal(validateDirectionsV2([direction], references, 1).length, 1);
    else assert.throws(() => validateDirectionsV2([direction], references, 1), (error) => error.validation?.reason === variant.expected);
  }
});

test("contrat Structured Output : required, enums, nullabilité et propriétés fermées", () => {
  const { references } = fixture();
  const schema = openai.directionPipelineSchemas.expansion;
  const mutateCases = [
    (d) => { delete d.siteInformationArchitecture.homepageMoments[0].contentScope; },
    (d) => { d.siteInformationArchitecture.homepageMoments[4].contentScope = "detailed"; },
    (d) => { d.siteInformationArchitecture.homepageMoments[4].homeElements.push("form"); },
    (d) => { d.siteInformationArchitecture.homepageMoments[4].destinationPageId = 42; },
    (d) => { d.siteInformationArchitecture.homepageMoments[0].momentRole = "footer"; },
    (d) => { d.siteInformationArchitecture.homepageMoments[0].inventedField = true; },
  ];
  assert.deepEqual(assertStructuredSchema({ direction: v2Direction(references) }, schema), []);
  for (const mutate of mutateCases) {
    const direction = v2Direction(references);
    mutate(direction);
    assert.ok(assertStructuredSchema({ direction }, schema).length);
  }
  assert.throws(() => validateDirectionsV2([], references, 1), (error) => error.validation?.reason === "direction_count_invalid");
});

test("Style Frame : vrais assets et 2 images DesignReference, jamais Portfolio", () => {
  const { project, references } = fixture();
  project.directions.push(validateDirectionsV2([v2Direction(references)], references, 1)[0]);
  const direction = project.directions[0];
  const plan = styleFramePlan(project, direction, references);
  assert.equal(plan.endpoint, "/v1/images/edits");
  assert.equal(plan.size, "1024x1536");
  assert.deepEqual(plan.inputs.slice(-2).map((item) => item.kind), ["VISUAL_REFERENCE", "VISUAL_REFERENCE"]);
  assert.ok(plan.inputs.slice(0, -2).every((item) => item.kind === "CLIENT_ASSET"));
  assert.ok(plan.inputs.every((item) => !/portfolio/i.test(item.image.publicId)));
  assert.ok(!plan.inputs.some((item) => item.name === "graphique-exclu"));
  assert.match(plan.prompt, /Extract visual grammar, not layout identity/);
  assert.match(plan.prompt, /IMAGE 1 — CLIENT_ASSET/);
  assert.match(plan.prompt, /VISUAL_REFERENCE/);
});

test("homepage V2 : Style Frame validé requis, ownership unique, renderOnly et forbiddenContent", () => {
  const { project, references } = fixture();
  project.directions.push(validateDirectionsV2([v2Direction(references)], references, 1)[0]);
  const direction = project.directions[0];
  assert.throws(() => homepageV2Plan(project, direction), { status: 409 });
  direction.styleFrames.push({ image: source("frame"), prompt: "style", size: "1536x1024", approvedAt: new Date() });
  direction.approvedStyleFrameId = direction.styleFrames[0]._id;
  const plan = homepageV2Plan(project, direction);
  assert.equal(plan.engineVersion, "v2");
  assert.equal(plan.segments.length, 3);
  assert.equal(plan.homepageBlueprint.sections.length, 6);
  const owners = plan.homepageBlueprint.assetOwnership.map((entry) => entry.assetId);
  assert.equal(new Set(owners).size, owners.length);
  assert.ok(plan.homepageBlueprint.sections.find((section) => section.id === "cuisine").assignedAssets.some((asset) => asset.role === "food"));
  assert.equal(plan.homepageBlueprint.sections.find((section) => section.id === "manifesto").assignedAssets.length, 0);
  assert.ok(plan.segments[1].forbiddenContent.some((item) => /hero/.test(item)));
  assert.ok(plan.segments[2].forbiddenContent.some((item) => /Cuisine de saison/.test(item)));
  assert.ok(plan.segments.every((chapter) => chapter.prompt.includes("STYLE_FRAME")));
  assert.ok(plan.segments.every((chapter) => chapter.prompt.includes("RENDER_ONLY") && chapter.prompt.includes("FORBIDDEN_CONTENT")));
  assert.equal(plan.segments[0].prompt.includes("PREVIOUS_CHAPTER"), false);
  assert.equal(plan.segments[1].prompt.includes("PREVIOUS_CHAPTER"), true);
});

test("contexte de maquette : détails dédiés et texte libre d'un teaser restent hors prompt home", () => {
  const { project, references } = fixture();
  const direction = validateDirectionsV2([v2Direction(references)], references, 1)[0];
  const architecture = direction.siteInformationArchitecture;
  architecture.homepageMoments.find((moment) => moment.id === "catering").purpose = "Traiteur SENSITIVE_DETAIL_MARKER prestations et devis";
  architecture.dedicatedPageTopics[1].detailToReserve = "SENSITIVE_DETAIL_MARKER formules et devis";
  architecture.contentAssignments.find((assignment) => assignment.topic === "détails de la carte").topic = "SENSITIVE_DETAIL_MARKER prix complets";
  project.directions.push(direction);
  const saved = project.directions[0];
  saved.styleFrames.push({ image: source("frame"), prompt: "style", approvedAt: new Date() });
  saved.approvedStyleFrameId = saved.styleFrames[0]._id;
  const plan = homepageV2Plan(project, saved);
  assert.ok(plan.segments.every((segment) => !segment.prompt.includes("SENSITIVE_DETAIL_MARKER")));
  assert.equal(plan.homepageBlueprint.sections.find((section) => section.id === "catering").purpose, "Traiteur");
  assert.equal(plan.homepageBlueprint.sections.find((section) => section.id === "catering").contentScope, "teaser_only");
});

test("snapshot du moteur actuel fige le Style Frame, la marque et le blueprint", async () => {
  const { project, references } = fixture();
  project.directions.push(validateDirectionsV2([v2Direction(references)], references, 1)[0]);
  const direction = project.directions[0];
  seedVersionedFixture(project, direction);
  direction.styleFrames.push({ image: source("frame"), prompt: "style", approvedAt: new Date() });
  direction.approvedStyleFrameId = direction.styleFrames[0]._id;
  project.generations.push({ engineVersion: "v2", directionId: direction._id, styleFrameId: direction.approvedStyleFrameId, generatedPrompt: "homepage", image: source("homepage"), generationStrategy: { homepageBlueprint: { sections: [{ id: "hero" }] } } });
  direction.styleFrames.push({ image: source("frame-2"), prompt: "style 2", approvedAt: new Date() });
  direction.approvedStyleFrameId = direction.styleFrames[1]._id;
  const snapshot = buildApprovalSnapshot(project, project.generations[0], references, new Date());
  assert.equal(snapshot.direction.brandSystem.brandIdea, "Idée 0");
  assert.equal(snapshot.direction.siteInformationArchitecture.homepageMoments.length, 6);
  assert.equal(snapshot.styleFrame.prompt, "style");
  assert.equal(String(snapshot.direction.approvedStyleFrameId), String(project.generations[0].styleFrameId));
  assert.equal(snapshot.generation.generationStrategy.homepageBlueprint.sections[0].id, "hero");
  await project.validate();
});

test("moteur unique : aucun export ou bouton de génération historique", async () => {
  assert.equal(openai.generateDirections, undefined);
  assert.equal(SiteProject.schema.path("directions").schema.path("layoutPrinciples"), undefined);
  assert.equal(SiteProject.schema.path("directions").schema.path("imageGenerationPrompt"), undefined);
  assert.deepEqual(SiteProject.schema.path("directions").schema.path("engineVersion").enumValues, ["v2"]);
  const routes = fs.readFileSync(path.join(__dirname, "../routes/admin/design-lab.routes.js"), "utf8");
  const admin = fs.readFileSync(path.join(__dirname, "../../client/src/pages/dashboard/admin/sites/[id].page.js"), "utf8");
  assert.doesNotMatch(routes, /buildMockupPlan|openai\.generateDirections\b/);
  assert.doesNotMatch(admin, /Générer jusqu’à 3 maquettes|engineVersion|generateAll/);
  await assert.rejects(new SiteProject({ name: "Ancien moteur", slug: "ancien-moteur", directions: [{ engineVersion: "v1" }] }).validate(), /engineVersion/);
});

test("assemblage commun : la bande de raccord conserve la hauteur prévue", async () => {
  const first = await sharp({ create: { width: 32, height: 48, channels: 3, background: "#eeddcc" } }).png().toBuffer();
  const second = await sharp({ create: { width: 32, height: 48, channels: 3, background: "#223344" } }).png().toBuffer();
  const result = await assembleChapters([first, second], [{ width: 32, height: 48 }, { width: 32, height: 48 }], 8);
  assert.deepEqual([ (await sharp(result).metadata()).width, (await sharp(result).metadata()).height ], [32, 88]);
});

test("pipeline Sol V2 : territoires puis trois expansions parallèles sans ancien design documentaire", async () => {
  const { project, references } = fixture();
  const originalFetch = global.fetch, originalKey = process.env.OPENAI_API_KEY, originalInfo = console.info, originalWarn = console.warn, originalTimeout = global.setTimeout;
  const bodies = [];
  const logs = [];
  const timeouts = [];
  const stages = [];
  let expansionStarts = 0;
  let releaseExpansions;
  const allStarted = new Promise((resolve) => { releaseExpansions = resolve; });
  process.env.OPENAI_API_KEY = "mock-key";
  global.setTimeout = (callback, delay, ...args) => { timeouts.push(delay); return originalTimeout(callback, delay, ...args); };
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    bodies.push(body);
    if (body.text.format.name === "design_creative_territories") return mockStructuredResponse({ territories: [creativeTerritory("A", [0, 1]), creativeTerritory("B", [1, 2], 1), creativeTerritory("C", [0, 2], 2)] });
    expansionStarts += 1;
    if (expansionStarts === 3) releaseExpansions();
    await allStarted;
    const payload = JSON.parse(body.input[0].content[0].text);
    const variant = "ABC".indexOf(payload.yourTerritory.id);
    const direction = v2Direction(references, variant);
    direction.visualSystem.referenceAnchors = payload.yourTerritory.likelyReferenceAnchors.map((referenceIndex) => ({ referenceIndex, why: "Principe pertinent", principles: ["composition"] }));
    return mockStructuredResponse({ direction });
  };
  console.info = (label, details) => { logs.push({ label, details }); };
  console.warn = () => {};
  try {
    const result = await openai.generateDirectionsV2(project, references, { portfolioSummary: { siteCount: 7, frequentPatterns: [{ tag: "Serif", count: 5 }] }, onStage: async (stage) => { stages.push(stage); } });
    assert.equal(bodies.length, 4);
    assert.equal(bodies[0].model, "gpt-6.1-sol");
    assert.deepEqual(bodies.map((body) => body.text.format.name), ["design_creative_territories", "design_direction_expansion_v2", "design_direction_expansion_v2", "design_direction_expansion_v2"]);
    assert.ok(bodies.every((body) => body.text.format.strict));
    const structuredDirection = bodies[1].text.format.schema.properties.direction.properties;
    assert.ok(structuredDirection.siteInformationArchitecture);
    assert.deepEqual(structuredDirection.siteInformationArchitecture.properties.contentAssignments.items.properties.classification.enum,
      ["homepage_primary", "homepage_teaser", "dedicated_page", "global_navigation", "footer_only", "optional"]);
    const momentsSchema = structuredDirection.siteInformationArchitecture.properties.homepageMoments.items;
    assert.deepEqual(momentsSchema.properties.placement.enum, ["homepage_primary", "homepage_teaser"]);
    assert.ok(momentsSchema.required.includes("destinationPageId"));
    assert.deepEqual(momentsSchema.properties.destinationPageId.anyOf, [{ type: "string" }, { type: "null" }]);
    assert.equal(momentsSchema.properties.contentDepth, undefined);
    assert.equal(structuredDirection.visualSystem.properties.homepageSections, undefined);
    assert.ok(result.every((direction) => direction.engineVersion === "v2"));
    assert.ok(bodies.every((body) => !body.input[0].content[0].text.includes("https://old.example")));
    assert.deepEqual(timeouts, [240000, 480000, 480000, 480000]);
    assert.deepEqual(stages, ["territories", "expanding", "saving"]);
    assert.deepEqual(bodies.slice(1).map((body) => JSON.parse(body.input[0].content[0].text).yourTerritory.id), ["A", "B", "C"]);
    assert.ok(bodies.slice(1).every((body) => JSON.parse(body.input[0].content[0].text).reservedForOtherTerritories.length === 2));
    assert.ok(logs.some((entry) => entry.label === "[design-lab] directions:territories_completed"));
    assert.ok(["A", "B", "C"].every((id) => logs.some((entry) => entry.label === `[design-lab] directions:expand_${id}_completed`)));
    assert.equal(logs.find((entry) => entry.label.endsWith("v2_request")).details.referenceCount, references.length);
  } finally {
    global.fetch = originalFetch;
    global.setTimeout = originalTimeout;
    console.info = originalInfo;
    console.warn = originalWarn;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});

test("territoires trop proches : warning sans retry artistique payant", async () => {
  const { project, references } = fixture();
  const originalFetch = global.fetch, originalKey = process.env.OPENAI_API_KEY, originalInfo = console.info, originalWarn = console.warn, originalTimeout = global.setTimeout;
  const attempts = [];
  const timeouts = [];
  process.env.OPENAI_API_KEY = "mock-key";
  global.setTimeout = (callback, delay, ...args) => { timeouts.push(delay); return originalTimeout(callback, delay, ...args); };
  global.fetch = async (_url, options) => {
    attempts.push(JSON.parse(options.body));
    if (attempts.length === 1) return mockStructuredResponse({ territories: ["A", "B", "C"].map((id) => creativeTerritory(id, [0, 1])) });
    const payload = JSON.parse(attempts.at(-1).input[0].content[0].text);
    const variant = "ABC".indexOf(payload.yourTerritory.id);
    const direction = v2Direction(references, variant);
    direction.visualSystem.referenceAnchors = payload.yourTerritory.likelyReferenceAnchors.map((referenceIndex) => ({ referenceIndex, why: "Rythme", principles: ["composition"] }));
    return mockStructuredResponse({ direction });
  };
  console.info = () => {};
  console.warn = () => {};
  try {
    const directions = await openai.generateDirectionsV2(project, references, { portfolioSummary: { siteCount: 7, frequentPatterns: [{ tag: "Serif", count: 5 }] } });
    assert.equal(attempts.length, 4);
    assert.ok(directions.every((direction) => direction.qualityWarnings.some((warning) => warning.code === "territories_too_similar")));
    assert.deepEqual(timeouts, [240000, 480000, 480000, 480000]);
    assert.equal(directions.length, 3);
    assert.ok(directions.every((direction) => direction.visualSystem.divergenceConstraints.some((item) => item.includes("Serif"))));
    assert.notEqual(directions[0].brandSystem.typographicVoice, directions[1].brandSystem.typographicVoice);
  } finally {
    global.fetch = originalFetch;
    global.setTimeout = originalTimeout;
    console.info = originalInfo;
    console.warn = originalWarn;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});

test("une expansion échouée attend les autres puis refuse tout assemblage partiel", async () => {
  const { project, references } = fixture();
  const original = { fetch: global.fetch, key: process.env.OPENAI_API_KEY, info: console.info, warn: console.warn };
  const expanded = [];
  process.env.OPENAI_API_KEY = "mock-key";
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.text.format.name === "design_creative_territories") return mockStructuredResponse({ territories: [creativeTerritory("A", [0, 1]), creativeTerritory("B", [1, 2], 1), creativeTerritory("C", [0, 2], 2)] });
    const payload = JSON.parse(body.input[0].content[0].text);
    const id = payload.yourTerritory.id;
    expanded.push(id);
    if (id === "B") return { ok: false, status: 500, json: async () => ({ error: { message: "mock expansion failure" } }) };
    const direction = v2Direction(references, "ABC".indexOf(id));
    direction.visualSystem.referenceAnchors = payload.yourTerritory.likelyReferenceAnchors.map((referenceIndex) => ({ referenceIndex, why: "Rythme", principles: ["composition"] }));
    return mockStructuredResponse({ direction });
  };
  console.info = () => {};
  console.warn = () => {};
  try {
    await assert.rejects(openai.generateDirectionsV2(project, references), { status: 502 });
    assert.deepEqual(expanded, ["A", "B", "C"]);
    assert.equal(project.directions.length, 0);
  } finally {
    global.fetch = original.fetch;
    console.info = original.info;
    console.warn = original.warn;
    if (original.key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = original.key;
  }
});

test("expansion invalide : log structuré du moment, placement et motif, sans sauvegarde", async () => {
  const { project, references } = fixture();
  const original = { fetch: global.fetch, key: process.env.OPENAI_API_KEY, info: console.info, warn: console.warn };
  const warnings = [];
  process.env.OPENAI_API_KEY = "mock-key";
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.text.format.name === "design_creative_territories") return mockStructuredResponse({ territories: [creativeTerritory("A", [0, 1])] });
    const direction = v2Direction(references);
    direction.siteInformationArchitecture.homepageMoments[4].destinationPageId = null;
    return mockStructuredResponse({ direction });
  };
  console.info = () => {};
  console.warn = (label, details) => { warnings.push({ label, details }); };
  try {
    await assert.rejects(openai.generateDirectionsV2(project, references, { count: 1 }), /teaser sans page dédiée/);
    const invalid = warnings.find((entry) => entry.label === "[design-lab] directions:expansion_invalid");
    assert.deepEqual({
      stage: invalid.details.stage, validationStage: invalid.details.validationStage,
      momentId: invalid.details.momentId, placement: invalid.details.placement,
      destinationPageId: invalid.details.destinationPageId, reason: invalid.details.reason,
    }, {
      stage: "expand_A", validationStage: "site_information_architecture",
      momentId: "catering", placement: "homepage_teaser",
      destinationPageId: null, reason: "homepage_teaser_requires_destination",
    });
    assert.equal(project.directions.length, 0);
  } finally {
    global.fetch = original.fetch;
    console.info = original.info;
    console.warn = original.warn;
    if (original.key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = original.key;
  }
});

test("incident invitation-table simulé : trois HTTP 200 conservent le motif et un diagnostic sans texte", async () => {
  const { project, references } = fixture();
  const originals = { fetch: global.fetch, key: process.env.OPENAI_API_KEY, diagnostics: process.env.DESIGN_LAB_DIAGNOSTICS, nodeEnv: process.env.NODE_ENV, info: console.info, warn: console.warn };
  const warnings = [];
  process.env.OPENAI_API_KEY = "mock-key";
  process.env.DESIGN_LAB_DIAGNOSTICS = "1";
  process.env.NODE_ENV = "test";
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.text.format.name === "design_creative_territories") return mockStructuredResponse({ territories: [creativeTerritory("A", [0, 1]), creativeTerritory("B", [1, 2], 1), creativeTerritory("C", [0, 2], 2)] });
    const territory = JSON.parse(body.input[0].content[0].text).yourTerritory.id;
    const direction = preflightDirections(references)["ABC".indexOf(territory)];
    const moment = direction.siteInformationArchitecture.homepageMoments.find((item) => item.id === "reservation");
    moment.id = "invitation-table";
    moment.contentIntent = "On se retrouve à table ? Sans calendrier ni formulaire.";
    direction.visualSystem.rhythmMap.at(-1).sectionId = moment.id;
    direction.visualSystem.sectionClimatePlan.at(-1).sectionId = moment.id;
    return mockStructuredResponse({ direction });
  };
  console.info = () => {};
  console.warn = (label, details) => { warnings.push({ label, details }); };
  try {
    await assert.rejects(openai.generateDirectionsV2(project, references), (error) => error.validation?.reason === "teaser_content_intent_must_be_empty");
    const invalid = warnings.filter((item) => item.label === "[design-lab] directions:expansion_invalid");
    assert.deepEqual(invalid.map((item) => item.details.stage), ["expand_A", "expand_B", "expand_C"]);
    for (const { details } of invalid) {
      assert.equal(details.code, "DIRECTIONS_V2_VALIDATION");
      assert.equal(details.validationStage, "site_information_architecture");
      assert.match(details.fieldPath, /homepageMoments\[6\]\.contentIntent$/);
      assert.equal(details.momentId, "invitation-table");
      assert.equal(details.placement, "homepage_teaser");
      assert.equal(details.destinationPageId, "booking");
      assert.equal(details.reason, "teaser_content_intent_must_be_empty");
      assert.equal(details.rejectedMoment.id, "invitation-table");
      assert.equal(JSON.stringify(details).includes("Sans calendrier"), false);
      assert.equal(JSON.stringify(details).includes("mock-key"), false);
    }
    assert.equal(project.directions.length, 0);
    warnings.length = 0;
    process.env.NODE_ENV = "production";
    await assert.rejects(openai.generateDirectionsV2(project, references), (error) => error.validation?.reason === "teaser_content_intent_must_be_empty");
    assert.ok(warnings.filter((item) => item.label === "[design-lab] directions:expansion_invalid").every((item) => !Object.hasOwn(item.details, "rejectedMoment")));
  } finally {
    global.fetch = originals.fetch;
    console.info = originals.info;
    console.warn = originals.warn;
    if (originals.key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originals.key;
    if (originals.diagnostics === undefined) delete process.env.DESIGN_LAB_DIAGNOSTICS;
    else process.env.DESIGN_LAB_DIAGNOSTICS = originals.diagnostics;
    if (originals.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originals.nodeEnv;
  }
});

test("diversité finale : warning après trois expansions valides, sans rejet", async () => {
  const { project, references } = fixture();
  const originals = { fetch: global.fetch, key: process.env.OPENAI_API_KEY, info: console.info, warn: console.warn };
  const warnings = [];
  process.env.OPENAI_API_KEY = "mock-key";
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.text.format.name === "design_creative_territories") return mockStructuredResponse({ territories: [creativeTerritory("A", [0, 1]), creativeTerritory("B", [1, 2], 1), creativeTerritory("C", [0, 2], 2)] });
    const territoryId = JSON.parse(body.input[0].content[0].text).yourTerritory.id;
    const direction = v2Direction(references);
    direction.visualSystem.referenceAnchors = ({ A: [0, 1], B: [1, 2], C: [0, 2] })[territoryId]
      .map((referenceIndex) => ({ referenceIndex, why: "Rythme", principles: ["composition"] }));
    return mockStructuredResponse({ direction });
  };
  console.info = () => {};
  console.warn = (label, details) => { warnings.push({ label, details }); };
  try {
    const directions = await openai.generateDirectionsV2(project, references);
    assert.equal(directions.length, 3);
    assert.ok(directions.every((direction) => direction.qualityWarnings.some((warning) => warning.code === "directions_too_similar")));
    assert.ok(warnings.some((item) => item.label === "[design-lab] directions:quality_warnings" && item.details.stage === "diversity_check"));
    assert.equal(project.directions.length, 0);
  } finally {
    global.fetch = originals.fetch;
    console.info = originals.info;
    console.warn = originals.warn;
    if (originals.key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originals.key;
  }
});

test("réponse 200 sans JSON structuré : parsing et log gardent une raison explicite", async () => {
  const { project, references } = fixture();
  const originals = { fetch: global.fetch, key: process.env.OPENAI_API_KEY, info: console.info, warn: console.warn };
  const warnings = [];
  process.env.OPENAI_API_KEY = "mock-key";
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.text.format.name === "design_creative_territories") return mockStructuredResponse({ territories: [creativeTerritory("A", [0, 1])] });
    return { ok: true, status: 200, json: async () => ({ output: [{ content: [{ type: "output_text", text: "{invalid" }] }] }) };
  };
  console.info = () => {};
  console.warn = (label, details) => { warnings.push({ label, details }); };
  try {
    await assert.rejects(openai.generateDirectionsV2(project, references, { count: 1 }), (error) => error.validation?.reason === "structured_output_parse_failed");
    const invalid = warnings.find((item) => item.label === "[design-lab] directions:expansion_invalid");
    assert.equal(invalid.details.validationStage, "structural");
    assert.equal(invalid.details.reason, "structured_output_parse_failed");
    assert.equal(project.directions.length, 0);
  } finally {
    global.fetch = originals.fetch;
    console.info = originals.info;
    console.warn = originals.warn;
    if (originals.key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originals.key;
  }
});

async function withCheckpointRoute(callback) {
  const { project, references } = fixture();
  const originals = {
    fetch: global.fetch, key: process.env.OPENAI_API_KEY, info: console.info, warn: console.warn,
    findOneAndUpdate: SiteProject.findOneAndUpdate, exists: SiteProject.exists, updateOne: SiteProject.updateOne,
    findById: SiteProject.findById, findReferences: DesignReference.find, updateMany: DesignReference.updateMany,
    findSites: GustoPortfolioSite.find,
  };
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const state = { project, references, checkpoint: null, official: [], saves: 0, calls: [], history: [], logs: [], outcomeA: "valid", failSave: false, failCheckpoint: false };
  process.env.OPENAI_API_KEY = "mock-key";
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    state.calls.push(body);
    if (body.text.format.name === "design_creative_territories") return mockStructuredResponse({ territories: [creativeTerritory("A", [0, 1]), creativeTerritory("B", [1, 2], 1), creativeTerritory("C", [0, 2], 2)] });
    const territory = JSON.parse(body.input[0].content[0].text).yourTerritory;
    if (territory.id === "A" && state.outcomeA === "network") throw new Error("synthetic network failure");
    const direction = v2Direction(references, "ABC".indexOf(territory.id));
    direction.visualSystem.referenceAnchors = territory.likelyReferenceAnchors.map((referenceIndex) => ({ referenceIndex, why: "Principe pertinent", principles: ["composition"] }));
    if (territory.id === "A") {
      const moment = direction.siteInformationArchitecture.homepageMoments[2];
      moment.id = "scene-partage"; moment.homeElements = ["short_copy", "photography"];
      syncVisualPlans(direction);
      if (state.outcomeA === "business") moment.homeElements = ["invitation"];
      if (state.outcomeA === "schema") delete direction.brandSystem;
      if (state.outcomeA === "warning") {
        const sections = direction.siteInformationArchitecture.homepageMoments;
        sections[1].climate = sections[0].climate; sections[1].layoutMode = sections[0].layoutMode;
        syncVisualPlans(direction);
      }
    }
    // Distinct completion order exercises serialized durable snapshots.
    await new Promise((resolve) => setTimeout(resolve, territory.id === "B" ? 5 : 1));
    return mockStructuredResponse({ direction });
  };
  SiteProject.findOneAndUpdate = async (_query, update) => {
    project.directions = copy(state.official); // New request sees persisted official state only.
    Object.assign(project, update.$set);
    return project;
  };
  SiteProject.findById = () => ({ select: async () => ({ directionGenerationCheckpoint: state.checkpoint && copy(state.checkpoint) }) });
  SiteProject.exists = async () => true;
  SiteProject.updateOne = async (query, update) => {
    assert.equal(query.operation, project.operation);
    if (update.$set?.directionGenerationCheckpoint) {
      if (state.failCheckpoint) throw new Error("synthetic checkpoint storage failure");
      state.checkpoint = copy(update.$set.directionGenerationCheckpoint);
      state.history.push(copy(state.checkpoint));
    } else Object.assign(project, update.$set);
    return { matchedCount: 1 };
  };
  project.save = async () => {
    assert.ok(project.$where.operation.startsWith("directions:"));
    await project.validate();
    if (state.failSave) throw new Error("synthetic final save failure");
    assert.equal(project.directionGenerationCheckpoint, null);
    assert.ok(project.isModified("directionGenerationCheckpoint"));
    state.saves += 1;
    // One atomic document commit: official directions and checkpoint cleanup.
    state.official = copy(project.directions);
    state.checkpoint = null;
    return project;
  };
  DesignReference.find = () => ({ lean: async () => references.map((reference) => ({ ...reference, active: true })) });
  DesignReference.updateMany = async () => ({ modifiedCount: references.length });
  GustoPortfolioSite.find = () => ({ lean: async () => [] });
  console.info = (label, details) => state.logs.push({ label, details });
  console.warn = (label, details) => state.logs.push({ label, details });
  const routePath = "../routes/admin/design-lab.routes";
  delete require.cache[require.resolve(routePath)];
  const router = require(routePath);
  const handler = router.stack.find((layer) => layer.route?.path === "/admin/design-lab/projects/:id/directions" && layer.route.methods.post).route.stack.at(-1).handle;
  state.run = async () => {
    const response = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ params: { id: String(project._id) } }, response);
    return response;
  };
  try { await callback(state); }
  finally {
    global.fetch = originals.fetch; console.info = originals.info; console.warn = originals.warn;
    SiteProject.findOneAndUpdate = originals.findOneAndUpdate; SiteProject.exists = originals.exists;
    SiteProject.updateOne = originals.updateOne; SiteProject.findById = originals.findById;
    DesignReference.find = originals.findReferences; DesignReference.updateMany = originals.updateMany;
    GustoPortfolioSite.find = originals.findSites;
    if (originals.key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originals.key;
    delete require.cache[require.resolve(routePath)];
  }
}

test("Régénération B mockée : identifiant B dans prompt, Structured Output, checkpoint et résultat", async () => {
  const { project, references } = fixture();
  const originals = { fetch:global.fetch, key:process.env.OPENAI_API_KEY, info:console.info, warn:console.warn };
  const calls = [], checkpoints = [];
  process.env.OPENAI_API_KEY = "mock-key";
  console.info = () => {}; console.warn = () => {};
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body); calls.push(body);
    return mockStructuredResponse(body.text.format.name === "design_creative_territories"
      ? { territories:[creativeTerritory("B",[0,1])] } : { direction:v2Direction(references) });
  };
  try {
    const result = await openai.generateDirectionsV2(project,references,{count:1,targetSlot:"B",replacesDirectionId:"source-b",onCheckpoint:async (checkpoint)=>checkpoints.push(checkpoint)});
    assert.equal(calls.length,2);
    assert.equal(result.length,1); assert.equal(result[0].slot,"B");
    assert.equal(result[0].generationId,checkpoints[0].generationId);
    assert.ok(calls[0].instructions.includes("l'ID du territoire est exactement B"));
    assert.ok(calls[1].instructions.includes("YOUR TERRITORY (B)"));
    assert.deepEqual(Object.keys(checkpoints.at(-1).expansions),["B"]);
    assert.equal(checkpoints.at(-1).targetSlot,"B");
    assert.equal(checkpoints.at(-1).replacesDirectionId,"source-b");
  } finally {
    global.fetch=originals.fetch; console.info=originals.info; console.warn=originals.warn;
    if(originals.key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=originals.key;
  }
});

test("checkpoint : reprise ciblée sur un set existant, historique intact et toujours A/B/C actifs", () => withCheckpointRoute(async (s) => {
  promoteDirectionSet(s.project, [0,1,2].map((variant) => validateDirectionsV2([v2Direction(s.references,variant)],s.references,1)[0]), "old-run");
  s.project.directions[1].styleFrames.push({ image:source("historical-frame"),prompt:"Conserver cette image",approvedAt:new Date() });
  const oldIds = s.project.directions.map((direction)=>String(direction._id));
  s.official = s.project.toObject().directions;
  s.outcomeA = "business";
  assert.equal((await s.run()).code,502);
  assert.equal(s.official.length,3);
  assert.deepEqual(Object.keys(s.checkpoint.expansions),["A","B","C"]);
  s.outcomeA = "valid";
  assert.equal((await s.run()).code,200);
  assert.equal(s.calls.length,5); // 4 mocked initial requests, only A retried manually.
  assert.equal(s.official.length,6);
  assert.equal(activeDirections({directions:s.official}).length,3);
  assert.ok(s.official.filter((direction)=>oldIds.includes(String(direction._id))).every((direction)=>direction.status==="archived"));
  assert.equal(s.official.find((direction)=>String(direction._id)===oldIds[1]).styleFrames.length,1);
  assert.ok(activeDirections({directions:s.official}).every((direction)=>direction.version===2&&direction.styleFrames.length===0));
  assert.equal(s.checkpoint,null);
}));

test("checkpoint persistant : sauvegarde atomique officielle et reprise ciblée", async (t) => {
  await t.test("1 : A/B/C valides, un commit officiel et checkpoint consommé", () => withCheckpointRoute(async (s) => {
    assert.equal((await s.run()).code, 200);
    assert.equal(s.calls.length, 4); assert.equal(s.saves, 1);
    assert.equal(s.official.length, 3); assert.equal(s.checkpoint, null);
    assert.deepEqual(s.official[0].siteInformationArchitecture.homepageMoments[2].homeElements, ["short_copy", "photography"]);
    assert.ok(s.history.some((c) => c.expansions.A.status === "received"));
    assert.equal(s.history.at(-1).status, "ready");
    for (const territory of ["B", "C"]) {
      let validSeen = false;
      for (const snapshot of s.history) {
        if (validSeen) assert.equal(snapshot.expansions[territory].status, "valid");
        validSeen ||= snapshot.expansions[territory].status === "valid";
      }
    }
  }));
  await t.test("2 : A invalide, B/C persistés sans direction officielle", () => withCheckpointRoute(async (s) => {
    s.outcomeA = "business";
    assert.equal((await s.run()).code, 502);
    assert.equal(s.calls.length, 4); assert.equal(s.saves, 0); assert.equal(s.official.length, 0);
    assert.equal(s.checkpoint.expansions.A.status, "failed");
    assert.ok(s.checkpoint.expansions.A.result);
    assert.equal(s.checkpoint.expansions.B.status, "valid");
    assert.equal(s.checkpoint.expansions.C.status, "valid");
    assert.equal(s.checkpoint.territories.length, 3);
    assert.equal(s.checkpoint.validatorVersion, VALIDATOR_VERSION);
  }));
  await t.test("3 : reprise manuelle, A uniquement avec même contexte et anchors", () => withCheckpointRoute(async (s) => {
    s.outcomeA = "business"; await s.run();
    const generationId = s.checkpoint.generationId;
    const firstA = s.calls.find((body) => body.text.format.name === "design_direction_expansion_v2" && JSON.parse(body.input[0].content[0].text).yourTerritory.id === "A");
    s.outcomeA = "valid";
    assert.equal((await s.run()).code, 200);
    assert.equal(s.calls.length, 5); assert.equal(s.saves, 1); assert.equal(s.official.length, 3);
    assert.deepEqual(s.calls.at(-1), firstA);
    assert.equal(s.history.at(-1).generationId, generationId);
    assert.equal(s.checkpoint, null);
  }));
  await t.test("4 : A encore invalide au second run, B/C restent intacts", () => withCheckpointRoute(async (s) => {
    s.outcomeA = "business"; await s.run();
    const previousB = JSON.stringify(s.checkpoint.expansions.B.result), previousC = JSON.stringify(s.checkpoint.expansions.C.result);
    assert.equal((await s.run()).code, 502);
    assert.equal(s.calls.length, 5); assert.equal(s.saves, 0);
    assert.equal(JSON.stringify(s.checkpoint.expansions.B.result), previousB);
    assert.equal(JSON.stringify(s.checkpoint.expansions.C.result), previousC);
    assert.equal(s.checkpoint.expansions.A.attempts, 2);
    assert.equal(s.checkpoint.expansions.B.attempts, 1);
  }));
  await t.test("5 : contrat incompatible, refus sans nouvel appel et checkpoint conservé", () => withCheckpointRoute(async (s) => {
    s.outcomeA = "business"; await s.run();
    s.checkpoint.contractVersion = "incompatible-contract";
    const checkpoint = JSON.stringify(s.checkpoint);
    assert.equal((await s.run()).code, 409); assert.equal(s.calls.length, 4);
    assert.equal(JSON.stringify(s.checkpoint), checkpoint); assert.equal(s.saves, 0);
  }));
  await t.test("6 : qualityWarning reste valid et sauvegardable", () => withCheckpointRoute(async (s) => {
    s.outcomeA = "warning";
    assert.equal((await s.run()).code, 200); assert.equal(s.calls.length, 4);
    assert.equal(s.history.at(-1).expansions.A.status, "valid");
    assert.ok(s.official[0].qualityWarnings.some((warning) => warning.code === "adjacent_rhythm_repeated"));
  }));
  await t.test("7 : erreur réseau A, B/C récupérables puis A seul", () => withCheckpointRoute(async (s) => {
    s.outcomeA = "network";
    assert.equal((await s.run()).code, 500); assert.equal(s.saves, 0);
    assert.equal(s.checkpoint.expansions.A.status, "failed");
    assert.equal(s.checkpoint.expansions.B.status, "valid"); assert.equal(s.checkpoint.expansions.C.status, "valid");
    s.outcomeA = "valid";
    assert.equal((await s.run()).code, 200); assert.equal(s.calls.length, 5);
  }));
  await t.test("8 : panne du save final, reprise sans repayer aucune étape", () => withCheckpointRoute(async (s) => {
    s.failSave = true;
    assert.equal((await s.run()).code, 500);
    assert.equal(s.checkpoint.status, "ready"); assert.equal(s.official.length, 0);
    s.failSave = false;
    assert.equal((await s.run()).code, 200); assert.equal(s.calls.length, 4);
    assert.equal(s.official.length, 3); assert.equal(s.checkpoint, null);
  }));
  await t.test("9 : correctif de validateur, réponse déjà reçue revalidée sans API", () => withCheckpointRoute(async (s) => {
    s.outcomeA = "business"; await s.run();
    const raw = s.checkpoint.expansions.A.result.direction;
    raw.siteInformationArchitecture.homepageMoments[2].homeElements = ["short_copy", "photography"];
    s.checkpoint.validatorVersion = "old-headline-required";
    assert.equal((await s.run()).code, 200); assert.equal(s.calls.length, 4);
    assert.equal(s.history.at(-1).validatorVersion, VALIDATOR_VERSION);
  }));
  await t.test("10 : schéma invalide conservé avant rejet ; B/C non rappelés", () => withCheckpointRoute(async (s) => {
    s.outcomeA = "schema";
    assert.equal((await s.run()).code, 502);
    assert.ok(s.checkpoint.expansions.A.result);
    assert.equal(s.checkpoint.expansions.A.error.reason, "structured_output_schema_invalid");
    s.outcomeA = "valid";
    assert.equal((await s.run()).code, 200); assert.equal(s.calls.length, 5);
  }));
  await t.test("11 : contexte changé, refus sans nouvelle facturation", () => withCheckpointRoute(async (s) => {
    s.outcomeA = "business"; await s.run();
    s.project.brief.story = "Un autre brief documentaire";
    assert.equal((await s.run()).code, 409); assert.equal(s.calls.length, 4);
    assert.equal(s.checkpoint.expansions.B.status, "valid");
  }));
  await t.test("12 : checkpoint initial indisponible, aucun appel payant", () => withCheckpointRoute(async (s) => {
    s.failCheckpoint = true;
    assert.equal((await s.run()).code, 500); assert.equal(s.calls.length, 0);
    assert.equal(s.official.length, 0);
  }));
  await t.test("13 : territoires devenus invalides, aucune réattribution avec B/C", () => withCheckpointRoute(async (s) => {
    s.outcomeA = "business"; await s.run();
    s.checkpoint.territoriesResult.territories[0].name = "";
    assert.equal((await s.run()).code, 409); assert.equal(s.calls.length, 4);
    assert.equal(s.checkpoint.expansions.B.status, "valid");
  }));
  await t.test("14 : checkpoint incomplet, refus sans nouvelle facturation", () => withCheckpointRoute(async (s) => {
    s.outcomeA = "business"; await s.run();
    delete s.checkpoint.expansions.A;
    assert.equal((await s.run()).code, 409); assert.equal(s.calls.length, 4);
    assert.equal(s.checkpoint.expansions.B.status, "valid");
  }));
});

test("checkpoint interne : absent des JSON API et snapshots de projet", () => {
  const { project } = fixture();
  project.directionGenerationCheckpoint = { territories: ["PRIVATE"], expansions: { A: { result: { private: true } } } };
  assert.equal(project.toJSON().directionGenerationCheckpoint, undefined);
  assert.equal(project.toObject().directionGenerationCheckpoint, undefined);
  assert.ok(project.directionGenerationCheckpoint);
  assert.equal(SiteProject.schema.path("directionGenerationCheckpoint").options.select, false);
});

test("abandon du checkpoint : explicite, protégé par l'état du projet et le verrou", async () => {
  const { project } = fixture();
  const originals = { findById: SiteProject.findById, updateOne: SiteProject.updateOne, fetch: global.fetch };
  let writes = 0;
  SiteProject.findById = async () => project;
  SiteProject.updateOne = async (query, update) => {
    assert.equal(query.operation, ""); assert.deepEqual(query.status, { $ne: "approved" });
    assert.deepEqual(update, { $unset: { directionGenerationCheckpoint: "" } });
    writes += 1;
    return { matchedCount: 1 };
  };
  global.fetch = async () => { throw new Error("No network expected"); };
  const routePath = "../routes/admin/design-lab.routes";
  delete require.cache[require.resolve(routePath)];
  const router = require(routePath);
  const handler = router.stack.find((layer) => layer.route?.path === "/admin/design-lab/projects/:id/directions-checkpoint" && layer.route.methods.delete).route.stack.at(-1).handle;
  const run = async () => {
    const response = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ params: { id: String(project._id) } }, response);
    return response;
  };
  try {
    project.operation = "directions:running";
    assert.equal((await run()).code, 409); assert.equal(writes, 0);
    project.operation = ""; project.status = "approved";
    assert.equal((await run()).code, 409); assert.equal(writes, 0);
    project.status = "brief_ready";
    assert.equal((await run()).code, 200); assert.equal(writes, 1);
  } finally {
    SiteProject.findById = originals.findById; SiteProject.updateOne = originals.updateOne;
    global.fetch = originals.fetch;
    delete require.cache[require.resolve(routePath)];
  }
});

test("versionnement : prompt, schéma, modèle et contexte modifiés sont incompatibles", () => {
  const { project, references } = fixture();
  const options = { count: 3, avoid: [], model: "gpt-6.1-sol", schemas: openai.directionPipelineSchemas };
  const first = checkpointIdentity(project, references, {}, options);
  assert.equal(checkpointIdentity(project, references, {}, { ...options, model: "another-model" }).contractVersion === first.contractVersion, false);
  assert.equal(checkpointIdentity(project, references, {}, { ...options, schemas: { ...options.schemas, changed: true } }).contractVersion === first.contractVersion, false);
  references[0].analysis.composition = "Nouvelle analyse";
  assert.notEqual(checkpointIdentity(project, references, {}, options).contextHash, first.contextHash);
  project.creativeSettings.brandContinuity = "preserve";
  assert.notEqual(checkpointIdentity(project, references, {}, options).contractVersion, first.contractVersion);
});

test("Directions V2 : le schéma est aussi contrôlé localement après parsing", async (t) => {
  const { project, references } = fixture();
  const originals = { fetch: global.fetch, key: process.env.OPENAI_API_KEY, info: console.info, warn: console.warn };
  const cases = [
    ["champ obligatoire absent", (d) => { delete d.brandSystem; }],
    ["objet null interdit", (d) => { d.visualSystem = null; }],
    ["array invalide", (d) => { d.siteInformationArchitecture.homepageMoments = {}; }],
    ["enum impossible", (d) => { d.siteInformationArchitecture.homepageMoments[0].placement = "dedicated_page"; }],
    ["entier impossible", (d) => { d.siteInformationArchitecture.homepageMoments[0].estimatedHeight = "haut"; }],
    ["champ mort ajouté", (d) => { d.obsolete = "unused"; }],
    ["nullable mais mauvaise forme", (d) => { d.siteInformationArchitecture.homepageMoments[4].editorialIntent = "Le goût du partage"; }],
    ["slot éditorial trop long", (d) => { d.siteInformationArchitecture.homepageMoments[4].editorialIntent.tone = "x".repeat(81); }],
    ["destination non nullable invalide", (d) => { d.siteInformationArchitecture.homepageMoments[0].destinationPageId = 42; }],
  ];
  process.env.OPENAI_API_KEY = "mock-key";
  console.info = () => {};
  console.warn = () => {};
  try {
    for (const [name, mutate] of cases) await t.test(name, async () => {
      global.fetch = async (_url, options) => {
        if (JSON.parse(options.body).text.format.name === "design_creative_territories") return mockStructuredResponse({ territories: [creativeTerritory("A", [0, 1])] });
        const direction = v2Direction(references); mutate(direction);
        return mockStructuredResponse({ direction });
      };
      await assert.rejects(openai.generateDirectionsV2(project, references, { count: 1 }), (error) => error.validation.category === "FATAL_STRUCTURE" && error.validation.reason === "structured_output_schema_invalid" && error.validation.fieldPath.startsWith("design_direction_expansion_v2.direction"));
      assert.equal(project.directions.length, 0);
    });
  } finally {
    global.fetch = originals.fetch;
    console.info = originals.info;
    console.warn = originals.warn;
    if (originals.key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originals.key;
  }
});

test("territoire structurellement invalide : aucune répétition payante automatique", async () => {
  const { project, references } = fixture();
  const originals = { fetch: global.fetch, key: process.env.OPENAI_API_KEY, info: console.info, warn: console.warn };
  let territoryCalls = 0, expansionCalls = 0;
  process.env.OPENAI_API_KEY = "mock-key";
  console.info = () => {};
  console.warn = () => {};
  global.fetch = async (_url, options) => {
    if (JSON.parse(options.body).text.format.name === "design_creative_territories") {
      territoryCalls += 1;
      return mockStructuredResponse({ territories: [creativeTerritory(territoryCalls === 1 ? "B" : "A", [0, 1])] });
    }
    expansionCalls += 1;
    return mockStructuredResponse({ direction: v2Direction(references) });
  };
  try {
    await assert.rejects(openai.generateDirectionsV2(project, references, { count: 1 }), (error) => error.validation?.reason === "territory_count_or_ids_invalid");
    assert.equal(territoryCalls, 1); assert.equal(expansionCalls, 0);
  } finally {
    global.fetch = originals.fetch;
    console.info = originals.info;
    console.warn = originals.warn;
    if (originals.key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originals.key;
  }
});

test("préflight A/B/C : schéma strict, parsing réel, validation V2 et sauvegarde projet simulée", async () => {
  const { project, references } = fixture();
  project.name = "Maison des Quais";
  project.brief.description = "Restaurant familial de cuisine de saison, avec traiteur et réservation.";
  const responses = preflightDirections(references);
  responses[0].siteInformationArchitecture.homepageMoments[1].climate = responses[0].siteInformationArchitecture.homepageMoments[0].climate;
  responses[0].siteInformationArchitecture.homepageMoments[1].layoutMode = responses[0].siteInformationArchitecture.homepageMoments[0].layoutMode;
  const expansionSchema = openai.directionPipelineSchemas.expansion;
  for (const [index, direction] of responses.entries()) {
    assert.deepEqual(assertStructuredSchema({ direction }, expansionSchema), [], `Fixture ${"ABC"[index]} hors JSON Schema`);
    const architecture = direction.siteInformationArchitecture;
    const dedicatedIds = new Set(architecture.primaryPages.filter((page) => page.role === "dedicated").map((page) => page.id));
    assert.ok(architecture.homepageMoments.some((moment) => moment.id === "hero-maison" && moment.placement === "homepage_primary" && moment.destinationPageId === null));
    assert.ok(architecture.homepageMoments.some((moment) => moment.id === "manifesto" && moment.placement === "homepage_primary" && moment.destinationPageId === null));
    assert.ok(architecture.homepageMoments.some((moment) => moment.id === "catering" && moment.placement === "homepage_teaser" && moment.destinationPageId === "catering"));
    assert.ok(architecture.homepageMoments.some((moment) => moment.id === "reservation" && moment.placement === "homepage_teaser" && moment.destinationPageId === "booking"));
    assert.ok(architecture.contentAssignments.filter((item) => ["homepage_teaser", "dedicated_page"].includes(item.classification)).every((item) => dedicatedIds.has(item.targetPageId)));
    assert.ok(architecture.contentAssignments.filter((item) => ["dedicated_page", "global_navigation", "footer_only", "optional"].includes(item.classification)).every((item) => !architecture.homepageMoments.some((moment) => moment.contentTopics.includes(item.topic))));
    assert.ok(!architecture.homepageMoments.some((moment) => /formulaire|calendrier|menu complet|traiteur détaillé/i.test(moment.contentIntent)));
    assert.equal(validateDirectionsV2([direction], references, 1, { allowedReferenceIndexes: [index === 1 ? 1 : 0, index === 2 ? 2 : index === 1 ? 2 : 1] }).length, 1);
  }

  const originals = {
    fetch: global.fetch, key: process.env.OPENAI_API_KEY, info: console.info, warn: console.warn,
    findOneAndUpdate: SiteProject.findOneAndUpdate, exists: SiteProject.exists, updateOne: SiteProject.updateOne,
    findById: SiteProject.findById, findReferences: DesignReference.find, updateMany: DesignReference.updateMany,
    findSites: GustoPortfolioSite.find,
  };
  const calls = [];
  const stages = [];
  const writes = [];
  let saves = 0;
  process.env.OPENAI_API_KEY = "mock-key";
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    if (body.text.format.name === "design_creative_territories") return mockStructuredResponse({ territories: [creativeTerritory("A", [0, 1]), creativeTerritory("B", [1, 2], 1), creativeTerritory("C", [0, 2], 2)] });
    assert.deepEqual(body.text.format.schema, expansionSchema);
    assert.match(body.instructions, /homepage_teaser ne signifie JAMAIS/);
    const id = JSON.parse(body.input[0].content[0].text).yourTerritory.id;
    return mockStructuredResponse({ direction: responses["ABC".indexOf(id)] });
  };
  project.save = async () => {
    saves += 1;
    writes.push("project.save");
    assert.equal(project.directions.length, 3);
    await project.validate();
    return project;
  };
  SiteProject.findOneAndUpdate = async (_query, update) => { Object.assign(project, update.$set); return project; };
  SiteProject.exists = async () => true;
  SiteProject.updateOne = async (_query, update) => { if (update.$set.operationStage) stages.push(update.$set.operationStage); return { matchedCount: 1 }; };
  SiteProject.findById = () => ({ select: async () => project });
  DesignReference.find = () => ({ lean: async () => references.map((reference) => ({ ...reference, active: true })) });
  DesignReference.updateMany = async () => { writes.push("references.updateMany"); return { modifiedCount: references.length }; };
  GustoPortfolioSite.find = () => ({ lean: async () => [] });
  console.info = () => {};
  console.warn = () => {};
  const routePath = "../routes/admin/design-lab.routes";
  delete require.cache[require.resolve(routePath)];
  const router = require(routePath);
  const handler = router.stack.find((layer) => layer.route?.path === "/admin/design-lab/projects/:id/directions" && layer.route.methods.post).route.stack.at(-1).handle;
  const response = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  try {
    await handler({ params: { id: String(project._id) } }, response);
    assert.equal(response.code, 200, response.body?.message);
    assert.equal(calls.length, 4);
    assert.equal(saves, 1);
    assert.deepEqual(writes, ["project.save", "references.updateMany"]);
    assert.equal(project.directions.length, 3);
    assert.deepEqual(stages, ["territories", "expanding", "saving"]);
    assert.equal(project.operation, "");
    assert.equal(project.status, "directions_ready");
    assert.ok(project.directions.every((direction) => direction.engineVersion === "v2" && direction.referencesUsed.length === 2));
    assert.ok(project.directions.every((direction) => direction.siteInformationArchitecture.homepageMoments[0].destinationPageId === null));
    assert.equal(project.directions[1].brandSystem.colorSystem.accentSecondary, null);
    const serialized = project.toObject();
    assert.equal(serialized.directions[0].siteInformationArchitecture.homepageMoments[0].destinationPageId, null);
    assert.ok(serialized.directions[0].qualityWarnings.some((warning) => warning.code === "adjacent_rhythm_repeated"));
    assert.equal(serialized.directions[0].siteInformationArchitecture.homepageMoments[4].editorialIntent.headlineIdea, "Le goût du partage");
    assert.equal(serialized.directions[1].brandSystem.colorSystem.accentSecondary, null);
  } finally {
    global.fetch = originals.fetch;
    console.info = originals.info;
    console.warn = originals.warn;
    SiteProject.findOneAndUpdate = originals.findOneAndUpdate;
    SiteProject.exists = originals.exists;
    SiteProject.updateOne = originals.updateOne;
    SiteProject.findById = originals.findById;
    DesignReference.find = originals.findReferences;
    DesignReference.updateMany = originals.updateMany;
    GustoPortfolioSite.find = originals.findSites;
    if (originals.key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originals.key;
    delete require.cache[require.resolve(routePath)];
  }
});

test("régénération d'une seule direction réutilise les deux étapes sans lancer B/C", async () => {
  const { project, references } = fixture();
  const original = { fetch: global.fetch, key: process.env.OPENAI_API_KEY, info: console.info, warn: console.warn };
  const calls = [];
  process.env.OPENAI_API_KEY = "mock-key";
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    if (body.text.format.name === "design_creative_territories") return mockStructuredResponse({ territories: [creativeTerritory("A", [0, 1])] });
    return mockStructuredResponse({ direction: v2Direction(references) });
  };
  console.info = () => {};
  console.warn = () => {};
  try {
    const directions = await openai.generateDirectionsV2(project, references, { count: 1, avoid: ["ancienne direction"] });
    assert.equal(directions.length, 1);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((body) => JSON.parse(body.input[0].content[0].text).avoidExistingDirections.includes("ancienne direction")));
  } finally {
    global.fetch = original.fetch;
    console.info = original.info;
    console.warn = original.warn;
    if (original.key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = original.key;
  }
});

test("route directions : échec sans sauvegarde partielle, succès avec un seul save final", async () => {
  const { project, references } = fixture();
  const eligible = references.map((reference) => ({ ...reference, active: true }));
  const original = {
    findOneAndUpdate: SiteProject.findOneAndUpdate, exists: SiteProject.exists, updateOne: SiteProject.updateOne,
    findById: SiteProject.findById, findReferences: DesignReference.find, updateMany: DesignReference.updateMany,
    findSites: GustoPortfolioSite.find, generate: openai.generateDirectionsV2, info: console.info, warn: console.warn,
  };
  let saves = 0;
  project.save = async () => { saves += 1; await project.validate(); return project; };
  SiteProject.findOneAndUpdate = async (_query, update) => { Object.assign(project, update.$set); return project; };
  SiteProject.exists = async () => true;
  SiteProject.findById = () => ({ select: async () => project });
  SiteProject.updateOne = async (_query, update) => { Object.assign(project, update.$set); return { matchedCount: 1 }; };
  DesignReference.find = () => ({ lean: async () => eligible });
  DesignReference.updateMany = async () => ({ modifiedCount: eligible.length });
  GustoPortfolioSite.find = () => ({ lean: async () => [] });
  console.info = () => {};
  const warnings = [];
  console.warn = (label) => { warnings.push(label); };
  const routePath = "../routes/admin/design-lab.routes";
  delete require.cache[require.resolve(routePath)];
  const router = require(routePath);
  const handler = router.stack.find((layer) => layer.route?.path === "/admin/design-lab/projects/:id/directions" && layer.route.methods.post).route.stack.at(-1).handle;
  const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
  try {
    openai.generateDirectionsV2 = async (_project, _references, options) => {
      await options.onStage("expanding");
      throw Object.assign(new Error("mock expansion B failure"), { status: 502 });
    };
    const failed = response();
    await handler({ params: { id: String(project._id) } }, failed);
    assert.equal(failed.code, 502);
    assert.equal(saves, 0);
    assert.equal(project.directions.length, 0);
    assert.equal(project.operationStage, "");
    openai.generateDirectionsV2 = async (_project, _references, options) => {
      await options.onStage("expanding");
      await options.onStage("saving");
      return [0, 1, 2].map((variant) => ({ ...validateDirectionsV2([v2Direction(references, variant)], references, 1)[0], generationId: `mock-run-${saves}` }));
    };
    const successful = response();
    await handler({ params: { id: String(project._id) } }, successful);
    assert.equal(successful.code, 200, successful.body?.message);
    assert.equal(saves, 1);
    assert.equal(project.directions.length, 3);
    assert.equal(project.operationStage, "");
    DesignReference.updateMany = async () => { throw new Error("mock counter failure"); };
    const counterFailed = response();
    await handler({ params: { id: String(project._id) } }, counterFailed);
    assert.equal(counterFailed.code, 200);
    assert.equal(saves, 2);
    assert.equal(project.directions.length, 6);
    assert.equal(project.directions.filter((direction) => direction.status === "active").length, 3);
    assert.ok(warnings.includes("[design-lab] directions:reference_usage_update_failed"));
  } finally {
    SiteProject.findOneAndUpdate = original.findOneAndUpdate;
    SiteProject.exists = original.exists;
    SiteProject.updateOne = original.updateOne;
    SiteProject.findById = original.findById;
    DesignReference.find = original.findReferences;
    DesignReference.updateMany = original.updateMany;
    GustoPortfolioSite.find = original.findSites;
    openai.generateDirectionsV2 = original.generate;
    console.info = original.info;
    console.warn = original.warn;
    delete require.cache[require.resolve(routePath)];
  }
});

test("le seul moteur actif remonte proprement un vrai timeout Sol sans direction partielle", async () => {
  const { project, references } = fixture();
  const original = { fetch: global.fetch, setTimeout: global.setTimeout, key: process.env.OPENAI_API_KEY, info: console.info, warn: console.warn };
  const warnings = [];
  process.env.OPENAI_API_KEY = "mock-key";
  global.setTimeout = (callback, delay, ...args) => original.setTimeout(callback, delay === 240000 ? 10 : delay, ...args);
  global.fetch = async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
  });
  console.info = () => {};
  console.warn = (label, details) => { warnings.push({ label, details }); };
  try {
    await assert.rejects(openai.generateDirectionsV2(project, references, { count: 1 }), { status: 504 });
    assert.equal(project.directions.length, 0);
    assert.equal(warnings.find((item) => item.label.endsWith("territories_failed")).details.phase, "awaiting_headers");
  } finally {
    global.fetch = original.fetch;
    global.setTimeout = original.setTimeout;
    console.info = original.info;
    console.warn = original.warn;
    if (original.key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = original.key;
  }
});

test("un timeout après les headers signale un body incomplet, sans enregistrer de direction", async () => {
  const { project, references } = fixture();
  const original = { fetch: global.fetch, setTimeout: global.setTimeout, key: process.env.OPENAI_API_KEY, info: console.info, warn: console.warn };
  const logs = [];
  process.env.OPENAI_API_KEY = "mock-key";
  global.setTimeout = (callback, delay, ...args) => original.setTimeout(callback, delay === 240000 ? 10 : delay, ...args);
  global.fetch = async (_url, { signal }) => ({
    ok: true, status: 200,
    json: async () => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }),
  });
  console.info = (label) => { logs.push(label); };
  console.warn = (label, details) => { logs.push({ label, details }); };
  try {
    await assert.rejects(openai.generateDirectionsV2(project, references, { count: 1 }), { status: 504 });
    assert.ok(logs.includes("[design-lab] directions:v2_response_headers"));
    assert.ok(!logs.includes("[design-lab] directions:v2_response_body"));
    assert.equal(logs.find((item) => item.label?.endsWith("territories_failed")).details.phase, "reading_body");
    assert.equal(project.directions.length, 0);
  } finally {
    global.fetch = original.fetch;
    global.setTimeout = original.setTimeout;
    console.info = original.info;
    console.warn = original.warn;
    if (original.key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = original.key;
  }
});

test("une réponse complète mais invalide est distinguée d'un abort pendant le réseau", async () => {
  const { project, references } = fixture();
  const original = { fetch: global.fetch, key: process.env.OPENAI_API_KEY, info: console.info, warn: console.warn };
  const warnings = [];
  process.env.OPENAI_API_KEY = "mock-key";
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ output: [{ content: [{ type: "output_text", text: "{" }] }] }) });
  console.info = () => {};
  console.warn = (label, details) => { warnings.push({ label, details }); };
  try {
    await assert.rejects(openai.generateDirectionsV2(project, references, { count: 1 }), { status: 502 });
    assert.equal(warnings.find((item) => item.label.endsWith("territories_failed")).details.phase, "parsing_structured_output");
    assert.equal(project.directions.length, 0);
  } finally {
    global.fetch = original.fetch;
    console.info = original.info;
    console.warn = original.warn;
    if (original.key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = original.key;
  }
});

test("routes V2 : Style Frame mocké, validation humaine, puis homepage ; aucune image Portfolio", async () => {
  const { project, references } = fixture();
  project.directions.push(validateDirectionsV2([v2Direction(references)], references, 1)[0]);
  const direction = project.directions[0];
  seedVersionedFixture(project, direction);
  project.selectedDirection = direction._id;
  const originals = {
    findOneAndUpdate: SiteProject.findOneAndUpdate,
    findById: SiteProject.findById,
    exists: SiteProject.exists,
    updateOne: SiteProject.updateOne,
    findReferences: DesignReference.find,
    download: designLab.downloadOwnImage,
    upload: designLab.uploadImage,
    generate: openai.generateImage,
    info: console.info,
  };
  const Attempt = require("../models/style-frame-generation-attempt.model");
  const styleFrames = require("../services/design-lab/style-frame.service");
  const attemptOriginals = { create: Attempt.create, updateOne: Attempt.updateOne, findOne: Attempt.findOne, spool: { ...styleFrames.spool } };
  const HomepageAttempt = require("../models/homepage-generation-attempt.model");
  const homepages = require("../services/design-lab/homepage-generation.service");
  const cloudinary = require("cloudinary").v2;
  const homepageOriginals = { create: HomepageAttempt.create, updateOne: HomepageAttempt.updateOne, findOne: HomepageAttempt.findOne,
    lookup: cloudinary.api.resource, spool: { ...homepages.spool } };
  HomepageAttempt.create = async (data) => ({ toObject: () => data });
  HomepageAttempt.updateOne = async () => ({ matchedCount: 1 });
  HomepageAttempt.findOne = () => ({ lean: async () => null });
  cloudinary.api.resource = async () => { throw { http_code: 404 }; };
  Object.assign(homepages.spool, { prepare: async () => {}, write: async () => {}, remove: async () => {},
    read: async () => { throw Object.assign(new Error("Absent"), { code: "ENOENT" }); } });
  Attempt.create = async (data) => data;
  Attempt.updateOne = async () => ({ matchedCount: 1 });
  Attempt.findOne = async () => null;
  Object.assign(styleFrames.spool, { prepare: async () => {}, write: async () => {}, remove: async () => {} });
  const sourceBuffer = await sharp({ create: { width: 32, height: 32, channels: 3, background: "white" } }).png().toBuffer();
  const calls = [];
  let uploaded = 0;
  project.save = async () => { await project.validate(); return project; };
  SiteProject.findOneAndUpdate = async (_query, update) => {
    Object.assign(project, update.$set);
    return project;
  };
  SiteProject.findById = async () => project;
  SiteProject.exists = async () => true;
  SiteProject.updateOne = async () => ({ matchedCount: 1 });
  DesignReference.find = () => ({ lean: async () => references });
  designLab.downloadOwnImage = async () => ({ buffer: sourceBuffer, mime: "image/png" });
  designLab.uploadImage = async () => ({ url: source(`output-${++uploaded}`).url, publicId: `gusto/design-lab/generations/output-${uploaded}` });
  openai.generateImage = async (prompt, images, options) => {
    calls.push({ prompt, images, options });
    const [width, height] = options.size.split("x").map(Number);
    return { buffer: await sharp({ create: { width, height, channels: 3, background: "#ddd" } }).png().toBuffer(), model: "mock-flare" };
  };
  console.info = () => {};
  const routePath = "../routes/admin/design-lab.routes";
  delete require.cache[require.resolve(routePath)];
  const router = require(routePath);
  const handler = (method, path) => router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]).route.stack.at(-1).handle;
  const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
  try {
    const frameResponse = response();
    await handler("post", "/admin/design-lab/projects/:id/directions/:directionId/style-frames")({ params: { id: String(project._id), directionId: String(direction._id) } }, frameResponse);
    assert.equal(frameResponse.code, 200, frameResponse.body?.message);
    assert.equal(direction.styleFrames.length, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].images.length, 7);
    assert.ok(calls[0].prompt.includes("VISUAL_REFERENCE"));
    assert.ok(!calls[0].prompt.includes("gustoPortfolioComparison"));

    const denied = response();
    await handler("post", "/admin/design-lab/projects/:id/directions/:directionId/generations")({ params: { id: String(project._id), directionId: String(direction._id) } }, denied);
    assert.equal(denied.code, 409);
    assert.equal(project.generations.length, 0);
    project.operation = "";

    const approved = response();
    await handler("patch", "/admin/design-lab/projects/:id/directions/:directionId/style-frames/:frameId/approve")({ params: { id: String(project._id), directionId: String(direction._id), frameId: String(direction.styleFrames[0]._id) } }, approved);
    assert.equal(approved.code, 200);
    assert.ok(direction.styleFrames[0].approvedAt);

    const homepage = response();
    await handler("post", "/admin/design-lab/projects/:id/directions/:directionId/generations")({ params: { id: String(project._id), directionId: String(direction._id) } }, homepage);
    assert.equal(homepage.code, 200, homepage.body?.message);
    assert.equal(calls.length, 4);
    assert.equal(project.generations.length, 1);
    assert.equal(project.generations[0].engineVersion, "v2");
    assert.equal(String(project.generations[0].styleFrameId), String(direction.approvedStyleFrameId));
    assert.ok(calls.slice(1).every((call) => call.prompt.includes("STYLE_FRAME_APPROVED")));
    assert.ok(calls.slice(1).every((call) => call.images.length <= 16));
  } finally {
    SiteProject.findOneAndUpdate = originals.findOneAndUpdate;
    SiteProject.findById = originals.findById;
    SiteProject.exists = originals.exists;
    SiteProject.updateOne = originals.updateOne;
    DesignReference.find = originals.findReferences;
    designLab.downloadOwnImage = originals.download;
    designLab.uploadImage = originals.upload;
    openai.generateImage = originals.generate;
    console.info = originals.info;
    Object.assign(Attempt, { create: attemptOriginals.create, updateOne: attemptOriginals.updateOne, findOne: attemptOriginals.findOne });
    Object.assign(styleFrames.spool, attemptOriginals.spool);
    Object.assign(HomepageAttempt, { create: homepageOriginals.create, updateOne: homepageOriginals.updateOne, findOne: homepageOriginals.findOne });
    cloudinary.api.resource = homepageOriginals.lookup;
    Object.assign(homepages.spool, homepageOriginals.spool);
    delete require.cache[require.resolve(routePath)];
  }
});
