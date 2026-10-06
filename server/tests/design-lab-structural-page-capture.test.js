/* global window, document, matchMedia */
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  sharp = require("sharp");
const {
  captureStructuralPage,
  coverageIsComplete,
} = require("../services/design-lab/structural-page-capture.service");
const {
  sanitizeStructuralCapture,
} = require("../services/design-lab/capture-sanitization.service");
const {
  waitForPortfolioImages,
} = require("../services/design-lab/portfolio-capture.service");
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const panels = () =>
  ["#fcaaaa", "#aaccff", "#bbffbb", "#ffee99", "#aaffee", "#ddbbff"]
    .map(
      (color, i) =>
        `<section style="height:700px;background:${color};font-size:60px">Moment ${i + 1}</section>`,
    )
    .join("");
test('Chromium : galerie RAF en perspective capturée intégralement sans relâcher la fiabilité adaptative',
 {skip:!fs.existsSync(chrome)},async()=>{
  const browser=await require('playwright-core').chromium.launch({executablePath:chrome,headless:true});
  const p=await browser.newPage({viewport:{width:1440,height:900}});
  await p.route('**/*',r=>r.abort());
  const image='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="240"><rect width="300" height="240" fill="teal"/></svg>').toString('base64');
  let diagnostic;
  try {
    await p.setContent(`<style>body{margin:0}.hero{height:900px;background:#334455;font-size:70px}.gallery{height:360px;width:100%;overflow:hidden;perspective:1200px}.track{display:flex;gap:20px;width:2000px;transform-style:preserve-3d}.track img{width:300px;height:300px;flex:none;transform:rotateY(12deg)}footer{height:740px;background:#ddddaa}</style><header class="hero">Complete structural hero</header><div class="gallery"><div class="track">${Array(6).fill(`<img src="${image}">`).join('')}</div></div><footer>Distinct footer</footer><script>let tick=0;function frame(){tick++;document.querySelector('.track').style.transform='translateX(-'+(tick%200)+'px)';requestAnimationFrame(frame)}frame()</script>`);
    const initial=await sanitizeStructuralCapture(p,Date.now()+90000);
    const result=await captureStructuralPage(p,Date.now()+90000,initial,{onDiagnostic:d=>{diagnostic=d;}});
    assert.equal(coverageIsComplete(result),true);
    assert.equal(result.captureCoverage.captureStrategy,'sampled');
    assert.equal(result.captureCoverage.totalHeight,2000);
    assert.ok(diagnostic.animationDiagnostics.some(d=>d.components[0].detectedMechanisms.includes('inline_motion_updates')));
    assert.ok(diagnostic.observations.some(o=>o.animatedComponents.length&&o.measures.unknown.length),'perspective remains unknown to adaptive collector');
    assert.equal(result.captureCoverage.observationSelection.mode,'fixed_fallback');
    assert.equal(Object.keys(result.viewBuffers).length,6);
    assert.equal(await p.locator('img').count(),6);
    assert.equal(await p.locator('[data-gusto-animated-frame],[data-gusto-animated-style]').count(),0);
    assert.ok(diagnostic.observations.some(o=>o.position===1100));
  } finally {await browser.close();}
 });
