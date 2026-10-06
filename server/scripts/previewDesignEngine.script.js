// Read-only local preview. No OpenAI request, no image download and no Mongo writes.
require("dotenv").config();
const mongoose = require("mongoose");
const SiteProject = require("../models/site-project.model");
const DesignReference = require("../models/design-reference.model");
const GustoPortfolioSite = require("../models/gusto-portfolio-site.model");
const { buildPortfolioSummary } = require("../services/design-lab/portfolio.service");
const { selectReferences } = require("../services/design-lab/design-lab.service");
const { MODEL_CONFIG, directionPipelineSchemas } = require("../services/design-lab/openai.service");
const { isActivePrimary } = require("../services/design-lab/direction-versioning.service");
const {
  buildCreativeTerritoriesRequest,
  buildDirectionExpansionRequest,
  eligibleAssets,
  styleFramePlan,
  homepageV2Plan,
} = require("../services/design-lab/design-engine-v2.service");

function outputExample(schema, path = []) {
  if (schema.anyOf) return outputExample(schema.anyOf[0], path);
  if (schema.type === "object") return Object.fromEntries(Object.entries(schema.properties || {}).map(([key, value]) => [key, outputExample(value, [...path, key])]));
  if (schema.type === "array") {
    const lengths = { territories: 3, likelyReferenceAnchors: 2, brandPersonality: 4, directions: 3, rhythmMap: 6, sectionClimatePlan: 6, signatureMoves: 3, referenceAnchors: 2, primaryPages: 6, contentAssignments: 10, homepageMoments: 6, dedicatedPageTopics: 5 };
    return Array.from({ length: lengths[path.at(-1)] || 2 }, () => outputExample(schema.items, path));
  }
  if (schema.type === "integer") return 1;
  return "x".repeat(100);
}

function requestJsonChars(request, schema, schemaName) {
  return JSON.stringify({
    model: MODEL_CONFIG.directionModel, store: false, reasoning: { effort: "high" },
    instructions: request.instructions,
    input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify(request.payload) }] }],
    text: { format: { type: "json_schema", name: schemaName, strict: true, schema } },
  }).length;
}

function expansionTemplate(project, references, portfolio, territoryId) {
  const pending = "<produit par l'appel creative territories>";
  const territory = (id) => ({ id, name: pending, brandIdea: pending, creativeThesis: pending, brandPersonality: [], visualTerritory: pending, conceptualColorDirection: pending, typographicTerritory: pending, photographicTerritory: pending, spatialTerritory: pending, majorDifferentiator: pending, likelyReferenceAnchors: [0, 1], explicitDifferenceFromOthers: pending });
  const request = buildDirectionExpansionRequest(project, references, portfolio, ["A", "B", "C"].map(territory), territoryId);
  request.payload.yourTerritory.likelyReferenceAnchors = "<2 ou 3 index sélectionnés par le premier appel>";
  request.payload.selectedReferenceDetails = "<analyses détaillées des seuls anchors sélectionnés>";
  return { dynamic: true, instructions: request.instructions, payloadTemplate: request.payload, templateChars: request.instructions.length + JSON.stringify(request.payload).length, templateRequestJsonChars: requestJsonChars(request, directionPipelineSchemas.expansion, "design_direction_expansion_v2") };
}

