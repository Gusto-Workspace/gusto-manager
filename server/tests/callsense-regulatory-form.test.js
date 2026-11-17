// Interaction tests: simulated API only; no Twilio or network calls.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), Module = require("node:module");
const filename = path.resolve(__dirname, "../../client/src/components/dashboard/admin/restaurants/callsense-regulatory-form.component.js");
const modules = path.resolve(__dirname, "../../client/node_modules");
const React = require(path.join(modules, "react"));
const babel = require(path.join(modules, "@babel/core"));
const compiled = babel.transformSync(fs.readFileSync(filename, "utf8"), { filename, babelrc: false, configFile: false, presets: [[require.resolve(path.join(modules, "next/babel")), { "preset-env": { modules: "commonjs" } }]] }).code;
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
function walk(node, result = []) {
  if (Array.isArray(node)) { node.forEach(child => walk(child, result)); return result; }
  if (!node || typeof node !== "object") return result;
  result.push(node);
  if (typeof node.type === "function") walk(node.type(node.props), result);
  else walk(node.props?.children, result);
  return result;
}
function label(node) { return walk(node, []).flatMap(part => { const c = part.props?.children; return Array.isArray(c) ? c.filter(item => typeof item === "string") : typeof c === "string" ? [c] : []; }).join(" "); }
const requirements = {
  endUserTypes: [{ machineName: "business", fields: [{ machine_name: "business_name", friendly_name: "Raison sociale" }] }],
  supportingDocumentTypes: [{ machineName: "certificate", fields: [{ machine_name: "registration", friendly_name: "Immatriculation" }] }, { machineName: "passport", fields: [] }],
  requirements: { end_user: [{ type: "business", fields: ["business_name"], detailed_fields: [{ machine_name: "business_name", friendly_name: "Raison sociale" }] }], supporting_document: [[{ name: "Identité professionnelle", description: "Document en cours de validité", accepted_documents: [{ type: "certificate", name: "Certificat", fields: ["registration"] }, { type: "passport", name: "Passeport", fields: [] }] }]] },
};

