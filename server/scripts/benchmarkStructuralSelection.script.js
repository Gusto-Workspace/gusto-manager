// Local only. No dotenv, service orchestration, upload or model import.
const fs = require("node:fs"),
  path = require("node:path"),
  Module = require("node:module");
const load = Module._load;
const baselineOverride = process.argv[4] && process.argv[4] !== "-" ? path.resolve(process.argv[4]) : null;
Module._load = function (name, ...args) {
  if (/openai|mongoose|mongodb|cloudinary/.test(name))
    throw new Error(`Forbidden benchmark dependency: ${name}`);
  if (baselineOverride && /(?:^|\/)structural-observation-selection(?:\.js)?$/.test(name))
    return load.call(this, baselineOverride, ...args);
  return load.call(this, name, ...args);
};
for (const name of ["node:http", "node:https"]) {
  const transport = require(name),
    request = transport.request;
  transport.request = function (url, options, callback) {
    const target = new URL(url);
    if (
      /openai\.com$/.test(target.hostname) ||
      !["GET", "HEAD"].includes(options?.method || "GET")
    )
      throw new Error("Benchmark forbids paid APIs and external writes");
    return request.call(this, url, options, callback);
  };
}
const sharp = require("sharp");
const {
  capturePortfolioSite,
  CAPTURE_USER_AGENT,
  waitForPortfolioImages,
} = require("../services/design-lab/portfolio-capture.service");
const {
  sanitizeStructuralCapture,
} = require("../services/design-lab/capture-sanitization.service");
const {
  captureStructuralPage,
} = require("../services/design-lab/structural-page-capture.service");
const {
  selectStructuralObservations,
  DEFAULT_SELECTION_CONFIG,
  structuralObservationDOM,
} = require("../services/design-lab/structural-observation-selection");
const comparisonSelector = process.argv[5] ? require(path.resolve(process.argv[5])) : null;
const sites = [
  ["tastavents", "https://www.tastavents.com/"],
  ["salterra", "https://www.salterra.com/"],
  ["gucci-osteria", "https://www.gucciosteria.com/en/florence/homepage/"],
  ["amici", "https://restaurant-amici.com/"],
  ["khufus", "https://khufusbistro.com/"],
];
const root = path.resolve(
  process.argv[2] || "diagnostics/structural-selection",
);
const filter = process.argv[3];
process.env.GUSTO_PORTFOLIO_CAPTURE_ENABLED = "true";
const escape = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (s) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        s
      ],
  );
