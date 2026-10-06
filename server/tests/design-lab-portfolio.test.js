/* global document, window, getComputedStyle, scrollY */
const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const mongoose = require("mongoose");
const fs = require("node:fs");
const GustoPortfolioSite = require("../models/gusto-portfolio-site.model");
const portfolioRouter = require("../routes/admin/design-lab-portfolio.routes");
const {
  selectReferences,
  portfolioSimilarityAdjustment,
} = require("../services/design-lab/design-lab.service");
const {
  analyzePortfolioPage,
  synthesizePortfolioProfile,
} = require("../services/design-lab/openai.service");
const {
  MAX_PORTFOLIO_PAGES,
  discoverPortfolioPages,
  buildPortfolioSummary,
  buildPortfolioEvidence,
  finalizePortfolioProfile,
  visualConceptKey,
  canonicalVisualConcept,
} = require("../services/design-lab/portfolio.service");
const {
  publicAddress,
  createPinnedLookup,
  fetchPublicResource,
  warmUpPortfolioPage,
  waitForPortfolioImages,
  capturePortfolioSite,
  portfolioCaptureEnabled,
  CAPTURE_USER_AGENT,
} = require("../services/design-lab/portfolio-capture.service");
const {
  analyzePortfolioSite,
  replacePortfolioAnalysis,
  replacePortfolioProfile,
} = require("../services/design-lab/portfolio-analysis.service");

const publicLookup = async () => [{ address: "93.184.215.14" }];
const originalCaptureSetting = process.env.GUSTO_PORTFOLIO_CAPTURE_ENABLED;
test.beforeEach(() => {
  process.env.GUSTO_PORTFOLIO_CAPTURE_ENABLED = "true";
});
test.afterEach(() => {
  if (originalCaptureSetting === undefined)
    delete process.env.GUSTO_PORTFOLIO_CAPTURE_ENABLED;
  else process.env.GUSTO_PORTFOLIO_CAPTURE_ENABLED = originalCaptureSetting;
});

