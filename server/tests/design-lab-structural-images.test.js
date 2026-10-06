const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const sharp = require("sharp");
const {
  fetchPublicResource,
  waitForPortfolioImages,
} = require("../services/design-lab/portfolio-capture.service");
const {
  structuralInstructions,
} = require("../services/design-lab/structural-reference.contract");
const StructuralReference = require("../models/structural-reference.model");
const {
  applyExternalEmbedPlaceholdersDOM,
} = require("../services/design-lab/capture-image-visibility");
const {
  createStructuralResourcePolicy,
  STRUCTURAL_RESOURCE_LIMITS: limits,
} = require("../services/design-lab/structural-resource-policy");
const MiB = 1024 * 1024;
const response = (url, size) => ({
  url,
  status: 200,
  headers: {},
  body: { length: size },
});
test("ressources structurelles : photo réelle de 23,6 Mo autorisée, au-delà du plafond refusé explicitement", async () => {
  const p = createStructuralResourcePolicy();
  const url = "https://public.test/photo.png";
  await p.fetch(url, "image", async () => response(url, 23594708), {});
  assert.equal(p.stats.imageBytes, 23594708);
  await assert.rejects(
    p.fetch(
      url + "?large",
      "image",
      async (_, options) => {
        assert.equal(options.maxBytes, 32 * MiB);
        throw options.budgetError(33 * MiB, options.maxBytes);
      },
      {},
    ),
    (error) =>
      error.code === "structural_media_budget_exceeded" &&
      error.resourceUrl === url + "?large" &&
      error.detectedBytes === 33 * MiB &&
      error.limitBytes === 32 * MiB &&
      error.limitKind === "resource",
  );
});
test("ressources structurelles : même URL simultanée et alias final téléchargés une seule fois", async () => {
  const p = createStructuralResourcePolicy();
  let calls = 0;
  const fetch = async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return response("https://public.test/final.jpg", 9 * MiB);
  };
  await Promise.all([
    p.fetch("https://public.test/original.jpg", "image", fetch, {}),
    p.fetch("https://public.test/original.jpg#fragment", "image", fetch, {}),
  ]);
  await p.fetch("https://public.test/final.jpg", "image", fetch, {});
  assert.equal(calls, 1);
  assert.equal(p.stats.imageBytes, 9 * MiB);
  assert.equal(p.stats.cacheHits, 2);
});
test("ressources structurelles : longue page photographique au-delà de 55 MiB, budgets cumulés bornés", async () => {
  const p = createStructuralResourcePolicy();
  for (let i = 0; i < 12; i++)
    await p.fetch(
      `https://public.test/${i}.jpg`,
      "image",
      async (url) => response(url, 10 * MiB),
      {},
    );
  assert.equal(p.stats.imageBytes, 120 * MiB);
  await assert.rejects(
    p.fetch(
      "https://public.test/excess.jpg",
      "image",
      async (url) => response(url, 10 * MiB),
      {},
    ),
    (e) =>
      e.limitKind === "images" &&
      e.limitBytes === 128 * MiB &&
      e.detectedBytes === 130 * MiB,
  );
  assert.equal(limits.total, 208 * MiB);
});
test("ressources structurelles : budget non-image séparé, trackers ignorés et contrôle pendant le flux", async () => {
  const p = createStructuralResourcePolicy();
  let calls = 0;
  assert.equal(
    await p.fetch(
      "https://www.google-analytics.com/collect",
      "fetch",
      () => {
        calls++;
      },
      {},
    ),
    null,
  );
  assert.equal(calls, 0);
  for (let i = 0; i < 10; i++)
    await p.fetch(
      `https://public.test/${i}.js`,
      "script",
      async (url) => response(url, 8 * MiB),
      {},
    );
  await assert.rejects(
    p.fetch(
      "https://public.test/extra.js",
      "script",
      () => {
        calls++;
      },
      {},
    ),
    (e) => e.limitKind === "nonImages",
  );
  await p.fetch(
    "https://public.test/visible.jpg",
    "image",
    async (url) => response(url, 10 * MiB),
    {},
  );
  assert.equal(calls, 0);
  const stream = createStructuralResourcePolicy();
  await assert.rejects(
    stream.fetch(
      "https://public.test/stream.jpg",
      "image",
      async (_, options) => {
        options.accountBytes(20 * MiB);
        options.accountBytes(13 * MiB);
        assert.fail("Le téléchargement doit être interrompu avant ce point.");
      },
      {},
    ),
    (e) =>
      e.code === "structural_media_budget_exceeded" &&
      e.limitKind === "resource",
  );
});
test("ressources structurelles : vidéo jusqu'à 32 MiB, médias cumulés bornés à 64 MiB", async () => {
  const p = createStructuralResourcePolicy();
  const hero = "https://public.test/hero.mp4";
  await p.fetch(
    hero,
    "media",
    async (url, options) => {
      assert.equal(options.maxBytes, 32 * MiB);
      return response(url, 25707129);
    },
    {},
    true,
  );
  await p.fetch(
    "https://public.test/offscreen.mp4",
    "media",
    async (url, options) => {
      assert.equal(options.maxBytes, 32 * MiB);
      return response(url, 10 * MiB);
    },
    {},
  );
  await p.fetch(
    "https://public.test/lower-page.mp4",
    "media",
    async (url) => response(url, 25 * MiB),
    {},
  );
  await assert.rejects(
    p.fetch(
      "https://public.test/extra.mp4",
      "media",
      async (url) => response(url, 8 * MiB),
      {},
    ),
    (error) =>
      error.limitKind === "mediaTotal" && error.limitBytes === 64 * MiB,
  );
  assert.equal(p.stats.mediaBytes, 25707129 + 35 * MiB);
});
test("ressources structurelles : cache/file d'attente bornés et navigation conserve sa petite limite", async () => {
  const p = createStructuralResourcePolicy({ ...limits, requests: 2 });
  await Promise.all(
    [0, 1].map((i) =>
      p.fetch(
        `https://public.test/${i}`,
        "document",
        async (url, options) => {
          assert.equal(options.maxBytes, 4 * MiB);
          return response(url, 1024);
        },
        {},
      ),
    ),
  );
  await assert.rejects(
    p.fetch(
      "https://public.test/3",
      "image",
      () => assert.fail("Aucune nouvelle requête après la limite."),
      {},
    ),
    (error) => error.limitKind === "requests",
  );
  assert.equal(p.stats.uniqueRequests, 2);
});
test("ressources structurelles : les réservations parallèles n'épuisent pas artificiellement le budget images", async () => {
  const p = createStructuralResourcePolicy();
  const completed = await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      p.fetch(
        `https://public.test/concurrent-${index}.jpg`,
        "image",
        async (url) => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return response(url, MiB);
        },
        {},
      ),
    ),
  );
  assert.equal(completed.length, 12);
  assert.equal(p.stats.imageBytes, 12 * MiB);
  assert.equal(p.stats.uniqueRequests, 12);
});
test("gate structurel : une limite réseau sur l'image visible retourne URL/taille/plafond", async () => {
  const p = createStructuralResourcePolicy();
  const url = "https://public.test/too-large.jpg";
  await p
    .fetch(
      url,
      "image",
      async (_, options) => {
        throw options.budgetError(40 * MiB, options.maxBytes);
      },
      {},
    )
    .catch(() => {});
  const page = {
    structuralResourcePolicy: p,
    evaluate: async () => [
      { url, complete: true, naturalWidth: 0, pending: false },
    ],
  };
  await assert.rejects(
    waitForPortfolioImages(page, Date.now() + 1000, { visibleOnly: true }),
    (e) =>
      e.code === "structural_media_budget_exceeded" &&
      e.resourceUrl === url &&
      e.detectedBytes === 40 * MiB,
  );
});
test("gate structurel : un iframe externe mesurable en échec garde son empreinte et n'arrête pas la capture", async () => {
  const url = "https://widget.public.test/reservations";
  const embed = {
    domain: "widget.public.test",
    networkStatus: 403,
    status: "unavailable",
    width: 705,
    height: 500,
    x: 7.5,
    y: 634.2,
    externalEmbedUnavailable: true,
  };
  const page = {
    structuralResourcePolicy: {
      failures: new Map(),
      embedFailures: new Map([[url, { url, networkStatus: 403 }]]),
    },
    evaluate: async (fn) =>
      fn.name === "applyExternalEmbedPlaceholdersDOM"
        ? [embed]
        : [],
  };
  const result = await waitForPortfolioImages(page, Date.now() + 1000, {
    visibleOnly: true,
  });
  assert.equal(result.failed, 0);
  assert.equal(result.pending, 0);
  assert.equal(page.structuralExternalEmbeds.size, 1);
  assert.deepEqual([...page.structuralExternalEmbeds.values()][0], embed);
});
test("iframe StructuralReference : le statut réseau externe reste disponible pour les métadonnées", async () => {
  await assert.rejects(
    fetchPublicResource("https://widget.public.test/reservations", {
      rootHostname: "restaurant.public.test",
      navigation: true,
      allowExternalNavigation: true,
      lookup: async () => [{ address: "8.8.8.8", family: 4 }],
      request: async (url) => ({
        status: 403,
        headers: {},
        body: Buffer.alloc(0),
        url: url.href,
      }),
    }),
    (error) =>
      error.networkStatus === 403 &&
      error.sourceUrl === "https://widget.public.test/reservations" &&
      error.resourceUrl === "https://widget.public.test/reservations",
  );
});
test("metadata d'embed indisponible est stockable et le prompt demande une lecture spatiale seule", () => {
  const reference = new StructuralReference({
    title: "Embed externe",
    slug: "embed-test",
    sourceUrl: "https://restaurant.example/",
    domain: "restaurant.example",
    localMetadata: {
      externalEmbeds: [
        {
          domain: "widget.thefork.com",
          networkStatus: 403,
          status: "unavailable",
          width: 705,
          height: 500,
          x: 7.5,
          y: 634.2,
          externalEmbedUnavailable: true,
        },
      ],
    },
  });
  assert.equal(
    reference.toObject().localMetadata.externalEmbeds[0].networkStatus,
    403,
  );
  const prompt = structuralInstructions("sampled");
  assert.match(prompt, /placeholder neutre/);
  assert.match(prompt, /analyse uniquement son rectangle comme rôle spatial/);
  assert.match(prompt, /apparence interne/);
});
test("placeholder d'embed : srcdoc neutre et dimensions CSS mesurées conservées", async () => {
  const attributes = new Map([[
    "src",
    "https://widget.thefork.com/reservations",
  ]]);
  const sized = [];
  const frame = {
    tagName: "IFRAME",
    parentElement: null,
    style: {
      setProperty: (name, value, priority) =>
        sized.push({ name, value, priority }),
    },
    getAttribute: (name) => attributes.get(name) || null,
    setAttribute: (name, value) => attributes.set(name, value),
    getBoundingClientRect: () => ({
      left: 7.5,
      top: 634.2,
      right: 712.5,
      bottom: 1134.2,
      width: 705,
      height: 500,
    }),
    closest: () => null,
  };
  const context = {
    document: {
      baseURI: "https://restaurant.test/",
      querySelectorAll: (selector) =>
        selector === "iframe" ? [frame] : [],
    },
    window: { scrollX: 0, scrollY: 0 },
    innerWidth: 1440,
    innerHeight: 900,
    URL,
    Number,
    getComputedStyle: () => ({
      display: "block",
      visibility: "visible",
      opacity: "1",
      overflowX: "visible",
      overflowY: "visible",
      width: "705px",
      height: "500px",
    }),
  };
  const source = `(${applyExternalEmbedPlaceholdersDOM.toString()})([{url:"https://widget.thefork.com/reservations",networkStatus:403}])`;
  const output = await vm.runInNewContext(source, context);
  assert.equal(frame.srcdoc.includes("background:#e9e9e9"), true);
  assert.deepEqual(sized, [
    { name: "width", value: "705px", priority: "important" },
    { name: "height", value: "500px", priority: "important" },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(output[0])), {
    domain: "widget.thefork.com",
    networkStatus: 403,
    status: "unavailable",
    width: 705,
    height: 500,
    x: 7.5,
    y: 634.2,
    viewportX: 7.5,
    viewportY: 634.2,
    externalEmbedUnavailable: true,
  });
});
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
test(
  "Chromium : visibilité réelle et sources actives du gate",
  { skip: !fs.existsSync(chrome) },
  async (t) => {
    const browser = await require("playwright-core").chromium.launch({
      executablePath: chrome,
      headless: true,
      args: ["--no-sandbox"],
    });
    const body = await sharp({
      create: { width: 300, height: 300, channels: 3, background: "blue" },
    })
      .png()
      .toBuffer();
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    await page.route("**/*", (route) =>
      route.request().url().endsWith("/valid.png")
        ? route.fulfill({ contentType: "image/png", body })
        : route.abort(),
    );
    const gate = async (html) => {
      await page.setContent(
        `<style>img{width:300px;height:300px}body{margin:0}</style>${html}`,
      );
      return waitForPortfolioImages(page, Date.now() + 1500, {
        visibleOnly: true,
      });
    };
    try {
      await t.test(
        "iframe tiers indisponible remplacé par un placeholder neutre sans changer son rectangle",
        async () => {
          const embedPage = await browser.newPage({
            viewport: { width: 1000, height: 800 },
          });
          try {
            const url = "https://widget.example.test/reservations";
            await embedPage.route(url, (route) =>
              route.fulfill({ status: 403, body: "blocked" }),
            );
            await embedPage.setContent(
              `<style>body{margin:0;background:#1646a0}iframe{display:block;width:705px;height:500px;border:0}</style><iframe src="${url}"></iframe>`,
            );
            await embedPage.waitForTimeout(100);
            const before = await embedPage.locator("iframe").evaluate((frame) => {
              const { x, y, width, height } = frame.getBoundingClientRect();
              return { x, y, width, height };
            });
            const embeds = await embedPage.evaluate(
              require("../services/design-lab/capture-image-visibility")
                .applyExternalEmbedPlaceholdersDOM,
              [{ url, networkStatus: 403 }],
            );
            const after = await embedPage.locator("iframe").evaluate((frame) => {
              const { x, y, width, height } = frame.getBoundingClientRect();
              return {
                box: { x, y, width, height },
                placeholderApplied:
                  frame.getAttribute("data-gusto-external-embed-unavailable") ===
                  "true",
              };
            });
            assert.deepEqual(after.box, before);
            assert.equal(after.placeholderApplied, true);
            assert.deepEqual(embeds, [
              {
                domain: "widget.example.test",
                networkStatus: 403,
                status: "unavailable",
                width: 705,
                height: 500,
                x: 0,
                y: 0,
                viewportX: 0,
                viewportY: 0,
                externalEmbedUnavailable: true,
              },
            ]);
            const image = await embedPage.screenshot({ type: "png" });
            const pixel = await sharp(image)
              .extract({ left: 350, top: 250, width: 1, height: 1 })
              .raw()
              .toBuffer();
            assert.deepEqual([...pixel], [233, 233, 233]);
          } finally {
            await embedPage.close();
          }
        },
      );
      for (const [name, html] of [
        [
          "src vide invisible",
          '<img src="" style="display:none" data-src="https://fixture.test/broken.png">',
        ],
        [
          "src vide rendu dans menu fermé",
          '<nav style="opacity:0"><img src="" width="300" height="300"></nav>',
        ],
        [
          "menu fermé opacity zéro",
          '<nav style="opacity:0"><img src="https://fixture.test/broken.png"></nav>',
        ],
        [
          "ancêtre invisible",
          '<div style="visibility:hidden"><img src="https://fixture.test/broken.png"></div>',
        ],
        [
          "branche de carrousel inactive",
          '<div style="opacity:0"><img src="" data-src="https://fixture.test/broken.png"></div>',
        ],
        [
          "clipping vide",
          '<div style="height:0;overflow:hidden"><img src="https://fixture.test/broken.png"></div>',
        ],
        [
          "clip-path vide",
          '<div style="clip-path:polygon(0% 0%,100% 0%,100% 0%,0% 0%)"><img src="https://fixture.test/broken.png"></div>',
        ],
        [
          "clip-path inset sans zone rendue",
          '<div style="clip-path:inset(50%)"><img src="https://fixture.test/broken.png"></div>',
        ],
        [
          "clip-path cercle nul",
          '<div style="clip-path:circle(0 at 50% 50%)"><img src="https://fixture.test/broken.png"></div>',
        ],
        [
          "pixel technique",
          '<img style="width:1px;height:1px" src="https://fixture.test/broken.png">',
        ],
        [
          "hors viewport",
          '<img style="position:absolute;top:2000px" src="https://fixture.test/broken.png">',
        ],
      ])
        await t.test(name, async () =>
          assert.deepEqual(await gate(html), {
            total: 0,
            failed: 0,
            pending: 0,
          }),
        );
      await t.test("picture : seule la source active compte", async () =>
        assert.deepEqual(
          await gate(
            '<picture><source media="(max-width:500px)" srcset="https://fixture.test/broken.png"><source media="(min-width:501px)" srcset="https://fixture.test/valid.png"><img src="https://fixture.test/broken.png"></picture>',
          ),
          { total: 1, failed: 0, pending: 0 },
        ),
      );
      await t.test("vraie image visible absente", async () =>
        assert.deepEqual(
          await gate('<img src="https://fixture.test/broken.png">'),
          { total: 1, failed: 1, pending: 0 },
        ),
      );
      await t.test(
        "src vide visible après le délai reste une image structurelle absente",
        async () => {
          const result = await gate('<img src="" width="300" height="300">');
          assert.equal(result.total, 1);
          assert.equal(result.failed, 0);
          assert.equal(result.pending, 1);
        },
      );
      await t.test(
        "source picture inactive avec fallback src vide ignorée",
        async () =>
          assert.deepEqual(
            await gate(
              '<picture><source media="(max-width:500px)" srcset="https://fixture.test/broken.png"><img src=""></picture>',
            ),
            { total: 0, failed: 0, pending: 0 },
          ),
      );
      await t.test("placeholder remplacé après lazy-load", async () =>
        assert.deepEqual(
          await gate(
            '<img id="lazy" src="" data-src="https://fixture.test/valid.png"><script>setTimeout(()=>document.getElementById("lazy").src="https://fixture.test/valid.png",200)</script>',
          ),
          { total: 1, failed: 0, pending: 0 },
        ),
      );
      await t.test("background CSS visible absent", async () =>
        assert.deepEqual(
          await gate(
            '<div style="width:300px;height:300px;background-image:url(https://fixture.test/broken.png)"></div>',
          ),
          { total: 1, failed: 1, pending: 0 },
        ),
      );
      await t.test("background CSS non rendu ignoré", async () =>
        assert.deepEqual(
          await gate(
            '<div style="opacity:0;width:300px;height:300px;background-image:url(https://fixture.test/broken.png)"></div>',
          ),
          { total: 0, failed: 0, pending: 0 },
        ),
      );
      await t.test(
        "vidéo visible sans frame ni poster => trou visuel bloquant",
        async () => {
          const result = await gate(
            '<video style="width:300px;height:300px" src="https://fixture.test/broken.mp4"></video>',
          );
          assert.equal(result.total, 1);
          assert.ok(result.failed || result.pending);
        },
      );
      await t.test(
        "vidéo inaccessible avec poster chargé => composition préservée",
        async () =>
          assert.deepEqual(
            await gate(
              '<video style="width:300px;height:300px" poster="https://fixture.test/valid.png" src="https://fixture.test/broken.mp4"></video>',
            ),
            { total: 1, failed: 0, pending: 0 },
          ),
      );
    } finally {
      await browser.close();
    }
  },
);
