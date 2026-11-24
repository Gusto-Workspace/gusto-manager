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

function renderComponent(path, mocks, props) {
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
  const module = { exports: {} };
  const imports = { react, "react-dom": { createPortal: (child) => child }, ...mocks };
  runInNewContext(source, { exports: module.exports, module, document: { body: {} }, process: { env: { NEXT_PUBLIC_API_URL: "/api" } },
    FormData, AbortController, require: (name) => Object.hasOwn(imports, name) ? imports[name] : require(name) });
  return {
    effects,
    render() {
      index = 0;
      return module.exports.default(props);
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
  const importDialog = renderComponent("admin/restaurants/import-skello.admin.component.js", {
    axios: {
      get: async () => ({ data: { batches: [], target: { name: "Restaurant fictif" } } }),
      post: async (_path, form) => {
        const choices = form.get("choices");
        if (!choices) return { data: preview };
        posted.push(JSON.parse(choices));
        return { data: { ...preview, token: "fake-token", rows: [{ ...row, individual: [
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
  assert.deepEqual(posted, [[{ order: 1, destination: "create", keepExisting: false, creationReviewed: true }]]);
  const html = renderToStaticMarkup(importDialog.render());
  for (const label of ["Repris", "Conservés", "Non repris", "Cycle non documenté", "sans accès ni invitation"]) {
    assert.ok(html.includes(label), label);
  }
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
  }, { kind: "leave", employeeName: "Camille Exemple", baseUrl: "/api/test/inputs/employee" });
  assert.equal(input(endBalance.render(), "date").props.disabled, true);
  endBalance.effects.forEach((effect) => effect());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(input(endBalance.render(), "date").props.value, date);
  assert.ok(find(endBalance.render(), ({ props }) => props.url === `/api/test/inputs/employee/leave/${date}`));
});
