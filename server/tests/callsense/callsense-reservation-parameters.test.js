const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const client = path.resolve(__dirname, "../../../client");
const modules = path.join(client, "node_modules");
const React = require(path.join(modules, "react"));
const babel = require(path.join(modules, "@babel/core"));
const { renderToStaticMarkup } = require(path.join(modules, "react-dom/server"));

function load(relative) {
  const filename = path.join(client, "src", relative);
  const code = babel.transformSync(fs.readFileSync(filename, "utf8"), { filename, babelrc: false, configFile: false,
    presets: [[require.resolve(path.join(modules, "next/babel")), { "preset-env": { modules: "commonjs" } }]] }).code;
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  instance._compile(code, filename);
  return instance.exports;
}

test("paramètres : seul le restaurant activé ou réellement en mode test est visible", () => {
  const { isCallSenseAvailableForRestaurant: visible } = load("components/_shared/callsense/callsense-availability.js");
  assert.equal(visible(null, "a"), false);
  assert.equal(visible({ available: false, availabilityRestaurantId: "a" }, "a"), false);
  assert.equal(visible({ enabled: true, available: true, availabilityRestaurantId: "a" }, "a"), true);
  assert.equal(visible({ enabled: false, testMode: true, available: true, availabilityRestaurantId: "a" }, "a"), true);
  assert.equal(visible({ enabled: true, available: true, availabilityRestaurantId: "a" }, "b"), false);
  assert.equal(visible({ enabled: true, available: true, availabilityRestaurantId: "a" }, null), false);
});

test("la recherche desktop et webapp ne propose CallSense que lorsqu'il est disponible", () => {
  const saved = { useState: React.useState, useRef: React.useRef, useEffect: React.useEffect, useMemo: React.useMemo };
  try {
    for (const webapp of [false, true]) for (const callSenseAvailable of [false, true]) {
      let index = 0;
      React.useState = () => [index++ === 0 ? "callsense" : true, () => {}];
      React.useRef = () => ({ current: null });
      React.useEffect = () => {};
      React.useMemo = (fn) => fn();
      const { default: Search } = load("components/dashboard/reservations/parameters-search.reservations.component.js");
      const html = renderToStaticMarkup(React.createElement(Search, { webapp, callSenseAvailable }));
      assert.equal(html.includes("Gusto CallSense"), callSenseAvailable);
    }
  } finally { Object.assign(React, saved); }
});

test("les deux pages utilisent la même section et la même condition", () => {
  for (const file of ["components/dashboard/reservations/parameters.reservations.component.js", "components/dashboard/webapp/reservations/parameters.reservations.webapp.js"]) {
    const source = fs.readFileSync(path.join(client, "src", file), "utf8");
    assert.match(source, /isCallSenseAvailableForRestaurant\(callSense, parameterRestaurantId\)/);
    assert.match(source, /callSenseAvailable && <div id="reservation-parameters-callsense"/);
    assert.match(source, /<CallSenseUsageReservationsComponent/);
  }
});
