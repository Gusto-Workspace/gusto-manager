const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const componentPath = require.resolve("../../client/src/components/dashboard/take-away/sms-notifications.take-away.component.js");
const source = fs.readFileSync(componentPath, "utf8");
const helperStart = source.indexOf("function normalizeSmsSettings");
const helperEnd = source.indexOf("function SmsEventEditor");
assert.ok(helperStart >= 0 && helperEnd > helperStart, "local form comparison helpers should exist");
const context = {};
vm.runInNewContext(`${source.slice(helperStart, helperEnd)}
this.smsForm = { createSavedSmsValues, hasSmsFormChanges, getChangedSharedSmsKeys };`, context);
const { createSavedSmsValues, hasSmsFormChanges, getChangedSharedSmsKeys } = context.smsForm;

function copy(value) { return JSON.parse(JSON.stringify(value)); }
function fixture() {
  return {
    settings: { enabled: true, events: {
      ready: { enabled: false, template: "Commande prête {orderNumber}" },
      confirmed: { enabled: true, template: "Bonjour {firstName}" },
    } },
    shared: { internationalEnabled: false, billingPeriodSpendingLimit: 20 },
  };
}
function state(values) { return copy(createSavedSmsValues(values.settings, values.shared)); }

test("cocher puis décocher un événement masque le bouton Enregistrer", () => {
  const initial = fixture();
  const saved = state(initial);
  const current = state(initial);
  current.settings.events.ready.enabled = true;
  assert.equal(hasSmsFormChanges(saved, current), true);
  current.settings.events.ready.enabled = false;
  assert.equal(hasSmsFormChanges(saved, current), false);
});

test("modifier puis restaurer un template masque le bouton Enregistrer", () => {
  const initial = fixture();
  const saved = state(initial);
  const current = state(initial);
  current.settings.events.confirmed.template = "Texte provisoire";
  assert.equal(hasSmsFormChanges(saved, current), true);
  current.settings.events.confirmed.template = saved.settings.events.confirmed.template;
  assert.equal(hasSmsFormChanges(saved, current), false);
});

test("modifier puis restaurer le plafond SMS masque le bouton Enregistrer", () => {
  const initial = fixture();
  const saved = state(initial);
  const current = fixture();
  current.shared.billingPeriodSpendingLimit = 35;
  assert.equal(hasSmsFormChanges(saved, state(current)), true);
  current.shared.billingPeriodSpendingLimit = "20";
  assert.equal(hasSmsFormChanges(saved, state(current)), false, "string and numeric input represent the same saved value");
});

test("ouvrir puis fermer un événement ne modifie pas les paramètres suivis", () => {
  const initial = fixture();
  const saved = state(initial);
  let expandedEventKey = null;
  expandedEventKey = expandedEventKey === "ready" ? null : "ready";
  expandedEventKey = expandedEventKey === "ready" ? null : "ready";
  assert.equal(expandedEventKey, null);
  assert.equal(hasSmsFormChanges(saved, state(initial)), false);
  assert.match(source, /const \[expandedEventKey, setExpandedEventKey\] = useState\(null\)/);
});

test("annuler une modification parmi plusieurs garde le bouton visible", () => {
  const initial = fixture();
  const saved = state(initial);
  const current = fixture();
  current.settings.events.ready.enabled = true;
  current.shared.internationalEnabled = true;
  current.settings.events.ready.enabled = false;
  const normalizedCurrent = state(current);
  assert.equal(hasSmsFormChanges(saved, normalizedCurrent), true);
  assert.deepEqual(Array.from(getChangedSharedSmsKeys(saved, normalizedCurrent)), ["internationalEnabled"]);
});

test("la sauvegarde confirmée prend les valeurs du serveur et garde l’indicateur Enregistré", () => {
  const initial = fixture();
  const current = fixture();
  current.settings.events.ready.enabled = true;
  const confirmedByServer = state(current);
  const updatedReference = createSavedSmsValues(
    confirmedByServer.settings,
    confirmedByServer.sharedSettings,
  );
  assert.equal(hasSmsFormChanges(updatedReference, confirmedByServer), false);
  assert.match(source, /savedValues\.current = createSavedSmsValues\(\s*confirmedSettings,\s*confirmedSharedSettings/);
  assert.match(source, /setSaved\(true\)/);
  assert.match(source, /hasUnsavedChanges \|\| saving \|\| saved/);
});

test("un échec conserve la référence serveur et les modifications à réessayer", () => {
  const initial = fixture();
  const saved = state(initial);
  const current = fixture();
  current.settings.events.ready.enabled = true;
  const normalizedCurrent = state(current);
  const saveBlock = source.slice(source.indexOf("async function save()"), source.indexOf("const destinations ="));
  const catchBlock = saveBlock.slice(saveBlock.indexOf("} catch (failure) {"));
  assert.doesNotMatch(catchBlock, /savedValues\.current\s*=/);
  assert.match(catchBlock, /setError\(/);
  assert.equal(hasSmsFormChanges(saved, normalizedCurrent), true);
  assert.match(source, /hasUnsavedChanges \|\| saving \|\| saved/);
});
