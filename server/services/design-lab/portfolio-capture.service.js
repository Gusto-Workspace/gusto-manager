/* global window, document, navigator */
const dns = require("node:dns").promises;
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const zlib = require("node:zlib");
const { parseWebsiteUrl, isPublicIpv4 } = require("./existing-website.service");
const { sameDomain } = require("./portfolio.service");
const {
  inspectCaptureImagesDOM,
  applyExternalEmbedPlaceholdersDOM,
} = require("./capture-image-visibility");
const {
  createStructuralResourcePolicy,
} = require("./structural-resource-policy");

const MAX_REDIRECTS = 3;
const MAX_RESOURCE_BYTES = 8 * 1024 * 1024;
const MAX_PAGE_BYTES = 55 * 1024 * 1024;
const MAX_REQUESTS = 160;
const MAX_CONCURRENT_REQUESTS = 12;
const PAGE_TIMEOUT_MS = 25000;
const SITE_TIMEOUT_MS = 180000;
const WARMUP_TIMEOUT_MS = 9000;
const IMAGE_SETTLE_TIMEOUT_MS = 5000;
const MAX_WARMUP_STEPS = 90;
const MAX_WARMUP_SCROLL_HEIGHT = 50000;
// Shared by the pinned HTTP transport and browser JS (navigator.userAgent).
// Keep capture responses consistent with the desktop browser used for diagnosis.
const CAPTURE_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";
const CHROME_PATHS = [
  process.env.GUSTO_PORTFOLIO_CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

function portfolioCaptureEnabled() {
  return process.env.GUSTO_PORTFOLIO_CAPTURE_ENABLED === "true";
}

function requirePortfolioCaptureEnabled() {
  if (!portfolioCaptureEnabled())
    throw captureError(
      "Les captures Portfolio sont désactivées dans cet environnement.",
      403,
    );
}

function captureError(message, status = 422) {
  return Object.assign(new Error(message), { status });
}
function remaining(deadline, maximum) {
  const value = Math.min(maximum, deadline - Date.now());
  if (value < 1) throw captureError("Délai de capture dépassé.", 504);
  return value;
}
async function publicAddress(
  hostname,
  lookup = dns.lookup,
  deadline = Date.now() + 5000,
) {
  if (net.isIP(hostname)) {
    if (!isPublicIpv4(hostname))
      throw captureError("Adresse non publique interdite.", 400);
    return hostname;
  }
  let timer;
  let addresses;
  try {
    addresses = await Promise.race([
      lookup(hostname, { family: 4, all: true, verbatim: true }),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(captureError("Résolution DNS trop lente.", 504)),
          remaining(deadline, 5000),
        );
      }),
    ]);
  } catch (error) {
    if (error.status === 504) throw error;
    throw captureError(`Résolution DNS Portfolio impossible pour ${hostname}.`);
  } finally {
    clearTimeout(timer);
  }
  const records = Array.isArray(addresses) ? addresses : [addresses];
  if (!records.length || records.some((record) => record == null))
    throw captureError(`Aucune IPv4 publique résolue pour ${hostname}.`);
  const resolved = records.map((record) =>
    typeof record === "string" ? record : record.address,
  );
  if (resolved.some((address) => !isPublicIpv4(address)))
    throw captureError(`Adresse non publique interdite pour ${hostname}.`, 400);
  if (
    records.some(
      (record) =>
        typeof record === "object" &&
        record.family != null &&
        record.family !== 4,
    )
  )
    throw captureError(`Adresse non publique interdite pour ${hostname}.`, 400);
  return resolved[0];
}

function createPinnedLookup(address) {
  if (!isPublicIpv4(address))
    throw captureError("Adresse non publique interdite.", 400);
  return (_hostname, options, callback) => {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    if (options?.all) callback(null, [{ address, family: 4 }]);
    else callback(null, address, 4);
  };
}

