const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("next/dist/compiled/babel/core");
const packages = require("next/dist/compiled/babel-packages");

const filename = path.join(__dirname, "../src/components/_shared/callsense/callsense-read-state.js");
const compiled = babel.transformSync(fs.readFileSync(filename, "utf8"), {
  filename, babelrc: false, configFile: false,
  plugins: [packages.pluginTransformModulesCommonjs().default],
}).code;
const mod = { exports: {} };
vm.runInNewContext(`(function(module,exports){${compiled}\n})`)(mod, mod.exports);
const { mergeCalls, markCallsRead, shouldHighlightCall } = mod.exports;

test("les appels nouvellement lus restent mis en avant jusqu’à la fermeture", () => {
  const readAt = "2026-11-05T12:00:00.000Z";
  const missed = { id: "a", status: "missed", read: false, updatedAt: "2026-11-05T11:59:00.000Z" };
  const busy = { id: "b", status: "busy", read: false, updatedAt: "2026-11-05T11:59:30.000Z" };
  const oldRead = { id: "c", status: "missed", read: true, readAt: "2026-11-04T12:00:00.000Z", updatedAt: "2026-11-04T11:00:00.000Z" };
  const current = markCallsRead({ a: missed, b: busy, c: oldRead }, { readAt });
  const open = { open: true, highlightIds: ["a", "b"], highlightReadAt: readAt };
  assert.equal(current.a.read, true);
  assert.equal(shouldHighlightCall(current.a, open), true);
  assert.equal(shouldHighlightCall(current.b, open), true);
  assert.equal(shouldHighlightCall(current.c, open), false);
  assert.equal(shouldHighlightCall(current.a, { ...open, open: false, highlightIds: [], highlightReadAt: null }), false);
  assert.equal(shouldHighlightCall({ ...busy, read: true, readAt }, { ...open, highlightIds: [] }), true);
});

test("une réponse SSE ancienne ne rétablit pas l’état non lu et un nouvel appel reste non lu", () => {
  const readAt = "2026-11-05T12:00:00.000Z";
  const previous = { a: { id: "a", status: "busy", read: true, readAt, updatedAt: "2026-11-05T11:59:00.000Z" } };
  const stale = { id: "a", status: "busy", read: false, readAt: null, updatedAt: "2026-11-05T11:59:00.000Z" };
  const later = { id: "b", status: "missed", read: false, updatedAt: "2026-11-05T12:01:00.000Z" };
  const merged = mergeCalls(previous, [stale, later], readAt);
  assert.equal(merged.a.read, true);
  assert.equal(merged.b.read, false);
  assert.equal(markCallsRead(merged, { readAt }).b.read, false);
  assert.equal(shouldHighlightCall(merged.b, { open: true, highlightIds: [], highlightReadAt: readAt }), true);
});
