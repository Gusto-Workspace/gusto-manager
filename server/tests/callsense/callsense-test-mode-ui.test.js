const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), Module = require("node:module");
const modules = path.resolve(__dirname, "../../../client/node_modules");
const filename = path.resolve(__dirname, "../../../client/src/components/_shared/callsense/callsense-panel.js");
const babel = require(path.join(modules, "@babel/core"));

test("la popup et le bouton téléphone restent visibles en mode test", () => {
  const original = Module._load;
  let state = { enabled: false, testMode: true, available: true, calls: [{ id: "appel", status: "incoming" }], popups: { appel: true }, dismissed: {}, unreadMissedCount: 0 };
  Module._load = function(request, parent, isMain) {
    if (request === "./callsense-context") return { useCallSense: () => state };
    if (request === "next/router") return { useRouter: () => ({ pathname: "/dashboard/reservations" }) };
    if (request === "@/contexts/global.context") return { GlobalContext: {} };
    if (request === "./callsense-read-state") return { shouldHighlightCall: () => false };
    return original.call(this, request, parent, isMain);
  };
  try {
    const compiled = babel.transformSync(fs.readFileSync(filename, "utf8"), { filename, babelrc: false, configFile: false, presets: [[require.resolve(path.join(modules, "next/babel")), { "preset-env": { modules: "commonjs" } }]] }).code;
    const instance = new Module(filename, module); instance.filename = filename; instance.paths = Module._nodeModulePaths(path.dirname(filename)); instance._compile(compiled, filename);
    assert.ok(instance.exports.CallSenseHeaderButton());
    const panel = instance.exports.default();
    assert.ok(panel.props.children[1]);
    assert.equal(panel.props.children[1].props["aria-label"], "Appels en cours");
    state = { ...state, testMode: false, available: false };
    assert.equal(instance.exports.CallSenseHeaderButton(), null);
    assert.equal(instance.exports.default(), null);
  } finally { Module._load = original; }
});

test("menu Réservations : téléphone disponible en test, navigation et masquage sans droit", () => {
  const file = path.resolve(__dirname, "../../../client/src/components/dashboard/webapp/_shared/sidebar.webapp.js");
  const original = Module._load, React = require(path.join(modules, "react")), oldEffect = React.useEffect;
  let state = { enabled: false, testMode: true, available: true }, route = "/dashboard/webapp/reservations", destination = "";
  React.useEffect = () => {};
  Module._load = function(request, parent, isMain) {
    if (request === "@/components/_shared/callsense/callsense-context") return { useCallSense: () => state };
    if (request === "next/router") return { useRouter: () => ({ pathname: route, push: value => { destination = value; } }) };
    return original.call(this, request, parent, isMain);
  };
  const walk = node => !node || typeof node !== "object" ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(walk)];
  try {
    const compiled = babel.transformSync(fs.readFileSync(file, "utf8"), { filename: file, babelrc: false, configFile: false, presets: [[require.resolve(path.join(modules, "next/babel")), { "preset-env": { modules: "commonjs" } }]] }).code;
    const instance = new Module(file, module); instance.filename = file; instance.paths = Module._nodeModulePaths(path.dirname(file)); instance._compile(compiled, file);
    const render = () => instance.exports.default({ open: true, module: "reservations" });
    const phone = () => walk(render()).find(node => node.type === "button" && walk(node).some(child => child.props?.children === "Téléphone"));
    assert.ok(phone());
    const originalTimeout = global.setTimeout;
    try { global.setTimeout = fn => fn(); phone().props.onClick(); assert.equal(destination, "/dashboard/webapp/reservations/phone"); } finally { global.setTimeout = originalTimeout; }
    route = "/dashboard/webapp/reservations/phone"; assert.equal(phone().props["aria-current"], "page");
    state = { enabled: false, testMode: false, available: false }; assert.equal(phone(), undefined);
    state = null; assert.equal(phone(), undefined);
    state = { enabled: true, testMode: false, available: true }; assert.ok(phone());
  } finally { React.useEffect = oldEffect; Module._load = original; }
});

