const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), Module = require("node:module");
const filename = path.resolve(__dirname, "../../../client/src/components/dashboard/admin/restaurants/callsense-regulatory-form.component.js");
const modules = path.resolve(__dirname, "../../../client/node_modules");
const React = require(path.join(modules, "react")), babel = require(path.join(modules, "@babel/core"));
const compiled = babel.transformSync(fs.readFileSync(filename, "utf8"), { filename, babelrc: false, configFile: false, presets: [[require.resolve(path.join(modules, "next/babel")), { "preset-env": { modules: "commonjs" } }]] }).code;
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
function walk(node, result = []) { if (Array.isArray(node)) { node.forEach(child => walk(child, result)); return result; } if (!node || typeof node !== "object") return result; result.push(node); if (typeof node.type === "function") walk(node.type(node.props), result); else walk(node.props?.children, result); return result; }
function text(node) { return walk(node).flatMap(part => { const value = part.props?.children; return Array.isArray(value) ? value.filter(item => typeof item === "string") : typeof value === "string" ? [value] : []; }).join(" "); }

function harness(t, { interrupted = false, approved = false } = {}) {
  const old = { useState: React.useState, useRef: React.useRef, useEffect: React.useEffect, useCallback: React.useCallback, load: Module._load };
  t.after(() => { React.useState = old.useState; React.useRef = old.useRef; React.useEffect = old.useEffect; React.useCallback = old.useCallback; Module._load = old.load; });
  const states = [], refs = []; let index = 0, effect, fail = interrupted; const calls = [];
  React.useState = initial => { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; };
  React.useRef = initial => { const i = index++; return refs[i] ||= { current: initial }; };
  React.useCallback = fn => fn; React.useEffect = fn => { index++; effect = fn; };
  const requirements = { endUserTypes: [{ machineName: "business", fields: [] }], supportingDocumentTypes: [{ machineName: "proof", fields: [] }], requirements: { end_user: [{ type: "business", fields: ["business_name"] }], supporting_document: [[{ name: "Justificatif", accepted_documents: [{ type: "proof", fields: ["registration"] }] }]] } };
  const current = { endUser: { sid: "ITfake", type: "business", attributes: { business_name: "Ancien" } }, documents: [{ sid: "RDold", type: "proof", status: "rejected", attributes: { registration: "old" }, failureReason: "Illisible", errors: [{ field: "registration", message: "Numéro incorrect" }] }] };
  if (approved) current.documents[0].status = "approved";
  const props = { base: "/admin/test", draft: { regulatoryBundleSid: "BUfake", regulatorySubmission: { state: "submitted", bundleSid: "BUfake" } }, complianceStatus: "twilio-rejected", active: true, onRefresh: async () => {} };
  const api = {
    get: async url => ({ data: url.endsWith("regulatory-rejection") ? structuredClone(current) : requirements }),
    post: async (url, body) => {
      calls.push({ url, body });
      if (url.endsWith("regulatory-correction")) { Object.assign(current.endUser.attributes, body.values); return { data: { status: "completed" } }; }
      if (url.endsWith("regulatory-document-replacement")) {
        const payload = JSON.parse(body.get("payload"));
        if (fail && !payload.verify) { fail = false; props.draft.regulatoryCorrection = { state: "uncertain", kind: "replace-document", objectSid: "RDold", phase: "assignments" }; throw { response: { data: { message: "Remplacement incertain" } } }; }
        if (payload.verify) assert.equal(body.getAll("documents").length, 0);
        current.documents[0] = { ...current.documents[0], sid: "RDnew", status: "draft", attributes: { registration: "new" } };
        props.draft.regulatoryCorrection = { state: "completed" };
        return { data: { status: "completed", sid: "RDnew" } };
      }
      if (url.endsWith("regulatory-resubmission")) { props.complianceStatus = "pending-review"; return { data: { status: "pending-review" } }; }
      throw Error("unexpected endpoint");
    },
  };
  Module._load = function(request, parent, isMain) { if (request === "axios") return api; if (request.endsWith("admin-auth.utils")) return { getAdminAuthConfig: config => config || {} }; return old.load.call(this, request, parent, isMain); };
  const instance = new Module(filename, module); instance.filename = filename; instance.paths = Module._nodeModulePaths(path.dirname(filename)); instance._compile(compiled, filename);
  const render = () => { index = 0; const tree = instance.exports.default(props); effect(); return tree; };
  const button = (tree, name) => walk(tree).find(node => node.type === "button" && text(node).includes(name));
  return { render, button, calls, props };
}

