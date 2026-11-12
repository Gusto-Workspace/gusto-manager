// Component interaction tests with an in-memory API; no browser or remote service.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), Module = require("node:module");
const filename = path.resolve(__dirname, "../../client/src/components/dashboard/admin/restaurants/callsense-onboarding.admin.component.js");
const modules = path.resolve(__dirname, "../../client/node_modules");
const babel = require(path.join(modules, "@babel/core"));
const React = require(path.join(modules, "react"));
const compiled = babel.transformSync(fs.readFileSync(filename, "utf8"), { filename, babelrc: false, configFile: false,
  presets: [[require.resolve(path.join(modules, "next/babel")), { "preset-env": { modules: "commonjs" } }]] }).code;
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((resolve) => setImmediate(resolve)); };
function walk(node, result = []) {
  if (Array.isArray(node)) { node.forEach((item) => walk(item, result)); return result; }
  if (!node || typeof node !== "object") return result;
  result.push(node); walk(node.props?.children, result); return result;
}
function label(node) { return walk(node, []).flatMap((part) => { const children = part.props?.children; return Array.isArray(children) ? children.filter((item) => typeof item === "string") : typeof children === "string" ? [children] : []; }).join(" "); }

test("navigation, sous-compte, devis et état d’abonnement pilotent l'interface", async () => {
  const old = { useState: React.useState, useRef: React.useRef, useCallback: React.useCallback, useEffect: React.useEffect, load: Module._load, window: global.window, localStorage: global.localStorage };
  const oldNavigator = Object.getOwnPropertyDescriptor(global, "navigator"); let copied = "", sipReveals = 0;
  Object.defineProperty(global, "navigator", { configurable: true, value: { clipboard: { writeText: async (value) => { copied = value; } } } });
  const state = [], refs = [], effects = [], progress = [];
  let index = 0, first = true, bundleStatus = "pending-review", accountPosts = 0, saveCalls = 0, failAccount = true, pendingSubscription = false, stripeFound = false, meterEnabled = true, complianceError = false, complianceCalls = 0, automationPosts = 0;
  const sensitiveCalls = [];
  let addressRows = [{ sid: `AD${"f".repeat(32)}`, customerName: "Entreprise fictive", city: "Paris", isoCountry: "FR", validated: true }];
  const storage = { getItem: () => null, setItem: () => {} };
  const nativeForbidden = () => { throw new Error("Dialogue natif interdit"); };
  global.window = { localStorage: storage, confirm: nativeForbidden, prompt: nativeForbidden, alert: nativeForbidden }; global.localStorage = storage;
  const server = { restaurant: { name: "Restaurant fictif" }, complianceStrategy: "shared_clone", liveExists: false, liveManaged: false, draft: { wizardStep: 0, accountOperation: "not_started", terminalType: "HT813", regulatoryBundleSid: "", operator: "test", checklist: {} } };
  const axios = {
    get: async (url) => {
      if (url.endsWith("/compliance")) { complianceCalls++; if (complianceError) throw new Error("Twilio indisponible"); return { data: { bundle: { sid: server.draft.regulatoryBundleSid, status: bundleStatus, compatible: true } } }; }
      if (url.endsWith("/number-quote")) return { data: { numbers: [{ phoneNumber: "+33123456789", numberType: "local", addressRequirements: "local", capabilities: { voice: true } }, { phoneNumber: "+33973921894", numberType: "national", addressRequirements: "local", capabilities: { voice: true } }], prices: [{ type: "local", amount: "1.00" }, { type: "national", amount: "1.00" }], currency: "EUR", bundle: { status: bundleStatus, compatible: true } } };
      if (url.endsWith("/addresses")) return { data: { addresses: addressRows } };
      if (url.endsWith("/resources")) return { data: { numbers: [], domains: [], bundle: null } };
      if (url.endsWith("/subscription-recovery")) return { data: pendingSubscription ? { pending: true, state: "uncertain", startedAt: new Date().toISOString(), subscription: stripeFound ? { id: "sub_test", status: "active" } : null } : { pending: false } };
      if (url.endsWith("/twilio-reconciliation")) return { data: { observed: 1, missingCount: 1, complete: true, missing: [{ sid: "CA-test", startedAt: new Date().toISOString(), status: "completed" }] } };
      if (url.endsWith("/metering")) return { data: { enabled: meterEnabled, globalEnabled: true, outstanding: 1, reconciliation: { anomalies: [{ callSid: "CA-anomaly", startedAt: new Date().toISOString(), reason: "test" }] }, reviewCalls: [{ _id: "entry", callSid: "CA-review", createdAt: new Date().toISOString(), entry: { state: "review", lastError: "delai_idempotence_depasse" } }] } };
      return { data: structuredClone(server) };
    },
    put: async (url, body) => { if (url.endsWith("/progress")) { progress.push(body.step); server.draft.wizardStep = body.step; } else if (url.endsWith("/metering")) sensitiveCalls.push({ url, body }); else { saveCalls++; Object.assign(server.draft, body); } return { data: {} }; },
    post: async (url, body) => {
      if (url.endsWith("/sip-secret")) { sipReveals++; return { data: { username: "fake-user", domain: "example.test", password: "fake-secret" } }; }
      if (url.endsWith("/automation")) { automationPosts++; assert.equal(body.confirm, true); assert.equal(body.sharedCloneConsent, true); assert.equal(body.maxAmount, "2.00"); server.draft.automation = { status: "waiting", phase: "compliance", message: "Dossier requis", maxAmount: body.maxAmount, currency: body.currency, sharedCloneAccepted: true }; return { data: server.draft.automation }; }
      if (body?.acknowledgement) sensitiveCalls.push({ url, body });
      if (url.endsWith("/account")) { accountPosts++; if (failAccount) { server.draft.accountOperation = "uncertain"; throw { response: { data: { message: "Résultat incertain" } } }; } server.draft.accountSid = `AC${"a".repeat(32)}`; server.draft.accountOperation = "completed"; }
      if (url.endsWith("/recovery-inspect")) return { data: { id: "inspection", operation: "account", evidence: "absent", checkedAt: new Date().toISOString(), resources: [] } };
      if (url.endsWith("/recovery-unlock")) { server.draft.accountOperation = "not_started"; failAccount = false; }
      if (url.endsWith("/number-purchase")) { assert.equal(body.addressSid, `AD${"f".repeat(32)}`); assert.equal(body.technicalConfirm, true); server.draft.phoneNumberSid = `PN${"b".repeat(32)}`; server.draft.twilioNumber = "+33123456789"; server.draft.numberOperation = "completed"; }
      if (url.endsWith("/domain")) { server.draft.sipDomain = "test.sip.twilio.com"; server.draft.domainOperation = "completed"; }
      if (url.endsWith("/sip-credentials")) server.draft.sipCredentialOperation = "completed";
      if (url.endsWith("/fallback-probe")) { server.draft.fallbackProbeUrl = body.fallbackUrl; server.draft.fallbackProbeAt = new Date().toISOString(); }
      if (url.endsWith("/fallback-verification")) { server.draft.verifiedFallbackUrl = body.fallbackUrl; server.draft.checklist.fallbackTest = true; }
      if (url.endsWith("/webhooks")) server.draft.webhookOperation = "completed";
      if (url.endsWith("/status")) {
        if (body.status === "active" && server.draft.serviceStatus !== "ready_for_test") throw { response: { data: { message: "Tests requis avant activation" } } };
        server.draft.serviceStatus = body.status;
        if (["active", "ready_for_test"].includes(body.status)) { server.liveExists = true; server.liveManaged = true; }
      }
      return { data: {} };
    },
  };
  React.useState = (initial) => { const i = index++; if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial; return [state[i], (value) => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; };
  React.useRef = (initial) => { const i = index++; return refs[i] ||= { current: initial }; };
  React.useCallback = (fn) => fn;
  React.useEffect = (fn) => { index++; if (first) effects.push(fn); };
  Module._load = function(request, parent, isMain) { if (request === "axios") return axios; if (request.endsWith("admin-auth.utils")) return { getAdminAuthConfig: () => ({}) }; return old.load.call(this, request, parent, isMain); };
  try {
    const instance = new Module(filename, module); instance.filename = filename; instance.paths = Module._nodeModulePaths(path.dirname(filename)); instance._compile(compiled, filename);
    const Component = instance.exports.default;
    const render = () => { index = 0; const tree = Component({ restaurantId: "restaurant" }); first = false; return tree; };
    const button = (tree, text) => walk(tree).find((node) => node.type === "button" && label(node).includes(text));
    const confirmModal = (tree) => button(walk(tree).find((node) => node.props?.role === "dialog"), "Confirmer");
    let tree = render(); effects.forEach((effect) => effect()); await flush(); tree = render();
    for (const [step, title] of ["Informations du restaurant", "Sous-compte Twilio", "Conformité réglementaire", "Numéro de téléphone", "SIP et webhooks", "Terminal et renvoi d’appel", "Tests et activation"].entries()) {
      button(tree, title).props.onClick(); await flush(); tree = render();
      assert.equal(button(tree, title).props["aria-current"], "step"); assert.equal(progress.at(-1), step);
    }
    assert.ok(button(tree, "Vérifier l’opération Stripe"));
    assert.doesNotMatch(label(tree), /Opération d’abonnement interrompue/);
    button(tree, "Vérifier l’opération Stripe").props.onClick(); await flush(); tree = render();
    assert.match(label(tree), /Aucune opération interrompue/);
    button(tree, "Sous-compte Twilio").props.onClick(); await flush(); tree = render();
    button(tree, "Créer un sous-compte").props.onClick(); tree = render();
    assert.equal(accountPosts, 0); assert.equal(saveCalls, 0); assert.match(label(tree), /Restaurant fictif/); assert.match(label(tree), /Créer un sous-compte Twilio/);
    button(tree, "Annuler").props.onClick(); tree = render(); assert.equal(accountPosts, 0);
    button(tree, "Créer un sous-compte").props.onClick(); tree = render();
    walk(tree).find((node) => node.props?.role === "dialog").props.onKeyDown({ key: "Escape", preventDefault() {}, stopPropagation() {} }); tree = render(); assert.equal(accountPosts, 0);
    button(tree, "Créer un sous-compte").props.onClick(); tree = render(); walk(tree).find((node) => node.props?.["aria-label"] === "Fermer la confirmation").props.onClick(); tree = render(); assert.equal(accountPosts, 0); assert.equal(saveCalls, 0);
    button(tree, "Créer un sous-compte").props.onClick(); tree = render();
    const confirmCreate = button(tree, "Créer le sous-compte"); confirmCreate.props.onClick(); confirmCreate.props.onClick(); tree = render();
    assert.equal(button(tree, "Opération en cours").props.disabled, true);
    await flush(); tree = render(); assert.equal(accountPosts, 1); assert.match(label(tree), /Résultat incertain/);
    assert.match(label(tree), /Une opération peut avoir été effectuée/); assert.equal(button(tree, "Créer le sous-compte").props.disabled, true);
    button(tree, "Annuler").props.onClick(); tree = render();
    assert.equal(button(tree, "Créer un sous-compte").props.disabled, true);
    button(tree, "Tests et activation").props.onClick(); await flush(); tree = render();
    walk(tree).find((node) => node.type === "button" && label(node).includes("Sous-compte") && label(node).includes("incertain")).props.onClick(); await flush(); tree = render();
    button(tree, "Confirmer l’absence et permettre une nouvelle tentative").props.onClick(); tree = render();
    assert.equal(confirmModal(tree).props.disabled, true);
    walk(tree).find((node) => node.type === "input" && node.props.autoComplete === "off").props.onChange({ target: { value: "JE CONFIRME ABSENCE ET ARRET" } }); tree = render();
    confirmModal(tree).props.onClick(); await flush(); tree = render();
    assert.equal(accountPosts, 1);
    button(tree, "Sous-compte Twilio").props.onClick(); await flush(); tree = render();
    button(tree, "Créer un sous-compte").props.onClick(); tree = render(); button(tree, "Créer le sous-compte").props.onClick(); await flush(); tree = render();
    assert.equal(accountPosts, 2); assert.equal(server.draft.accountOperation, "completed");
    assert.equal(walk(tree).some((node) => node.props?.role === "dialog"), false);
    button(tree, "Conformité réglementaire").props.onClick(); await flush(); tree = render();
    assert.match(label(tree), /Non renseigné/);
    const bundleInput = walk(tree).find((node) => node.type === "input" && node.props.placeholder === "BU…");
    bundleInput.props.onChange({ target: { value: `BU${"a".repeat(32)}` } }); tree = render();
    button(tree, "Enregistrer et vérifier").props.onClick(); await flush(); tree = render();
    assert.equal(complianceCalls, 1); assert.equal(server.draft.regulatoryBundleSid, `BU${"a".repeat(32)}`); assert.match(label(tree), /En attente d’approbation/);
    bundleStatus = "twilio-rejected"; button(tree, "Actualiser le statut").props.onClick(); await flush(); tree = render(); assert.match(label(tree), /Refusé/);
    bundleStatus = "twilio-approved"; button(tree, "Actualiser le statut").props.onClick(); await flush(); tree = render(); assert.match(label(tree), /Approuvé/);
    complianceError = true; button(tree, "Enregistrer et vérifier").props.onClick(); await flush(); tree = render(); assert.match(label(tree), /Vérification impossible/); assert.equal(server.draft.regulatoryBundleSid, `BU${"a".repeat(32)}`); complianceError = false;
    bundleStatus = "pending-review"; button(tree, "Numéro de téléphone").props.onClick(); await flush(); tree = render();
    button(tree, "Rechercher des numéros et tarifs").props.onClick(); await flush(); tree = render();
    assert.equal(button(tree, "Acheter"), undefined);
    bundleStatus = "twilio-rejected"; button(tree, "Rechercher des numéros et tarifs").props.onClick(); await flush(); tree = render(); assert.equal(button(tree, "Acheter"), undefined);
    addressRows = [];
    bundleStatus = "twilio-approved"; button(tree, "Rechercher des numéros et tarifs").props.onClick(); await flush(); tree = render(); assert.equal(button(tree, "Acheter"), undefined); assert.match(label(tree), /Aucune adresse validée/);
    addressRows = [{ sid: `AD${"f".repeat(32)}`, customerName: "Entreprise fictive", city: "Paris", isoCountry: "FR", validated: true }, { sid: `AD${"1".repeat(32)}`, customerName: "Autre adresse", isoCountry: "FR", validated: true }];
    button(tree, "Rechercher des numéros et tarifs").props.onClick(); await flush(); tree = render(); assert.equal(button(tree, "Acheter"), undefined);
    walk(tree).find(node => node.type === "select" && label(node).includes("Sélectionner une adresse")).props.onChange({ target: { value: `AD${"f".repeat(32)}` } }); tree = render(); assert.ok(button(tree, "Acheter"));
    addressRows = [addressRows[0]];
    bundleStatus = "twilio-approved"; button(tree, "Rechercher des numéros et tarifs").props.onClick(); await flush(); tree = render(); assert.ok(button(tree, "Acheter"));
    assert.equal(button(walk(tree).find(node => node.type === "li" && label(node).includes("+33973921894")), "Acheter"), undefined);
    button(tree, "Acheter").props.onClick(); tree = render(); confirmModal(tree).props.onClick(); await flush(); tree = render(); assert.equal(server.draft.numberOperation, "completed");
    button(tree, "SIP et webhooks").props.onClick(); await flush(); tree = render();
    button(tree, "Créer le domaine SIP").props.onClick(); tree = render(); confirmModal(tree).props.onClick(); await flush(); tree = render();
    button(tree, "Créer les identifiants").props.onClick(); tree = render(); confirmModal(tree).props.onClick(); await flush(); tree = render();
    const reveal = () => walk(tree).find(node => node.type === "button" && label(node) === "Afficher");
    reveal().props.onClick(); tree = render(); assert.equal(sipReveals, 0); confirmModal(tree).props.onClick(); await flush(); tree = render(); assert.match(label(tree), /fake-secret/);
    button(tree, "Copier").props.onClick(); await flush(); tree = render(); assert.equal(copied, "fake-secret");
    button(tree, "Masquer").props.onClick(); tree = render(); assert.doesNotMatch(label(tree), /fake-secret/);
    reveal().props.onClick(); tree = render(); confirmModal(tree).props.onClick(); await flush(); tree = render(); assert.equal(sipReveals, 2);
    button(tree, "Masquer").props.onClick(); tree = render();
    const fallbackUrl = `https://handler.twilio.com/twiml/EH${"a".repeat(32)}`;
    const input = walk(tree).find((node) => node.type === "input" && node.props.placeholder === "https://handler.twilio.com/twiml/EH…");
    input.props.onChange({ target: { value: fallbackUrl } }); tree = render();
    button(tree, "Vérifier la réponse TwiML").props.onClick(); await flush(); tree = render();
    assert.equal(walk(tree).find((node) => node.type === "input" && node.props.placeholder === "https://handler.twilio.com/twiml/EH…").props.value, fallbackUrl);
    assert.equal(button(tree, "Confirmer le test téléphonique").props.disabled, false);
    button(tree, "Confirmer le test téléphonique").props.onClick(); tree = render(); confirmModal(tree).props.onClick(); await flush(); tree = render();
    button(tree, "Configurer et vérifier les webhooks").props.onClick(); tree = render(); confirmModal(tree).props.onClick(); await flush(); tree = render(); assert.equal(server.draft.webhookOperation, "completed");
    button(tree, "Tests et activation").props.onClick(); await flush(); tree = render();
    button(tree, "Activer après recette").props.onClick(); tree = render(); confirmModal(tree).props.onClick(); await flush(); tree = render(); assert.match(label(tree), /Tests requis avant activation/); button(tree, "Annuler").props.onClick(); tree = render();
    button(tree, "Prêt à tester").props.onClick(); tree = render(); confirmModal(tree).props.onClick(); await flush(); tree = render(); assert.equal(server.draft.serviceStatus, "ready_for_test");
    walk(tree).filter((node) => node.type === "input" && node.props.type === "checkbox").forEach((node) => node.props.onChange({ target: { checked: true } })); tree = render();
    button(tree, "Enregistrer la checklist").props.onClick(); await flush(); tree = render(); assert.equal(server.draft.checklist.incomingTest, true);
    button(tree, "Activer après recette").props.onClick(); tree = render(); confirmModal(tree).props.onClick(); await flush(); tree = render(); assert.equal(server.draft.serviceStatus, "active");
    pendingSubscription = true;
    button(tree, "Vérifier l’opération Stripe").props.onClick(); await flush(); tree = render();
    button(tree, "Vérifier les appels Twilio").props.onClick(); await flush(); tree = render();
    button(tree, "Consulter l’état des envois").props.onClick(); await flush(); tree = render();
    for (const [trigger, phrase, endpoint] of [
      ["Débloquer après vérification", "JE CONFIRME ABSENCE STRIPE", "/subscription-recovery"],
      ["Récupérer après vérification", "JE CONFIRME RECUPERATION APPEL", "/recover-twilio-call"],
      ["Classer après vérification", "JE CONFIRME LA VERIFICATION", "/dismiss"],
      ["Suspendre les envois", "JE SUSPENDS LES ENVOIS", "/metering"],
      ["Classer sans facturer", "JE CONFIRME LA VERIFICATION", "/resolve"],
      ["Préparer une régularisation manuelle", "JE CONFIRME LA VERIFICATION", "/resolve"],
      ["Confirmer l’événement reçu", "JE CONFIRME EVENEMENT STRIPE", "/confirm-reported"],
    ]) {
      const before = sensitiveCalls.length;
      button(tree, trigger).props.onClick(); tree = render();
      assert.equal(confirmModal(tree).props.disabled, true, trigger);
      let input = walk(tree).find((node) => node.type === "input" && node.props.autoComplete === "off");
      input.props.onChange({ target: { value: "incorrect" } }); tree = render();
      assert.equal(confirmModal(tree).props.disabled, true, trigger); confirmModal(tree).props.onClick(); await flush(); assert.equal(sensitiveCalls.length, before);
      input = walk(tree).find((node) => node.type === "input" && node.props.autoComplete === "off");
      input.props.onChange({ target: { value: phrase } }); tree = render();
      const confirm = confirmModal(tree); assert.equal(confirm.props.disabled, false, trigger); confirm.props.onClick(); confirm.props.onClick(); await flush(); tree = render();
      assert.equal(sensitiveCalls.length, before + 1, trigger); assert.ok(sensitiveCalls.at(-1).url.endsWith(endpoint)); assert.equal(sensitiveCalls.at(-1).body.acknowledgement, phrase);
    }
    stripeFound = true; button(tree, "Vérifier l’opération Stripe").props.onClick(); await flush(); tree = render();
    button(tree, "Débloquer après vérification").props.onClick(); tree = render();
    walk(tree).find((node) => node.type === "input" && node.props.autoComplete === "off").props.onChange({ target: { value: "JE CONFIRME LA VERIFICATION STRIPE" } }); tree = render();
    confirmModal(tree).props.onClick(); await flush(); tree = render(); assert.equal(sensitiveCalls.at(-1).body.acknowledgement, "JE CONFIRME LA VERIFICATION STRIPE");
    meterEnabled = false; button(tree, "Consulter l’état des envois").props.onClick(); await flush(); tree = render();
    const meteringSection = walk(tree).filter((node) => node.type === "div" && node.props?.children && label(node).includes("Transmission des minutes à Stripe") && walk(node).some((child) => child.type === "button" && label(child) === "Consulter l’état des envois")).at(-1);
    button(meteringSection, "Activer après recette").props.onClick(); tree = render();
    walk(tree).find((node) => node.type === "input" && node.props.autoComplete === "off").props.onChange({ target: { value: "JE CONFIRME LA RECETTE" } }); tree = render();
    confirmModal(tree).props.onClick(); await flush(); tree = render(); assert.equal(sensitiveCalls.at(-1).body.acknowledgement, "JE CONFIRME LA RECETTE");
    walk(tree).find(node => node.type === "input" && node.props.placeholder === "Ex. 2.00").props.onChange({ target: { value: "2.00" } }); tree = render();
    button(tree, "Lancer la mise en service").props.onClick(); tree = render(); assert.equal(automationPosts, 0); assert.match(label(tree), /2.00 USD/); assert.match(label(tree), /dossier réglementaire Gusto approuvé sera cloné/);
    confirmModal(tree).props.onClick(); await flush(); tree = render(); assert.equal(automationPosts, 1); assert.match(label(tree), /Dossier requis/);
  } finally { Object.assign(React, { useState: old.useState, useRef: old.useRef, useCallback: old.useCallback, useEffect: old.useEffect }); Module._load = old.load; global.window = old.window; global.localStorage = old.localStorage; if (oldNavigator) Object.defineProperty(global, "navigator", oldNavigator); else delete global.navigator; }
});