test("page Téléphone du pilote : mode test et erreurs distincts d'une absence de droits", () => {
  const file = path.resolve(__dirname, "../../../client/src/pages/dashboard/webapp/reservations/phone.page.js");
  const original = Module._load, React = require(path.join(modules, "react"));
  const saved = { context: React.useContext, state: React.useState };
  const restaurant = { isAuth: true, restaurantData: { _id: "507f1f77bcf86cd799439011" } };
  let phone = { enabled: false, testMode: true, available: true, loading: false };
  const History = () => null;
  React.useContext = () => ({ restaurantContext: restaurant }); React.useState = value => [value, () => {}];
  Module._load = function(request, parent, isMain) {
    if (request === "@/contexts/global.context") return { GlobalContext: {} };
    if (request === "@/components/_shared/callsense/callsense-context") return { useCallSense: () => phone };
    if (request === "@/components/_shared/callsense/callsense-panel") return { CallSenseHistory: History };
    if (request.startsWith("@/components/dashboard/webapp/_shared/")) return () => null;
    return original.call(this, request, parent, isMain);
  };
  const walk = node => !node || typeof node !== "object" ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(walk)];
  try {
    const compiled = babel.transformSync(fs.readFileSync(file, "utf8"), { filename: file, babelrc: false, configFile: false, presets: [[require.resolve(path.join(modules, "next/babel")), { "preset-env": { modules: "commonjs" } }]] }).code;
    const instance = new Module(file, module); instance.filename = file; instance.paths = Module._nodeModulePaths(path.dirname(file)); instance._compile(compiled, file);
    const render = () => walk(instance.exports.default());
    assert.ok(render().some(node => node.type === History && node.props.webapp));
    phone = { enabled: false, testMode: false, available: false, loading: false };
    assert.ok(render().some(node => typeof node.props?.children === "string" && node.props.children.includes("n’est pas disponible")));
    phone = { ...phone, error: "Impossible de charger les appels.", reload: () => {} };
    assert.ok(render().some(node => node.props?.role === "alert"));
    assert.ok(!render().some(node => typeof node.props?.children === "string" && node.props.children.includes("n’est pas disponible")));
    phone = { enabled: true, available: true }; assert.ok(render().some(node => node.type === History));
    restaurant.isAuth = false; assert.equal(instance.exports.default(), null);
  } finally { React.useContext = saved.context; React.useState = saved.state; Module._load = original; }
});

test("PWA : les lectures CallSense passent toujours par le réseau", () => {
  const file = path.resolve(__dirname, "../../../client/next.config.js"), original = Module._load;
  let options;
  Module._load = function(request, parent, isMain) {
    if (request === "next-pwa") return value => { options = value; return config => config; };
    return original.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[file]; require(file);
    const url = new URL("https://api.example/api/restaurants/abc/callsense/calls");
    const rule = options.runtimeCaching.find((entry) => typeof entry.urlPattern === "function" && entry.urlPattern({ url }));
    assert.equal(rule.handler, "NetworkOnly"); assert.equal(rule.method, "GET");
    for (const url of ["https://api.example/api/restaurants/abc/callsense/calls", "https://api.example/api/restaurants/abc/callsense/unread-missed-count"]) assert.equal(rule.urlPattern({ url: new URL(url) }), true);
    for (const path of ["/api/restaurants/abc/reservations", "/api/admin/commerciaux", "/api/commercial/me"]) {
      assert.equal(rule.urlPattern({ url: new URL(path, "https://api.example") }), true);
    }
    assert.equal(rule.urlPattern({ url: new URL("https://manager.example/dashboard/seller") }), false);
  } finally { Module._load = original; delete require.cache[file]; }
});
