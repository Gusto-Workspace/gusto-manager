const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const filename = path.resolve(__dirname, "../../client/src/components/dashboard/_shared/reservations/callsense-usage.reservations.component.js");
const clientModules = path.resolve(__dirname, "../../client/node_modules");
const babel = require(path.join(clientModules, "@babel/core"));
const React = require(path.join(clientModules, "react"));
const { renderToStaticMarkup } = require(path.join(clientModules, "react-dom/server"));
const source = fs.readFileSync(filename, "utf8");
const compiled = babel.transformSync(source, { filename, babelrc: false, configFile: false, presets: [
  [require.resolve(path.join(clientModules, "next/babel")), { "preset-env": { modules: "commonjs" } }],
] }).code;
function render(usage) {
  const previous = { useState: React.useState, useRef: React.useRef, useEffect: React.useEffect };
  const values = [{ configured: true, enabled: true, restaurantId: "restaurant", twilioNumber: "+33123456789", usage,
    telephone: { month: "2026-11", received: 6, answered: 1, missed: 5, busy: 0, refused: 0, conversationSeconds: 10 } }, false, "2026-11", 0];
  React.useState = () => [values.shift(), () => {}];
  React.useRef = () => ({ current: null });
  React.useEffect = () => {};
  try {
    const moduleInstance = new Module(filename, module);
    moduleInstance.filename = filename;
    moduleInstance.paths = Module._nodeModulePaths(path.dirname(filename));
    moduleInstance._compile(compiled, filename);
    return renderToStaticMarkup(React.createElement(moduleInstance.exports.default, { restaurantData: { _id: "restaurant" } }));
  }
  finally { Object.assign(React, previous); }
}

test("sans offre, présentation standard avant activité et aucun solde fictif", () => {
  const html = render({ available: false, reason: "offre_non_associee" });
  assert.match(html, /Offre non encore souscrite/);
  assert.match(html, /1 000 minutes incluses/);
  assert.ok(html.indexOf("Offre CallSense") < html.indexOf("Activité téléphonique"));
  assert.match(html, /10 s/);
  assert.doesNotMatch(html, /role="progressbar"|min restantes|renouvellement le/);
});

test("offre active : quota, dépassement, attente et historique sont affichés", () => {
  const html = render({ available: true, periodStart: "2026-11-01T00:00:00Z", periodEnd: "2026-12-01T00:00:00Z",
    verifiedMinutes: 1001, includedMinutes: 1000, remainingMinutes: 0, reportedMinutes: 999, percent: 100,
    overageMinutes: 1, unverifiedCalls: 2, history: [{ periodStart: "2026-11-01T00:00:00Z", periodEnd: "2026-12-01T00:00:00Z", verifiedMinutes: 1001, reportedMinutes: 999, pending: 1 }] });
  assert.ok(html.indexOf("Consommation commerciale") < html.indexOf("Activité téléphonique"));
  assert.match(html, /role="progressbar"/);
  assert.match(html, /1001 \/ 1000 min/);
  assert.match(html, /0 min restantes/);
  assert.match(html, /Dépassement : 1 min/);
  assert.match(html, /consommation affichée peut être incomplète/);
  assert.match(html, /Historique des périodes/);
  assert.match(html, /Période du/);
  assert.doesNotMatch(html, /Stripe|registre|transmis|reporting|Service technique|heure de Paris|\+33123456789/);
});