function portfolioHandler(method, path) {
  return portfolioRouter.stack.find(
    (layer) => layer.route?.path === path && layer.route.methods[method],
  ).route.stack[0].handle;
}
function response() {
  return {
    status(code) {
      this.code = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
}

test("capture Portfolio désactivée par défaut et autorisée uniquement avec true", () => {
  delete process.env.GUSTO_PORTFOLIO_CAPTURE_ENABLED;
  assert.equal(portfolioCaptureEnabled(), false);
  process.env.GUSTO_PORTFOLIO_CAPTURE_ENABLED = "false";
  assert.equal(portfolioCaptureEnabled(), false);
  process.env.GUSTO_PORTFOLIO_CAPTURE_ENABLED = "TRUE";
  assert.equal(portfolioCaptureEnabled(), false);
  process.env.GUSTO_PORTFOLIO_CAPTURE_ENABLED = "true";
  assert.equal(portfolioCaptureEnabled(), true);
});

test("capture interdite immédiatement sans navigateur, Sharp ni Vision", async () => {
  delete process.env.GUSTO_PORTFOLIO_CAPTURE_ENABLED;
  let invoked = 0;
  await assert.rejects(
    capturePortfolioSite("https://example.com/", {
      lookup: async () => { invoked += 1; return publicLookup(); },
      launch: async () => { invoked += 1; },
    }),
    (error) => error.status === 403 && /désactivées/.test(error.message),
  );
  await assert.rejects(
    analyzePortfolioSite({ url: "https://example.com/" }, {
      capture: async () => { invoked += 1; },
      upload: async () => { invoked += 1; },
      analyze: async () => { invoked += 1; },
      synthesize: async () => { invoked += 1; },
    }),
    (error) => error.status === 403,
  );
  assert.equal(invoked, 0);
});

test("API Portfolio : refus immédiat de l'analyse, lecture toujours disponible", async () => {
  process.env.GUSTO_PORTFOLIO_CAPTURE_ENABLED = "false";
  const id = new mongoose.Types.ObjectId();
  const site = {
    _id: id,
    active: true,
    pages: [{ screenshot: { url: "https://res.cloudinary.com/demo/home.webp" } }],
    visualProfile: { visualTags: ["éditorial"] },
  };
  const find = GustoPortfolioSite.find;
  const create = GustoPortfolioSite.create;
  const findById = GustoPortfolioSite.findById;
  const findOneAndUpdate = GustoPortfolioSite.findOneAndUpdate;
  let writes = 0;
  GustoPortfolioSite.find = () => ({ sort: () => ({ lean: async () => [site] }) });
  GustoPortfolioSite.create = async (fields) => ({ ...site, ...fields });
  GustoPortfolioSite.findById = async () => site;
  GustoPortfolioSite.findOneAndUpdate = async () => { writes += 1; return site; };
  try {
    const denied = response();
    await portfolioHandler("post", "/admin/design-lab/portfolio/:id/analyze")(
      { params: { id: String(id) } }, denied,
    );
    assert.equal(denied.code, 403);
    assert.match(denied.body.message, /désactivées/);
    assert.equal(writes, 0);
    const added = response();
    await portfolioHandler("post", "/admin/design-lab/portfolio")(
      { body: { name: "Nouveau", url: "http://93.184.215.14/" } }, added,
    );
    assert.equal(added.code, 201);
    assert.equal(added.body.site.name, "Nouveau");
    assert.equal(writes, 0);
    const list = response();
    await portfolioHandler("get", "/admin/design-lab/portfolio")({}, list);
    assert.equal(list.body.portfolioCaptureEnabled, false);
    assert.equal(list.body.sites[0].pages[0].screenshot.url, site.pages[0].screenshot.url);
    const detail = response();
    await portfolioHandler("get", "/admin/design-lab/portfolio/:id")(
      { params: { id: String(id) } }, detail,
    );
    assert.equal(detail.body.portfolioCaptureEnabled, false);
    assert.deepEqual(detail.body.site.visualProfile.visualTags, ["éditorial"]);
    assert.equal(buildPortfolioSummary([site]).siteCount, 1);
  } finally {
    GustoPortfolioSite.find = find;
    GustoPortfolioSite.create = create;
    GustoPortfolioSite.findById = findById;
    GustoPortfolioSite.findOneAndUpdate = findOneAndUpdate;
  }
});

test("API Portfolio : true autorise le travail demandé explicitement", async () => {
  const id = new mongoose.Types.ObjectId();
  const site = { _id: id, pages: [], analysisStartedAt: new Date() };
  const findOneAndUpdate = GustoPortfolioSite.findOneAndUpdate;
  const analysisService = require("../services/design-lab/portfolio-analysis.service");
  const replace = analysisService.replacePortfolioAnalysis;
  let writes = 0;
  let jobs = 0;
  GustoPortfolioSite.findOneAndUpdate = async () => { writes += 1; return site; };
  analysisService.replacePortfolioAnalysis = async () => { jobs += 1; };
  try {
    const accepted = response();
    await portfolioHandler("post", "/admin/design-lab/portfolio/:id/analyze")(
      { params: { id: String(id) } }, accepted,
    );
    assert.equal(accepted.code, 202);
    assert.equal(writes, 1);
    assert.equal(jobs, 1);
  } finally {
    GustoPortfolioSite.findOneAndUpdate = findOneAndUpdate;
    analysisService.replacePortfolioAnalysis = replace;
  }
});

test("API Portfolio : resynthèse disponible sans capture Chromium", async () => {
  process.env.GUSTO_PORTFOLIO_CAPTURE_ENABLED = "false";
  const id = new mongoose.Types.ObjectId();
  const site = { _id: id, pages: [{ pageType: "home", analysis: {} }], analysisStartedAt: new Date() };
  const findOneAndUpdate = GustoPortfolioSite.findOneAndUpdate;
  const service = require("../services/design-lab/portfolio-analysis.service");
  const replace = service.replacePortfolioProfile;
  let jobs = 0;
  GustoPortfolioSite.findOneAndUpdate = async (_filter, update) => {
    assert.equal(_filter["pages.0"].$exists, true);
    assert.equal(update.$set.progress.currentStage, "synthesizing");
    return site;
  };
  service.replacePortfolioProfile = async () => { jobs += 1; };
  try {
    const accepted = response();
    await portfolioHandler("post", "/admin/design-lab/portfolio/:id/synthesize")(
      { params: { id: String(id) } }, accepted,
    );
    assert.equal(accepted.code, 202);
    assert.equal(jobs, 1);
  } finally {
    GustoPortfolioSite.findOneAndUpdate = findOneAndUpdate;
    service.replacePortfolioProfile = replace;
  }
});

test("routes Portfolio : ajout, URL/SSRF refusées, désactivation et suppression", async () => {
  const create = GustoPortfolioSite.create;
  const findById = GustoPortfolioSite.findById;
  const findOneAndDelete = GustoPortfolioSite.findOneAndDelete;
  const site = {
    _id: new mongoose.Types.ObjectId(),
    name: "A",
    url: "http://93.184.215.14/",
    active: true,
    analyzing: false,
    pages: [],
    save: async () => {},
  };
  GustoPortfolioSite.create = async (fields) => ({ ...site, ...fields });
  GustoPortfolioSite.findById = async () => site;
  GustoPortfolioSite.findOneAndDelete = async () => site;
  try {
    const added = response();
    await portfolioHandler("post", "/admin/design-lab/portfolio")(
      { body: { name: "A", url: site.url } },
      added,
    );
    assert.equal(added.code, 201);
    assert.equal(added.body.site.name, "A");
    const invalid = response();
    await portfolioHandler("post", "/admin/design-lab/portfolio")(
      { body: { name: "A", url: "file:///etc/passwd" } },
      invalid,
    );
    assert.equal(invalid.code, 400);
    const privateAddress = response();
    await portfolioHandler("post", "/admin/design-lab/portfolio")(
      { body: { name: "A", url: "http://127.0.0.1/" } },
      privateAddress,
    );
    assert.equal(privateAddress.code, 400);
    const disabled = response();
    await portfolioHandler("patch", "/admin/design-lab/portfolio/:id")(
      { params: { id: String(site._id) }, body: { active: false } },
      disabled,
    );
    assert.equal(disabled.body.site.active, false);
    const deleted = response();
    await portfolioHandler("delete", "/admin/design-lab/portfolio/:id")(
      { params: { id: String(site._id) } },
      deleted,
    );
    assert.deepEqual(deleted.body, { deleted: true });
  } finally {
    GustoPortfolioSite.create = create;
    GustoPortfolioSite.findById = findById;
    GustoPortfolioSite.findOneAndDelete = findOneAndDelete;
  }
});

test("Portfolio est un modèle visuel dédié, sans champs documentaires", () => {
  const site = new GustoPortfolioSite({
    name: "Gusto A",
    url: "https://example.com/",
    pages: [],
  });
  assert.equal(site.validateSync(), undefined);
  assert.equal(site.active, true);
  assert.equal(site.visualProfile, null);
  site.visualProfile = {
    visualTags: ["serif éditoriale"],
    patternSupport: [{ label: "serif éditoriale", key: "typographie:serif",
      pageCount: 2, totalPages: 3, tier: "dominant" }],
  };
  assert.equal(site.validateSync(), undefined);
  assert.equal(site.toObject().visualProfile.patternSupport[0].pageCount, 2);
  assert.equal(
    GustoPortfolioSite.schema.path("existingWebsiteContext"),
    undefined,
  );
  assert.equal(GustoPortfolioSite.schema.path("brief"), undefined);
  assert.equal(GustoPortfolioSite.schema.path("restaurantSummary"), undefined);
  assert.equal(
    GustoPortfolioSite.schema
      .path("pages")
      .schema.path("analysis")
      .schema.path("structure").instance,
    "String",
  );
  site.pages = [
    {
      url: "https://example.com/",
      pageType: "home",
      screenshot: {
        url: "https://res.cloudinary.com/demo/image/upload/home.webp",
        publicId: "gusto/design-lab/portfolio/1/home",
        width: 1440,
        height: 5000,
      },
      visualTags: ["éditorial"],
      analysis: { structure: "Grille", chef: "Donnée documentaire à exclure" },
    },
  ];
  assert.equal(site.validateSync(), undefined);
  assert.equal(site.pages[0].analysis.chef, undefined);
  site.pages = [
    { url: "https://example.com/", pageType: "home", analysis: {} },
  ];
  assert.match(site.validateSync().message, /screenshot/);
});

test("découverte Portfolio : même domaine, thèmes distincts et maximum central", () => {
  const names = [
    "restaurant",
    "histoire",
    "chef",
    "carte",
    "menus",
    "boissons",
    "vins",
    "traiteur",
    "evenements",
    "reservation",
    "actualites",
    "contact",
    "cartes-cadeaux",
  ];
  const links = names.map((name) => ({
    href: `/${name}`,
    label: name,
    inNavigation: true,
  }));
  links.push(
    { href: "https://outside.example/contact", label: "Contact" },
    { href: "/mentions-legales", label: "Mentions légales" },
    { href: "/actualites/un-article", label: "Une actualité" },
    { href: "/carte?page=2", label: "Carte 2" },
    { href: "/carte.pdf", label: "PDF" },
    { href: "/carte/", label: "Carte doublon" },
    { href: "http://127.0.0.1/chef", label: "Chef" },
  );
  const pages = discoverPortfolioPages(links, "https://www.example.com/");
  assert.ok(pages.length <= MAX_PORTFOLIO_PAGES - 1);
  assert.ok(pages.some((page) => page.pageType === "menu"));
  assert.ok(pages.some((page) => page.pageType === "reservation"));
  assert.ok(
    pages.every(
      (page) =>
        !/outside|mentions|un-article|page=|\.pdf|127\.0/.test(page.url),
    ),
  );
  assert.equal(new Set(pages.map((page) => page.url)).size, pages.length);
  assert.ok(pages.filter((page) => page.pageType === "menu").length <= 2);
});

test("une page éditoriale de navigation reste éligible sans slug connu", () => {
  const pages = discoverPortfolioPages(
    [{ href: "/notre-univers", label: "Découvrir", inNavigation: true }],
    "https://example.com/",
  );
  assert.equal(pages[0].pageType, "editorial");
});

test("SSRF Portfolio : IP privées, DNS privé et redirection privée bloqués", async () => {
  await assert.rejects(publicAddress("127.0.0.1"), /non publique/);
  await assert.rejects(publicAddress("169.254.169.254"), /non publique/);
  await assert.rejects(
    publicAddress("example.com", async () => [{ address: "10.0.0.1" }]),
    /non publique/,
  );
  await assert.rejects(
    fetchPublicResource("file:///etc/passwd", { lookup: publicLookup }),
    /HTTP\(S\)/,
  );
  await assert.rejects(
    fetchPublicResource("https://example.com/private", {
      lookup: publicLookup,
      request: async () => ({
        status: 302,
        headers: { location: "http://127.0.0.1/latest/meta-data" },
        body: Buffer.alloc(0),
      }),
    }),
    /non publique/,
  );
  await assert.rejects(
    fetchPublicResource("https://other.example/menu", {
      rootHostname: "example.com",
      navigation: true,
      lookup: publicLookup,
      request: async () => ({
        status: 200,
        headers: {},
        body: Buffer.from("ok"),
      }),
    }),
    /hors du domaine/,
  );
  const iframe = await fetchPublicResource("https://widget.example/embed", {
    rootHostname: "example.com",
    navigation: true,
    allowExternalNavigation: true,
    lookup: publicLookup,
    request: async () => ({
      status: 200,
      headers: { "content-type": "text/html" },
      body: Buffer.from("public embedded content"),
    }),
  });
  assert.equal(iframe.body.toString(), "public embedded content");
  await assert.rejects(
    fetchPublicResource("https://widget.example/redirect", {
      rootHostname: "example.com",
      navigation: true,
      allowExternalNavigation: true,
      lookup: async (hostname) =>
        hostname === "127.0.0.1"
          ? [{ address: "127.0.0.1" }]
          : [{ address: "93.184.215.14" }],
      request: async () => ({
        status: 302,
        headers: { location: "http://127.0.0.1/latest/meta-data" },
        body: Buffer.alloc(0),
      }),
    }),
    /non publique/,
  );
  const requested = [];
  await fetchPublicResource("https://example.com/menu", {
    lookup: publicLookup,
    request: async (url, address) => {
      requested.push([url.href, address]);
      return {
        status: 200,
        headers: { "content-type": "text/html" },
        body: Buffer.from("ok"),
      };
    },
  });
  assert.deepEqual(requested, [["https://example.com/menu", "93.184.215.14"]]);
});

test("fetch Portfolio transmet le format accepté par Chrome sans relâcher le contrôle DNS", async () => {
  const accept = "image/avif,image/webp,image/apng,image/*,*/*;q=0.8";
  let received;
  await fetchPublicResource("https://example.com/decor.webp", {
    lookup: publicLookup,
    accept,
    request: async (_url, address, _deadline, _maxBytes, requestAccept) => {
      received = { address, requestAccept };
      return { status: 200, headers: { "content-type": "image/webp" }, body: Buffer.from("image") };
    },
  });
  assert.deepEqual(received, { address: "93.184.215.14", requestAccept: accept });
});

test("résolution Portfolio : formats DNS valides et réponses absentes rejetées proprement", async () => {
  const expectedOptions = { family: 4, all: true, verbatim: true };
  const lookup = async (hostname, options) => {
    assert.equal(hostname, "example.com");
    assert.deepEqual(options, expectedOptions);
    return [
      { address: "93.184.215.14", family: 4 },
      { address: "93.184.215.15", family: 4 },
    ];
  };
  assert.equal(await publicAddress("example.com", lookup), "93.184.215.14");
  assert.equal(await publicAddress("example.com", async () => "93.184.215.14"), "93.184.215.14");
  assert.equal(await publicAddress("example.com", async () => ({ address: "93.184.215.14", family: 4 })), "93.184.215.14");
  for (const answer of [[], undefined, [{ address: undefined, family: 4 }]]) {
    await assert.rejects(
      publicAddress("example.com", async () => answer),
      (error) => /IPv4 publique|non publique/.test(error.message) &&
        !/Invalid IP address: undefined/.test(error.message),
    );
  }
  await assert.rejects(
    publicAddress("example.com", async () => [
      { address: "93.184.215.14", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]),
    /non publique/,
  );
  await assert.rejects(
    publicAddress("example.com", async () => [{ address: "2001:4860:4860::8888", family: 6 }]),
    /non publique/,
  );
  await assert.rejects(publicAddress("2001:4860:4860::8888"), /non publique/);
  await assert.rejects(
    publicAddress("example.com", async () => { throw new Error("ENOTFOUND"); }),
    /Résolution DNS Portfolio impossible pour example.com/,
  );
});

test("lookup HTTPS épinglé : réponse liste pour all:true, scalaire sinon", () => {
  const lookup = createPinnedLookup("93.184.215.14");
  lookup("example.com", { all: true }, (error, addresses) => {
    assert.equal(error, null);
    assert.deepEqual(addresses, [{ address: "93.184.215.14", family: 4 }]);
  });
  lookup("example.com", { all: false }, (error, address, family) => {
    assert.equal(error, null);
    assert.equal(address, "93.184.215.14");
    assert.equal(family, 4);
  });
  assert.throws(() => createPinnedLookup("127.0.0.1"), /non publique/);
  assert.throws(() => createPinnedLookup(undefined), /non publique/);
});

test("capture : UA Chrome desktop identique sur HTTP/HTTPS et redirections du fetch sécurisé", async (t) => {
  const { EventEmitter } = require("node:events");
  const seen = [];
  for (const protocol of ["http", "https"]) {
    t.mock.method(require(`node:${protocol}`), "get", (url, options, callback) => {
      seen.push(options.headers["User-Agent"]);
      options.lookup(url.hostname, {}, (error, address) => {
        assert.equal(error, null);
        assert.equal(address, "93.184.215.14");
      });
      const request = new EventEmitter();
      queueMicrotask(() => {
        const response = new EventEmitter();
        response.statusCode = url.pathname === "/start" ? 302 : 200;
        response.headers = response.statusCode === 302 ? { location: "/final" } : {};
        callback(response);
        response.emit("data", Buffer.from("fixture"));
        response.emit("end");
      });
      return request;
    });
  }
  await fetchPublicResource("https://example.com/start", { lookup: publicLookup });
  await fetchPublicResource("http://example.com/image.png", { lookup: publicLookup });
  assert.deepEqual(seen, [CAPTURE_USER_AGENT, CAPTURE_USER_AGENT, CAPTURE_USER_AGENT]);
  assert.match(CAPTURE_USER_AGENT, /^Mozilla\/5\.0 .*Chrome\/145\.0\.0\.0 Safari\/537\.36$/);
  assert.doesNotMatch(CAPTURE_USER_AGENT, /HeadlessChrome|GustoDesignLab/);
});

test("capture : JS rendu, screenshot full-page, aucune soumission de réservation", async () => {
  const calls = [];
  let handler;
  let warmed = false;
  const pendingResources = [];
  let concurrentResources = 0;
  let maxConcurrentResources = 0;
  const page = {
    on() {},
    setDefaultTimeout() {},
    url: () => "https://example.com/",
    waitForTimeout: async () => {},
    goto: async () => ({ ok: () => true }),
    evaluate: async (fn) => {
      if (fn.toString().includes("highestObservedHeight")) warmed = true;
      if (fn.toString().includes("const images = [...document.images]"))
        return { total: 0, failed: 0, pending: 0 };
      return fn.toString().includes("querySelectorAll") ? [] : undefined;
    },
    screenshot: async (options) => {
      assert.equal(warmed, true);
      calls.push(options);
      return Buffer.from("image");
    },
  };
  const context = {
    route: async (_pattern, fn) => {
      handler = fn;
    },
    routeWebSocket: async () => {},
    addInitScript: async () => {},
    newPage: async () => page,
  };
  const result = await capturePortfolioSite("https://example.com/", {
    lookup: publicLookup,
    launch: async () => ({
      newContext: async (options) => {
        assert.equal(options.userAgent, CAPTURE_USER_AGENT);
        return context;
      },
      close: async () => {},
    }),
    fetchResource: async (url) => {
      if (url.includes("/queued-")) {
        concurrentResources += 1;
        maxConcurrentResources = Math.max(maxConcurrentResources, concurrentResources);
        await new Promise((resolve) => pendingResources.push(resolve));
        concurrentResources -= 1;
      }
      return { status: 200, headers: {}, body: Buffer.from("ok"), url };
    },
  });
  assert.equal(result.pages.length, 1);
  assert.equal(calls[0].fullPage, true);
  assert.equal(calls[0].type, "png");
  assert.equal(calls[0].animations, "disabled");
  let aborted = false;
  await handler({
    request: () => ({ method: () => "POST" }),
    abort: () => {
      aborted = true;
    },
  });
  assert.equal(aborted, true);
  let fulfilled;
  await handler({
    request: () => ({
      method: () => "GET",
      url: () => "https://cdn.example.com/style.css",
      isNavigationRequest: () => false,
    }),
    fulfill: (result) => { fulfilled = result; },
  });
  assert.equal(fulfilled.status, 200);
  assert.equal(fulfilled.body.toString(), "ok");
  let queuedAborts = 0;
  let queuedFulfilled = 0;
  const queued = Array.from({ length: 13 }, (_, index) =>
    handler({
      request: () => ({
        method: () => "GET",
        url: () => `https://example.com/queued-${index}.js`,
        isNavigationRequest: () => false,
      }),
      abort: () => { queuedAborts += 1; },
      fulfill: () => { queuedFulfilled += 1; },
    }),
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pendingResources.length, 12);
  assert.equal(maxConcurrentResources, 12);
  pendingResources.shift()();
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(pendingResources.length, 12);
  pendingResources.splice(0).forEach((release) => release());
  await Promise.all(queued);
  assert.equal(queuedAborts, 0);
  assert.equal(queuedFulfilled, 13);
  assert.equal(maxConcurrentResources, 12);
});

test("capture : une image rendue cassée déclenche une seule nouvelle navigation", async () => {
  let navigations = 0;
  let screenshots = 0;
  const page = {
    on() {},
    setDefaultTimeout() {},
    url: () => "https://example.com/",
    waitForTimeout: async () => {},
    goto: async () => {
      navigations += 1;
      return { ok: () => true };
    },
    evaluate: async (fn) => {
      const source = fn.toString();
      if (source.includes("const images = [...document.images]"))
        return { total: 1, failed: Number(navigations === 1), pending: 0 };
      if (source.includes("querySelectorAll")) return [];
      return undefined;
    },
    screenshot: async () => {
      screenshots += 1;
      return Buffer.from("image");
    },
  };
  const result = await capturePortfolioSite("https://example.com/", {
    lookup: publicLookup,
    launch: async () => ({
      newContext: async () => ({
        route: async () => {},
        addInitScript: async () => {},
        newPage: async () => page,
      }),
      close: async () => {},
    }),
  });
  assert.equal(navigations, 2);
  assert.equal(screenshots, 1);
  assert.equal(result.pages.length, 1);
});

test(
  "Chromium attend une grande image lente et détecte une image cassée sans attente infinie",
  { skip: !fs.existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome") },
  async () => {
    const browser = await require("playwright-core").chromium.launch({
      executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headless: true,
      args: ["--no-sandbox"],
    });
    try {
      const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
      const png = await sharp({ create: { width: 400, height: 400, channels: 3, background: "green" } }).png().toBuffer();
      await page.route("https://assets.example/slow.png", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        await route.fulfill({ status: 200, contentType: "image/png", body: png });
      });
      await page.setContent('<img src="https://assets.example/slow.png" width="400" height="400">', { waitUntil: "domcontentloaded" });
      const slow = await waitForPortfolioImages(page, Date.now() + 6000);
      assert.deepEqual(slow, { total: 1, failed: 0, pending: 0 });
      assert.equal(await page.locator("img").evaluate((image) => image.naturalWidth), 400);

      await page.route("https://assets.example/broken.png", (route) => route.fulfill({ status: 404, body: "" }));
      await page.setContent('<img src="https://assets.example/broken.png" width="400" height="400">', { waitUntil: "domcontentloaded" });
      const started = Date.now();
      const broken = await waitForPortfolioImages(page, Date.now() + 1000);
      assert.deepEqual(broken, { total: 1, failed: 1, pending: 0 });
      assert.ok(Date.now() - started < 1000);
    } finally {
      await browser.close();
    }
  },
);

test(
  "warm-up Chromium : reveal, image lazy, hauteur changeante et retour en haut",
  { skip: !fs.existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome") },
  async () => {
    const browser = await require("playwright-core").chromium.launch({
      executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headless: true,
      args: ["--no-sandbox"],
    });
    try {
      const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
      await page.setContent(`<!doctype html><html><head><style>
        #reveal { margin-top: 1600px; height: 400px; opacity: 0; transition: opacity 100ms; }
        #reveal.visible { opacity: 1; }
      </style></head><body>
        <div id="reveal"><img id="lazy" loading="lazy" width="80" height="80"
          data-src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='red'/%3E%3C/svg%3E"></div>
        <script>
          const target = document.getElementById('reveal');
          const image = document.getElementById('lazy');
          new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
              target.classList.add('visible');
              image.src = image.dataset.src;
              const extra = document.createElement('div');
              extra.id = 'extra';
              extra.style.height = '1800px';
              document.body.append(extra);
            }
          }).observe(target);
        </script></body></html>`);
      const warmed = await warmUpPortfolioPage(page, Date.now() + 15000);
      const state = await page.evaluate(() => ({
        visible: document.getElementById("reveal").classList.contains("visible"),
        opacity: getComputedStyle(document.getElementById("reveal")).opacity,
        imageComplete: document.getElementById("lazy").complete,
        imageWidth: document.getElementById("lazy").naturalWidth,
        grew: Boolean(document.getElementById("extra")),
        scrollY,
      }));
      assert.equal(state.visible, true);
      assert.equal(state.opacity, "1");
      assert.equal(state.imageComplete, true);
      assert.equal(state.imageWidth, 80);
      assert.equal(state.grew, true);
      assert.equal(state.scrollY, 0);
      assert.ok(warmed.highestObservedHeight >= 3800);
      assert.ok((await page.screenshot({ fullPage: true })).length > 0);
    } finally {
      await browser.close();
    }
  },
);

test(
  "warm-up Chromium : page courte, image cassée, sans fonts API ni IntersectionObserver",
  { skip: !fs.existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome") },
  async () => {
    const browser = await require("playwright-core").chromium.launch({
      executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headless: true,
      args: ["--no-sandbox"],
    });
    try {
      const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
      await page.setContent('<!doctype html><html><body><img src="data:image/png;base64,invalid"><p>Courte page</p></body></html>');
      await page.evaluate(() => {
        Object.defineProperty(document, "fonts", { value: undefined, configurable: true });
        window.IntersectionObserver = undefined;
      });
      const start = Date.now();
      const warmed = await warmUpPortfolioPage(page, Date.now() + 15000);
      assert.ok(Date.now() - start < 3000);
      assert.equal(warmed.steps, 1);
      assert.equal(await page.evaluate(() => scrollY), 0);
      assert.equal(await page.evaluate(() => document.images[0].naturalWidth), 0);
    } finally {
      await browser.close();
    }
  },
);

test(
  "warm-up Chromium : page très longue bornée sans infinite scroll",
  { skip: !fs.existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome") },
  async () => {
    const browser = await require("playwright-core").chromium.launch({
      executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headless: true,
      args: ["--no-sandbox"],
    });
    try {
      const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
      await page.setContent('<!doctype html><html><body style="height:150000px">Longue page</body></html>');
      const start = Date.now();
      const warmed = await warmUpPortfolioPage(page, Date.now() + 15000);
      assert.ok(Date.now() - start < 11000);
      assert.ok(warmed.steps <= 90);
      assert.ok(warmed.highestScroll <= 50000);
      assert.equal(await page.evaluate(() => scrollY), 0);
    } finally {
      await browser.close();
    }
  },
);

test(
  "Chromium rend les liens JavaScript et capture les pages entières sans POST",
  {
    skip: !fs.existsSync(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ),
  },
  async () => {
    const requested = [];
    const html = (path) =>
      `<!doctype html><html><body><main style="height:1600px"><h1>${path}</h1></main><script>if(location.pathname==='/'){const a=document.createElement('a');a.href='/carte';a.textContent='La carte';document.body.append(a);fetch('/api/reservations',{method:'POST'}).catch(()=>{});}</script></body></html>`;
    const result = await capturePortfolioSite("https://example.com/", {
      lookup: publicLookup,
      fetchResource: async (url) => {
        requested.push(url);
        return {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
          body: Buffer.from(html(new URL(url).pathname)),
          url,
        };
      },
    });
    assert.deepEqual(
      result.pages.map((page) => page.pageType),
      ["home", "menu"],
    );
    assert.ok(
      result.pages.every(
        (page) => page.buffer.subarray(1, 4).toString() === "PNG",
      ),
    );
    const dimensions = await sharp(result.pages[0].buffer).metadata();
    assert.equal(dimensions.width, 1440);
    assert.ok(dimensions.height >= 1600);
    assert.ok(requested.every((url) => !url.includes("/api/reservations")));
  },
);

test(
  "capture Portfolio : une image transparente conserve son alpha après négociation du format",
  { skip: !fs.existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome") },
  async () => {
    const transparentWebp = await sharp({
      create: { width: 100, height: 100, channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 0 } },
    }).webp().toBuffer();
    const grayJpeg = await sharp({
      create: { width: 100, height: 100, channels: 3, background: "#999999" },
    }).jpeg().toBuffer();
    let imageAccept;
    const result = await capturePortfolioSite("https://example.com/", {
      lookup: publicLookup,
      fetchResource: async (url, { accept }) => {
        if (new URL(url).pathname === "/decor.webp") {
          imageAccept = accept;
          const supportsWebp = accept?.includes("image/webp");
          return { url, status: 200,
            headers: { "content-type": supportsWebp ? "image/webp" : "image/jpeg" },
            body: supportsWebp ? transparentWebp : grayJpeg };
        }
        return { url, status: 200, headers: { "content-type": "text/html" },
          body: Buffer.from('<body style="margin:0;background:#fae6d2"><img src="/decor.webp" width="100" height="100"></body>') };
      },
    });
    assert.match(imageAccept, /image\/webp/);
    const pixel = await sharp(result.pages[0].buffer)
      .extract({ left: 10, top: 10, width: 1, height: 1 }).raw().toBuffer();
    assert.deepEqual([...pixel], [250, 230, 210]);
  },
);

test("analyse Portfolio : WebP avant upload, une analyse par page, profil et remplacement", async () => {
  const id = new mongoose.Types.ObjectId();
  const png = await sharp({
    create: { width: 300, height: 600, channels: 3, background: "#123456" },
  })
    .png()
    .toBuffer();
  const menuPng = await sharp({
    create: { width: 300, height: 600, channels: 3, background: "#abcdef" },
  })
    .png()
    .toBuffer();
  const site = new GustoPortfolioSite({
    _id: id,
    name: "A",
    url: "https://example.com/",
    pages: [],
  });
  const uploads = [];
  let analyzed = 0;
  const dependencies = {
    capture: async () => ({
      discovered: 2,
      failures: [],
      pages: [
        {
          url: "https://example.com/",
          pathname: "/",
          label: "Accueil",
          pageType: "home",
          buffer: png,
        },
        {
          url: "https://example.com/carte",
          pathname: "/carte",
          label: "Carte",
          pageType: "menu",
          buffer: menuPng,
        },
      ],
    }),
    upload: async (buffer, folder, options) => {
      uploads.push({ buffer, folder, options });
      return {
        url: `https://res.cloudinary.com/demo/image/upload/${uploads.length}.webp`,
        publicId: `${folder}/${uploads.length}`,
      };
    },
    analyze: async (_url, pageType) => {
      analyzed += 1;
      return {
        visualTags: ["éditorial", pageType],
        analysis: { composition: "grille", originality: pageType },
      };
    },
    synthesize: async (pages) => ({
      visualTags: ["éditorial"],
      concepts: [{ label: "éditorial", pageIndexes: pages.map((_, index) => index) }],
      signaturePatterns: ["éditorial"],
    }),
    destroy: async () => {},
  };
  const first = await analyzePortfolioSite(site, dependencies);
  assert.equal(first.pages.length, 2);
  assert.deepEqual(first.captureStats, { discovered: 2, failed: 0 });
  assert.equal(analyzed, 2);
  assert.deepEqual(first.visualProfile.dominantPatterns, ["éditorial"]);
  assert.deepEqual(first.visualProfile.signaturePatterns, ["éditorial"]);
  assert.ok(
    uploads.every((item) => item.buffer.toString("ascii", 8, 12) === "WEBP"),
  );
  assert.ok(
    uploads.every(
      (item) =>
        item.folder === `Gusto_Workspace/design-lab/portfolio/${id}` &&
        item.options.format === "webp",
    ),
  );
  assert.equal(first.pages[0].screenshot.height, 600);
  site.pages = first.pages;
  site.visualProfile = first.visualProfile;
  const second = await analyzePortfolioSite(site, {
    ...dependencies,
    capture: async () => ({
      discovered: 1,
      failures: [],
      pages: [
        {
          url: "https://example.com/",
          pathname: "/",
          label: "Accueil",
          pageType: "home",
          buffer: png,
        },
      ],
    }),
  });
  site.pages = second.pages;
  site.visualProfile = second.visualProfile;
  assert.equal(site.pages.length, 1);
  assert.deepEqual(site.visualProfile.signaturePatterns, ["éditorial"]);
});

test("captures visuellement identiques ne déclenchent pas deux analyses Luna", async () => {
  const png = await sharp({
    create: { width: 40, height: 80, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  let analyses = 0;
  const result = await analyzePortfolioSite(
    { _id: "id", url: "https://example.com/" },
    {
      capture: async () => ({
        pages: [
          { url: "https://example.com/", pageType: "home", buffer: png },
          {
            url: "https://example.com/alias",
            pageType: "editorial",
            buffer: png,
          },
        ],
        discovered: 2,
        failures: [],
      }),
      upload: async () => ({
        url: "https://res.cloudinary.com/demo/a.webp",
        publicId: "a",
      }),
      analyze: async () => {
        analyses += 1;
        return { visualTags: ["sobre"], analysis: {} };
      },
      synthesize: async (_pages, local) => local,
    },
  );
  assert.equal(analyses, 1);
  assert.equal(result.pages.length, 1);
});

test("échec d'une page interne non bloquant et nouvelles captures nettoyées", async () => {
  const png = await sharp({
    create: { width: 30, height: 60, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  const menuPng = await sharp({
    create: { width: 30, height: 60, channels: 3, background: "#000000" },
  })
    .png()
    .toBuffer();
  const old = { url: "https://example.com/", pageType: "home", buffer: png };
  const captures = {
    pages: [
      old,
      { url: "https://example.com/carte", pageType: "menu", buffer: menuPng },
    ],
    failures: [],
    discovered: 2,
  };
  const destroyed = [];
  let uploaded = 0;
  const dependencies = {
    capture: async () => captures,
    upload: async () => ({
      url: `https://res.cloudinary.com/demo/${++uploaded}.webp`,
      publicId: `new-${uploaded}`,
    }),
    analyze: async (_url, type) => {
      if (type === "menu") throw new Error("Analyse secondaire échouée");
      return { visualTags: ["éditorial"], analysis: { composition: "grille" } };
    },
    synthesize: async (_pages, local) => local,
    destroy: async (id) => {
      destroyed.push(id);
    },
  };
  const result = await analyzePortfolioSite(
    { _id: "id", url: "https://example.com/" },
    dependencies,
  );
  assert.equal(result.pages.length, 1);
  assert.deepEqual(destroyed, ["new-2"]);
  assert.deepEqual(result.captureStats, { discovered: 2, failed: 1 });
  await assert.rejects(
    analyzePortfolioSite(
      { _id: "id", url: "https://example.com/" },
      {
        ...dependencies,
        analyze: async () => {
          throw new Error("Homepage échouée");
        },
      },
    ),
    /Homepage échouée/,
  );
  assert.ok(destroyed.includes("new-3"));
});

test("réanalyse atomique : données remplacées puis anciennes captures supprimées", async () => {
  const site = {
    _id: "id",
    analysisStartedAt: new Date(),
    pages: [{ screenshot: { publicId: "old" } }],
  };
  const changes = [];
  const destroyed = [];
  const result = {
    pages: [{ screenshot: { publicId: "new" }, visualTags: ["nouveau"] }],
    visualProfile: { visualTags: ["nouveau"] },
    analyzedAt: new Date(),
    newImages: ["new"],
  };
  const model = {
    updateOne: async (_filter, update) => {
      changes.push(update.$set);
      return { modifiedCount: 1 };
    },
  };
  assert.equal(
    await replacePortfolioAnalysis(site, {
      analyze: async () => result,
      model,
      destroy: async (id) => {
        destroyed.push(id);
      },
    }),
    true,
  );
  assert.equal(changes[0].pages[0].visualTags[0], "nouveau");
  assert.deepEqual(destroyed, ["old"]);
  changes.length = 0;
  destroyed.length = 0;
  assert.equal(
    await replacePortfolioAnalysis(site, {
      analyze: async () => {
        throw new Error("analyse échouée");
      },
      model,
      destroy: async (id) => {
        destroyed.push(id);
      },
    }),
    false,
  );
  assert.equal(changes[0].lastError, "analyse échouée");
  assert.equal(changes[0].pages, undefined);
  assert.deepEqual(destroyed, []);
});

test("resynthèse seule : remplace le profil sans toucher aux pages ni aux captures", async () => {
  const pages = [
    { pageType: "home", visualTags: ["serif éditoriale"], analysis: { usefulPatterns: [] } },
    { pageType: "menu", visualTags: ["titres à empattements"], analysis: { usefulPatterns: [] } },
  ];
  const updates = [];
  const result = await replacePortfolioProfile(
    { _id: "id", analysisStartedAt: new Date(), pages },
    {
      synthesize: async () => ({
        visualTags: ["serif éditoriale"],
        concepts: [{ label: "Typographie serif éditoriale", pageIndexes: [0, 1] }],
        signaturePatterns: ["Typographie serif éditoriale"],
      }),
      model: { updateOne: async (_filter, update) => {
        updates.push(update.$set);
        return { modifiedCount: 1 };
      } },
    },
  );
  assert.equal(result, true);
  assert.deepEqual(updates.at(-1).visualProfile.dominantPatterns, ["Typographie serif éditoriale"]);
  assert.ok(updates.every((update) => update.pages === undefined && update.captureStats === undefined));
  assert.deepEqual(pages[0].visualTags, ["serif éditoriale"]);
});

test("échec de resynthèse : l'ancien profil et les analyses restent stockés", async () => {
  const updates = [];
  const completed = await replacePortfolioProfile(
    { _id: "id", analysisStartedAt: new Date(),
      pages: [{ pageType: "home", visualTags: ["serif"], analysis: {} }],
      visualProfile: { visualTags: ["ancien profil"] } },
    {
      synthesize: async () => { throw new Error("Luna indisponible"); },
      model: { updateOne: async (_filter, update) => {
        updates.push(update.$set);
        return { modifiedCount: 1 };
      } },
    },
  );
  assert.equal(completed, false);
  assert.equal(updates.at(-1).lastError, "Luna indisponible");
  assert.ok(updates.every((update) => update.visualProfile === undefined && update.pages === undefined));
});

test("agrégation locale et exclusion fiable du restaurant courant", () => {
  const restaurantId = new mongoose.Types.ObjectId();
  const sites = [
    {
      active: true,
      slug: "a",
      restaurantId,
      pages: [{}],
      visualProfile: {
        visualTags: ["serif", "crème"],
        signaturePatterns: ["arches"],
      },
    },
    {
      active: true,
      slug: "b",
      pages: [{}],
      visualProfile: {
        visualTags: ["serif", "photos"],
        signaturePatterns: ["arches"],
      },
    },
    {
      active: false,
      slug: "c",
      pages: [{}],
      visualProfile: { visualTags: ["brutaliste"] },
    },
  ];
  assert.equal(buildPortfolioSummary([], {}).siteCount, 0);
  const all = buildPortfolioSummary(sites, {});
  assert.equal(all.siteCount, 2);
  assert.deepEqual(
    all.frequentPatterns.find((item) => item.tag === "serif"),
    { tag: "serif", count: 2 },
  );
  assert.equal(buildPortfolioSummary(sites, { restaurantId }).siteCount, 1);
  assert.equal(buildPortfolioSummary(sites, { slug: "b" }).siteCount, 1);
  assert.equal(buildPortfolioSummary(sites, { name: "A" }).siteCount, 2);
});

test("profil global : synonymes fusionnés, support par page et motifs fonctionnels ponctuels", () => {
  const pages = [
    { visualTags: ["serif éditoriale", "titres à empattements éditoriaux", "palette crème, vert profond et cuivre"] },
    { visualTags: ["typographie serif contrastée", "palette ivoire et terre cuite", "formulaire discret"] },
    { visualTags: ["titres à empattements éditoriaux", "prix alignés en colonne", "palette ivoire, terre cuite et vert profond"] },
    { visualTags: ["serif éditoriale", "filets fins", "palette crème et cuivre"] },
    { visualTags: ["typographie serif contrastée", "formulaire à filets", "palette ivoire et terre cuite"] },
    { visualTags: ["palette crème, vert profond et cuivre"] },
  ].map((page) => ({ ...page, analysis: { usefulPatterns: [] } }));
  const before = structuredClone(pages);
  const evidence = buildPortfolioEvidence(pages);
  assert.equal(evidence.totalPages, 6);
  assert.deepEqual(evidence.observedTerms.find((item) => item.label === "serif éditoriale").pageIndexes, [0, 3]);
  const profile = finalizePortfolioProfile(pages, {
    visualTags: ["serif éditoriale", "typographie serif contrastée", "palette ivoire et terre cuite", "formulaire discret", "prix alignés"],
    concepts: [
      { label: "Typographie serif éditoriale contrastée", pageIndexes: [0, 1, 2, 3, 4] },
      { label: "Titres à empattements éditoriaux", pageIndexes: [0, 2] },
      { label: "Palette ivoire, vert profond et terre cuite", pageIndexes: [0, 1, 2, 3, 4, 5] },
      { label: "Hero photographique assombri", pageIndexes: [0, 1, 4, 5] },
      { label: "Filets fins et ornements discrets", pageIndexes: [0, 3, 4] },
      { label: "Prix alignés en colonne", pageIndexes: [2] },
      { label: "Formulaire à filets", pageIndexes: [1, 4] },
    ],
    signaturePatterns: ["Serif éditoriale", "Palette ivoire et terre cuite", "Formulaire à filets"],
  });
  assert.deepEqual(pages, before);
  assert.equal(profile.patternSupport.find((item) => item.key === "typographie:serif").pageCount, 5);
  assert.equal(profile.patternSupport.find((item) => item.key === "palette:ivoire-terre-cuite").pageCount, 6);
  assert.equal(profile.patternSupport.find((item) => item.label === "Hero photographique assombri").tier, "recurring");
  assert.ok(profile.dominantPatterns.includes("Typographie serif éditoriale contrastée"));
  assert.ok(profile.occasionalPatterns.includes("Prix alignés en colonne"));
  assert.ok(!profile.visualTags.some((tag) => /prix|formulaire/u.test(tag)));
  assert.ok(!profile.signaturePatterns.some((tag) => /formulaire/u.test(tag)));
  assert.equal(profile.visualTags.filter((tag) => visualConceptKey(tag) === "typographie:serif").length, 1);
  assert.equal(profile.visualTags.filter((tag) => visualConceptKey(tag) === "palette:ivoire-terre-cuite").length, 1);
});

test("Similarité Gusto compte les variantes visuelles une fois par site", () => {
  const sites = [
    { active: true, pages: [{}], visualProfile: { visualTags: ["serif éditoriale", "titres à empattements", "palette crème et cuivre"] } },
    { active: true, pages: [{}], visualProfile: { visualTags: ["typographie serif contrastée", "fond ivoire et accents terre cuite"] } },
  ];
  const summary = buildPortfolioSummary(sites);
  assert.equal(summary.siteCount, 2);
  assert.equal(summary.frequentPatterns.find((item) => visualConceptKey(item.tag) === "typographie:serif").count, 2);
  assert.equal(summary.frequentPatterns.find((item) => visualConceptKey(item.tag) === "palette:ivoire-terre-cuite").count, 2);
  assert.equal(summary.patternCounts.length, 2);
});

test("normalisation inter-sites et références : synonymes conservés dans leur dimension", () => {
  assert.equal(
    canonicalVisualConcept("Titres serif contrastés"),
    canonicalVisualConcept("TYPOGRAPHIE éditoriale SÉRIF contrastée"),
  );
  assert.equal(
    canonicalVisualConcept("Composition éditoriale aérée"),
    canonicalVisualConcept("Compositions éditoriales aérées"),
  );
  assert.equal(
    canonicalVisualConcept("Espaces généreux"),
    canonicalVisualConcept("Composition éditoriale aérée"),
  );
  assert.equal(canonicalVisualConcept("Composition éditoriale asymétrique et aérée"),
    "composition:asymetrie");
  assert.notEqual(
    canonicalVisualConcept("Titres blancs sur image assombrie"),
    canonicalVisualConcept("Photographie immersive assombrie"),
  );
  assert.notEqual(
    canonicalVisualConcept("Typographie serif contrastée"),
    canonicalVisualConcept("Photographie immersive assombrie"),
  );
  const sites = [
    { active: true, pages: [{}], visualProfile: { visualTags: [
      "Composition éditoriale aérée", "COMPOSITIONS ÉDITORIALES AÉRÉES",
      "Titres blancs sur image assombrie",
    ] } },
    { active: true, pages: [{}], visualProfile: { visualTags: [
      "Espaces généreux", "Photographie immersive assombrie",
    ] } },
  ];
  const summary = buildPortfolioSummary(sites);
  assert.equal(summary.patternCounts.find((item) =>
    canonicalVisualConcept(item.tag) === "rythme:respiration").count, 2);
  assert.equal(summary.patternCounts.find((item) =>
    canonicalVisualConcept(item.tag) === "composition:texte-sur-image-assombrie").count, 1);
  assert.equal(summary.patternCounts.find((item) =>
    canonicalVisualConcept(item.tag) === "photographie:assombrie").count, 1);
});

test("bonus et malus Portfolio comptent chaque concept une seule fois par référence", () => {
  const summary = { siteCount: 7, frequentPatterns: [
    { tag: "Titres serif contrastés", count: 5 },
    { tag: "Composition éditoriale aérée", count: 4 },
  ] };
  const tags = ["Typographie éditoriale SÉRIF contrastée", "titres à empattements",
    "espaces généreux", "Composition éditoriale aérée"];
  assert.equal(portfolioSimilarityAdjustment(tags, 0, summary), -3);
  assert.ok(Math.abs(portfolioSimilarityAdjustment(tags, 15, summary) + 2.1) < 1e-10);
  assert.equal(portfolioSimilarityAdjustment(tags, 50, summary), 0);
  assert.equal(portfolioSimilarityAdjustment(tags, 100, summary), 3);
  assert.equal(portfolioSimilarityAdjustment(tags.slice(0, 2), 100, summary), 1.5);
  assert.equal(portfolioSimilarityAdjustment(["Photographie immersive assombrie"], 100, summary), 0);
});

test("signatures inter-sites : fréquence avant limite, indépendamment de l'ordre Mongo", () => {
  const sites = Array.from({ length: 20 }, (_, index) => ({
    active: true,
    pages: [{}],
    visualProfile: { visualTags: [], signaturePatterns: [`Traitement propre version${index + 100}`] },
  }));
  for (const tag of ["Titres serif contrastés", "Typographie sérif", "Titres à empattements"])
    sites.push({ active: true, pages: [{}], visualProfile: { visualTags: [], signaturePatterns: [tag, tag] } });
  const forward = buildPortfolioSummary(sites).signatures;
  const reverse = buildPortfolioSummary([...sites].reverse()).signatures;
  assert.deepEqual(forward, reverse);
  assert.equal(forward.length, 20);
  assert.equal(forward[0].count, 3);
  assert.equal(canonicalVisualConcept(forward[0].tag), "typographie:serif");
});

test("synthèse Luna textuelle : concepts groupés avec indices de pages", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = global.fetch;
  process.env.OPENAI_API_KEY = "test-key";
  let body;
  global.fetch = async (_url, options) => {
    body = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({ output: [{ content: [{ type: "output_text", text: JSON.stringify({
        visualTags: ["serif éditoriale"],
        concepts: [{ label: "Typographie serif éditoriale", pageIndexes: [0, 1] }],
        typographyProfile: "Serif éditoriale",
        colorProfile: "",
        layoutProfile: "",
        photographyProfile: "",
        rhythmProfile: "",
        signaturePatterns: ["Typographie serif éditoriale"],
      }) }] }] }),
    };
  };
  try {
    const pages = [
      { pageType: "home", visualTags: ["serif éditoriale"], analysis: { usefulPatterns: [] } },
      { pageType: "menu", visualTags: ["titres à empattements"], analysis: { usefulPatterns: [] } },
    ];
    const result = await synthesizePortfolioProfile(pages, buildPortfolioEvidence(pages));
    assert.deepEqual(result.concepts[0].pageIndexes, [0, 1]);
    assert.equal(body.model, "gpt-6-luna");
    assert.ok(body.text.format.schema.required.includes("concepts"));
    assert.ok(body.text.format.schema.properties.concepts.items.required.includes("pageIndexes"));
    assert.match(body.instructions, /Regroupe les synonymes/);
    assert.deepEqual(body.input[0].content.map((item) => item.type), ["input_text"]);
    assert.deepEqual(JSON.parse(body.input[0].content[0].text).pages.map((page) => page.index), [0, 1]);
  } finally {
    global.fetch = previousFetch;
    if (previousKey) process.env.OPENAI_API_KEY = previousKey;
    else delete process.env.OPENAI_API_KEY;
  }
});

test("analyse visuelle Luna structurée et distincte de DesignReference", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = global.fetch;
  process.env.OPENAI_API_KEY = "test-key";
  let body;
  global.fetch = async (_url, options) => {
    body = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  visualTags: ["éditorial"],
                  analysis: {
                    structure: "sections",
                    hero: "photo",
                    composition: "grille",
                    rhythm: "ample",
                    typography: "serif",
                    photography: "immersive",
                    colors: "crème",
                    originality: "arches",
                    identity: "affirmée",
                    usefulPatterns: ["titres amples"],
                  },
                }),
              },
            ],
          },
        ],
      }),
    };
  };
  try {
    const result = await analyzePortfolioPage(
      "https://res.cloudinary.com/demo/image/upload/full.webp",
      "reservation",
    );
    assert.deepEqual(result.visualTags, ["éditorial"]);
    assert.equal(body.model, "gpt-6-luna");
    assert.equal(body.text.format.name, "gusto_portfolio_page");
    assert.ok(body.text.format.schema.required.includes("visualTags"));
    assert.ok(
      body.input[0].content.some(
        (item) => item.type === "input_image" && item.detail === "high",
      ),
    );
    assert.match(body.instructions, /état initial seulement/);
  } finally {
    global.fetch = previousFetch;
    if (previousKey) process.env.OPENAI_API_KEY = previousKey;
    else delete process.env.OPENAI_API_KEY;
  }
});
