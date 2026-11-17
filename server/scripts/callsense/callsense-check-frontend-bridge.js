// In-process component interaction against the isolated HTTP API and MongoDB Test.
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), Module = require("node:module");
const filename = path.resolve(__dirname, "../../../client/src/components/dashboard/admin/restaurants/callsense-onboarding.admin.component.js");
const modules = path.resolve(__dirname, "../../../client/node_modules");
const babel = require(path.join(modules, "@babel/core")), React = require(path.join(modules, "react"));
function walk(node, result = []) {
  if (Array.isArray(node)) { node.forEach((child) => walk(child, result)); return result; }
  if (!node || typeof node !== "object") return result;
  result.push(node); walk(node.props?.children, result); return result;
}
function label(node) { return walk(node).flatMap((part) => { const children = part.props?.children; return Array.isArray(children) ? children.filter((item) => typeof item === "string") : typeof children === "string" ? [children] : []; }).join(" "); }

async function checkFrontend(baseUrl, restaurantId, token) {
  const old = { useState: React.useState, useRef: React.useRef, useCallback: React.useCallback, useEffect: React.useEffect, load: Module._load,
    window: global.window, localStorage: global.localStorage, api: process.env.NEXT_PUBLIC_API_URL };
  const state = [], refs = [], effects = [], pending = new Set(); let index = 0, first = true;
  const storage = { getItem: () => null, setItem: () => {} };
  global.window = { localStorage: storage, confirm: () => true, prompt: () => null }; global.localStorage = storage;
  process.env.NEXT_PUBLIC_API_URL = `${baseUrl}/api`;
  function request(method, url, body) {
    const operation = fetch(url, { method, headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, ...(body ? { body: JSON.stringify(body) } : {}) })
      .then(async (response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return { data: await response.json() }; });
    pending.add(operation); operation.finally(() => pending.delete(operation)).catch(() => {}); return operation;
  }
  const axios = { get: (url) => request("GET", url), put: (url, body) => request("PUT", url, body), post: (url, body) => request("POST", url, body) };
  React.useState = (initial) => { const i = index++; if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial; return [state[i], (value) => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; };
  React.useRef = (initial) => { const i = index++; return refs[i] ||= { current: initial }; };
  React.useCallback = (fn) => fn;
  React.useEffect = (fn) => { index++; if (first) effects.push(fn); };
  Module._load = function(requestName, parent, isMain) { if (requestName === "axios") return axios; if (requestName.endsWith("admin-auth.utils")) return { getAdminAuthConfig: () => ({}) }; return old.load.call(this, requestName, parent, isMain); };
  try {
    const compiled = babel.transformSync(fs.readFileSync(filename, "utf8"), { filename, babelrc: false, configFile: false,
      presets: [[require.resolve(path.join(modules, "next/babel")), { "preset-env": { modules: "commonjs" } }]] }).code;
    const instance = new Module(filename, module); instance.filename = filename; instance.paths = Module._nodeModulePaths(path.dirname(filename)); instance._compile(compiled, filename);
    const render = () => { index = 0; const tree = instance.exports.default({ restaurantId: String(restaurantId) }); first = false; return tree; };
    const titles = ["Informations du restaurant", "Sous-compte Twilio", "Conformité réglementaire", "Numéro de téléphone", "SIP et webhooks", "Terminal et renvoi d’appel", "Tests et activation"];
    let tree = render(); effects.forEach((effect) => effect());
    await Promise.all([...pending]); await new Promise((resolve) => setImmediate(resolve)); tree = render();
    for (const [step, title] of titles.entries()) {
      const button = walk(tree).find((node) => node.type === "button" && label(node).includes(title));
      assert.ok(button); button.props.onClick();
      const queue = refs.find((ref) => ref?.current && typeof ref.current.then === "function");
      await queue.current;
      const persisted = await axios.get(`${baseUrl}/api/admin/restaurants/${restaurantId}/callsense-onboarding`);
      assert.equal(persisted.data.draft.wizardStep, step);
      tree = render();
      assert.equal(walk(tree).find((node) => node.type === "button" && label(node).includes(title)).props["aria-current"], "step");
    }
    console.log("Composant frontend : navigation des sept étapes reliée aux réponses API et à la persistance MongoDB Test.");
  } finally {
    Object.assign(React, { useState: old.useState, useRef: old.useRef, useCallback: old.useCallback, useEffect: old.useEffect }); Module._load = old.load;
    global.window = old.window; global.localStorage = old.localStorage;
    if (old.api === undefined) delete process.env.NEXT_PUBLIC_API_URL; else process.env.NEXT_PUBLIC_API_URL = old.api;
  }
}
module.exports = { checkFrontend };
