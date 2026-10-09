const dns = require("node:dns").promises;
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");

const MAX_HTML_BYTES = 1024 * 1024;
const MAX_PAGES = 7;
const MAX_PAGE_TEXT_LENGTH = 8000;
const MAX_TOTAL_TEXT_LENGTH = 30000;
const MAX_REDIRECTS = 3;
const MIN_CONTENT_LENGTH = 80;
const MAX_CRAWL_MS = 90000;

const PAGE_TOPICS = [
  {
    type: "restaurant",
    pattern: /restaurant|a propos|about|histoire|history|maison|concept/u,
  },
  { type: "menu", pattern: /carte|menus?|cuisine|food|boissons?/u },
  { type: "chef", pattern: /chef|equipe|team|brigade/u },
  { type: "catering", pattern: /traiteur|catering/u },
  { type: "contact", pattern: /contact|acces|reservation/u },
  { type: "events", pattern: /evenements?|events?|seminaires?/u },
  { type: "groups", pattern: /groupes?|privatisation|private|receptions?/u },
  {
    type: "practical",
    pattern: /horaires?|infos? pratiques?|adresse|opening/u,
  },
];
const IGNORED_PATH =
  /(?:^|\/)(?:mentions?-legales?|legal|privacy(?:-policy)?|politique-de-confidentialite|confidentialite|cgv|conditions-generales(?:-de-vente)?|cookies?(?:-policy)?|login|admin|sitemap|feed|actualites?|blog|news|articles?|compte|account|checkout|panier|cart)(?:\/|$)|(?:^|\/)page\/\d+(?:\/|$)|\.(?:pdf|docx?|xlsx?|jpe?g|png|gif|svg|webp|zip|mp4)$/u;
const IGNORED_WORDS =
  /mentions legales|politique de confidentialite|confidentialite|privacy|cookies?|cgv|conditions generales|actualites?|blog|articles?|login|admin|sitemap/u;

function websiteError(message, status = 422) {
  return Object.assign(new Error(message), { status });
}

function remainingMs(deadline, maximum) {
  if (!deadline) return maximum;
  const remaining = deadline - Date.now();
  if (remaining <= 0)
    throw websiteError("Délai global d'analyse du site dépassé.", 504);
  return Math.min(maximum, remaining);
}

function parseWebsiteUrl(value, { maxLength = 2000 } = {}) {
  if (!Number.isSafeInteger(maxLength) || maxLength < 1 || maxLength > 16384)
    throw websiteError('Limite d’adresse invalide.', 400);
  if (typeof value !== "string" || !value.trim() || value.length > maxLength)
    throw websiteError("Adresse du site existant invalide.", 400);
  const input = value.trim();
  if (
    [...input].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  )
    throw websiteError("Adresse du site existant invalide.", 400);
  let url;
  try {
    url = new URL(
      /^[a-z][a-z\d+.-]*:/iu.test(input) ? input : `https://${input}`,
    );
  } catch {
    throw websiteError("Adresse du site existant invalide.", 400);
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  )
    throw websiteError("Seule une URL HTTP(S) publique est autorisée.", 400);
  url.hash = "";
  return url;
}

function isPublicIpv4(address) {
  if (net.isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}

async function publicAddress(hostname, lookup = dns.lookup, deadline) {
  if (net.isIP(hostname)) {
    if (!isPublicIpv4(hostname))
      throw websiteError("Adresse du site existant non publique.", 400);
    return hostname;
  }
  let addresses;
  let timer;
  const dnsTimeout = remainingMs(deadline, 5000);
  try {
    addresses = await Promise.race([
      lookup(hostname, { family: 4, all: true, verbatim: true }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("DNS timeout")), dnsTimeout);
      }),
    ]);
  } catch {
    throw websiteError("Impossible de résoudre le site existant.");
  } finally {
    clearTimeout(timer);
  }
  if (
    !addresses?.length ||
    addresses.some(({ address }) => !isPublicIpv4(address))
  )
    throw websiteError("Adresse du site existant non publique.", 400);
  return addresses[0].address;
}

