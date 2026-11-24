const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), Module = require("node:module");
const modules = path.resolve(__dirname, "../../../client/node_modules"), React = require(path.join(modules, "react"));
const babel = require(path.join(modules, "@babel/core"));
const file = path.resolve(__dirname, "../../../client/src/components/_shared/callsense/callsense-context.js");

test("historique partagé : six appels, création puis suppression du client, sans modifier les appels", async () => {
  const old = { useState: React.useState, useRef: React.useRef, useEffect: React.useEffect, useCallback: React.useCallback, useContext: React.useContext, load: Module._load, window: global.window, document: global.document };
  const states = [], refs = [], effects = []; let index = 0, tasks = [], client = null, requests = 0;
  const rid = "507f1f77bcf86cd799439011", phone = "+33612345678", date = "2026-01-01T00:00:00.000Z";
  const context = { restaurantData: { _id: rid }, userConnected: { id: "owner", role: "owner" }, isAuth: true, callSenseEvents: {}, callSenseReadEvent: {}, callSenseReconnect: 0, callSenseIdentityChange: null };
  let pathname = "/dashboard/webapp/reservations/phone";
  const gets = [];
  const calls = Array.from({ length: 6 }, (_, i) => ({ id: String(i), restaurantId: rid, from: phone, match: "unknown", status: "completed", createdAt: date, updatedAt: date }));
  const axios = { get: async url => (gets.push(url), url.endsWith("unread-missed-count")) ? { data: { count: 0 } } : { data: { enabled: false, testMode: true, calls, nextCursor: null } }, post: async (_url, body) => { requests++; assert.deepEqual(body.phones, [phone]); return { data: { identities: { [phone]: client || { match: "unknown", customerId: null, customerName: "" } } } }; } };
  const changed = (a, b) => !a || !b || a.length !== b.length || a.some((value, i) => !Object.is(value, b[i]));
  React.useState = initial => { const i = index++; if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial; return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; };
  React.useRef = initial => { const i = index++; return refs[i] ||= { current: initial }; };
  React.useEffect = (fn, deps) => { const i = index++; if (!effects[i] || changed(effects[i].deps, deps)) { const previous = effects[i]; effects[i] = { deps }; tasks.push(() => { previous?.cleanup?.(); effects[i].cleanup = fn(); }); } };
  React.useCallback = (fn, deps) => { const i = index++; if (!effects[i] || changed(effects[i].deps, deps)) effects[i] = { deps, fn }; return effects[i].fn; };
  React.useContext = () => ({ restaurantContext: context });
  global.window = { addEventListener() {}, removeEventListener() {} }; global.document = { addEventListener() {}, removeEventListener() {}, visibilityState: "visible" };
  Module._load = function(request, parent, isMain) {
    if (request === "axios") return axios;
    if (request === "next/router") return { useRouter: () => ({ pathname, query: {} }) };
    if (request === "@/contexts/global.context") return { GlobalContext: {} };
    if (request === "./callsense-read-state") return { mergeCalls: (previous, incoming) => ({ ...previous, ...Object.fromEntries(incoming.map(call => [call.id, call])) }), markCallsRead: value => value };
    return old.load.call(this, request, parent, isMain);
  };
  const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
  try {
    const code = babel.transformSync(fs.readFileSync(file, "utf8"), { filename: file, babelrc: false, configFile: false, presets: [[require.resolve(path.join(modules, "next/babel")), { "preset-env": { modules: "commonjs" } }]] }).code;
    const instance = new Module(file, module); instance.filename = file; instance.paths = Module._nodeModulePaths(path.dirname(file)); instance._compile(code, file);
    const render = async () => { index = 0; tasks = []; const value = instance.exports.CallSenseProvider({ children: null }).props.value; tasks.forEach(fn => fn()); await flush(); return value; };
    pathname = "/dashboard/my-space";
    await render(); await render();
    context.userConnected = { id: "worker", role: "employee", restaurantId: rid, options: {} };
    await render();
    pathname = "/dashboard/employees";
    await render();
    context.restaurantData.options = { customers: true };
    context.userConnected = { ...context.userConnected, restaurantId: "other", options: { customers: true } };
    await render();
    assert.equal(gets.length, 0);
    pathname = "/dashboard/webapp/reservations/phone";
    context.userConnected = { id: "owner", role: "owner" };
    await render(); let value = await render(); assert.equal(value.calls.length, 6); assert.ok(value.calls.every(call => call.match === "unknown"));
    client = { match: "recognized", customerId: "client", customerName: "Léo Test" }; context.callSenseIdentityChange = { restaurantId: rid, phones: [phone] };
    await render(); value = await render(); assert.ok(value.calls.every(call => call.customerId === "client"));
    client = null; context.callSenseIdentityChange = { restaurantId: rid, phones: [phone] };
    await render(); value = await render(); assert.ok(value.calls.every(call => !call.customerId && call.match === "unknown"));
    assert.ok(value.calls.every(call => call.status === "completed" && call.createdAt === date)); assert.ok(requests >= 3);
  } finally { Object.assign(React, { useState: old.useState, useRef: old.useRef, useEffect: old.useEffect, useCallback: old.useCallback, useContext: old.useContext }); Module._load = old.load; global.window = old.window; global.document = old.document; }
});
