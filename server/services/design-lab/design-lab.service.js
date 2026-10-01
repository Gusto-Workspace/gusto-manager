const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");
const sharp = require("sharp");

const WEBP_QUALITY = 85;
const MAX_UPLOAD_WIDTH = 2000;
// WebP cannot encode an edge above 16,383 px.
const MAX_WEBP_EDGE = 16383;
const LOSSLESS_ASSET_ROLES = new Set([
  "logo",
  "signatureGraphic",
  "illustration",
  "badge",
]);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const STYLE_WORDS = {
  minimaliste: ["minimal", "epure", "vide", "whitespace"],
  editorial: ["editorial", "magazine", "typograph"],
  patrimonial: ["patrimoine", "heritage", "historique"],
  brutaliste: ["brutal", "asym", "grille"],
  luxe: ["luxe", "raffine", "elegant"],
  chaleureux: ["chaleur", "chaleureux", "convivial"],
  mediterraneen: ["mediterr", "soleil", "terre"],
  bistrot: ["bistrot", "brasserie"],
  contemporain: ["contemporain", "moderne"],
};

// Apply these only when the analysis has explicitly identified an artifact.
const PRESENTATION_CUES = [
  {
    identify:
      /device_mockup|smartphone|telephone|mobile|tablette|tablet|ordinateur|laptop|computer/,
    mention:
      /smartphone|telephone|mockup|apercu[^.!?;]*mobile|maquette mobile|mobile flottant|ecran mobile|tablette|tablet|ordinateur|laptop|device/,
  },
  {
    identify: /browser_frame|browser|navigateur|fenetre fictive/,
    mention:
      /cadre de navigateur|navigateur fictif|browser frame|fenetre de navigateur/,
  },
  {
    identify: /portfolio_layout|behance|dribbble|portfolio|planche|case.study/,
    mention:
      /behance|dribbble|portfolio|planche|case.study|mise en presentation/,
  },
  {
    identify:
      /presentation_background|decorative_framing|fond|marge|toile|framing|decoration/,
    mention:
      /fond de presentation|fond autour|toile de presentation|marges? externe|marges? autour|marges? rouge|fond rouge peripherique|decor de presentation|motif.*marges/,
  },
  {
    identify: /annotation|legende|fleche|numero|callout/,
    mention: /annotation|legende|fleche|numero|callout/,
  },
  {
    identify: /watermark|filigrane|agence|marketplace/,
    mention: /watermark|filigrane|logo d.agence|logo de marketplace/,
  },
  {
    identify: /comparison|comparatif|desktop.mobile|avant.apres/,
    mention: /comparatif|comparison|desktop.mobile|avant.apres/,
  },
  {
    identify:
      /secondary_screenshot|detail_zoom|capture secondaire|secondary.screenshot|zoom|detail|miniature/,
    mention:
      /capture secondaire|secondary.screenshot|zoom de detail|miniature de presentation/,
  },
  {
    identify: /packaging|affiche|poster/,
    mention:
      /packaging de presentation|affiche de presentation|poster de presentation/,
  },
];

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function presentationMatchers(artifacts) {
  if (!Array.isArray(artifacts)) return [];
  const descriptions = artifacts
    .filter((artifact) =>
      typeof artifact === "string" ? true : artifact?.shouldIgnore === true,
    )
    .map((artifact) =>
      normalize(
        typeof artifact === "string"
          ? artifact
          : `${artifact.type} ${artifact.description}`,
      ),
    );
  return PRESENTATION_CUES.filter(({ identify }) =>
    descriptions.some((description) => identify.test(description)),
  ).map(({ mention }) => mention);
}

function removeArtifactMentions(value, matchers) {
  if (typeof value !== "string" || !matchers.length) return value;
  return value
    .split(/(?<=[.!?;])\s+/u)
    .filter(
      (part) => !matchers.some((matcher) => matcher.test(normalize(part))),
    )
    .join(" ")
    .trim();
}

function filterPresentationTags(tags, artifacts) {
  const matchers = presentationMatchers(artifacts);
  return (Array.isArray(tags) ? tags : []).filter(
    (tag) =>
      typeof tag === "string" &&
      !matchers.some((matcher) => matcher.test(normalize(tag))),
  );
}