function requestHtml(url, address, deadline) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.get(
      url,
      {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "Accept-Encoding": "identity",
          "User-Agent": "GustoDesignLab/1.0 (restaurant content analysis)",
        },
        lookup: (_hostname, _options, callback) => callback(null, address, 4),
        signal: AbortSignal.timeout(remainingMs(deadline, 12000)),
      },
      (response) => {
        const status = response.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(status)) {
          const location = response.headers.location;
          response.resume();
          if (!location) return reject(websiteError("Redirection invalide."));
          return resolve({ location });
        }
        if (status !== 200) {
          response.resume();
          return reject(
            websiteError("Le site existant ne répond pas correctement."),
          );
        }
        const contentType = String(response.headers["content-type"] || "");
        const encoding = String(
          response.headers["content-encoding"] || "identity",
        );
        if (
          !/^\s*(text\/html|application\/xhtml\+xml)(?:\s*;|\s*$)/iu.test(
            contentType,
          ) ||
          !["identity", ""].includes(encoding.toLowerCase())
        ) {
          response.resume();
          return reject(websiteError("Le site doit renvoyer une page HTML."));
        }
        const chunks = [];
        let size = 0;
        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > MAX_HTML_BYTES) {
            response.destroy();
            reject(websiteError("La page du site est trop volumineuse."));
          } else chunks.push(chunk);
        });
        response.on("end", () => {
          const charset = /charset\s*=\s*([\w-]+)/iu.exec(contentType)?.[1];
          let decoder;
          try {
            decoder = new TextDecoder(charset || "utf-8");
          } catch {
            decoder = new TextDecoder("utf-8");
          }
          resolve({ html: decoder.decode(Buffer.concat(chunks)) });
        });
        response.on("error", reject);
      },
    );
    request.on("error", (error) =>
      reject(
        websiteError(
          error.name === "AbortError"
            ? "Délai de chargement du site dépassé."
            : "Impossible de charger le site existant.",
          error.name === "AbortError" ? 504 : 422,
        ),
      ),
    );
  });
}

function decodeEntities(value) {
  const named = {
    amp: "&",
    apos: "'",
    quot: '"',
    nbsp: " ",
    lt: "<",
    gt: ">",
    eacute: "é",
    egrave: "è",
    ecirc: "ê",
    agrave: "à",
    acirc: "â",
    ugrave: "ù",
    ucirc: "û",
    ccedil: "ç",
    ocirc: "ô",
    icirc: "î",
    rsquo: "’",
    lsquo: "‘",
    rdquo: "”",
    ldquo: "“",
    ndash: "–",
    mdash: "—",
  };
  return value.replace(/&(#(?:x[\da-f]+|\d+)|[a-z]+);/giu, (entity, code) => {
    if (code.startsWith("#")) {
      const number =
        code[1].toLowerCase() === "x"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return number > 0 && number <= 0x10ffff
        ? String.fromCodePoint(number)
        : " ";
    }
    return named[code.toLowerCase()] || entity;
  });
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

function sameDomain(a, b) {
  return (
    a.toLowerCase().replace(/^www\./u, "") ===
    b.toLowerCase().replace(/^www\./u, "")
  );
}

function canonicalPageKey(url) {
  return `${url.hostname.toLowerCase().replace(/^www\./u, "")}${url.pathname.replace(/\/+$/u, "") || "/"}`.toLowerCase();
}

function attribute(attributes, name) {
  const match = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "iu",
  ).exec(attributes);
  return decodeEntities(match?.[1] || match?.[2] || match?.[3] || "");
}

