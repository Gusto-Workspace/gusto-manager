// Fresh product-path capture only. The boundary guards are installed before
// application imports; no application DB, upload or paid request may execute.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const envPath = path.join(__dirname, "../.env");
const env = fs.existsSync(envPath) ? require("dotenv").parse(fs.readFileSync(envPath)) : {};
for (const [key, value] of Object.entries(env))
  if (/^GUSTO_STRUCTURAL_|^GUSTO_PORTFOLIO_(CAPTURE_ENABLED|CHROME_PATH)$|^OPENAI_DESIGN_REFERENCE_ANALYSIS_MODEL$/.test(key) && process.env[key] === undefined)
    process.env[key] = value;
const forbidden = { openai: 0, mongo: 0, cloudinary: 0, externalWrites: 0 };
const block = (kind) => { forbidden[kind]++; throw new Error(`Dry-run forbids ${kind}`); };
const mongoose = require("mongoose");
mongoose.connect = () => block("mongo");
mongoose.Query.prototype.exec = () => block("mongo");
const mongodb = require("mongodb");
mongodb.MongoClient.prototype.connect = () => block("mongo");
for (const name of ["insertOne", "insertMany", "updateOne", "updateMany", "deleteOne", "deleteMany", "findOneAndUpdate", "bulkWrite"])
  mongodb.Collection.prototype[name] = () => block("mongo");
const cloudinary = require("cloudinary").v2;
for (const name of ["upload", "upload_stream", "destroy", "explicit"])
  cloudinary.uploader[name] = () => block("cloudinary");
const inspectRequest = (target, options = {}) => {
  const host = typeof target === "string" || target instanceof URL ? new URL(target).hostname
    : target?.hostname || target?.host || "";
  if (/(^|\.)openai\.com$/.test(host)) block("openai");
  if (host === "api.cloudinary.com") block("cloudinary");
  if (!["GET", "HEAD"].includes((options.method || target?.method || "GET").toUpperCase())) block("externalWrites");
};
for (const protocol of ["http", "https"]) {
  const transport = require(protocol), request = transport.request;
  transport.request = function(target, options, ...rest) {
    inspectRequest(target, typeof options === "object" ? options : {});
    return request.call(this, target, options, ...rest);
  };
}
const fetch = global.fetch;
global.fetch = (target, options) => { inspectRequest(target, options); return fetch(target, options); };
const { createStructuralService } = require("../services/design-lab/structural-reference.service");
const { MODEL_CONFIG } = require("../services/design-lab/openai.service");
const reliabilityShadow = process.argv.includes("--shadow-reliability");
const fixedPoolShadow = process.argv.includes("--shadow-fixed") || reliabilityShadow;
const shadowEnabled = process.argv.includes("--shadow") || fixedPoolShadow;
let observationTrace;
const service = createStructuralService({
  localCaptureOnly: true,
  analyze: () => block("openai"), upload: () => block("cloudinary"), destroy: () => block("cloudinary"),
  ...(shadowEnabled ? { capture: async (url, options) => {
    observationTrace = reliabilityShadow ? { reliabilityRecords: [] } : {};
    // Same capture/sanitation callbacks and settings. The opt-in recorder only
    // retains actual observations; analysis runs after service.run finishes.
    return require("../services/design-lab/portfolio-capture.service").capturePortfolioSite(url, {
      ...options, capturePage: (page, deadline, initial) => options.capturePage(page, deadline, initial, { observationTrace }),
    });
  } } : {}),
});
const sourceUrl = process.argv[2], output = process.argv[3] && path.resolve(process.argv[3]);
const count = Number(process.argv[4] || 1);
if (!sourceUrl || !output || !Number.isInteger(count) || count < 1 || count > 3 || process.argv.includes("--experimental-sequencing"))
  throw new Error("Usage: node scripts/dryRunStructuralReference.script.js <url> <output-directory> [1..3] [--shadow | --shadow-fixed | --shadow-reliability]. Le séquencement validé est désormais le défaut ; --experimental-sequencing n'est plus nécessaire ni accepté.");