async function main() {
  if (process.env.NODE_ENV === "production" || !process.env.CONNECTION_STRING_TEST)
    throw new Error("Preview V2 réservée à MongoDB TEST en développement local.");
  const slug = process.argv[2];
  if (!slug) throw new Error("Usage : npm run design-lab:preview-engine -- <project-slug> [direction-id]");
  await mongoose.connect(process.env.CONNECTION_STRING_TEST, {
    serverSelectionTimeoutMS: 5000, autoIndex: false, autoCreate: false,
  });
  const project = await SiteProject.findOne({ slug }).lean();
  if (!project) throw new Error("Projet introuvable en base TEST.");
  const sites = await GustoPortfolioSite.find({ active: true, analyzedAt: { $ne: null } }).lean();
  const portfolio = buildPortfolioSummary(sites, project);
  const references = selectReferences(project, await DesignReference.find({ active: true }).lean(), 8, portfolio);
  const request = buildCreativeTerritoriesRequest(project, references, portfolio);
  const territoriesSchema = directionPipelineSchemas.creativeTerritories;
  const expansionSchema = directionPipelineSchemas.expansion;
  const territoryUserPrompt = JSON.stringify(request.payload);
  const directionId = process.argv[3] || String(project.selectedDirection || "");
  const direction = project.directions.find((item) => String(item._id) === directionId && item.engineVersion === "v2" && isActivePrimary(item));
  let futureDirection = null;
  if (direction) {
    const anchorIds = (direction.visualSystem?.referenceAnchors || []).map((item) => String(item.referenceId));
    const anchorReferences = await DesignReference.find({ _id: { $in: anchorIds } }).lean();
    const frame = styleFramePlan(project, direction, anchorReferences);
    const homepage = homepageV2Plan(project, direction, { previewOnly: true });
    futureDirection = {
      id: String(direction._id), name: direction.name,
      brandSystem: direction.brandSystem, visualSystem: direction.visualSystem,
      siteInformationArchitecture: {
        primaryPages: direction.siteInformationArchitecture?.primaryPages || [],
        homepageRole: direction.siteInformationArchitecture?.homepageRole || "",
        contentAssignments: direction.siteInformationArchitecture?.contentAssignments || [],
        homepageContent: (direction.siteInformationArchitecture?.contentAssignments || [])
          .filter((item) => ["homepage_primary", "homepage_teaser"].includes(item.classification)),
        dedicatedPageContent: (direction.siteInformationArchitecture?.contentAssignments || [])
          .filter((item) => item.classification === "dedicated_page"),
        homepageMoments: direction.siteInformationArchitecture?.homepageMoments || [],
        dedicatedPageTopics: direction.siteInformationArchitecture?.dedicatedPageTopics || [],
        excludedFromHomepage: (direction.siteInformationArchitecture?.contentAssignments || [])
          .filter((item) => !["homepage_primary", "homepage_teaser"].includes(item.classification)),
      },
      styleFrame: {
        endpoint: frame.endpoint, model: MODEL_CONFIG.imageGenerationModel, size: frame.size,
        imageOrder: frame.inputs.map(({ image: _image, ...input }, index) => ({ index: index + 1, ...input })),
        prompt: frame.prompt,
      },
      homepage: {
        requiresApprovedStyleFrame: true,
        approvedStyleFrameId: direction.approvedStyleFrameId || null,
        blueprint: homepage.homepageBlueprint,
        chapters: homepage.segments.map((segment) => ({
          chapter: segment.index + 1, renderOnly: segment.renderOnly,
          forbiddenContent: segment.forbiddenContent,
          sectionsAlreadyRendered: segment.sectionsAlreadyRendered.map((item) => item.id),
          futureSections: segment.futureSections.map((item) => item.id),
          assets: segment.assets.map((item) => ({ id: String(item._id), name: item.name, role: item.role })),
          prompt: segment.prompt,
        })),
      },
    };
  }
  console.log(JSON.stringify({
    dryRun: true, openaiCalls: 0, mongoWrites: 0,
    project: { id: String(project._id), name: project.name, slug },
    directionPipelinePreview: {
      endpoint: "/v1/responses", model: MODEL_CONFIG.directionModel,
      creativeTerritories: {
        instructions: request.instructions, payload: request.payload,
        instructionsChars: request.instructions.length, userPromptChars: territoryUserPrompt.length,
        requestJsonChars: requestJsonChars(request, territoriesSchema, "design_creative_territories"),
        compactReferencesChars: JSON.stringify(request.payload.compactReferences).length,
        compactReferenceChars: request.payload.compactReferences.map((item) => JSON.stringify(item).length),
        schema: territoriesSchema, schemaChars: JSON.stringify(territoriesSchema).length,
        illustrativeOutputChars: JSON.stringify(outputExample(territoriesSchema)).length,
      },
      expansions: Object.fromEntries(["A", "B", "C"].map((territoryId) => [territoryId, expansionTemplate(project, references, portfolio, territoryId)])),
      expansionSchema, expansionSchemaChars: JSON.stringify(expansionSchema).length,
      illustrativeOutputCharsPerExpansion: JSON.stringify(outputExample(expansionSchema)).length,
      note: "Les trois payloads d'expansion sont des gabarits : leurs territoires et anchors réels n'existent qu'après le premier appel Sol. L'estimation de sortie utilise 100 caractères par chaîne et des tailles de listes représentatives ; aucun maximum formel n'est imposé par le schéma.",
    },
    permittedAssets: eligibleAssets(project).map((item) => ({ id: String(item._id), name: item.name, role: item.role })),
    benchmarkExclusions: (project.assets || []).filter((item) => item.benchmarkExcluded).map((item) => item.name),
    futureDirection,
    note: direction ? "Direction existante : architecture de l'information, Style Frame et homepage montrés en dry-run, dans cet ordre." : "Aucune direction sélectionnée : territoires et anchors encore inconnus ; aucun résultat IA inventé.",
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