function discoverRelevantLinks(html, homepageUrl) {
  const navigationRanges = [
    ...html.matchAll(/<(nav|header)\b[^>]*>[\s\S]*?<\/\1\s*>/giu),
  ].map((match) => [match.index, match.index + match[0].length]);
  const found = new Map();
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/giu)) {
    const href = attribute(match[1], "href");
    if (!href || href.startsWith("#")) continue;
    let url;
    try {
      url = parseWebsiteUrl(new URL(href, homepageUrl).href);
    } catch {
      continue;
    }
    if (!sameDomain(url.hostname, homepageUrl.hostname) || url.search) continue;
    let decodedPath = url.pathname;
    try {
      decodedPath = decodeURIComponent(url.pathname);
    } catch {
      continue;
    }
    const path = normalizeText(decodedPath);
    const label = normalizeText(
      decodeEntities(match[2].replace(/<[^>]+>/gu, " ")) +
        " " +
        attribute(match[1], "aria-label") +
        " " +
        attribute(match[1], "title"),
    );
    if (
      IGNORED_PATH.test(url.pathname.toLowerCase()) ||
      IGNORED_WORDS.test(`${path} ${label}`)
    )
      continue;
    const key = canonicalPageKey(url);
    if (key === canonicalPageKey(homepageUrl)) continue;
    const inNavigation = navigationRanges.some(
      ([start, end]) => match.index >= start && match.index < end,
    );
    const matches = PAGE_TOPICS.map(({ type, pattern }) => ({
      type,
      score:
        (pattern.test(path) ? 4 : 0) +
        (pattern.test(label) ? 3 : 0) +
        (inNavigation ? 1 : 0),
    })).filter((topic) => topic.score >= 3);
    if (!matches.length) continue;
    matches.sort((a, b) => b.score - a.score);
    const candidate = {
      url: url.href,
      pageType: matches[0].type,
      score: matches[0].score,
    };
    if (!found.has(key) || found.get(key).score < candidate.score)
      found.set(key, candidate);
  }
  const rank = (type) => PAGE_TOPICS.findIndex((topic) => topic.type === type);
  const ranked = [...found.values()].sort(
    (a, b) =>
      b.score - a.score ||
      rank(a.pageType) - rank(b.pageType) ||
      a.url.localeCompare(b.url),
  );
  const selected = [];
  const types = new Set();
  for (const candidate of ranked) {
    if (types.has(candidate.pageType)) continue;
    selected.push(candidate);
    types.add(candidate.pageType);
    if (selected.length === MAX_PAGES - 1) return selected;
  }
  for (const candidate of ranked) {
    if (selected.includes(candidate)) continue;
    selected.push(candidate);
    if (selected.length === MAX_PAGES - 1) break;
  }
  return selected;
}

function extractWebsiteText(html, { includeFooter = false } = {}) {
  let cleaned = String(html || "")
    .replace(/<!--[\s\S]*?-->/gu, " ")
    .replace(
      /<(script|style|noscript|svg|canvas|iframe|template)\b[^>]*>[\s\S]*?<\/\1\s*>/giu,
      " ",
    )
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav\s*>/giu, " ")
    .replace(
      /<(div|aside|section)\b[^>]*(?:id|class)\s*=\s*["'][^"']*(?:cookie|consent|rgpd)[^"']*["'][^>]*>[\s\S]*?<\/\1\s*>/giu,
      " ",
    );
  if (!includeFooter)
    cleaned = cleaned.replace(/<footer\b[^>]*>[\s\S]*?<\/footer\s*>/giu, " ");
  cleaned = cleaned
    .replace(
      /<\/?(?:p|div|section|article|h[1-6]|li|br|main|header|footer|tr|td)\b[^>]*>/giu,
      "\n",
    )
    .replace(/<[^>]+>/gu, " ");
  const text = decodeEntities(cleaned)
    .replace(/[ \t\r]+/gu, " ")
    .replace(/\n\s*\n+/gu, "\n")
    .trim()
    .slice(0, MAX_PAGE_TEXT_LENGTH);
  if (text.length < MIN_CONTENT_LENGTH)
    throw websiteError(
      "Le HTML du site contient trop peu de texte exploitable (site peut-être rendu en JavaScript).",
    );
  return text;
}

