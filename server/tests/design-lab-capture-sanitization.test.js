/* global window, document */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
  sanitizeStructuralCapture,
  capturesAreClean,
  inspectConsentDOM,
  inspectBlockingOverlays,
} = require("../services/design-lab/capture-sanitization.service");
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
test("frames vides ou sans viewport : inspection sûre sans nettoyage arbitraire", () => {
  const vm = require("node:vm");
  for (const globals of [
    {
      document: { body: null },
      window: { innerWidth: 1440, innerHeight: 900 },
    },
    { document: { body: {} }, window: { innerWidth: 0, innerHeight: 0 } },
  ]) {
    const consent = vm.runInNewContext(
      `(${inspectConsentDOM.toString()})({token:'test'})`,
      globals,
    );
    const blockers = vm.runInNewContext(
      `(${inspectBlockingOverlays.toString()})()`,
      globals,
    );
    assert.equal(consent.roots, 0);
    assert.equal(consent.removed, 0);
    assert.equal(blockers.length, 0);
  }
});
const fixture = (content) => `<!doctype html><html><head><style>
  body{margin:0;font-family:Arial}main{height:2100px;padding-top:100px;background:#fafafa}
  .backdrop{position:fixed;inset:0;background:#0009;z-index:1000}
  .consent{position:fixed;left:10%;top:20%;width:80%;height:55%;z-index:1001;background:white}
  button,a,[role=button]{display:inline-block;padding:20px}nav{position:sticky;top:0;height:70px;z-index:9000;background:white}
  </style></head><body><nav>Navigation du site</nav><main>Contenu réel conservé</main>${content}</body></html>`;