const digest = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
async function writeShadow(directory, product) {
  if (!shadowEnabled) return;
  const shadow = await require("../services/design-lab/structural-observation-shadow").analyzeStructuralShadow(observationTrace || {}, product,
    { includeFixed: fixedPoolShadow, reliabilityRegistry: reliabilityShadow });
  if(reliabilityShadow) {
    fs.writeFileSync(path.join(directory,"reliability-records.json"),JSON.stringify(observationTrace.reliabilityRecords,null,2));
    fs.writeFileSync(path.join(directory,"reliability-registry.json"),JSON.stringify(shadow.report.reliabilityRegistry,null,2));
  }
  fs.writeFileSync(path.join(directory, "shadow-report.json"), JSON.stringify(shadow.report, null, 2));
  if (!shadow.storyboard) return;
  fs.writeFileSync(path.join(directory, "shadow-input.json"), JSON.stringify(shadow.input, null, 2));
  fs.writeFileSync(path.join(directory, fixedPoolShadow ? "storyboard-proposed.png" : "storyboard-phase-a.png"), shadow.storyboard.buffer);
  if (shadow.currentStoryboard) fs.writeFileSync(path.join(directory, "storyboard-current.png"), shadow.currentStoryboard.buffer);
  const sharp = require("sharp");
  for (const view of shadow.candidates)
    fs.writeFileSync(path.join(directory, `${view.id}.webp`), await sharp(view.buffer).webp({ quality: 85 }).toBuffer());
  for (const [i, view] of (observationTrace.fixedViews || []).entries())
    fs.writeFileSync(path.join(directory, `fixed-proof-${i + 1}.webp`), await sharp(view.buffer).webp({ quality: 85 }).toBuffer());
}
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const results = [];
  for (let i = 1; i <= count; i++) {
    const directory = path.join(output, `run-${i}`), startedAt = new Date().toISOString();
    fs.mkdirSync(directory, { recursive: true });
    console.log(`run-${i}: fresh product-path capture`);
    try {
      const result = await service.run(null, { dryRun: true, sourceUrl });
      const { manifest, content, schema, instructions } = result.vision;
      const request = { model: MODEL_CONFIG.referenceAnalysisModel, store: false, reasoning: { effort: "medium" },
        instructions, input: [{ role: "user", content }], text: { format: { type: "json_schema", name: "structural_reference_analysis", strict: true, schema } } };
      fs.writeFileSync(path.join(directory, "vision-request.json"), JSON.stringify(request, null, 2));
      fs.writeFileSync(path.join(directory, "manifest.json"), JSON.stringify(manifest, null, 2));
      for (const view of result.views) fs.writeFileSync(path.join(directory, `${view.type}.webp`), view.buffer);
      const summary = { run: i, sourceUrl: result.sourceUrl, startedAt, finishedAt: new Date().toISOString(),
        status: result.status, dryRun: true, stoppedBefore: result.stoppedBefore, forbidden,
        captureSanitization: result.captureSanitization, captureCoverage: result.captureCoverage,
        capturePerformance: result.capturePerformance, pipelinePerformance: result.pipelinePerformance,
        captureDiagnostics: result.captureDiagnostics,
        resourceUsage: result.resourceUsage, requestSha256: digest(Buffer.from(JSON.stringify(request))),
        views: manifest.views.map((v) => {
          const prepared = result.views.find((view) => view.type === v.id);
          return { ...v, url: "inline_prepared_webp", file: `${v.id}.webp`,
            bytes: prepared.buffer.length, sha256: digest(prepared.buffer) };
        }) };
      fs.writeFileSync(path.join(directory, "result.json"), JSON.stringify(summary, null, 2));
      results.push(summary);
      // Shadow artifacts are outside the capture budget and Vision metadata.
      // Their failure must not rewrite the product-path result.
      try { await writeShadow(directory, summary); } catch (error) {
        fs.writeFileSync(path.join(directory, "shadow-error.json"), JSON.stringify({ message: error.message, stack: error.stack }, null, 2));
        process.exitCode = 1;
      }
      console.log(JSON.stringify({ run: i, status: summary.status, version: summary.captureCoverage.version,
        strategy: summary.captureCoverage.captureStrategy, mode: summary.captureCoverage.observationSelection?.mode,
        positions: summary.captureCoverage.positions.map((p) => p.position), forbidden }));
    } catch (error) {
      const summary = { run: i, startedAt, finishedAt: new Date().toISOString(), status: "blocked", forbidden,
        error: { message: error.message, code: error.code, stack: error.stack, captureTiming: error.captureTiming,
          capturePerformance: error.capturePerformance, captureCoverage: error.captureCoverage,
          captureSanitization: error.captureSanitization, animationIntegrity: error.animationIntegrity,
          imageGateFailure:error.imageGateFailure,imageGateDiagnostics:error.imageGateDiagnostics,
          videoGateFailure:error.videoGateFailure,
          captureResourceDiagnostics:error.captureResourceDiagnostics,captureRuntime:error.captureRuntime,
          visionCleanliness:error.visionCleanliness } };
      fs.writeFileSync(path.join(directory, "result.json"), JSON.stringify(summary, null, 2));
      results.push(summary); console.log(JSON.stringify(summary));
      try { await writeShadow(directory, summary); } catch (shadowError) {
        fs.writeFileSync(path.join(directory, "shadow-error.json"), JSON.stringify({ message: shadowError.message }, null, 2));
      }
      process.exitCode = 1; break;
    }
  }
  fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