function requestPinned(
  url,
  address,
  deadline,
  maxBytes = MAX_RESOURCE_BYTES,
  accept,
  { accountBytes, budgetError } = {},
) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.get(
      url,
      {
        lookup: createPinnedLookup(address),
        headers: {
          Accept:
            typeof accept === "string" &&
            accept.length <= 512 &&
            /^[\x20-\x7e]+$/.test(accept)
              ? accept
              : "text/html,application/xhtml+xml,image/*,text/css,application/javascript,*/*;q=0.8",
          "Accept-Encoding": "identity",
          "User-Agent": CAPTURE_USER_AGENT,
        },
        signal: AbortSignal.timeout(remaining(deadline, 12000)),
      },
      (response) => {
        const chunks = [];
        let size = 0;
        const declaredSize = Number(response.headers["content-length"]);
        if (declaredSize > maxBytes) {
          response.destroy();
          reject(
            budgetError?.(declaredSize, maxBytes) ||
              captureError("Ressource trop volumineuse."),
          );
          return;
        }
        response.on("data", (chunk) => {
          size += chunk.length;
          try {
            accountBytes?.(chunk.length);
            if (size > maxBytes)
              throw (
                budgetError?.(size, maxBytes) ||
                captureError("Ressource trop volumineuse.")
              );
            chunks.push(chunk);
          } catch (error) {
            response.destroy(error);
          }
        });
        response.on("end", () => {
          try {
            let body = Buffer.concat(chunks);
            const encoding = String(
              response.headers["content-encoding"] || "",
            ).toLowerCase();
            if (encoding === "gzip")
              body = zlib.gunzipSync(body, { maxOutputLength: maxBytes });
            else if (encoding === "br")
              body = zlib.brotliDecompressSync(body, {
                maxOutputLength: maxBytes,
              });
            else if (encoding === "deflate")
              body = zlib.inflateSync(body, { maxOutputLength: maxBytes });
            else if (encoding && encoding !== "identity")
              throw captureError("Encodage non pris en charge.");
            resolve({
              status: response.statusCode || 0,
              headers: response.headers,
              body,
            });
          } catch (error) {
            reject(error);
          }
        });
        response.on("error", reject);
      },
    );
    request.on("error", reject);
  });
}

async function fetchPublicResource(
  value,
  {
  rootHostname,
  navigation = false,
  allowExternalNavigation = false,
    deadline = Date.now() + PAGE_TIMEOUT_MS,
    lookup = dns.lookup,
    request = requestPinned,
    accept,
    maxBytes = MAX_RESOURCE_BYTES,
    accountBytes,
    budgetError,
  } = {},
) {
  let url = parseWebsiteUrl(value);
  const sourceUrl = url.href;
  const visited = new Set();
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    if (
      navigation &&
      !allowExternalNavigation &&
      rootHostname &&
      !sameDomain(url.hostname, rootHostname)
    )
      throw captureError(
        "Navigation hors du domaine Portfolio interdite.",
        400,
      );
    if (visited.has(url.href)) throw captureError("Boucle de redirection.");
    visited.add(url.href);
    const address = await publicAddress(url.hostname, lookup, deadline);
    const result = await request(url, address, deadline, maxBytes, accept, {
      accountBytes,
      budgetError,
    });
    if ([301, 302, 303, 307, 308].includes(result.status)) {
      if (!result.headers.location) throw captureError("Redirection invalide.");
      url = parseWebsiteUrl(new URL(result.headers.location, url).href);
      continue;
    }
    if (result.status < 200 || result.status >= 400)
      throw Object.assign(captureError("Page inaccessible."), {
        networkStatus: result.status,
        sourceUrl,
        resourceUrl: url.href,
      });
    const headers = Object.fromEntries(
      Object.entries(result.headers)
        .filter(
          ([key]) =>
            ![
              "connection",
              "keep-alive",
              "proxy-authenticate",
              "proxy-authorization",
              "te",
              "trailer",
              "upgrade",
            ].includes(key),
        )
        .map(([key, value]) => [
          key,
          Array.isArray(value) ? value.join(", ") : String(value),
        ]),
    );
    delete headers["content-encoding"];
    delete headers["content-length"];
    delete headers["transfer-encoding"];
    delete headers["set-cookie"];
    return { ...result, url: url.href, headers };
  }
  throw captureError("Trop de redirections.");
}

