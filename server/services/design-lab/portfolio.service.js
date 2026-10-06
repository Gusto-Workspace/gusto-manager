const { parseWebsiteUrl } = require("./existing-website.service");

// Homepage plus at most eight distinct internal page templates.
const MAX_PORTFOLIO_PAGES = 9;
const PAGE_TOPICS = [
  {
    type: "restaurant",
    pattern: /restaurant|about|histoire|maison|a propos|concept/u,
  },
  { type: "menu", pattern: /menus?|carte|cuisine|food/u },
  { type: "drinks", pattern: /boissons?|drinks?|vins?|cocktails?/u },
  { type: "chef", pattern: /chef|equipe|brigade|team/u },
  { type: "catering", pattern: /traiteur|catering/u },
  { type: "events", pattern: /evenements?|events?|groupes?|privatisation/u },
  { type: "reservation", pattern: /reservations?|booking|book.a.table/u },
  { type: "news", pattern: /actualites?|news|journal|blog/u },
  { type: "contact", pattern: /contact|acces|horaires?|infos.pratiques/u },
  { type: "gifts", pattern: /cartes?.cadeaux?|bons?.cadeaux?|gift/u },
];
const IGNORED =
  /(?:^|\/)(?:mentions?.legales?|legal|privacy|confidentialite|cgv|conditions.generales|cookies?|login|connexion|admin|api|sitemap|checkout|paiement|payment|panier|cart|account|compte)(?:\/|$)|\.(?:pdf|docx?|xlsx?|jpe?g|png|svg|webp|gif|zip|mp4)$|(?:^|\/)page\/\d+(?:\/|$)/u;

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .trim();
}
function uniqueTags(tags) {
  const seen = new Set();
  return (Array.isArray(tags) ? tags : []).filter((tag) => {
    const key = normalize(tag);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function sameDomain(a, b) {
  return (
    normalize(a).replace(/^www\./u, "") === normalize(b).replace(/^www\./u, "")
  );
}
function pageKey(url) {
  return `${normalize(url.hostname).replace(/^www\./u, "")}${url.pathname.replace(/\/+$/u, "") || "/"}`;
}
function discoverPortfolioPages(links, homepage) {
  const home = parseWebsiteUrl(homepage);
  const seen = new Set([pageKey(home)]);
  const candidates = [];
  for (const link of links) {
    let url;
    try {
      url = parseWebsiteUrl(new URL(link.href, home).href);
    } catch {
      continue;
    }
    if (
      !sameDomain(url.hostname, home.hostname) ||
      url.search ||
      IGNORED.test(normalize(url.pathname))
    )
      continue;
    const key = pageKey(url);
    if (seen.has(key)) continue;
    const phrase = normalize(`${url.pathname} ${link.label || ""}`);
    const topic = PAGE_TOPICS.find(({ pattern }) => pattern.test(phrase));
    const editorialFallback =
      !topic &&
      link.inNavigation &&
      Boolean(link.label) &&
      url.pathname.split("/").filter(Boolean).length <= 2;
    if (!topic && !editorialFallback) continue;
    // Individual articles usually repeat the listing template.
    if (
      topic?.type === "news" &&
      url.pathname.split("/").filter(Boolean).length > 1
    )
      continue;
    seen.add(key);
    candidates.push({
      url: url.href,
      pathname: url.pathname,
      label: String(link.label || "").slice(0, 100),
      pageType: topic?.type || "editorial",
      score:
        (link.inNavigation ? 3 : 0) +
        (link.inFooter ? 1 : 0) +
        (url.pathname.split("/").length <= 3 ? 2 : 0),
    });
  }
  candidates.sort((a, b) => b.score - a.score);
  const types = new Map();
  const selected = [];
  for (const candidate of candidates) {
    const count = types.get(candidate.pageType) || 0;
    if (count >= (["menu", "editorial"].includes(candidate.pageType) ? 2 : 1))
      continue;
    selected.push(candidate);
    types.set(candidate.pageType, count + 1);
    if (selected.length >= MAX_PORTFOLIO_PAGES - 1) break;
  }
  return selected;
}

function buildPortfolioEvidence(pages) {
  const evidence = new Map();
  pages.forEach((page, pageIndex) => {
    for (const tag of uniqueTags(page.visualTags)) {
      const key = normalize(tag);
      const entry = evidence.get(key) || { label: tag, pageIndexes: [] };
      entry.pageIndexes.push(pageIndex);
      evidence.set(key, entry);
    }
  });
  return {
    totalPages: pages.length,
    // Exact strings are evidence for Luna, never the final site-level profile.
    observedTerms: [...evidence.values()],
  };
}

function visualConceptKey(value) {
  const words = normalize(value).replace(/[^a-z0-9]+/gu, " ").trim();
  if (/\bformulaires?\b/u.test(words)) return "fonction:formulaire";
  if (/\bprix\b/u.test(words)) return "fonction:prix";
  if (/\bnavigation\b/u.test(words) && /\bcategories?\b/u.test(words))
    return "fonction:navigation-categories";
  if (/\bcarte\b/u.test(words) && /\bproduits?\b/u.test(words))
    return "fonction:carte-produit";
  if (/\b(sans serifs?|sans empattements?)\b/u.test(words)) return "typographie:sans-serif";
  if (/\b(serifs?|empattements?)\b/u.test(words)) return "typographie:serif";
  const ivory = /\b(ivoire|creme|beige)\b/u.test(words);
  const earth = /\b(terre cuite|terracotta|cuivre)\b/u.test(words);
  const green = /\bvert\b/u.test(words);
  if (ivory && earth) return "palette:ivoire-terre-cuite";
  if (ivory && green) return "palette:ivoire-vert";
  if (earth && green) return "palette:terre-cuite-vert";
  if (/\b(photo|photographie|photographique|image|hero)\b/u.test(words) &&
      /\b(assombris?|assombries?|sombres?|obscurcis?|voiles?)\b/u.test(words))
    return /\b(hero|plein ecran|grand format|arriere plan|bandeau)\b/u.test(words)
      ? "photographie:hero-assombri" : "photographie:assombrie";
  if (/\b(filet|filets|separateur|separateurs|ornement|ornements)\b/u.test(words) &&
      /\b(fin|fins|discret|discrets)\b/u.test(words))
    return "decoration:filets-fins";
  if (/\basymetri/u.test(words)) return "composition:asymetrie";
  if (/\bgrille\b/u.test(words) && /\baerees?\b/u.test(words))
    return "composition:grille-aeree";
  if (/\b(respiration|aere|aeree|espacement)\b/u.test(words)) return "rythme:respiration";
  return words.split(" ").filter((word) => word.length > 2 &&
    !["avec", "dans", "pour", "des", "les", "une", "sur", "aux", "par"].includes(word))
    .sort().join("-");
}

// Shared by cross-site aggregation and DesignReference similarity scoring.
// Keep the site-level profile normalizer above unchanged for existing analyses.
function canonicalVisualConcept(value) {
  const words = normalize(value).replace(/[^a-z0-9]+/gu, " ").trim();
  if (/\b(titres?|textes?|typographies?)\b/u.test(words) &&
      /\b(images?|photos?|photographies?|heros?)\b/u.test(words) &&
      /\b(assombris?|assombries?|sombres?|obscurcis?|voiles?)\b/u.test(words))
    return "composition:texte-sur-image-assombrie";
  if (!/\basymetri/u.test(words) &&
      /\bcolonnes?\b/u.test(words) &&
      /\b(editorial|editoriale|editoriales|grilles?)\b/u.test(words))
    return "structure:colonnes-editoriales";
  if (!/\basymetri/u.test(words) &&
      /\bcompositions?\b/u.test(words) &&
      /\b(editorial|editoriale|editoriales)\b/u.test(words) &&
      /\baere(?:e|es|s)?\b/u.test(words))
    return "rythme:respiration";
  if (/\b(espaces?|espacements?)\b/u.test(words) &&
      /\b(genereux|genereuse|genereuses|amples?|vastes?)\b/u.test(words))
    return "rythme:respiration";
  return visualConceptKey(value);
}

function finalizePortfolioProfile(pages, synthesis) {
  const totalPages = pages.length;
  const concepts = new Map();
  for (const candidate of synthesis.concepts || []) {
    const label = String(candidate.label || "").trim();
    const key = visualConceptKey(label);
    if (!label || !key) continue;
    const pageIndexes = new Set((candidate.pageIndexes || []).filter(
      (index) => Number.isInteger(index) && index >= 0 && index < totalPages,
    ));
    if (!pageIndexes.size) continue;
    const current = concepts.get(key) || { label, key, pageIndexes: new Set() };
    for (const index of pageIndexes) current.pageIndexes.add(index);
    concepts.set(key, current);
  }
  const patternSupport = [...concepts.values()]
    .map(({ label, key, pageIndexes }) => {
      const pageCount = pageIndexes.size;
      const tier = totalPages === 1 || (pageCount >= 2 && pageCount / totalPages >= 0.75)
        ? "dominant" : pageCount >= 2 ? "recurring" : "occasional";
      return { label, key, pageCount, totalPages, tier };
    })
    .sort((a, b) => b.pageCount - a.pageCount || a.label.localeCompare(b.label));
  const byTier = (tier) => patternSupport.filter((item) => item.tier === tier)
    .map((item) => item.label);
  const globalPatterns = patternSupport.filter((item) =>
    item.tier !== "occasional" && !item.key.startsWith("fonction:"));
  const globalKeys = new Set(globalPatterns.map((item) => item.key));
  const suggestedTags = uniqueTags(synthesis.visualTags || []);
  const selectedTags = suggestedTags.filter((tag) => globalKeys.has(visualConceptKey(tag)));
  const dominantTags = globalPatterns.filter((item) => item.tier === "dominant")
    .map((item) => selectedTags.find((tag) => visualConceptKey(tag) === item.key) || item.label);
  const visualTags = uniqueTags(
    selectedTags.length
      ? [...dominantTags, ...selectedTags]
      : globalPatterns.map((item) => item.label),
  ).filter((tag, index, tags) => tags.findIndex(
    (value) => visualConceptKey(value) === visualConceptKey(tag),
  ) === index);
  const signaturePatterns = uniqueTags(synthesis.signaturePatterns || [])
    .filter((tag) => globalKeys.has(visualConceptKey(tag)))
    .filter((tag, index, tags) => tags.findIndex(
      (value) => visualConceptKey(value) === visualConceptKey(tag),
    ) === index).slice(0, 4);
  return {
    visualTags,
    dominantPatterns: byTier("dominant"),
    recurringPatterns: byTier("recurring"),
    occasionalPatterns: byTier("occasional"),
    patternSupport,
    typographyProfile: synthesis.typographyProfile || "",
    colorProfile: synthesis.colorProfile || "",
    layoutProfile: synthesis.layoutProfile || "",
    photographyProfile: synthesis.photographyProfile || "",
    rhythmProfile: synthesis.rhythmProfile || "",
    signaturePatterns,
  };
}

function isCurrentSite(site, project) {
  return Boolean(
    (site.restaurantId &&
      project.restaurantId &&
      String(site.restaurantId) === String(project.restaurantId)) ||
      (site.slug &&
        project.slug &&
        normalize(site.slug) === normalize(project.slug)),
  );
}
function buildPortfolioSummary(sites, project = {}) {
  const eligible = sites.filter(
    (site) =>
      site.active &&
      site.visualProfile &&
      site.pages?.length &&
      !isCurrentSite(site, project),
  );
  const frequency = new Map();
  for (const site of eligible) {
    const seenKeys = new Set();
    for (const tag of uniqueTags(site.visualProfile.visualTags).map((value) =>
      value.slice(0, 80),
    )) {
      const key = canonicalVisualConcept(tag);
      if (!key || key.startsWith("fonction:") || seenKeys.has(key)) continue;
      seenKeys.add(key);
      const entry = frequency.get(key) || { tag, count: 0 };
      entry.count += 1;
      frequency.set(key, entry);
    }
  }
  const patterns = [...frequency.values()].sort(
    (a, b) => b.count - a.count || a.tag.localeCompare(b.tag),
  );
  return {
    siteCount: eligible.length,
    frequentPatterns: patterns
      .filter((item) => item.count / eligible.length >= 0.5)
      .slice(0, 16),
    rarePatterns: patterns
      .filter((item) => item.count / eligible.length < 0.5)
      .slice(0, 12),
    signatures: buildSignatureCounts(eligible),
    patternCounts: patterns,
  };
}

function buildSignatureCounts(sites) {
  const frequency = new Map();
  for (const site of sites) {
    const seenKeys = new Set();
    for (const tag of uniqueTags(site.visualProfile.signaturePatterns || [])) {
      const key = canonicalVisualConcept(tag);
      if (!key || key.startsWith("fonction:") || seenKeys.has(key)) continue;
      seenKeys.add(key);
      const label = tag.slice(0, 180);
      const entry = frequency.get(key) || { tag: label, count: 0 };
      entry.count += 1;
      if (label.length < entry.tag.length ||
          (label.length === entry.tag.length && label.localeCompare(entry.tag) < 0))
        entry.tag = label;
      frequency.set(key, entry);
    }
  }
  return [...frequency.values()]
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 20);
}

module.exports = {
  MAX_PORTFOLIO_PAGES,
  discoverPortfolioPages,
  buildPortfolioEvidence,
  finalizePortfolioProfile,
  visualConceptKey,
  canonicalVisualConcept,
  buildPortfolioSummary,
  isCurrentSite,
  sameDomain,
};