function uniqueTags(tags) {
  const seen = new Set();
  return (Array.isArray(tags) ? tags : []).filter((tag) => {
    const key = normalize(tag).trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function excludeTags(tags, takenTags) {
  const takenKeys = new Set(uniqueTags(takenTags).map(normalize));
  return uniqueTags(tags).filter((tag) => !takenKeys.has(normalize(tag)));
}

function sanitizeReferenceAnalysis(reference) {
  const artifacts = reference.presentationArtifacts || reference.artifactTypes;
  const matchers = presentationMatchers(artifacts);
  if (!matchers.length) return reference;
  const cleanFields = (fields) =>
    fields &&
    Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [
        key,
        key === "usefulSections" && Array.isArray(value)
          ? value
              .map((item) => removeArtifactMentions(item, matchers))
              .filter(Boolean)
          : removeArtifactMentions(value, matchers),
      ]),
    );
  return {
    ...reference,
    visualTags: filterPresentationTags(reference.visualTags, artifacts),
    businessTags: filterPresentationTags(reference.businessTags, artifacts),
    analysis: cleanFields(reference.analysis),
    characteristics: cleanFields(reference.characteristics),
    sectionInspirations: cleanFields(reference.sectionInspirations),
  };
}

function applyReferenceAnalysis(reference, result) {
  const cleaned = sanitizeReferenceAnalysis(result);
  const artifactTypes = [
    ...new Set(
      (result.presentationArtifacts || [])
        .filter((artifact) => artifact.shouldIgnore)
        .map((artifact) => artifact.type),
    ),
  ];
  const manualTags = reference.manualTags || [];
  reference.visualTags = excludeTags(
    filterPresentationTags(cleaned.visualTags, artifactTypes),
    manualTags,
  );
  reference.businessTags = excludeTags(
    filterPresentationTags(cleaned.businessTags, artifactTypes),
    [...manualTags, ...reference.visualTags],
  );
  reference.referenceType = cleaned.referenceType;
  reference.artifactTypes = artifactTypes;
  reference.analysis = cleaned.analysis;
  reference.characteristics = cleaned.characteristics;
  reference.sectionInspirations = cleaned.sectionInspirations;
  return reference;
}

function selectReferences(project, references, limit = 8) {
  const settings = project.creativeSettings;
  const styles = settings.styles.map(normalize);
  const businessContext = normalize(
    [project.brief?.restaurantType, project.brief?.description].join(" "),
  );
  return references
    .filter(
      (ref) =>
        ref.active &&
        ref.analysis &&
        ref.characteristics &&
        ref.referenceType !== "other",
    )
    .map((ref) => {
      const { analysis, characteristics } = sanitizeReferenceAnalysis(ref);
      const visualTags = filterPresentationTags(
        ref.visualTags,
        ref.artifactTypes,
      );
      const manualTags = filterPresentationTags(
        ref.manualTags,
        ref.artifactTypes,
      );
      const businessTags = filterPresentationTags(
        ref.businessTags,
        ref.artifactTypes,
      );
      const visualLanguage = normalize(visualTags.join(" "));
      const manualLanguage = normalize(manualTags.join(" "));
      const visualDetails = normalize(
        [
          analysis?.composition,
          analysis?.typography,
          analysis?.photography,
          ...Object.values(characteristics).filter(
            (v) => typeof v === "string",
          ),
        ].join(" "),
      );
      let score = 0;
      for (const style of styles) {
        if (visualLanguage.includes(style)) score += 12;
        if (manualLanguage.includes(style)) score += 5;
        if (visualDetails.includes(style)) score += 3;
        for (const word of STYLE_WORDS[style] || []) {
          if (visualLanguage.includes(word)) score += 4;
          if (manualLanguage.includes(word)) score += 2;
          if (visualDetails.includes(word)) score += 1;
        }
      }
      if (
        businessContext &&
        businessTags.some((tag) => businessContext.includes(normalize(tag)))
      )
        score += 2;
      const closeness = (field, value) =>
        1 - Math.min(1, Math.abs((Number(field) || 50) - value) / 100);
      score +=
        5 * closeness(characteristics.visualDensity, settings.visualDensity);
      score +=
        4 * closeness(characteristics.asymmetry, settings.compositionFreedom);
      score +=
        3 * closeness(characteristics.overlapping, settings.compositionFreedom);
      score +=
        3 * closeness(characteristics.whitespace, 100 - settings.visualDensity);
      score += 4 * closeness(characteristics.asymmetry, settings.creativity);
      const useCount = Number(ref.useCount || 0);
      score -=
        ((100 - settings.gustoSimilarity) / 100) * Math.min(8, useCount * 1.5);
      return { ref, score };
    })
    .sort(
      (a, b) =>
        b.score - a.score || String(a.ref._id).localeCompare(String(b.ref._id)),
    )
    .slice(0, limit)
    .map(({ ref }) => ref);
}

function uploadImage(buffer, folder, { format } = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image", ...(format ? { format } : {}) },
      (error, result) => {
        if (error || !result)
          return reject(error || new Error("Upload Cloudinary échoué."));
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

async function downloadOwnImage(image, maxBytes = 20 * 1024 * 1024) {
  const host = new URL(image.url).hostname;
  if (
    host !== "res.cloudinary.com" ||
    !(
      image.publicId?.startsWith("gusto/design-lab/") ||
      image.publicId?.startsWith("Gusto_Workspace/admin/design-lab/")
    )
  ) {
    throw new Error("Image source non autorisée.");
  }
  const response = await fetch(image.url, {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Impossible de charger l'image source.");
  const mime = (response.headers.get("content-type") || "image/jpeg").split(
    ";",
  )[0];
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime))
    throw new Error("Format image source non pris en charge.");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes)
    throw new Error("Image source trop volumineuse.");
  return { buffer, mime };
}

async function validateUploadedImage(file) {
  const metadata = await sharp(file.buffer)
    .metadata()
    .catch(() => null);
  const expected = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
  if (
    !metadata ||
    expected[metadata.format] !== file.mimetype ||
    !metadata.width ||
    !metadata.height
  ) {
    const error = new Error("Image invalide ou trop grande (JPEG, PNG, WebP).");
    error.status = 400;
    throw error;
  }
  return metadata;
}

async function prepareUploadedRaster(
  file,
  { assetRole = "", reference = false } = {},
) {
  const metadata = await validateUploadedImage(file);
  const rotated = [5, 6, 7, 8].includes(metadata.orientation);
  const width = rotated ? metadata.height : metadata.width;
  const height = rotated ? metadata.width : metadata.height;
  const maxWidthForHeight = Math.floor((width * MAX_WEBP_EDGE) / height);
  const targetWidth = Math.min(width, MAX_UPLOAD_WIDTH, maxWidthForHeight);
  if (targetWidth < 1) {
    const error = new Error("Capture trop allongée pour le format WebP.");
    error.status = 400;
    throw error;
  }

  // Keep already suitable WebP assets intact, avoiding another lossy pass.
  if (
    !reference &&
    metadata.format === "webp" &&
    targetWidth === width &&
    (!metadata.orientation || metadata.orientation === 1)
  ) {
    return file.buffer;
  }

  const lossless = !reference && LOSSLESS_ASSET_ROLES.has(assetRole);
  try {
    return await sharp(file.buffer)
      .rotate()
      .resize({ width: targetWidth, withoutEnlargement: true })
      .webp(
        lossless
          ? { lossless: true, alphaQuality: 100 }
          : { quality: WEBP_QUALITY, alphaQuality: 100 },
      )
      .toBuffer();
  } catch {
    const error = new Error("Impossible de préparer l'image WebP.");
    error.status = 400;
    throw error;
  }
}

module.exports = {
  WEBP_QUALITY,
  MAX_UPLOAD_WIDTH,
  selectReferences,
  filterPresentationTags,
  uniqueTags,
  excludeTags,
  sanitizeReferenceAnalysis,
  applyReferenceAnalysis,
  uploadImage,
  downloadOwnImage,
  validateUploadedImage,
  prepareUploadedRaster,
};