async function warmUpPortfolioPage(page, deadline) {
  const budgetMs = remaining(deadline, WARMUP_TIMEOUT_MS);
  return page.evaluate(
    async ({ budgetMs, maxSteps, maxHeight }) => {
      const topSettleMs = Math.min(350, budgetMs);
      const end = Date.now() + budgetMs - topSettleMs;
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const timeLeft = () => Math.max(0, end - Date.now());
      const waitBounded = async (promise, maximum) => {
        const duration = Math.min(maximum, timeLeft());
        if (!duration) return;
        await Promise.race([
          Promise.resolve(promise).catch(() => {}),
          sleep(duration),
        ]);
      };
      const pageHeight = () =>
        Math.max(
          document.documentElement?.scrollHeight || 0,
          document.body?.scrollHeight || 0,
        );
      const viewport = Math.max(1, window.innerHeight);
      const stride = Math.max(1, Math.round(viewport * 0.7));
      let steps = 0;
      let highestScroll = 0;
      let highestObservedHeight = pageHeight();
      try {
        if (document.fonts?.ready)
          await waitBounded(document.fonts.ready, 1200);
        let nextTop = 0;
        while (steps < maxSteps && timeLeft() > 0) {
          const height = pageHeight();
          highestObservedHeight = Math.max(highestObservedHeight, height);
          const bottom = Math.max(0, Math.min(height, maxHeight) - viewport);
          const top = Math.min(nextTop, bottom);
          window.scrollTo({ top, behavior: "instant" });
          highestScroll = Math.max(highestScroll, top);
          steps += 1;
          await sleep(Math.min(75, timeLeft()));
          const updatedHeight = pageHeight();
          highestObservedHeight = Math.max(
            highestObservedHeight,
            updatedHeight,
          );
          if (
            top >= bottom &&
            (updatedHeight <= height + 4 || height >= maxHeight)
          )
            break;
          nextTop = top + stride;
        }
        await sleep(Math.min(300, timeLeft()));
        const images = [...document.images];
        await waitBounded(
          Promise.allSettled(
            images.map(async (image) => {
              if (!image.complete) {
                await new Promise((resolve) => {
                  image.addEventListener("load", resolve, { once: true });
                  image.addEventListener("error", resolve, { once: true });
                  if (image.complete) resolve();
                });
              }
              if (image.naturalWidth > 0 && image.decode)
                await image.decode().catch(() => {});
            }),
          ),
          1600,
        );
        if (document.fonts?.ready) await waitBounded(document.fonts.ready, 800);
      } finally {
        window.scrollTo({ top: 0, behavior: "instant" });
        await sleep(topSettleMs);
      }
      return { steps, highestScroll, highestObservedHeight };
    },
    {
      budgetMs,
      maxSteps: MAX_WARMUP_STEPS,
      maxHeight: MAX_WARMUP_SCROLL_HEIGHT,
    },
  );
}

async function waitForPortfolioImages(
  page,
  deadline,
  { visibleOnly = false } = {},
) {
  const maxWaitMs = remaining(deadline, IMAGE_SETTLE_TIMEOUT_MS);
  const end = Date.now() + maxWaitMs;
  let images;
  do {
    images = await page.evaluate(inspectCaptureImagesDOM, {
      maxWaitMs,
      visibleOnly,
    });
    // Lightweight browser doubles use the public result shape.
    if (!Array.isArray(images)) return images;
    if (!images.some((image) => image.pending)) break;
    await page.waitForTimeout(Math.min(100, Math.max(1, end - Date.now())));
  } while (Date.now() < end);
  // Rediscover the active branch and source after lazy-load/re-render.
  images = await page.evaluate(inspectCaptureImagesDOM, {
    maxWaitMs,
    visibleOnly,
    decode: true,
  });
  const missing = images.filter(
    (image) => !image.naturalWidth || image.pending,
  );
  for (const image of missing) {
    const error = page.structuralResourcePolicy?.failures.get(image.url);
    if (error?.code === "structural_media_budget_exceeded") throw error;
  }
  if (visibleOnly && page.structuralResourcePolicy?.embedFailures) {
    await synchronizeUnavailableExternalEmbeds(page);
  }
  return {
    total: images.length,
    failed: images.filter((image) => !image.pending && !image.naturalWidth)
      .length,
    pending: images.filter((image) => image.pending).length,
  };
}

