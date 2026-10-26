const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const clientRoot = path.join(__dirname, "../../client");
const React = require(path.join(clientRoot, "node_modules/react"));
const { renderToStaticMarkup } = require(
  path.join(clientRoot, "node_modules/react-dom/server"),
);
const babel = require(
  path.join(clientRoot, "node_modules/next/dist/compiled/babel/core"),
);
const packages = require(
  path.join(clientRoot, "node_modules/next/dist/compiled/babel-packages"),
);

function load(file, stubs = {}) {
  const filename = path.join(
    clientRoot,
    "src/components/dashboard/dashboard",
    file,
  );
  const code = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    filename,
    babelrc: false,
    configFile: false,
    presets: [[packages.presetReact().default, { runtime: "classic" }]],
    plugins: [packages.pluginTransformModulesCommonjs().default],
  }).code;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    React,
    require: (name) => {
      if (name === "react") return React;
      if (name in stubs) return stubs[name];
      throw new Error(`Unexpected UI import: ${name}`);
    },
  });
  return exports;
}
const empty = () => null;
const { default: Chart, SalesTooltip } = load(
  "monthly-gift-card-sales-chart.dashboard.component.js",
  {
    "next-i18next": { useTranslation: () => ({ t: (key) => key }) },
    recharts: Object.fromEntries(
      [
        "AreaChart",
        "Area",
        "XAxis",
        "YAxis",
        "CartesianGrid",
        "Tooltip",
        "ResponsiveContainer",
      ].map((name) => [name, empty]),
    ),
    "lucide-react": { Loader2: empty },
  },
);
const point = { month: "10/2026", total: 49, onlineNet: 19, onSiteOrders: 30 };
const renderChart = (extra = {}) =>
  renderToStaticMarkup(
    React.createElement(Chart, {
      data: [point],
      currency: "eur",
      showPaymentBreakdown: true,
      title: "Ventes à emporter",
      subtitle: "Montant des ventes à emporter des 6 derniers mois.",
      ...extra,
    }),
  );

test("activity card keeps Total and moves the payment breakdown into the info button tooltip", () => {
  const html = renderChart();
  assert.match(html, /Total/);
  assert.match(html, /49 €/);
  assert.match(html, /role="tooltip"/);
  assert.match(html, /En ligne : 19 € et au retrait : 30 €/);
  assert.match(html, /aria-label="Détail du total"/);
  assert.match(html, /aria-describedby="sales-breakdown-/);
  assert.match(html, /group-hover\/total-info:visible/);
  assert.match(html, /group-focus-within\/total-info:visible/);
  assert.doesNotMatch(html, /title=|delay-|duration-/);
  assert.match(html, /Mois en cours/);
  assert.match(html, /Montant des ventes à emporter des 6 derniers mois\./);
  assert.doesNotMatch(
    html,
    /Total suivi|Encaissement au retrait non confirmé|net Stripe|\(commandes\)/,
  );
  assert.match(renderChart({ currency: "usd" }), /\$US/);
});

test("activity tooltip exposes the same coherent breakdown and does not claim on-site receipt", () => {
  const html = renderToStaticMarkup(
    React.createElement(SalesTooltip, {
      active: true,
      payload: [{ value: 49, payload: point }],
      label: point.month,
      currencySymbol: "€",
      showPaymentBreakdown: true,
    }),
  );
  for (const text of ["49", "19", "30", "En ligne :", "Au retrait :"])
    assert.ok(html.includes(text), text);
  assert.doesNotMatch(
    html,
    /Total suivi|Encaissement au retrait non confirmé|\(|\)/,
  );
});

test("missing Stripe configuration is displayed as unavailable, never as confirmed zero online receipts", () => {
  const html = renderChart({ onlineAvailable: false });
  assert.match(html, /Indisponible/);
  assert.match(html, /En ligne : Indisponible et au retrait : 30 €/);
  const utils = load("financial-dashboard.utils.js");
  assert.equal(
    utils.selectedFinancialSeries(
      {
        take_away: [
          { currency: "eur", monthlySales: [point], onlineAvailable: false },
        ],
      },
      ["take_away"],
      "take_away",
      "eur",
    ).onlineAvailable,
    false,
  );
});

test("gift-card chart retains its total display without the on-site breakdown", () => {
  const html = renderChart({ showPaymentBreakdown: false });
  assert.doesNotMatch(html, /Total suivi|Au retrait|En ligne|<button/);
  assert.match(html, /Total/);
});

test("missing Stripe data is not shown as zero sales when switching from on-site activity to gift cards", () => {
  const html = renderChart({
    showPaymentBreakdown: false,
    onlineAvailable: false,
  });
  assert.match(html, /Indisponible/);
  assert.match(html, /données en ligne indisponibles/);
  assert.doesNotMatch(html, /49 €|Mois en cours/);
});