test("correction End-User et fichier : sauvegarde multipart puis resoumission du dossier existant", async t => {
  const h = harness(t); let tree = h.render(); h.button(tree, "Consulter les motifs").props.onClick(); await flush(); tree = h.render();
  assert.match(text(tree), /registration : Numéro incorrect/);
  walk(tree).find(node => node.type === "input" && node.props.name === "business_name").props.onChange({ target: { value: "Nouveau" } });
  walk(tree).find(node => node.type === "input" && node.props.name === "registration").props.onChange({ target: { value: "new" } });
  walk(tree).find(node => node.type === "input" && node.props.type === "file").props.onChange({ target: { files: [new Blob(["%PDF-fictif"], { type: "application/pdf" })] } });
  walk(tree).find(node => node.type === "input" && node.props.type === "checkbox").props.onChange({ target: { checked: true } });
  tree = h.render(); assert.equal(h.button(tree, "Évaluer et resoumettre").props.disabled, true);
  await walk(tree).find(node => node.type === "form").props.onSubmit({ preventDefault() {} }); tree = h.render();
  assert.equal(h.calls.length, 2); assert.match(h.calls[0].url, /regulatory-correction$/); assert.deepEqual(h.calls[0].body.values, { business_name: "Nouveau" });
  assert.match(h.calls[1].url, /regulatory-document-replacement$/); assert.equal(h.calls[1].body.getAll("documents").length, 1);
  assert.match(text(tree), /Corrections enregistrées/);
  await h.button(tree, "Évaluer et resoumettre").props.onClick(); tree = h.render();
  assert.equal(h.calls.length, 3); assert.match(h.calls[2].url, /regulatory-resubmission$/); assert.match(text(tree), /en cours de vérification/);
});

test("réponse perdue : vérification explicite sans deuxième upload", async t => {
  const h = harness(t, { interrupted: true }); let tree = h.render(); h.button(tree, "Consulter les motifs").props.onClick(); await flush(); tree = h.render();
  walk(tree).find(node => node.type === "input" && node.props.type === "file").props.onChange({ target: { files: [new Blob(["%PDF-fictif"], { type: "application/pdf" })] } });
  walk(tree).find(node => node.type === "input" && node.props.type === "checkbox").props.onChange({ target: { checked: true } });
  tree = h.render(); await walk(tree).find(node => node.type === "form").props.onSubmit({ preventDefault() {} }); tree = h.render();
  assert.match(text(tree), /Remplacement incertain/); assert.equal(walk(tree).some(node => node.type === "form"), false);
  await h.button(tree, "Vérifier l’état de la correction").props.onClick(); tree = h.render();
  assert.equal(h.calls.length, 2); assert.equal(h.calls[0].body.getAll("documents").length, 1); assert.equal(h.calls[1].body.getAll("documents").length, 0);
  assert.match(text(tree), /État vérifié/);
});

test("une pièce approuvée reste intacte lors de la correction des informations légales", async t => {
  const h = harness(t, { approved: true }); let tree = h.render();
  h.button(tree, "Consulter les motifs").props.onClick(); await flush(); tree = h.render();
  assert.match(text(tree), /Justificatif validé conservé/);
  assert.equal(walk(tree).some(node => node.type === "input" && node.props.type === "file"), false);
  walk(tree).find(node => node.type === "input" && node.props.name === "business_name").props.onChange({ target: { value: "Nouveau" } });
  walk(tree).find(node => node.type === "input" && node.props.type === "checkbox").props.onChange({ target: { checked: true } });
  tree = h.render(); await walk(tree).find(node => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].body.kind, "end-user");
});
