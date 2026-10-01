const dns = require("node:dns").promises;
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");

const MAX_HTML_BYTES = 1024 * 1024;
const MAX_TEXT_LENGTH = 20000;
const MAX_REDIRECTS = 3;

function websiteError(message, status = 422) {
  return Object.assign(new Error(message), { status });
}

function parseWebsiteUrl(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 2000)
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

async function publicAddress(hostname, lookup = dns.lookup) {
  if (net.isIP(hostname)) {
    if (!isPublicIpv4(hostname))
      throw websiteError("Adresse du site existant non publique.", 400);
    return hostname;
  }
  let addresses;
  let timer;
  try {
    addresses = await Promise.race([
      lookup(hostname, { family: 4, all: true, verbatim: true }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("DNS timeout")), 5000);
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

function requestHtml(url, address) {
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
        signal: AbortSignal.timeout(12000),
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

function extractWebsiteText(html) {
  const cleaned = String(html || "")
    .replace(/<!--[\s\S]*?-->/gu, " ")
    .replace(
      /<(script|style|noscript|svg|canvas|iframe|template)\b[^>]*>[\s\S]*?<\/\1\s*>/giu,
      " ",
    )
    .replace(
      /<\/?(?:p|div|section|article|h[1-6]|li|br|main|header|footer|tr|td)\b[^>]*>/giu,
      "\n",
    )
    .replace(/<[^>]+>/gu, " ");
  const text = decodeEntities(cleaned)
    .replace(/[ \t\r]+/gu, " ")
    .replace(/\n\s*\n+/gu, "\n")
    .trim()
    .slice(0, MAX_TEXT_LENGTH);
  if (text.length < 80)
    throw websiteError("Le site ne contient pas assez de texte exploitable.");
  return text;
}

async function fetchWebsiteText(value, { lookup = dns.lookup } = {}) {
  let url = parseWebsiteUrl(value);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const address = await publicAddress(url.hostname, lookup);
    const response = await requestHtml(url, address);
    if (response.html)
      return { text: extractWebsiteText(response.html), sourceUrl: url.href };
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

module.exports = {
  parseWebsiteUrl,
  isPublicIpv4,
  extractWebsiteText,
  fetchWebsiteText,
};
