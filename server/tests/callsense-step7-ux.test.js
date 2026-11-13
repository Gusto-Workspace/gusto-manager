const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), Module = require("node:module");
const modules = path.resolve(__dirname, "../../client/node_modules"), React = require(path.join(modules, "react")), babel = require(path.join(modules, "@babel/core"));
const file = path.resolve(__dirname, "../../client/src/components/dashboard/admin/restaurants/callsense-onboarding.admin.component.js");
const keys = ["terminalConnected", "operatorForwarding", "incomingTest", "outgoingTest", "callerIdTest", "popupTest", "pushTest", "customerTest", "emergencyTest", "fallbackTest", "fallbackNormalCall", "fallbackBackendOutage", "fallbackSipRinging", "fallbackBidirectionalAudio", "fallbackBackendRecovery", "fallbackHttpFailures", "missedTest"];

test("étape 7 : progression persistée, appel direct, renvoi et activation explicitement confirmée", async () => {
  const old = { state: React.useState, ref: React.useRef, effect: React.useEffect, callback: React.useCallback, load: Module._load, window: global.window };
  const values = [], refs = [], effects = []; let i = 0, queued = [], writes = 0;
  const checklist = Object.fromEntries(keys.map(key => [key, !["operatorForwarding", "outgoingTest", "emergencyTest"].includes(key)]));
  const server = { restaurant: { name: "Pilote" }, progress: { currentStep: 6 }, liveExists: true, liveManaged: true, draft: { serviceStatus: "ready_for_test", terminalType: "softphone", forwardingScenario: "direct", checklist } };
  const changed = (a, b) => !a || !b || a.length !== b.length || a.some((x, j) => !Object.is(x, b[j]));
  React.useState = x => { const n = i++; if (!(n in values)) values[n] = typeof x === "function" ? x() : x; return [values[n], v => { values[n] = typeof v === "function" ? v(values[n]) : v; }]; };
  React.useRef = x => { const n = i++; return refs[n] ||= { current: x }; };
  React.useCallback = (fn, deps) => { const n = i++; if (!effects[n] || changed(effects[n].deps, deps)) effects[n] = { deps, fn }; return effects[n].fn; };
  React.useEffect = (fn, deps) => { const n = i++; if (!effects[n] || changed(effects[n].deps, deps)) { effects[n] = { deps }; queued.push(fn); } };
  global.window = { localStorage: { getItem: () => null, setItem() {} } };
  const axios = { get: async () => ({ data: structuredClone(server) }), put: async () => ({}), post: async (url, body) => {
    if (url.endsWith("/fallback-drill/start")) { server.draft.fallbackDrill = { ...(server.draft.fallbackDrill || {}), state: "running", scenario: body.scenario, expiresAt: new Date(Date.now() + 90000).toISOString() }; return {}; }
    if (url.endsWith("/fallback-drill/stop")) { server.draft.fallbackDrill.state = "restoring"; server.draft.fallbackDrill.restoredAt = new Date().toISOString(); return {}; }
    if (url.endsWith("/fallback-drill/confirm")) { assert.equal(body.fallbackWorked, true); assert.equal(body.normalCallWorked, true); const d = server.draft.fallbackDrill; d.state = "completed"; d.results = { ...d.results, [d.scenario]: true }; return {}; }
    assert.equal(body.status, "active"); assert.equal(body.confirm, true); writes++; return {};
  } };
  Module._load = function(request, parent, isMain) { if (request === "axios") return axios; if (request.endsWith("admin-auth.utils")) return { getAdminAuthConfig: () => ({}) }; if (request.endsWith("callsense-regulatory-form.component")) return () => null; return old.load.call(this, request, parent, isMain); };
  const walk = x => !x || typeof x !== "object" ? [] : [x, ...React.Children.toArray(x.props?.children).flatMap(walk)];
  const text = node => typeof node === "string" ? node : !node || typeof node !== "object" ? "" : React.Children.toArray(node.props?.children).map(text).join(" ");
  const flush = async () => { for (let j = 0; j < 8; j++) await new Promise(resolve => setImmediate(resolve)); };
  try {
    const code = babel.transformSync(fs.readFileSync(file, "utf8"), { filename: file, babelrc: false, configFile: false, presets: [[require.resolve(path.join(modules, "next/babel")), { "preset-env": { modules: "commonjs" } }]] }).code;
    const instance = new Module(file, module); instance.filename = file; instance.paths = Module._nodeModulePaths(path.dirname(file)); instance._compile(code, file);
    const render = async () => { i = 0; queued = []; const tree = instance.exports.default({ restaurantId: "pilot" }); queued.forEach(fn => fn()); await flush(); return tree; };
    await render(); let tree = await render();
    assert.match(text(tree), /Tester les appels/); assert.match(text(tree), /Tester le secours/); assert.match(text(tree), /Activer CallSense/);
    assert.match(text(tree), /Non applicable/);
    const button = name => walk(tree).find(x => x.type === "button" && text(x).includes(name));
    assert.equal(button("Activer CallSense").props.disabled, false); assert.equal(writes, 0);
    for (const scenario of ["http", "invalid", "timeout"]) {
      const select = walk(tree).find(node => node.type === "select" && walk(node).some(child => child.type === "option" && child.props.value === "timeout"));
      select.props.onChange({ target: { value: scenario } }); tree = await render();
      button("Démarrer le test").props.onClick(); tree = await render();
      let modal = walk(tree).find(node => node.props?.role === "dialog"); walk(modal).find(node => node.type === "button" && text(node).includes("Confirmer")).props.onClick(); await flush(); tree = await render();
      assert.equal(server.draft.fallbackDrill.state, "running"); assert.equal(button("Activer CallSense").props.disabled, true);
      button("Terminer le test et rétablir Gusto").props.onClick(); await flush(); tree = await render();
      button("Confirmer les deux appels réels").props.onClick(); tree = await render();
      modal = walk(tree).find(node => node.props?.role === "dialog"); walk(modal).find(node => node.type === "button" && text(node).includes("Confirmer")).props.onClick(); await flush(); tree = await render();
      assert.equal(server.draft.fallbackDrill.results[scenario], true); assert.equal(writes, 0);
    }
    assert.equal(button("Activer CallSense").props.disabled, false);
    button("Activer CallSense").props.onClick(); tree = await render(); assert.equal(writes, 0);
    const dialog = walk(tree).find(x => x.props?.role === "dialog"); walk(dialog).find(x => x.type === "button" && text(x).includes("Confirmer")).props.onClick(); await flush(); assert.equal(writes, 1);
    server.draft.forwardingScenario = "forward"; server.draft.terminalType = "HT813";
    const diagnostics = walk(tree).find(x => x.type === "button" && text(x).includes("Vérifier l’opération Stripe")); diagnostics.props.onClick(); await flush(); tree = await render();
    assert.equal(button("Activer CallSense").props.disabled, true); assert.match(text(tree), /HT813/);
    const advanced = walk(tree).find(x => x.type === "details" && text(x).includes("Diagnostics avancés")); assert.equal(advanced.props.open, undefined);
  } finally { Object.assign(React, { useState: old.state, useRef: old.ref, useEffect: old.effect, useCallback: old.callback }); Module._load = old.load; global.window = old.window; }
});