const json = (file, value) =>
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
async function webp(buffer, file, width, quality = 85) {
  await sharp(buffer)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality })
    .toFile(file);
}
async function comparisonBoard(out, fixed, selected, selection, observations) {
  const width = 1480,
    cellWidth = 720,
    cellHeight = 450,
    band = 64,
    margin = 20;
  const height =
    90 + Math.max(fixed.length, selected.length) * (cellHeight + band);
  const layers = [];
  const title = (text, x, y, w, h = band) => ({
    input: Buffer.from(
      `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><text x="12" y="28" font-family="sans-serif" font-size="18" fill="#222">${escape(text)}</text></svg>`,
    ),
    left: x,
    top: y,
  });
  layers.push(
    title(
      "ANCIEN : positions fixes 0 / 20 / 50 / 80 / 100 %",
      margin,
      0,
      cellWidth,
      90,
    ),
  );
  layers.push(
    title(
      `NOUVEAU : ${selection.mode} | ${selected.length} vues locales`,
      740,
      0,
      cellWidth,
      90,
    ),
  );
  for (const [column, views] of [fixed, selected].entries())
    for (const [i, view] of views.entries()) {
      const x = column ? 740 : margin,
        y = 90 + i * (cellHeight + band);
      layers.push({
        input: await sharp(view.buffer)
          .resize(cellWidth, cellHeight, { fit: "fill" })
          .png()
          .toBuffer(),
        left: x,
        top: y + band,
      });
      const d =
        selection.decisions.find((d) => d.id === view.id) ||
        selection.decisions.find(
          (d) => Math.abs(d.position - view.position) < 2,
        );
      const scores = d?.scores
        ? Object.entries(d.scores)
            .map(([k, v]) => `${k}=${v.toFixed(3)}`)
            .join(" ")
        : "scores non fiables";
      layers.push(
        title(
          `${view.position}-${Math.min(selection.totalHeight || Infinity, view.position + view.visibleHeight)} px | ${column ? scores : `fixe ${i + 1}`}`,
          x,
          y,
          cellWidth,
        ),
      );
    }
  await sharp({ create: { width, height, channels: 3, background: "#eee" } })
    .composite(layers)
    .png()
    .toFile(path.join(out, "observations-comparatives.png"));
  const old = await sharp(path.join(out, "ancien-storyboard.webp"))
    .resize({ width: 700 })
    .png()
    .toBuffer();
  const next = await sharp(path.join(out, "nouveau-storyboard.webp"))
    .resize({ width: 700 })
    .png()
    .toBuffer();
  const oldSize = await sharp(old).metadata(),
    newSize = await sharp(next).metadata();
  await sharp({
    create: {
      width: 1440,
      height: 60 + Math.max(oldSize.height, newSize.height),
      channels: 3,
      background: "#eee",
    },
  })
    .composite([
      title("ANCIEN STORYBOARD", 10, 0, 700, 60),
      title("NOUVEAU : PARCOURS COMPLET", 730, 0, 700, 60),
      { input: old, left: 10, top: 60 },
      { input: next, left: 730, top: 60 },
    ])
    .png()
    .toFile(path.join(out, "storyboards-comparatifs.png"));
  const rows = selection.decisions
    .map(
      (d) =>
        `<tr><td><a href="candidats/${d.id}.webp">${d.id}</a></td><td>${d.position}</td><td>${d.visibleRangePx?.join("–")}</td><td>${["L", "D", "V", "R", "G"].map((k) => d.scores?.[k]?.toFixed(4) ?? "N/A").join(" / ")}</td><td>${d.selected ? "Retenu" : "Écarté"}</td><td>${escape(d.reason)}</td><td>${d.projection?.macroScale?.toFixed(5) ?? "N/A"}</td></tr>`,
    )
    .join("");
  const card = (v, folder, i) => {
    if (folder === "candidats") folder = "nouvelles";
    return `<figure><figcaption>${v.position}–${v.position + v.visibleHeight} px</figcaption><a href="${folder}/${folder === "anciennes" ? i + 1 : v.id}.webp"><img src="${folder}/${folder === "anciennes" ? i + 1 : v.id}.webp"></a></figure>`;
  };
  fs.writeFileSync(
    path.join(out, "index.html"),
    `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Benchmark structural</title><style>body{font:15px system-ui;margin:30px;color:#222;background:#f5f5f3}h1{font-size:30px}.columns{display:grid;grid-template-columns:1fr 1fr;gap:24px}img{width:100%;height:auto}figure{margin:0 0 30px}figcaption{padding:12px;background:white}table{border-collapse:collapse;width:100%;background:white}th,td{padding:10px;border:1px solid #ccc;font-size:13px}pre{white-space:pre-wrap}a{color:#1848a0}</style><h1>Ancien / nouveau — ${escape(path.basename(out))}</h1><p>Mode : ${escape(selection.mode)}. ${selected.length} observations locales. Aucun appel OpenAI, aucune écriture Mongo/Cloudinary. Les modes continuous restent inchangés en production ; cette comparaison locale évalue leur sélection sampled hypothétique.</p><p><a href="report.json">Rapport complet, paramètres et répétabilité</a> · <a href="mesures.json">Mesures rejouables</a> · <a href="observations-comparatives.png">Planche observations PNG</a> · <a href="storyboards-comparatifs.png">Planche storyboards PNG</a></p><pre>Fallback : ${escape(selection.fallbackReasons.join(", ") || "aucun")}</pre><div class="columns"><section><h2>Ancien storyboard</h2><a href="ancien-storyboard.webp"><img src="ancien-storyboard.webp"></a><h2>Anciennes observations</h2>${fixed.map((v, i) => card(v, "anciennes", i)).join("")}</section><section><h2>Nouveau storyboard</h2><a href="nouveau-storyboard.webp"><img src="nouveau-storyboard.webp"></a><h2>Nouvelles observations</h2>${selected.map((v, i) => card(v, "candidats", i)).join("")}</section></div><h2>Tous les candidats</h2><table><thead><tr><th>Candidat / capture</th><th>Position px</th><th>Plage px</th><th>L / D / V / R / G final</th><th>Décision</th><th>Raison</th><th>s macro</th></tr></thead><tbody>${rows}</tbody></table><p>Les scores finaux sont recalculés face aux autres vues retenues. Les scores de chaque étape, échanges et dimensions projetées figurent dans report.json. N/A signifie mesure insuffisante, jamais score zéro artificiel.</p></html>`,
  );
}
async function runSite(name, url) {
  const out = path.join(root, name);
  fs.mkdirSync(path.join(out, "candidats"), { recursive: true });
  fs.mkdirSync(path.join(out, "anciennes"), { recursive: true });
  fs.mkdirSync(path.join(out, "nouvelles"), { recursive: true });
  const report = {
    name,
    url,
    userAgent: CAPTURE_USER_AGENT,
    openaiCalls: 0,
    mongoWrites: 0,
    cloudinaryWrites: 0,
    startedAt: new Date().toISOString(),
  };
  const beforeMeasures = new Map();
  console.log(`${name}: capture sécurisée locale`);
  try {
    const result = await capturePortfolioSite(url, {
      singlePage: true,
      beforeScreenshot: async (page, deadline) => {
        try {
          const sanitized = await sanitizeStructuralCapture(page, deadline);
          await page.screenshot({ path: path.join(out, "premier-viewport.png") });
          return sanitized;
        } catch (error) {
          await page.screenshot({ path: path.join(out, "capture-bloquee.png"), animations: "disabled" });
          report.blockedControls = await page.locator('button,a,[role="button"]').evaluateAll((nodes) => nodes
            .filter((n) => { const b = n.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.top < innerHeight && b.bottom > 0 && getComputedStyle(n).visibility !== 'hidden'; })
            .slice(0, 40).map((n) => ({ tag: n.tagName, label: (n.innerText || n.getAttribute('aria-label') || '').trim().slice(0, 100), href: n.getAttribute('href') })));
          throw error;
        }
      },
      capturePage: async (page, deadline, initial) => {
        const evaluate = page.evaluate.bind(page);
        const motionHistory = [];
        page.evaluate = async (fn,arg) => {
          const result = await evaluate(fn,arg);
          if (comparisonSelector && fn === structuralObservationDOM)
            beforeMeasures.set(arg.position, await evaluate(comparisonSelector.structuralObservationDOM,
              {...arg,config:comparisonSelector.DEFAULT_SELECTION_CONFIG}));
          if (fn.name === "visualMotionDOM") {
            motionHistory.push(result);
            if (motionHistory.length > 12) motionHistory.shift();
          }
          return result;
        };
        try { return await captureStructuralPage(page, deadline, initial, {
          diagnostic: true,
          selectionConfig: DEFAULT_SELECTION_CONFIG,
          onDiagnostic: async (diagnostic) => {
            const {
              input,
              selection,
              observations,
              fixedViews,
              oldStoryboard,
              storyboard,
              localViews,
              persistentPresentation,
              animationDiagnostics,
            } = diagnostic;
            json(path.join(out, "mesures.json"), input);
            const serialized = JSON.stringify(selection);
            const replays = Array.from(
              { length: 20 },
              () =>
                JSON.stringify(
                  selectStructuralObservations(
                    JSON.parse(JSON.stringify(input)),
                    selection.config,
                  ),
                ) === serialized,
            );
            report.repetition = { runs: 20, identical: replays.every(Boolean) };
            report.selection = selection;
            report.persistentPresentation = persistentPresentation || [];
            report.animationDiagnostics = animationDiagnostics || [];
            report.captureStrategy = diagnostic.captureStrategy;
            if (comparisonSelector) {
              const beforeInput = {...input,candidates:input.candidates.map(c=>({...c,measures:beforeMeasures.get(c.position)}))};
              const beforeSelection = comparisonSelector.selectStructuralObservations(beforeInput,comparisonSelector.DEFAULT_SELECTION_CONFIG);
              json(path.join(out,"mesures-avant-corrections-meme-visite.json"),beforeInput);
              report.sameVisitBefore = { selection:beforeSelection,
                positions:beforeSelection.selectedIds.map(id=>observations.find(v=>v.id===id).position),
                protocol:"same_positions_same_storyboard_original_collector_and_selector" };
            }
            report.fixedPositions = fixedViews.map((v) => v.position);
            report.newPositions = selection.selectedIds.map(
              (id) => observations.find((v) => v.id === id).position,
            );
            await webp(
              oldStoryboard,
              path.join(out, "ancien-storyboard.webp"),
              720,
              80,
            );
            await webp(
              storyboard,
              path.join(out, "nouveau-storyboard.webp"),
              720,
              80,
            );
            for (const view of observations)
              await webp(
                view.buffer,
                path.join(out, "candidats", `${view.id}.webp`),
                2000,
              );
            for (const [i, view] of fixedViews.entries())
              await webp(
                view.buffer,
                path.join(out, "anciennes", `${i + 1}.webp`),
                2000,
              );
            const selected = localViews || selection.selectedIds.map((id) =>
              observations.find((v) => v.id === id),
            );
            for (const view of selected) await webp(view.buffer,
              path.join(out, "nouvelles", `${view.id}.webp`),2000);
            await comparisonBoard(
              out,
              fixedViews,
              selected,
              selection,
              observations,
            );
          },
        }); } catch (error) {
          report.instabilityWitness = motionHistory;
          await page.screenshot({ path: path.join(out, "capture-bloquee.png") });
          // Inspection only: never admitted as stabilized samples or fallback.
          // Keep moving structural content intact; do not freeze or remove it.
          const frames = [];
          fs.mkdirSync(path.join(out, "parcours-non-valide"), { recursive: true });
          if (error.captureCoverage?.strategy === "document") {
            for (let step = 0, target = 0; step < 90 && Date.now() + 1500 < deadline; step++) {
              const state = await page.evaluate((target) => {
                window.scrollTo({ top: target, behavior: "instant" });
                return { position: Math.round(window.scrollY), totalHeight: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight), viewportHeight: innerHeight };
              }, target);
              if (state.totalHeight > 50000) break;
              await page.waitForTimeout(150);
              await sanitizeStructuralCapture(page, deadline, { rewarm: false });
              const images = await waitForPortfolioImages(page, deadline, { visibleOnly: true });
              if (images.failed || images.pending) break;
              const file = `parcours-non-valide/${step + 1}.png`;
              await page.screenshot({ path: path.join(out, file) });
              frames.push({ ...state, file, stabilized: false });
              if (state.position >= state.totalHeight - state.viewportHeight - 5) break;
              target = Math.min(state.totalHeight - state.viewportHeight, state.position + Math.round(state.viewportHeight * .65));
            }
          }
          report.failureSurvey = { purpose: "human_inspection_only_not_admitted_as_observations", frames,
            endReached: Boolean(frames.length && frames.at(-1).position >= frames.at(-1).totalHeight - frames.at(-1).viewportHeight - 5) };
          fs.writeFileSync(path.join(out,"index.html"), `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Capture bloquée</title><style>body{font:16px system-ui;margin:30px}img{width:100%}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:24px}</style><h1>${escape(name)} — capture non validée</h1><p>${escape(error.message)}. Aucun sample admis, scores et répétabilité du sélecteur indisponibles. Ce parcours d'inspection conserve les compositions animées ; il ne remplace pas les gates.</p><h2>Premier viewport</h2><img src="premier-viewport.png"><h2>Parcours d'inspection non stabilisé</h2><div class="grid">${frames.map((f)=>`<figure><figcaption>${f.position}–${Math.min(f.totalHeight,f.position+f.viewportHeight)} px — NON VALIDÉ</figcaption><img src="${f.file}"></figure>`).join('')}</div><a href="report.json">Rapport</a></html>`);
          throw error;
        }
      },
    });
    const page = result.pages[0];
    report.success = true;
    report.coverage = page.captureCoverage;
    report.sanitization = page.captureSanitization;
    report.resourceUsage = page.resourceUsage;
    if (report.captureStrategy === "continuous")
      await webp(
        page.buffer,
        path.join(out, "macro-continuous-production.webp"),
        720,
        80,
      );
  } catch (error) {
    report.success = false;
    report.error = {
      message: error.message,
      code: error.code,
      captureCoverage: error.captureCoverage,
      captureSanitization: error.captureSanitization,
    };
    console.error(`${name}: ${error.code || "error"}: ${error.message}`);
  }
  report.finishedAt = new Date().toISOString();
  json(path.join(out, "report.json"), report);
  console.log(
    JSON.stringify({
      name,
      success: report.success,
      mode: report.selection?.mode,
      positions: report.newPositions,
      fallback: report.selection?.fallbackReasons,
      repetition: report.repetition,
    }),
  );
  return report;
}
async function main() {
  fs.mkdirSync(root, { recursive: true });
  for (const [name, url] of sites.filter(
    ([name]) => !filter || filter === "all" || filter === name,
  ))
    await runSite(name, url);
  const reports = sites
    .map(([name]) => path.join(root, name, "report.json"))
    .filter(fs.existsSync)
    .map((file) => JSON.parse(fs.readFileSync(file)));
  json(
    path.join(root, "summary.json"),
    reports.map((r) => ({
      name: r.name,
      url: r.url,
      success: r.success,
      captureStrategy: r.captureStrategy,
      mode: r.selection?.mode,
      positions: r.newPositions,
      count: r.newPositions?.length,
      fallback: r.selection?.fallbackReasons,
      repetition: r.repetition,
      error: r.error,
    })),
  );
  fs.writeFileSync(
    path.join(root, "index.html"),
    `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Benchmark StructuralReference</title><style>body{font:18px system-ui;margin:40px;background:#f6f6f3}li{margin:20px}</style><h1>Adaptive Structural Observation Selection</h1><p>Benchmark local · 5 observations maximum + 1 storyboard · zéro OpenAI/Mongo/Cloudinary</p><ul>${reports.map((r) => `<li><a href="${r.name}/index.html">${r.name}</a> — ${r.success ? `${r.selection.mode}, ${r.newPositions.length} observations ; répétabilité ${r.repetition.identical ? "20/20" : "échec"}` : escape(r.error?.message)}</li>`).join("")}</ul><p><a href="summary.json">Résumé JSON</a></p></html>`,
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