async function fetchWebsitePage(
  value,
  {
    lookup = dns.lookup,
    requestPage = requestHtml,
    allowedHostname,
    deadline,
  } = {},
) {
  let url = parseWebsiteUrl(value);
  const domain = allowedHostname || url.hostname;
  const visited = new Set();
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    remainingMs(deadline, 12000);
    if (!sameDomain(url.hostname, domain))
      throw websiteError("Redirection hors du domaine du site existant.", 400);
    if (visited.has(url.href))
      throw websiteError("Boucle de redirection du site existant.");
    visited.add(url.href);
    const address = await publicAddress(url.hostname, lookup, deadline);
    const response = await requestPage(url, address, deadline);
    if (typeof response.html === "string") return { html: response.html, url };
    if (redirect === MAX_REDIRECTS)
      throw websiteError("Le site effectue trop de redirections.");
    try {
      url = parseWebsiteUrl(new URL(response.location, url).href);
    } catch {
      throw websiteError("Redirection du site invalide.");
    }
  }
  throw websiteError("Le site existant ne peut pas être chargé.");
}

function shingles(text) {
  const words = normalizeText(text).split(/\s+/u);
  const result = new Set();
  for (let index = 0; index + 7 < words.length; index += 3)
    result.add(words.slice(index, index + 8).join(" "));
  return result;
}

function nearlyDuplicate(text, priorTexts) {
  const current = shingles(text);
  return priorTexts.some((prior) => {
    const existing = shingles(prior);
    const smaller = Math.min(current.size, existing.size);
    if (smaller < 8) return normalizeText(text) === normalizeText(prior);
    let shared = 0;
    for (const part of current) if (existing.has(part)) shared += 1;
    return shared / smaller >= 0.85;
  });
}

function uniqueTextBlocks(text, seen) {
  return text
    .split("\n")
    .map((block) => block.trim())
    .filter((block) => {
      const key = normalizeText(block);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join("\n");
}

async function crawlExistingWebsite(value, options = {}) {
  const deadline = Date.now() + MAX_CRAWL_MS;
  const homepage = await fetchWebsitePage(value, { ...options, deadline });
  const homepageText = extractWebsiteText(homepage.html, {
    includeFooter: true,
  });
  const candidates = discoverRelevantLinks(homepage.html, homepage.url);
  const pages = [
    { url: homepage.url.href, pageType: "home", text: homepageText },
  ];
  let failedPages = 0;
  const pageKeys = new Set([canonicalPageKey(homepage.url)]);
  for (const candidate of candidates) {
    try {
      const page = await fetchWebsitePage(candidate.url, {
        ...options,
        allowedHostname: homepage.url.hostname,
        deadline,
      });
      const key = canonicalPageKey(page.url);
      if (pageKeys.has(key)) continue;
      pageKeys.add(key);
      const text = extractWebsiteText(page.html);
      if (
        nearlyDuplicate(
          text,
          pages.map((item) => item.text),
        )
      )
        continue;
      pages.push({ url: page.url.href, pageType: candidate.pageType, text });
    } catch {
      failedPages += 1;
    }
  }
  let seen = new Set();
  const sourcePages = [];
  const sections = [];
  let remaining = MAX_TOTAL_TEXT_LENGTH;
  for (const page of pages) {
    const nextSeen = new Set(seen);
    const cleaned = uniqueTextBlocks(page.text, nextSeen).slice(
      0,
      Math.min(MAX_PAGE_TEXT_LENGTH, remaining),
    );
    if (cleaned.length < MIN_CONTENT_LENGTH) continue;
    seen = nextSeen;
    sections.push(`[${page.pageType}]\n${cleaned}`);
    sourcePages.push({ url: page.url, pageType: page.pageType });
    remaining -= cleaned.length;
    if (remaining < MIN_CONTENT_LENGTH) break;
  }
  return {
    text: sections.join("\n\n"),
    sourcePages,
    pagesDiscovered: candidates.length + 1,
    pagesFailed: failedPages,
  };
}

async function fetchWebsiteText(value, options = {}) {
  const page = await fetchWebsitePage(value, options);
  return {
    text: extractWebsiteText(page.html, { includeFooter: true }),
    sourceUrl: page.url.href,
  };
}

module.exports = {
  MAX_PAGES,
  parseWebsiteUrl,
  isPublicIpv4,
  extractWebsiteText,
  fetchWebsiteText,
  discoverRelevantLinks,
  crawlExistingWebsite,
};