test("Chromium : fallback fixe inchangé et contrôles persistants dédupliqués uniquement dans les locales",{skip:!fs.existsSync(chrome)},async()=>{
  const browser=await require('playwright-core').chromium.launch({executablePath:chrome,headless:true});
  const p=await browser.newPage({viewport:{width:1440,height:900}});
  await p.route('**/*',r=>r.abort());
  let diagnostic;
  try {
    await p.setContent(`<style>body{margin:0}header{position:fixed;top:0;left:0;width:100%;height:60px;background:#222;z-index:20}section{height:700px;background:#88bbcc}canvas{width:1440px;height:600px}#ui{position:fixed;left:0;bottom:45px;width:0;height:0;z-index:50}#ui>div{position:absolute;bottom:0;width:420px;height:250px;background:white}#moving{position:fixed;top:150px;right:0;width:100px;height:100px;background:blue}</style>
      <header>Structural navbar</header><main>${Array.from({length:6},()=>'<section><canvas width="1440" height="600"></canvas></section>').join('')}</main>
      <div id="ui"><div><h2>Persistent offer</h2><button style="visibility:visible!important">Explore</button></div></div><div id="moving"></div>
      <script>addEventListener('scroll',()=>document.querySelector('#moving').style.transform='translateX(-'+Math.min(180,Math.round(scrollY/20))+'px)')</script>`);
    const initial=await sanitizeStructuralCapture(p,Date.now()+90000);
    const result=await captureStructuralPage(p,Date.now()+90000,initial,{onDiagnostic:d=>{diagnostic=d;}});
    assert.equal(result.captureCoverage.captureStrategy,'sampled');
    assert.equal(result.captureCoverage.observationSelection.mode,'fixed_fallback');
    assert.equal(result.captureCoverage.positions.length,5);
    assert.deepEqual(result.captureCoverage.positions.map(v=>v.position),[0,660,1650,2640,3300]);
    const layer=diagnostic.persistentPresentation.find(l=>l.deduplicationEligible);
    assert.ok(layer); assert.equal(layer.suppressedObservationIds.length,4);
    assert.equal(layer.representativeObservationId,diagnostic.localViews[0].id);
    assert.equal(layer.occurrences[0].rect.height,250);
    for(const view of diagnostic.localViews.slice(1)){
      const pixel=await sharp(view.buffer).extract({left:100,top:700,width:1,height:1}).removeAlpha().raw().toBuffer();
      assert.deepEqual([...pixel],[136,187,204]);
      const raw=diagnostic.observations.find(v=>v.id===view.id);
      const original=await sharp(raw.buffer).extract({left:100,top:700,width:1,height:1}).removeAlpha().raw().toBuffer();
      assert.deepEqual([...original],[255,255,255]);
    }
    assert.equal(await p.locator('#ui button').evaluate(n=>getComputedStyle(n).visibility),'visible');
    assert.equal(await p.locator('header').evaluate(n=>getComputedStyle(n).visibility),'visible');
    assert.equal(coverageIsComplete(result),true);
  } finally {await browser.close();}
});
test(
  "Chromium : captures structurelles complètes, scrollers réels et popups temporaires",
  { skip: !fs.existsSync(chrome) },
  async (t) => {
    const browser = await require("playwright-core").chromium.launch({
      executablePath: chrome,
      headless: true,
      args: ["--no-sandbox"],
    });
    const page = async (content) => {
      const p = await browser.newPage({
        viewport: { width: 1440, height: 900 },
      });
      await p.route("**/*", (route) => route.abort());
      await p.setContent(
        `<style>body{margin:0}button{padding:15px}</style>${content}`,
      );
      return p;
    };
    const capture = async (p) => {
      const initial = await sanitizeStructuralCapture(p, Date.now() + 90000);
      return captureStructuralPage(p, Date.now() + 90000, initial);
    };
    try {
      await t.test(
        "images lazy internes : attendre le viewport parcouru, sans bloquer sur les images hors écran",
        async () => {
          const p = await page(
            `<style>html,body{height:100%;position:fixed;overflow:hidden;width:100%}#app{position:fixed;inset:0;overflow:auto}</style><div id="app"><main style="height:6000px">Homepage</main><img loading="lazy" width="300" height="300" src="https://fixture.test/lazy.png"></div>`,
          );
          try {
            const image = await sharp({
              create: {
                width: 300,
                height: 300,
                channels: 3,
                background: "blue",
              },
            })
              .png()
              .toBuffer();
            // Fulfilled locally; the fixture makes no network request.
            await p.route("**/lazy.png", (route) =>
              route.fulfill({ contentType: "image/png", body: image }),
            );
            const initial = await waitForPortfolioImages(p, Date.now() + 6000, {
              visibleOnly: true,
            });
            assert.equal(initial.total, 0);
            assert.equal(initial.pending, 0);
            await p
              .locator("#app")
              .evaluate((node) => node.scrollTo(0, node.scrollHeight));
            await p.waitForTimeout(250);
            const final = await waitForPortfolioImages(p, Date.now() + 6000, {
              visibleOnly: true,
            });
            assert.equal(final.total, 1);
            assert.equal(final.failed, 0);
            assert.equal(final.pending, 0);
          } finally {
            await p.close();
          }
        },
      );
      await t.test(
        "page longue native : fin réelle atteinte et cinq positions distribuées",
        async () => {
          const p = await page(
            `<header style="position:fixed;top:0;height:70px;z-index:5000">Navigation légitime</header><main>${panels()}</main>`,
          );
          try {
            const result = await capture(p);
            assert.equal(result.captureCoverage.strategy, "document");
            assert.equal(result.captureCoverage.captureStrategy, "continuous");
            assert.equal(result.captureCoverage.totalHeight, 4200);
            assert.equal(result.captureCoverage.complete, true);
            assert.equal(result.captureCoverage.positions.length, 5);
            assert.equal(result.captureCoverage.positions[4].position, 3300);
            assert.equal((await sharp(result.buffer).metadata()).height, 4200);
            assert.equal(result.viewBuffers.visionOverview, result.buffer);
            assert.equal(result.viewBuffers.overview, undefined);
            assert.equal(
              result.captureCoverage.overviewKind,
              "optimized_full_page",
            );
            assert.equal(await p.locator("header").count(), 1);
            assert.equal(await p.evaluate(() => window.scrollY), 0);
          } finally {
            await p.close();
          }
        },
      );
      await t.test(
        "widget cookies réapparu pendant le stitch : aucune copie dans les tuiles",
        async () => {
          const p = await page(
            `<main>${panels()}</main><script>
              let repeats=0;
              addEventListener('scroll',()=>{
                if (scrollY>100 && repeats<3 && !document.querySelector('#cookie-widget')) {
                  repeats++;
                  document.body.insertAdjacentHTML('beforeend','<div id="cookie-widget" style="position:fixed;left:0;top:100px;width:170px;height:90px;z-index:99;background:#000;color:white"><span>En cliquant sur Accepter, vous acceptez les cookies statistiques.</span><button onclick="this.parentElement.remove()">Accepter</button></div>');
                }
              });
            </script>`,
          );
          try {
            const result = await capture(p);
            assert.equal(result.captureSanitization.consentDetected, true);
            assert.equal(result.captureSanitization.qualityPassed, true);
            assert.equal(await p.locator("#cookie-widget").count(), 0);
            const raw = await sharp(result.buffer)
              .raw()
              .toBuffer({ resolveWithObject: true });
            for (const y of [100, 1000, 1700, 2400]) {
              const offset = (y * raw.info.width + 10) * raw.info.channels;
              assert.ok(
                raw.data[offset] > 100,
                `widget sombre dans la tuile y=${y}`,
              );
            }
          } finally {
            await p.close();
          }
        },
      );
      await t.test(
        "animation CSS : reduced motion après warm-up et captures locales cohérentes",
        async () => {
          const p = await page(
            `<style>@keyframes drift{to{transform:translateX(200px)}}#animated{position:absolute;top:120px;left:40px;width:100px;height:100px;background:blue;animation:drift 1s infinite alternate}@media(prefers-reduced-motion:reduce){#animated{animation:none}}</style><main>${panels()}</main><div id="animated"></div>`,
          );
          try {
            const result = await capture(p);
            assert.equal(result.captureCoverage.complete, true);
            assert.equal(
              await p.evaluate(
                () => matchMedia("(prefers-reduced-motion: reduce)").matches,
              ),
              true,
            );
            assert.equal(await p.locator("#animated").count(), 1);
            assert.ok(result.viewBuffers.top.length > 0);
            assert.ok(result.viewBuffers.middle.length > 0);
          } finally {
            await p.close();
          }
        },
      );
      await t.test(
        "transform JS lié au scroll : chaque crop attend son état, storyboard sampled",
        async () => {
          const p = await page(
            `<style>#floating{position:fixed;top:140px;left:80px;width:110px;height:110px;background:#0000ff;z-index:2}</style><main>${panels()}</main><div id="floating"></div><script>
              let tick=0;
              addEventListener('scroll',()=>{
                cancelAnimationFrame(tick);
                const target=Math.min(180,Math.round(scrollY/20));
                const start=performance.now();
                function animate(now){const fraction=Math.min(1,(now-start)/180);document.querySelector('#floating').style.transform='translateX('+Math.round(target*fraction)+'px)';if(fraction<1)tick=requestAnimationFrame(animate)}
                tick=requestAnimationFrame(animate);
              });
            </script>`,
          );
          try {
            const result = await capture(p);
            assert.equal(result.captureCoverage.scrollMotionDetected, true);
            assert.equal(result.captureCoverage.captureStrategy, "sampled");
            assert.equal(
              result.captureCoverage.overviewKind,
              "structural_storyboard",
            );
            assert.equal(result.captureCoverage.complete, true);
            assert.equal(result.captureCoverage.version, 3);
            assert.equal((await sharp(result.viewBuffers.overview).metadata()).width, 720);
            assert.ok(result.captureCoverage.storyboard.panels.length > 5);
            assert.equal(coverageIsComplete(result), true);
            assert.equal(result.viewBuffers.desktop_full, undefined);
            assert.ok(result.captureCoverage.positions.length >= 1 && result.captureCoverage.positions.length <= 5);
            assert.equal(result.captureCoverage.positions[0].position, 0);
            assert.equal(result.captureCoverage.storyboard.panels.at(-1).visibleRangePx[1], 4200);
            assert.equal(
              result.captureCoverage.positions.every((item) => item.stabilized),
              true,
            );
            // The last traversal panel reaches the footer even if no local
            // footer crop has sufficient marginal gain to be selected.
            const bottom = await sharp(result.viewBuffers.overview)
              .raw()
              .toBuffer({ resolveWithObject: true });
            assert.ok(bottom.data.length > 0);
          } finally {
            await p.close();
          }
        },
      );
      await t.test(
        "cas Gucci : html/body 900px mais .app scrollable 4200px",
        async () => {
          const p = await page(
            `<style>html,body{height:100%;position:fixed;overflow:hidden;width:100%}.app{position:fixed;inset:0;overflow-y:scroll}</style><div class="app">${panels()}</div>`,
          );
          try {
            const result = await capture(p);
            assert.equal(result.localMetadata.documentHeight, 900);
            assert.equal(result.captureCoverage.strategy, "scroll_container");
            assert.equal(result.captureCoverage.totalHeight, 4200);
            assert.equal(result.captureCoverage.reachedEnd, true);
            assert.equal((await sharp(result.buffer).metadata()).height, 4200);
            assert.ok(result.captureCoverage.positions[4].position >= 3300);
            assert.equal(
              await p.locator(".app").evaluate((node) => node.scrollTop),
              0,
            );
          } finally {
            await p.close();
          }
        },
      );
      await t.test(
        "smooth scroll JS / wrapper transformé : parcours par roue réelle",
        async () => {
          const p = await page(
            `<style>html,body{height:100%;position:fixed;overflow:hidden;width:100%}#smooth{width:100%}</style><div id="smooth">${panels()}</div><script>let offset=0;addEventListener('wheel',e=>{e.preventDefault();offset=Math.max(0,Math.min(3300,offset+e.deltaY));document.getElementById('smooth').style.transform='translateY(-'+offset+'px)'},{passive:false})</script>`,
          );
          try {
            const result = await capture(p);
            assert.equal(result.captureCoverage.strategy, "smooth_scroll");
            assert.equal(result.captureCoverage.complete, true);
            assert.equal(result.captureCoverage.positions[4].position, 3300);
            assert.equal((await sharp(result.buffer).metadata()).height, 4200);
          } finally {
            await p.close();
          }
        },
      );
      await t.test(
        "lazy append : longueur recalculée avant de déclarer la fin",
        async () => {
          const p = await page(
            `<style>html,body{height:100%;position:fixed;overflow:hidden;width:100%}#app{position:fixed;inset:0;overflow:auto}</style><div id="app">${panels().slice(0, panels().indexOf('<section style="height:700px;background:#ffee99'))}</div><script>const app=document.getElementById('app');let added=false;app.addEventListener('scroll',()=>{if(!added && app.scrollTop+app.clientHeight>=app.scrollHeight-50){added=true;setTimeout(()=>app.insertAdjacentHTML('beforeend','<section style="height:1000px;background:orange">Suite lazy</section><footer style="height:1000px;background:purple">Fin réelle</footer>'),150)}})</script>`,
          );
          try {
            const result = await capture(p);
            assert.equal(result.captureCoverage.totalHeight, 4100);
            assert.equal(result.captureCoverage.complete, true);
            assert.equal(result.captureCoverage.positions[4].position, 3200);
          } finally {
            await p.close();
          }
        },
      );
      await t.test(
        "scroller interne verrouillé : incomplete_page_capture sans fausse réussite",
        async () => {
          const p = await page(
            `<style>html,body{height:100%;position:fixed;overflow:hidden;width:100%}#app{position:fixed;inset:0;overflow:auto}</style><div id="app">${panels()}</div><script>document.getElementById('app').scrollTo=()=>{}</script>`,
          );
          try {
            await assert.rejects(
              capture(p),
              (error) =>
                error.code === "incomplete_page_capture" &&
                !error.captureCoverage.complete,
            );
          } finally {
            await p.close();
          }
        },
      );
      await t.test(
        "vues identiques malgré changement de scrollTop : quality gate refuse",
        async () => {
          const p = await page(
            `<main style="height:4200px;background:green"></main>`,
          );
          try {
            await assert.rejects(
              capture(p),
              (error) =>
                error.code === "incomplete_page_capture" &&
                /identiques/.test(error.message),
            );
          } finally {
            await p.close();
          }
        },
      );
      await t.test(
        "Gucci modal-news petite et sans backdrop : fermeture via bouton iconique",
        async () => {
          const p = await page(
            `<main>${panels()}</main><div class="modal-news" style="position:fixed;right:20px;bottom:20px;width:270px;height:235px;background:black;color:white;z-index:99"><p>Announcement: special event</p><button class="modal-news__close" onclick="this.parentElement.remove()">×</button></div>`,
          );
          try {
            const { captureSanitization: trace } =
              await sanitizeStructuralCapture(p, Date.now() + 20000);
            assert.equal(trace.popupDetected, true);
            assert.equal(trace.popupDismissed, true);
            assert.ok(
              trace.popupActions.some(
                (action) => action.method === "click" && action.success,
              ),
            );
            assert.equal(await p.locator(".modal-news").count(), 0);
            assert.equal(await p.locator("section").count(), 6);
          } finally {
            await p.close();
          }
        },
      );
      await t.test("popup fermée par Escape", async () => {
        const p = await page(
          `<main>${panels()}</main><div role="dialog" id="notice" style="position:fixed;top:20%;left:20%;width:60%;height:50%;z-index:99;background:black;color:white">Event announcement</div><script>addEventListener('keydown',e=>{if(e.key==='Escape')document.getElementById('notice')?.remove()})</script>`,
        );
        try {
          const { captureSanitization: trace } =
            await sanitizeStructuralCapture(p, Date.now() + 20000);
          assert.ok(
            trace.popupActions.some(
              (action) => action.method === "escape" && action.success,
            ),
          );
          assert.equal(trace.qualityPassed, true);
        } finally {
          await p.close();
        }
      });
      await t.test(
        "cookies + popup : diagnostics distincts et aucun CTA réel retiré",
        async () => {
          const p = await page(
            `<main>${panels()}<a id="real-cta">Discover more</a></main><div id="cookie-banner" role="dialog" style="position:fixed;top:10%;left:10%;width:80%;height:50%;z-index:200;background:white"><p>We use cookies</p><button onclick="this.parentElement.remove()">Accept all</button></div><div role="dialog" id="announcement" style="position:fixed;top:20%;left:20%;width:60%;height:50%;z-index:100;background:white"><p>Announcement</p><button onclick="this.parentElement.remove()">Close</button></div>`,
          );
          try {
            const { captureSanitization: trace } =
              await sanitizeStructuralCapture(p, Date.now() + 20000);
            assert.equal(trace.cookieOverlayDetected, true);
            assert.equal(trace.cookieOverlayDismissed, true);
            assert.equal(trace.popupDetected, true);
            assert.equal(trace.popupDismissed, true);
            assert.equal(await p.locator("#real-cta").count(), 1);
          } finally {
            await p.close();
          }
        },
      );
      await t.test(
        "popup dans un shadow DOM ouvert : fermeture normale",
        async () => {
          const p = await page(
            `<main>${panels()}</main><div id="popup-host"></div>`,
          );
          try {
            await p.evaluate(() => {
              const root = document
                .getElementById("popup-host")
                .attachShadow({ mode: "open" });
              root.innerHTML =
                '<div role="dialog" style="position:fixed;top:20%;left:20%;width:60%;height:50%;z-index:99;background:white">Announcement<button aria-label="Close" onclick="this.parentElement.remove()">×</button></div>';
            });
            const { captureSanitization: trace } =
              await sanitizeStructuralCapture(p, Date.now() + 20000);
            assert.ok(
              trace.popupActions.some(
                (action) => action.method === "click" && action.success,
              ),
            );
            assert.equal(trace.qualityPassed, true);
            assert.equal(await p.locator("section").count(), 6);
          } finally {
            await p.close();
          }
        },
      );
      await t.test(
        "popup dans iframe accessible : fallback uniquement sur le wrapper temporaire",
        async () => {
          const p = await page(
            `<main>${panels()}</main><div id="temporary-shell" style="position:fixed;inset:0;z-index:99"><iframe id="notice-frame" style="width:100%;height:100%;border:0"></iframe></div>`,
          );
          try {
            const frame = await p
              .locator("#notice-frame")
              .elementHandle()
              .then((handle) => handle.contentFrame());
            await frame.setContent(
              '<div role="dialog" style="position:fixed;inset:0;background:white;z-index:99">Announcement / special event</div>',
            );
            const { captureSanitization: trace } =
              await sanitizeStructuralCapture(p, Date.now() + 20000);
            assert.equal(trace.popupDismissed, true);
            assert.ok(
              trace.popupActions.some(
                (action) => action.method === "dom_fallback" && action.success,
              ),
            );
            assert.equal(await p.locator("#temporary-shell").count(), 0);
            assert.equal(await p.locator("section").count(), 6);
          } finally {
            await p.close();
          }
        },
      );
      await t.test(
        "popup qui se recrée : blocked_by_popup, zéro capture définitive",
        async () => {
          const p = await page(
            `<main>${panels()}</main><div role="dialog" id="promo" style="position:fixed;inset:0;background:white;z-index:100">Announcement</div><script>const obs=new MutationObserver(()=>{if(!document.getElementById('promo'))document.body.insertAdjacentHTML('beforeend','<div role="dialog" id="promo" style="position:fixed;inset:0;background:white;z-index:100">Announcement</div>')});obs.observe(document.body,{childList:true})</script>`,
          );
          try {
            await assert.rejects(
              sanitizeStructuralCapture(p, Date.now() + 20000),
              (error) =>
                error.code === "blocked_by_popup" &&
                !error.captureSanitization.qualityPassed,
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
test("réutilisation : preuve de couverture complète et version exigées", () => {
  const valid = {
    version: 2,
    captureStrategy: "continuous",
    complete: true,
    reachedEnd: true,
    distinctViews: true,
  };
  assert.equal(coverageIsComplete({ captureCoverage: valid }), true);
  for (const reference of [
    {},
    { captureCoverage: { ...valid, complete: false } },
    { captureCoverage: { ...valid, reachedEnd: false } },
    { captureCoverage: { ...valid, distinctViews: false } },
    { status: "incomplete_page_capture", captureCoverage: valid },
  ])
    assert.equal(coverageIsComplete(reference), false);
});
test("quality gate sampled : début, zones intérieures distinctes, fin et stabilité exigés", () => {
  const positions = [0, 1046, 2614, 4182, 5228].map((position, index) => ({
    role: ["top", "upper", "middle", "lower", "bottom"][index],
    position,
    progressPercent: [0, 20, 50, 80, 100][index],
    stabilized: true,
    signature: `distinct-${index}`,
  }));
  const coverage = {
    version: 2,
    captureStrategy: "sampled",
    totalHeight: 6128,
    viewportHeight: 900,
    complete: true,
    reachedEnd: true,
    distinctViews: true,
    positions,
  };
  assert.equal(coverageIsComplete({ captureCoverage: coverage }), true);
  for (const invalid of [
    { ...coverage, positions: positions.slice(1) },
    {
      ...coverage,
      positions: positions.map((item, index) =>
        index === 4 ? { ...item, position: 4800 } : item,
      ),
    },
    {
      ...coverage,
      positions: positions.map((item, index) =>
        index === 2 ? { ...item, stabilized: false } : item,
      ),
    },
    {
      ...coverage,
      positions: positions.map((item) => ({ ...item, signature: "same" })),
    },
    { ...coverage, version: 1 },
  ])
    assert.equal(coverageIsComplete({ captureCoverage: invalid }), false);
});