test("formulaire dynamique, multipart, validation, erreur et état soumis", async t => {
  const old = { useState: React.useState, useRef: React.useRef, useEffect: React.useEffect, useCallback: React.useCallback, load: Module._load };
  t.after(() => { React.useState = old.useState; React.useRef = old.useRef; React.useEffect = old.useEffect; React.useCallback = old.useCallback; Module._load = old.load; });
  const states = [], refs = []; let index = 0, posts = 0, refreshes = 0, fail = true, noncompliant = false, posted;
  React.useState = initial => { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; };
  React.useRef = initial => { const i = index++; return refs[i] ||= { current: initial }; };
  let effect; React.useCallback = fn => fn; React.useEffect = fn => { index++; effect = fn; };
  const api = {
    get: async (url, config) => { if (url.endsWith("/regulatory-rejection")) return { data: { documents: [{ sid: "RDfictif", type: "certificate", status: "rejected", failureReason: "Document illisible", errors: [] }] } }; assert.match(url, /regulatory-requirements$/); assert.equal(config.params.endUserType, "business"); return { data: requirements }; },
    post: async (url, form, config) => { posts++; posted = form; assert.match(url, /regulatory-submission$/); assert.equal(config.headers.Authorization, "Bearer fictif"); if (fail) throw { response: { data: { message: "Résultat réglementaire incertain" } } }; return { data: noncompliant ? { status: "noncompliant", results: [{ valid: false, error_code: "MANQUANT" }] } : { status: "pending-review", bundleSid: "BU-fictif" } }; },
  };
  Module._load = function(request, parent, isMain) { if (request === "axios") return api; if (request.endsWith("admin-auth.utils")) return { getAdminAuthConfig: config => ({ ...config, headers: { Authorization: "Bearer fictif" } }) }; return old.load.call(this, request, parent, isMain); };
  const instance = new Module(filename, module); instance.filename = filename; instance.paths = Module._nodeModulePaths(path.dirname(filename)); instance._compile(compiled, filename);
  const Component = instance.exports.default;
  const props = { base: "/api/admin/restaurant", draft: {}, active: true, onRefresh: async () => { refreshes++; } };
  const render = () => { index = 0; const tree = Component(props); effect(); return tree; };
  const findButton = (tree, text) => walk(tree).find(node => node.type === "button" && label(node).includes(text));
  const input = (tree, name) => walk(tree).find(node => node.type === "input" && node.props.name === name);
  let tree = render(); await flush(); tree = render();
  assert.match(label(tree), /Raison sociale/); assert.match(label(tree), /Identité professionnelle/);
  const form = () => walk(render()).find(node => node.type === "form");
  await form().props.onSubmit({ preventDefault() {} }); tree = render(); assert.match(label(tree), /champs obligatoires/); assert.equal(posts, 0);
  input(tree, "business_name").props.onChange({ target: { value: "Restaurant fictif" } });
  walk(tree).find(node => node.type === "input" && node.props.type === "email").props.onChange({ target: { value: "admin@example.com" } });
  walk(tree).find(node => node.type === "input" && node.props.type === "checkbox").props.onChange({ target: { checked: true } }); tree = render();
  const docSelect = walk(tree).find(node => node.type === "select" && walk(node).some(child => child.type === "option" && child.props.value === "certificate"));
  docSelect.props.onChange({ target: { value: "certificate" } }); tree = render();
  await form().props.onSubmit({ preventDefault() {} }); tree = render(); assert.match(label(tree), /Complétez les champs/); assert.equal(posts, 0);
  input(tree, "registration").props.onChange({ target: { value: "123" } }); tree = render();
  walk(tree).find(node => node.type === "input" && node.props.type === "file").props.onChange({ target: { files: [new Blob(["incorrect"], { type: "application/pdf" })] } });
  await form().props.onSubmit({ preventDefault() {} }); tree = render(); assert.match(label(tree), /Fichier invalide/); assert.equal(posts, 0);
  walk(tree).find(node => node.type === "input" && node.props.type === "file").props.onChange({ target: { files: [new Blob(["%PDF-fictif"], { type: "application/pdf" })] } });
  await form().props.onSubmit({ preventDefault() {} }); tree = render(); assert.match(label(tree), /Résultat réglementaire incertain/); assert.equal(refreshes, 1);
  assert.equal(posted.getAll("documents").length, 1); assert.deepEqual(JSON.parse(posted.get("payload")), { confirm: true, endUserType: "business", endUserAttributes: { business_name: "Restaurant fictif" }, email: "admin@example.com", documents: [{ type: "certificate", attributes: { registration: "123" }, fileIndex: 0 }] });
  props.draft = { regulatorySubmission: { state: "uncertain", phase: "document_0" } }; tree = render(); assert.match(label(tree), /reprise est bloquée/); assert.equal(walk(tree).some(node => node.type === "form"), false);
  props.draft = {}; fail = false; noncompliant = true; tree = render(); await form().props.onSubmit({ preventDefault() {} }); tree = render();
  assert.match(label(tree), /Évaluation non conforme/); assert.match(label(tree), /MANQUANT/); assert.equal(posts, 2);
  props.draft = { regulatoryBundleSid: "BU-fictif", regulatorySubmission: { state: "waiting", phase: "noncompliant", bundleSid: "BU-fictif" } }; noncompliant = false; tree = render();
  assert.match(label(tree), /exactement les mêmes informations/); await form().props.onSubmit({ preventDefault() {} });
  assert.equal(posts, 3); assert.equal(refreshes, 3);
  props.draft = { regulatoryBundleSid: "BU-fictif", regulatorySubmission: { state: "submitted", phase: "submitted", bundleSid: "BU-fictif" } }; tree = render();
  assert.match(label(tree), /Votre dossier a été transmis à Twilio\. Il est en cours de vérification\. Vous n'avez aucune action à effectuer pour le moment\./); assert.equal(walk(tree).some(node => node.type === "form"), false);
  props.complianceStatus = "twilio-rejected"; tree = render(); assert.match(label(tree), /Dossier refusé/); assert.doesNotMatch(label(tree), /pending-review/);
  findButton(tree, "Consulter les motifs").props.onClick(); await flush(); tree = render(); assert.match(label(tree), /Document illisible/); assert.ok(findButton(tree, "Évaluer et resoumettre"));
  props.complianceStatus = "twilio-approved"; tree = render(); assert.match(label(tree), /Dossier approuvé/);
});

test("adresse validée utilisée comme métadonnée, sans fichier fictif", async t => {
  const old = { useState: React.useState, useRef: React.useRef, useEffect: React.useEffect, useCallback: React.useCallback, load: Module._load };
  t.after(() => { React.useState = old.useState; React.useRef = old.useRef; React.useEffect = old.useEffect; React.useCallback = old.useCallback; Module._load = old.load; });
  const states = [], refs = []; let index = 0, sent;
  React.useState = initial => { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; };
  React.useRef = initial => { const i = index++; return refs[i] ||= { current: initial }; };
  let effect; React.useCallback = fn => fn; React.useEffect = fn => { index++; effect = fn; };
  const sid = `AD${"a".repeat(32)}`;
  const data = structuredClone(requirements);
  data.supportingDocumentTypes = [{ machineName: "address", fields: [{ machine_name: "address_sids" }] }];
  data.requirements.supporting_document = [[{ name: "Adresse", accepted_documents: [{ type: "address", name: "Adresse validée", fields: ["address_sids"] }] }]];
  const api = { get: async url => url.endsWith("/addresses") ? { data: { addresses: [{ sid, validated: true, city: "Paris" }] } } : { data }, post: async (_url, form) => { sent = form; return { data: { status: "pending-review" } }; } };
  Module._load = function(request, parent, isMain) { if (request === "axios") return api; if (request.endsWith("admin-auth.utils")) return { getAdminAuthConfig: config => config || {} }; return old.load.call(this, request, parent, isMain); };
  const instance = new Module(filename, module); instance.filename = filename; instance.paths = Module._nodeModulePaths(path.dirname(filename)); instance._compile(compiled, filename);
  const render = () => { index = 0; const tree = instance.exports.default({ base: "/admin", draft: {}, active: true, restaurant: { email: "restaurant@example.com" }, onRefresh: async () => {} }); effect(); return tree; };
  let tree = render(); await flush(); tree = render();
  assert.equal(walk(tree).find(node => node.type === "input" && node.props.type === "email").props.value, "restaurant@example.com");
  walk(tree).find(node => node.type === "input" && node.props.name === "business_name").props.onChange({ target: { value: "Société fictive" } });
  walk(tree).find(node => node.type === "input" && node.props.type === "checkbox").props.onChange({ target: { checked: true } });
  walk(tree).find(node => node.type === "select" && walk(node).some(child => child.type === "option" && child.props.value === "address")).props.onChange({ target: { value: "address" } }); tree = render();
  walk(tree).find(node => node.type === "select" && node.props.name === "address_sids").props.onChange({ target: { value: sid } }); tree = render();
  await walk(tree).find(node => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.deepEqual(JSON.parse(sent.get("payload")).documents, [{ type: "address", attributes: { address_sids: [sid] }, fileIndex: null }]);
  assert.equal(sent.getAll("documents").length, 0);
});

test("chargement automatique business à l’arrivée, sans répétition, et reprise sur erreur", async t => {
  const old = { useState: React.useState, useRef: React.useRef, useEffect: React.useEffect, useCallback: React.useCallback, load: Module._load };
  t.after(() => { React.useState = old.useState; React.useRef = old.useRef; React.useEffect = old.useEffect; React.useCallback = old.useCallback; Module._load = old.load; });
  const states = [], refs = []; let index = 0, effect, count = 0, rejectFirst = true, complete;
  React.useState = initial => { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; };
  React.useRef = initial => { const i = index++; return refs[i] ||= { current: initial }; };
  React.useCallback = fn => fn; React.useEffect = fn => { index++; effect = fn; };
  const api = { get: async (_url, config) => { count++; assert.equal(config.params.endUserType, "business"); if (rejectFirst) { rejectFirst = false; throw new Error("offline"); } return new Promise(resolve => { complete = () => resolve({ data: requirements }); }); } };
  Module._load = function(request, parent, isMain) { if (request === "axios") return api; if (request.endsWith("admin-auth.utils")) return { getAdminAuthConfig: config => config || {} }; return old.load.call(this, request, parent, isMain); };
  const instance = new Module(filename, module); instance.filename = filename; instance.paths = Module._nodeModulePaths(path.dirname(filename)); instance._compile(compiled, filename);
  const props = { base: "/admin", draft: {}, active: false, onRefresh: async () => {} };
  const render = () => { index = 0; const tree = instance.exports.default(props); effect(); return tree; };
  render(); await flush(); assert.equal(count, 0);
  props.active = true; render(); await flush(); let tree = render();
  assert.equal(count, 1); assert.match(label(tree), /Impossible de charger/); assert.doesNotMatch(label(tree), /Type d’utilisateur final/);
  props.active = false; render(); props.active = true; tree = render(); await flush(); assert.equal(count, 1);
  walk(tree).find(node => node.type === "button" && label(node).includes("Réessayer")).props.onClick(); tree = render();
  assert.equal(count, 2); assert.match(label(tree), /Chargement des exigences/);
  complete(); await flush(); tree = render(); assert.match(label(tree), /Raison sociale/);
  props.active = false; render(); props.active = true; render(); await flush(); assert.equal(count, 2);
});