async function synchronizeUnavailableExternalEmbeds(page) {
  const failures = [
    ...(page.structuralResourcePolicy?.embedFailures?.values() || []),
  ];
  if (!failures.length) return [];
  const embeds = await page
    .evaluate(applyExternalEmbedPlaceholdersDOM, failures)
    .catch(() => []);
  if (!Array.isArray(embeds) || !embeds.length) return [];
  page.structuralExternalEmbeds ||= new Map();
  for (const embed of embeds) {
    const key = [
      embed.domain,
      embed.networkStatus,
      Math.round(embed.width),
      Math.round(embed.height),
    ].join(":");
    page.structuralExternalEmbeds.set(key, embed);
  }
  return embeds;
}

async function capturePortfolioSite(
  homepage,
  {
    launch,
    fetchResource = fetchPublicResource,
    lookup = dns.lookup,
    onPage,
    onPageStart,
    onDiscovered,
    onPageError,
    now = Date.now,
    singlePage = false,
    collectSpatialMetadata = false,
    beforeScreenshot,
    capturePage,
    structuralResources = Boolean(capturePage),
  } = {},
) {
  requirePortfolioCaptureEnabled();
  const home = parseWebsiteUrl(homepage);
  await publicAddress(home.hostname, lookup);
  const fs = require("node:fs");
  const executablePath = CHROME_PATHS.find((path) => fs.existsSync(path));
  if (!launch && !executablePath)
    throw captureError("Chrome est requis pour capturer le Portfolio.", 503);
  const launchOptions = {
    headless: true,
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-background-networking",
      "--disable-features=Prerender2,SpeculationRules",
    ],
  };
  const browser = launch
    ? await launch(launchOptions)
    : await require("playwright-core").chromium.launch(launchOptions);
  const context = await browser
    .newContext({
      userAgent: CAPTURE_USER_AGENT,
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      serviceWorkers: "block",
      acceptDownloads: false,
    })
    .catch(async (error) => {
      await browser.close();
      throw error;
    });
  const deadline = now() + SITE_TIMEOUT_MS;
  let resourceBytes = 0;
  let requestCount = 0;
  let activeRequests = 0;
  let navigationError = null;
  const structuralPolicy = structuralResources
    ? createStructuralResourcePolicy()
    : null;
  if (structuralPolicy) structuralPolicy.embedFailures = new Map();
  try {
    await context.route("**/*", async (route) => {
      const request = route.request();
      const isNavigation =
        typeof request.isNavigationRequest === "function" &&
        request.isNavigationRequest();
      let subframeNavigation = false;
      if (isNavigation) {
        try {
          subframeNavigation = Boolean(request.frame().parentFrame());
        } catch {
          return route.abort();
        }
      }
      if (
        request.method() !== "GET" ||
        (!structuralPolicy && ++requestCount > MAX_REQUESTS) ||
        now() > deadline
      )
        return route.abort();
      const requestDeadline = Math.min(deadline, now() + PAGE_TIMEOUT_MS);
      while (
        !structuralPolicy &&
        activeRequests >= MAX_CONCURRENT_REQUESTS &&
        now() < requestDeadline
      )
        await new Promise((resolve) => setTimeout(resolve, 25));
      if (now() >= requestDeadline) return route.abort();
      activeRequests += 1;
      try {
        if (
          isNavigation &&
          !subframeNavigation &&
          !sameDomain(parseWebsiteUrl(request.url()).hostname, home.hostname)
        )
          throw captureError(
            "Navigation hors du domaine Portfolio interdite.",
            400,
          );
        const options = {
          rootHostname: home.hostname,
          navigation: isNavigation,
          allowExternalNavigation: subframeNavigation,
          deadline: requestDeadline,
          lookup,
          accept:
            typeof request.headers === "function"
              ? request.headers().accept
              : undefined,
        };
        const requestedType =
          request.resourceType?.() ||
          (isNavigation ? "document" : "other");
        const mediaRequest =
          requestedType === "media" ||
          /\.(?:mp4|m4v|mov|webm|ogv|ogg)(?:$|[?#])/i.test(request.url());
        const visibleMedia =
          mediaRequest &&
          (await page
            .evaluate((value) => {
              const requested = new URL(value);
              return [...document.querySelectorAll("video")].some((video) => {
                const box = video.getBoundingClientRect();
                if (
                  box.width < 120 ||
                  box.height < 120 ||
                  box.bottom <= 0 ||
                  box.top >= innerHeight ||
                  box.right <= 0 ||
                  box.left >= innerWidth
                )
                  return false;
                let opacity = 1;
                for (
                  let parent = video;
                  parent;
                  parent = parent.parentElement
                ) {
                  const style = getComputedStyle(parent);
                  opacity *= Number(style.opacity);
                  if (
                    style.display === "none" ||
                    ["hidden", "collapse"].includes(style.visibility) ||
                    opacity <= 0.01
                  )
                    return false;
                }
                const sources = [
                  video.currentSrc,
                  video.getAttribute("src"),
                  video.getAttribute("data-src"),
                  ...[...video.querySelectorAll("source")].flatMap((source) => [
                    source.getAttribute("src"),
                    source.getAttribute("data-src"),
                  ]),
                ].filter(Boolean);
                return sources.some((source) => {
                  try {
                    const candidate = new URL(source, document.baseURI);
                    return (
                      candidate.origin === requested.origin &&
                      candidate.pathname === requested.pathname
                    );
                  } catch {
                    return false;
                  }
                });
              });
            }, request.url())
            .catch(() => false));
        const response = structuralPolicy
          ? await structuralPolicy.fetch(
              request.url(),
              mediaRequest ? "media" : requestedType,
              fetchResource,
              options,
              visibleMedia,
            )
          : await fetchResource(request.url(), options);
        if (!response) return route.abort();
        if (!structuralPolicy) {
          resourceBytes += response.body.length;
          if (resourceBytes > MAX_PAGE_BYTES) return route.abort();
        }
        if (response.url !== request.url())
          return route.fulfill({
            status: 302,
            headers: { location: response.url },
            body: "",
          });
        return route.fulfill({
          status: response.status,
          headers: response.headers,
          body: response.body,
        });
      } catch (error) {
        if (structuralPolicy) {
          structuralPolicy.failures.set(request.url(), error);
          if (isNavigation && subframeNavigation) {
            let frameUrl = request.url();
            try {
              frameUrl = new URL(frameUrl);
              frameUrl.hash = "";
              frameUrl = frameUrl.href;
            } catch {
              // Invalid URLs are already rejected by the pinned transport.
            }
            const sourceUrl = error.sourceUrl || frameUrl;
            structuralPolicy.embedFailures.set(sourceUrl, {
              url: sourceUrl,
              requestUrl: error.resourceUrl || frameUrl,
              networkStatus: Number.isInteger(error.networkStatus)
                ? error.networkStatus
                : null,
              message: String(error.message || "Échec réseau iframe").slice(
                0,
                240,
              ),
            });
          }
        }
        if (isNavigation && !subframeNavigation)
          navigationError = error;
        return route.abort();
      } finally {
        activeRequests -= 1;
      }
    });
    if (context.routeWebSocket)
      await context.routeWebSocket("**/*", (socket) => socket.close());
    await context.addInitScript(() => {
      window.WebSocket = class {
        constructor() {
          throw new Error("WebSocket disabled");
        }
      };
      window.EventSource = class {
        constructor() {
          throw new Error("EventSource disabled");
        }
      };
      navigator.sendBeacon = () => false;
      window.open = () => null;
    });
    const page = await context.newPage();
    page.structuralResourcePolicy = structuralPolicy;
    page.on("popup", (popup) => popup.close());
    page.setDefaultTimeout(PAGE_TIMEOUT_MS);
    const results = [];
    const visit = async (candidate, index, total) => {
      requestCount = 0;
      resourceBytes = 0;
      navigationError = null;
      if (onPageStart) await onPageStart(candidate, index, total);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await page
          .goto(candidate.url, {
            waitUntil: "domcontentloaded",
            timeout: remaining(deadline, PAGE_TIMEOUT_MS),
          })
          .catch((error) => {
            throw navigationError || error;
          });
        if (
          !response ||
          !response.ok() ||
          !sameDomain(new URL(page.url()).hostname, home.hostname)
        )
          throw captureError("Page Portfolio inaccessible.");
        await page.waitForTimeout(1200);
        await warmUpPortfolioPage(page, deadline);
        // Structural capture owns the per-viewport image gate after popup cleanup.
        // Offscreen lazy images and temporary popup images must not block it here.
        if (capturePage) break;
        const imageState = await waitForPortfolioImages(page, deadline);
        if (!imageState.failed && !imageState.pending) break;
        if (attempt === 1)
          throw captureError("Images de la page non chargées pour la capture.");
      }
      const captureDetails = beforeScreenshot
        ? await beforeScreenshot(page, deadline)
        : {};
      const links =
        candidate.pageType === "home" && !singlePage
          ? await page.evaluate(() =>
              [...document.querySelectorAll("a[href]")].map((anchor) => ({
                href: anchor.href,
                label: anchor.textContent?.trim() || "",
                inNavigation: Boolean(anchor.closest("nav, header")),
                inFooter: Boolean(anchor.closest("footer")),
              })),
            )
          : [];
      const captured = capturePage
        ? await capturePage(page, deadline, captureDetails)
        : {
            buffer: await page.screenshot({
              type: "png",
              fullPage: true,
              animations: "disabled",
              timeout: remaining(deadline, PAGE_TIMEOUT_MS),
            }),
          };
      const result = {
        ...candidate,
        captureIndex: index,
        url: page.url(),
        ...captureDetails,
        ...captured,
          ...(structuralPolicy
          ? {
              resourceUsage: { ...structuralPolicy.stats },
              externalEmbeds: [...(page.structuralExternalEmbeds?.values() || [])],
            }
          : {}),
      };
      if (collectSpatialMetadata && !result.localMetadata)
        result.localMetadata = await page.evaluate(() => {
          const viewport = {
            width: window.innerWidth,
            height: window.innerHeight,
          };
          return {
            viewport,
            documentWidth: document.documentElement.scrollWidth,
            documentHeight: document.documentElement.scrollHeight,
            largeImages: [...document.querySelectorAll("img")]
              .map((image) => {
                const box = image.getBoundingClientRect();
                return {
                  x: Math.round(box.x + window.scrollX),
                  y: Math.round(box.y + window.scrollY),
                  width: Math.round(box.width),
                  height: Math.round(box.height),
                };
              })
              .filter(
                (box) =>
                  box.width * box.height >=
                  viewport.width * viewport.height * 0.1,
              )
              .slice(0, 20),
          };
        });
      results.push(result);
      if (onPage) await onPage(result, index, total);
      return links;
    };
    const links = await visit(
      {
        url: home.href,
        pathname: home.pathname,
        label: "Accueil",
        pageType: "home",
      },
      1,
      0,
    );
    if (singlePage) {
      if (onDiscovered) await onDiscovered(1);
      return { pages: results, discovered: 1, failures: [] };
    }
    const { discoverPortfolioPages } = require("./portfolio.service");
    const candidates = discoverPortfolioPages(links, home.href);
    if (onDiscovered) await onDiscovered(candidates.length + 1);
    const failures = [];
    for (const [index, candidate] of candidates.entries()) {
      if (now() >= deadline) {
        failures.push({
          url: candidate.url,
          message: "Délai de capture dépassé.",
        });
        if (onPageError)
          await onPageError(candidate, index + 2, candidates.length + 1);
        continue;
      }
      try {
        await visit(candidate, index + 2, candidates.length + 1);
      } catch (error) {
        failures.push({ url: candidate.url, message: error.message });
        if (onPageError)
          await onPageError(candidate, index + 2, candidates.length + 1, error);
      }
    }
    return { pages: results, discovered: candidates.length + 1, failures };
  } finally {
    await browser.close();
  }
}

module.exports = {
  portfolioCaptureEnabled,
  requirePortfolioCaptureEnabled,
  MAX_REDIRECTS,
  PAGE_TIMEOUT_MS,
  SITE_TIMEOUT_MS,
  CAPTURE_USER_AGENT,
  publicAddress,
  createPinnedLookup,
  fetchPublicResource,
  warmUpPortfolioPage,
  waitForPortfolioImages,
  synchronizeUnavailableExternalEmbeds,
  capturePortfolioSite,
};