test(
  "Chromium : consentements, fallbacks ciblés, iframes et quality gate",
  { skip: !fs.existsSync(chrome) },
  async (t) => {
    const browser = await require("playwright-core").chromium.launch({
      executablePath: chrome,
      headless: true,
      args: ["--no-sandbox"],
    });
    try {
      const page = async (content) => {
        const p = await browser.newPage({
          viewport: { width: 1440, height: 900 },
        });
        // Fixture documents only: no website or API request is allowed.
        await p.route("**/*", (route) => route.abort());
        await p.setContent(fixture(content));
        return p;
      };
      await t.test(
        "CMP générique acceptée par clic et disparition effective du backdrop",
        async () => {
          const p = await page(
            `<div class="backdrop" id="veil"></div><div role="dialog" class="consent" id="preferences"><p>Nous utilisons des cookies pour améliorer votre expérience.</p><button onclick="document.querySelector('#preferences').remove();document.querySelector('#veil').remove()">Tout accepter</button></div>`,
          );
          try {
            const { captureSanitization: trace } =
              await sanitizeStructuralCapture(p, Date.now() + 20000);
            assert.equal(trace.consentDetected, true);
            assert.equal(trace.consentAction, "clicked");
            assert.equal(trace.consentLabel, "Tout accepter");
            assert.equal(trace.blockingOverlayDetected, false);
            assert.equal(trace.qualityPassed, true);
            assert.equal(await p.locator("#preferences,#veil").count(), 0);
            assert.equal(await p.evaluate(() => window.scrollY), 0);
          } finally {
            await p.close();
          }
        },
      );
      await t.test(
        "petit widget fixed sans backdrop : consentement cliqué quelle que soit sa surface",
        async () => {
          const p = await page(
            `<div id="tiny-widget" style="position:fixed;left:8px;top:100px;width:175px;height:100px;z-index:80;background:white;font-size:11px"><p>En cliquant sur Accepter, vous acceptez les cookies de statistiques.</p><button style="padding:0" onclick="this.parentElement.remove()">Accepter</button><a style="padding:0">Préférences</a></div>`,
          );
          try {
            const { captureSanitization: trace } =
              await sanitizeStructuralCapture(p, Date.now() + 20000);
            assert.equal(trace.consentDetected, true);
            assert.equal(trace.consentAction, "clicked");
            assert.equal(trace.qualityPassed, true);
            assert.equal(await p.locator("#tiny-widget").count(), 0);
            assert.equal(await p.locator("nav,main").count(), 2);
          } finally {
            await p.close();
          }
        },
      );
      await t.test(
        "petit widget sticky CMP : fallback ciblé sans supprimer le contenu",
        async () => {
          const p = await page(
            `<div id="cookie-widget" style="position:sticky;top:70px;width:190px;height:95px;z-index:80;background:white"><p>Cookies et statistiques</p><button disabled style="padding:0">Accept all</button></div>`,
          );
          try {
            await p
              .locator("#cookie-widget")
              .evaluate((node) =>
                document.body.insertBefore(
                  node,
                  document.querySelector("main"),
                ),
              );
            const { captureSanitization: trace } =
              await sanitizeStructuralCapture(p, Date.now() + 20000);
            assert.equal(trace.consentAction, "removed");
            assert.equal(trace.qualityPassed, true);
            assert.equal(await p.locator("#cookie-widget").count(), 0);
            assert.equal(await p.locator("nav,main").count(), 2);
          } finally {
            await p.close();
          }
        },
      );
      for (const [tag, label] of [
        ["a", "Accept all"],
        ["div", "J’accepte"],
        ["button", "Allow all cookies"],
        ["button", "Accepter et continuer"],
      ]) {
        await t.test(`acceptation via ${tag} / ${label}`, async () => {
          const p = await page(
            `<div role="dialog" class="consent" id="cookie-consent"><p>Cookie preferences</p><${tag} role="button" onclick="document.querySelector('#cookie-consent').remove()">${label}</${tag}></div>`,
          );
          try {
            const result = await sanitizeStructuralCapture(
              p,
              Date.now() + 20000,
            );
            assert.equal(result.captureSanitization.consentAction, "clicked");
            assert.equal(result.captureSanitization.qualityPassed, true);
          } finally {
            await p.close();
          }
        });
      }
      await t.test(
        "fallback CMP connue désactivée : retire uniquement CMP et backdrop associé",
        async () => {
          const p =
            await page(`<div class="backdrop onetrust-pc-dark-filter" id="cookie-mask"></div>
        <div role="dialog" class="consent" id="onetrust-banner-sdk"><p>We use cookies.</p><button disabled>Accept all</button></div>
        <aside id="utility" style="position:fixed;bottom:0;right:0;width:60px;height:60px;z-index:30">Aide</aside>
        <div role="dialog" id="newsletter" style="position:fixed;left:0;bottom:0;width:250px;height:70px;z-index:50">Newsletter privacy</div>`);
          try {
            const { captureSanitization: trace } =
              await sanitizeStructuralCapture(p, Date.now() + 20000);
            assert.equal(trace.consentAction, "removed");
            assert.equal(trace.qualityPassed, true);
            assert.equal(
              await p.locator("#onetrust-banner-sdk,#cookie-mask").count(),
              0,
            );
            assert.equal(await p.locator("#utility,main,nav").count(), 3);
          } finally {
            await p.close();
          }
        },
      );
      await t.test(
        "clic sans effet : vérifie la disparition, puis fallback générique ciblé",
        async () => {
          const p = await page(
            `<div class="backdrop" id="cookie-shadow"></div><div role="dialog" class="consent" id="preferences"><p>Cookie preferences for this website</p><button>Accept</button></div>`,
          );
          try {
            const { captureSanitization: trace } =
              await sanitizeStructuralCapture(p, Date.now() + 20000);
            assert.equal(trace.consentAction, "removed");
            assert.equal(trace.consentLabel, "Accept");
            assert.equal(trace.qualityPassed, true);
            assert.equal(await p.locator("#cookie-shadow").count(), 0);
          } finally {
            await p.close();
          }
        },
      );
      await t.test(
        "popup newsletter non-CMP : fallback ciblé, diagnostics séparés des cookies",
        async () => {
          const p = await page(
            `<div class="backdrop" id="marketing-backdrop"></div><div class="consent" role="dialog" id="newsletter"><p>Subscribe to our newsletter. Privacy policy</p><button>Subscribe</button></div>`,
          );
          try {
            const { captureSanitization: trace } =
              await sanitizeStructuralCapture(p, Date.now() + 20000);
            assert.equal(trace.consentDetected, false);
            assert.equal(trace.popupDetected, true);
            assert.equal(trace.popupDismissed, true);
            assert.equal(trace.qualityPassed, true);
            assert.equal(
              await p.locator("#newsletter,#marketing-backdrop").count(),
              0,
            );
          } finally {
            await p.close();
          }
        },
      );
      await t.test(
        "navbar sticky normale, article cookies et éléments fixed discrets : capture propre",
        async () => {
          const p = await page(
            `<article><h2>Cookie policy</h2><p>Accept our use of cookies</p></article><aside id="help" style="position:fixed;width:50px;height:50px;bottom:0;right:0;z-index:9999">?</aside>`,
          );
          try {
            const { captureSanitization: trace } =
              await sanitizeStructuralCapture(p, Date.now() + 20000);
            assert.equal(trace.consentDetected, false);
            assert.equal(trace.consentAction, "none");
            assert.equal(trace.qualityPassed, true);
            assert.equal(await p.locator("nav,article,#help").count(), 3);
          } finally {
            await p.close();
          }
        },
      );
      await t.test(
        "iframe CMP accessible : clique dans la frame sans retirer le contenu principal",
        async () => {
          const p = await page(
            `<iframe id="cmp" style="position:fixed;inset:0;width:100%;height:100%;border:0;z-index:10001"></iframe>`,
          );
          try {
            await p.locator("#cmp").evaluate((iframe) => {
              iframe.srcdoc = `<body style="margin:0"><div role="dialog" id="cookie-consent" style="position:fixed;inset:0;background:white;z-index:1001"><p>We use cookies</p><button onclick="parent.document.getElementById('cmp').remove()">Accept all</button></div></body>`;
            });
            await p.frameLocator("#cmp").locator("button").waitFor();
            const { captureSanitization: trace } =
              await sanitizeStructuralCapture(p, Date.now() + 20000);
            assert.equal(trace.consentAction, "clicked");
            assert.equal(trace.qualityPassed, true);
            assert.equal(await p.locator("main").count(), 1);
          } finally {
            await p.close();
          }
        },
      );
      await t.test(
        "fallback dans iframe CMP : retire aussi son wrapper vide et son backdrop associé",
        async () => {
          const p = await page(
            `<div id="veil" class="backdrop" style="z-index:10000"></div><div id="frame-wrapper" style="position:fixed;inset:0;z-index:10001"><iframe id="cmp" style="width:100%;height:100%;border:0"></iframe></div>`,
          );
          try {
            await p.locator("#cmp").evaluate((iframe) => {
              iframe.srcdoc = `<body style="margin:0"><div role="dialog" id="cookie-consent" style="position:fixed;inset:0;background:white;z-index:1001"><p>We use cookies</p><button disabled>Accept all</button></div></body>`;
            });
            await p.frameLocator("#cmp").locator("button").waitFor();
            const { captureSanitization: trace } =
              await sanitizeStructuralCapture(p, Date.now() + 20000);
            assert.equal(trace.consentAction, "removed");
            assert.equal(trace.qualityPassed, true);
            assert.equal(await p.locator("#frame-wrapper,#veil").count(), 0);
            assert.equal(await p.locator("main").count(), 1);
          } finally {
            await p.close();
          }
        },
      );
      await t.test(
        "un backdrop seul, sans preuve CMP, n’est jamais supprimé",
        async () => {
          const p = await page(
            `<div class="backdrop" id="unknown-layer"></div>`,
          );
          try {
            await assert.rejects(
              sanitizeStructuralCapture(p, Date.now() + 20000),
              (error) => error.code === "blocked_by_overlay",
            );
            assert.equal(await p.locator("#unknown-layer").count(), 1);
          } finally {
            await p.close();
          }
        },
      );
      await t.test(
        "lien cookies dans une modale métier : pas de fallback CMP hasardeux",
        async () => {
          const p = await page(
            `<div class="consent" role="dialog" id="booking"><p>Confirm your booking</p><a>Cookie policy</a><button>Accept</button></div>`,
          );
          try {
            const { captureSanitization: trace } =
              await sanitizeStructuralCapture(p, Date.now() + 20000);
            assert.equal(trace.consentDetected, false);
            assert.equal(trace.popupDetected, true);
            assert.equal(await p.locator("#booking").count(), 0);
          } finally {
            await p.close();
          }
        },
      );
      await t.test(
        "CMP dans un shadow DOM ouvert : clic réel et capture propre",
        async () => {
          const p = await page(`<div id="cmp-host"></div>`);
          try {
            await p.locator("#cmp-host").evaluate((node) => {
              node.attachShadow({ mode: "open" }).innerHTML =
                `<div role="dialog" id="cookie-consent" style="position:fixed;inset:0;background:white;z-index:10001"><p>We use cookies.</p><button onclick="this.getRootNode().host.remove()">Accept all</button></div>`;
            });
            const { captureSanitization: trace } =
              await sanitizeStructuralCapture(p, Date.now() + 20000);
            assert.equal(trace.consentAction, "clicked");
            assert.equal(trace.qualityPassed, true);
            assert.equal(await p.locator("#cmp-host").count(), 0);
          } finally {
            await p.close();
          }
        },
      );
      await t.test(
        "CMP réapparue après fallback : quality gate stoppe même une bannière compacte",
        async () => {
          const p =
            await page(`<div id="cookie-banner" style="position:fixed;bottom:0;width:100%;height:120px;z-index:9999"><p>We use cookies.</p><button disabled>Accept all</button></div>
        <script>const observer=new MutationObserver(()=>{if(!document.getElementById('cookie-banner')){document.body.insertAdjacentHTML('beforeend','<div id="cookie-banner" style="position:fixed;bottom:0;width:100%;height:120px;z-index:9999"><p>We use cookies.</p><button disabled>Accept all</button></div>');observer.disconnect()}});observer.observe(document.body,{childList:true})</script>`);
          try {
            await assert.rejects(
              sanitizeStructuralCapture(p, Date.now() + 20000),
              (error) =>
                error.code === "blocked_by_overlay" &&
                error.captureSanitization.blockingOverlays.some(
                  (overlay) => overlay.reason === "remaining_cmp",
                ),
            );
          } finally {
            await p.close();
          }
        },
      );
    } finally {
      await browser.close();
    }
  },
);
test("réutilisation des captures : validation explicite et version actuelle exigées", () => {
  const valid = {
    version: 3,
    sanitizedAt: new Date(),
    qualityPassed: true,
    blockingOverlayDetected: false,
  };
  assert.equal(
    capturesAreClean({ status: "analyzed", captureSanitization: valid }),
    true,
  );
  for (const reference of [
    {},
    { captureSanitization: null },
    { status: "blocked_by_overlay", captureSanitization: valid },
    { captureSanitization: { ...valid, version: 0 } },
    { captureSanitization: { ...valid, blockingOverlayDetected: true } },
    { captureSanitization: { ...valid, qualityPassed: false } },
    { captureSanitization: { ...valid, sanitizedAt: null } },
  ])
    assert.equal(capturesAreClean(reference), false);
});
