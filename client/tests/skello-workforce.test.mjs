import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { Children } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const { transformSync } = require("next/dist/build/swc");
const dashboard = new URL("../src/components/dashboard/", import.meta.url);

function renderComponent(path, mocks, props, globals = {}) {
  const states = [];
  const effects = [];
  const element = { showModal() {}, close() {}, focus() {} };
  let index;
  const react = {
    useRef: () => ({ current: element }),
    useId: () => "test-id",
    useEffect: (callback) => effects.push(callback),
    useState(initial) {
      const slot = index++;
      if (!(slot in states)) states[slot] = initial;
      return [states[slot], (next) => {
        states[slot] = typeof next === "function" ? next(states[slot]) : next;
      }];
    },
  };
  const filename = new URL(path, dashboard);
  const source = transformSync(readFileSync(filename, "utf8"), {
    filename: filename.pathname, swcrc: false, configFile: false,
    jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
    module: { type: "commonjs" },
  }).code;
  const compiled = { exports: {} };
  const imports = { react, "react-dom": { createPortal: (child) => child }, ...mocks };
  runInNewContext(source, { exports: compiled.exports, module: compiled, document: { body: {} }, process: { env: { NEXT_PUBLIC_API_URL: "/api" } },
    FormData, AbortController, ...globals, require: (name) => Object.hasOwn(imports, name) ? imports[name] : require(name) });
  return {
    effects,
    render() {
      index = 0;
      return compiled.exports.default(props);
    },
  };
}

function find(tree, condition) {
  if (!tree?.props) return undefined;
  if (condition(tree)) return tree;
  return Children.toArray(tree.props.children).map((child) => find(child, condition)).find(Boolean);
}
const button = (tree, label) => find(tree, ({ type, props }) =>
  type === "button" && Children.toArray(props.children).some((child) => typeof child === "string" && child.includes(label)));
const input = (tree, type) => find(tree, (entry) => entry.type === "input" && entry.props.type === type);

test("le parcours Skello exige une vérification manuelle et affiche les décisions par champ", async () => {
  const row = { order: 1, firstname: "Camille", lastname: "Exemple", canCreate: true, type: "CDI", volume: 35, candidates: [] };
  const preview = { period: { from: "2026-11-01", to: "2026-11-30" }, issues: [], rows: [row], token: null };
  const posted = [];
  const completed = { id: "lot-fictif", period: preview.period, summary: {
    counts: { created: 1, skipped: 0, linked: 0 }, history: { ignoredHistory: 1 },
    individual: { imported: 1, preserved: 1, ignored: 1 }, issues: [], historyConflicts: ["Planning verrouillé."],
  } };
  const importDialog = renderComponent("admin/restaurants/import-skello.admin.component.js", {
    axios: {
      get: async () => ({ data: { batches: [], target: { name: "Restaurant fictif" } } }),
      post: async (path, form) => {
        const choices = form.get("choices");
        if (!choices) return { data: preview };
        posted.push(form);
        if (!path.endsWith("/preview")) return { data: { batch: completed, alreadyImported: false } };
        return { data: { ...preview, token: "fake-token", summary: completed.summary, requiresProtectionConfirmation: true,
          rows: [{ ...row, history: { counts: { ignoredHistory: 1 }, conflicts: [{ date: "2026-11-10", message: "Planning verrouillé." }] }, individual: [
          { field: "transport", status: "imported", value: 0 },
          { field: "grossSalary", status: "preserved", value: 1800 },
          { field: "annual", status: "ignored", reason: "Cycle non documenté." },
        ] }] } };
      },
    },
    "../_shared/utils/admin-auth.utils": { getAdminAuthConfig: () => ({}) },
    "./hr-configuration.admin.component": () => null,
    "../../employees/hr-questionnaire.employees.component": () => null,
  }, { restaurantId: "test" });
  await button(importDialog.render(), "Importer un rapport RH Skello").props.onClick();
  input(importDialog.render(), "file").props.onChange({ target: { files: [new File(["données fictives"], "rapport.xlsx")] } });
  await button(importDialog.render(), "Analyser le fichier").props.onClick();
  find(importDialog.render(), ({ type, props }) => type === "select" && props.value === "").props.onChange({ target: { value: "create" } });
  let tree = importDialog.render();
  assert.equal(button(tree, "Vérifier le rapprochement").props.disabled, true);
  input(tree, "checkbox").props.onChange({ target: { checked: true } });
  tree = importDialog.render();
  assert.equal(button(tree, "Vérifier le rapprochement").props.disabled, false);
  await button(tree, "Vérifier le rapprochement").props.onClick();
  assert.deepEqual(JSON.parse(posted[0].get("choices")), [{ order: 1, destination: "create", creationReviewed: true }]);
  const html = renderToStaticMarkup(importDialog.render());
  for (const label of ["Repris", "Conservés", "Non repris", "Cycle non documenté", "PIN Pointeuse", "La connexion Gusto s’active depuis la fiche salarié"]) {
    assert.ok(html.includes(label), label);
  }
  tree = importDialog.render();
  assert.equal(button(tree, "Confirmer l’import").props.disabled, true);
  const confirmation = find(tree, ({ props }) => props["aria-labelledby"] === "skello-review-heading");
  input(confirmation, "checkbox").props.onChange({ target: { checked: true } });
  await button(importDialog.render(), "Confirmer l’import").props.onClick();
  assert.equal(posted[1].get("acceptProtected"), "true");
  assert.equal(posted[1].get("confirmed"), "true");
  assert.match(renderToStaticMarkup(importDialog.render()), /Import terminé.*Données individuelles conservées.*Planning verrouillé/s);
});

test("la fiche ouvre le solde enregistré à sa date réelle", async () => {
  const date = "2026-11-30";
  const endBalance = renderComponent("employees/personnel-report-input.employees.component.js", {
    axios: { get: async (_url, { params }) => {
      assert.equal(params.latest, true);
      return { data: { date } };
    } },
    "../_shared/use-dialog-backdrop": () => ({}),
    "./planning-grid.utils.mjs": { parisPlanningDateKey: () => "2026-11-24" },
    "./personnel-report.utils.mjs": { formatReportValue: (value) => value },
    "../../../../public/locales/fr/planning.json": {},
    "./hr-rule-help.mjs": { hrRuleHelp: {} },
    "./hr-questionnaire.mjs": await import("../src/components/dashboard/employees/hr-questionnaire.mjs"),
    "../time-clock/time-clock.utils": { getAuthConfig: (config) => config },
  }, { kind: "leave", employeeName: "Camille Exemple", baseUrl: "/api/test/inputs/employee" });
  assert.equal(input(endBalance.render(), "date").props.disabled, true);
  endBalance.effects.forEach((effect) => effect());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(input(endBalance.render(), "date").props.value, date);
  assert.ok(find(endBalance.render(), ({ props }) => props.url === `/api/test/inputs/employee/leave/${date}`));
});

test("les paramètres RH ouvrent chaque version programmée en consultation à sa date exacte", async () => {
  const active = { date: "2026-10-01", values: { mode: "indemnities" } };
  const planned = { date: "2026-12-01", values: { mode: "tickets" } };
  const dialog = renderComponent("employees/personnel-report-input.employees.component.js", {
    axios: { get: async () => ({ data: { active: { rules: active }, planned: { rules: planned },
      scheduled: { rules: [planned, { date: "2027-01-01", values: { mode: "basket" } }] }, missingKinds: ["overtime"] } }) },
    "../_shared/use-dialog-backdrop": () => ({}),
    "./planning-grid.utils.mjs": { parisPlanningDateKey: () => "2026-11-24" },
    "./personnel-report.utils.mjs": {},
    "../../../../public/locales/fr/planning.json": {},
    "./hr-rule-help.mjs": { hrRuleHelp: {} },
    "./hr-questionnaire.mjs": await import("../src/components/dashboard/employees/hr-questionnaire.mjs"),
    "../time-clock/time-clock.utils": { getAuthConfig: (config) => config },
  }, { kind: "settings", baseUrl: "/api/reports/inputs", overviewUrl: "/api/hr-configuration/draft",
    from: "2026-11-01", initialDate: "2026-11" });
  dialog.render();
  dialog.effects.forEach((effect) => effect());
  await new Promise((resolve) => setImmediate(resolve));
  const tree = dialog.render();
  assert.ok(button(tree, "En vigueur depuis le 2026-10-01"));
  assert.ok(button(tree, "Programmé le 2026-12-01"));
  button(tree, "Programmé le 2027-01-01").props.onClick();
  const displayed = find(dialog.render(), ({ props }) => props.url === "/api/reports/inputs/rules/2027-01");
  assert.equal(displayed.props.readOnly, true);
  button(dialog.render(), "Heures majorées").props.onClick();
  assert.equal(find(dialog.render(), ({ type, props }) => type === "p" && props.children === "À compléter. Aucune version enregistrée.").type, "p");
});

test("l’activation confirme le destinataire et propose le renvoi des mêmes identifiants après un échec", async () => {
  const entry = { name: "Camille Exemple", email: "camille@example.test", phone: "0100000000",
    loginStatus: { active: false, hasPassword: false, delivery: null } };
  const requests = [];
  let confirmed = false;
  const card = renderComponent("employees/account-activation.employees.component.js", {
    axios: { post: async (url, body) => {
      requests.push({ url, body: { ...body } });
      return { data: { delivery: body.resend ? "sent" : "failed" } };
    } },
  }, {
    entry, endpoint: "/employees/fictif/account-activation", canActivate: true,
    onDelivery(delivery) { entry.loginStatus = { active: true, hasPassword: true, delivery }; },
  }, { window: { confirm(message) {
    assert.match(message, /camille@example\.test/);
    return confirmed;
  } } });
  assert.match(renderToStaticMarkup(card.render()), /Compte non activé/);
  await button(card.render(), "Activer le compte employé").props.onClick();
  assert.equal(requests.length, 0);
  confirmed = true;
  await button(card.render(), "Activer le compte employé").props.onClick();
  assert.match(renderToStaticMarkup(card.render()), /Compte actif.*L’envoi a échoué/);
  await button(card.render(), "Renvoyer les identifiants").props.onClick();
  assert.match(renderToStaticMarkup(card.render()), /Les identifiants ont été envoyés/);
  assert.deepEqual(requests.map(({ body }) => body), [
    { confirmed: true, email: entry.email, resend: false },
    { confirmed: true, email: entry.email, resend: true },
  ]);
});
