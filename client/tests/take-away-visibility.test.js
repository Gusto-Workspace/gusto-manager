const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const babel = require("next/dist/compiled/babel/core");
const packages = require("next/dist/compiled/babel-packages");

function load(file, stubs = {}) {
  const filename = path.join(__dirname, "../src", file);
  const code = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    filename, babelrc: false, configFile: false,
    presets: [[packages.presetReact().default, { runtime: "automatic" }]],
    plugins: [packages.pluginTransformModulesCommonjs().default],
  }).code;
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)(
    (name) => name in stubs ? stubs[name] : require(name), mod, mod.exports,
  );
  return mod.exports;
}
const visibility = load("_assets/utils/take-away-visibility.js");
const utils = load("components/dashboard/take-away/take-away.utils.js");
const empty = () => null;
const modalPath = "components/dashboard/webapp/take-away/confirm-modal.take-away.webapp.js";
const common = {
  "@/_assets/utils/take-away-visibility": visibility,
  "../webapp/take-away/confirm-modal.take-away.webapp": empty,
  "./confirm-modal.take-away.webapp": empty,
  "./order-adjustments.take-away.component": empty,
  "./order-details.take-away.component": empty,
  "../../take-away/order-adjustments.take-away.component": empty,
  "../../take-away/order-details.take-away.component": empty,
  "./take-away.utils": utils,
  "../../take-away/take-away.utils": utils,
  "@/components/_shared/use-mobile-drawer-swipe": () => ({
    getOverlayOpacity: () => 1, getPanelStyle: () => ({}), resetDrag() {},
  }),
};
const drawerPaths = ["components/dashboard/take-away/order-drawer.take-away.component.js",
  "components/dashboard/webapp/take-away/order-drawer.take-away.webapp.js"];
const base = { _id: "order", restaurant_id: "restaurant", orderNumber: "TA-1",
  paymentMethod: "online", paymentStatus: "paid", status: "completed", total: 10,
  scheduledFor: new Date().toISOString(), fulfillmentMode: "pickup" };

test("both actual drawers offer deletion only for visible completed/canceled orders", () => {
  for (const file of drawerPaths) {
    const Drawer = load(file, common).default;
    for (const status of ["pending", "confirmed", "preparing", "ready", "out_for_delivery", "completed", "canceled", "rejected"]) {
      const html = renderToStaticMarkup(React.createElement(Drawer, { open: true, order: { ...base, status } }));
      assert.equal(html.includes("Supprimer"), ["completed", "canceled"].includes(status), `${file}: ${status}`);
    }
    for (const extra of [{ deletedAt: new Date() }, { paymentStatus: "pending" }, { paymentStatus: "failed" }]) {
      assert.equal(renderToStaticMarkup(React.createElement(Drawer, { open: true, order: { ...base, ...extra } })).includes("Supprimer"), false);
    }
  }
});

test("the confirmation explains retention and offers Conserver / Supprimer la commande", () => {
  const Modal = load(modalPath, common).default;
  const html = renderToStaticMarkup(React.createElement(Modal, { open: true, order: base, status: "delete" }));
  assert.match(html, /Conserver/);
  assert.match(html, /Supprimer la commande/);
  assert.match(html, /historique visible/);
  assert.match(html, /Aucun remboursement/);
});

function hooks() {
  const slots = [];
  let index = 0;
  return {
    reset() { index = 0; },
    react: { ...React, useEffect() {}, useCallback: (fn) => fn,
      useMemo: (fn) => fn(),
      useRef(initial) { const i = index++; return slots[i] ||= { current: initial }; },
      useState(initial) {
        const i = index++;
        if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
        return [slots[i], (next) => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }];
      },
    },
  };
}
function find(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap((child) => find(child, predicate));
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...find(tree.props?.children, predicate)];
}

test("drawer deletion waits for confirmation and forwards the delete action", async () => {
  for (const file of drawerPaths) {
    const h = hooks();
    const calls = [];
    const Drawer = load(file, { ...common, react: h.react }).default;
    const render = () => { h.reset(); return Drawer({ open: true, order: base, onAction: async (...args) => { calls.push(args); return true; } }); };
    const button = find(render(), (node) => node.type === "button" && String(JSON.stringify(node.props.children)).includes("Supprimer"))[0];
    button.props.onClick();
    assert.equal(calls.length, 0);
    const confirmation = find(render(), (node) => node.props?.status === "delete")[0];
    assert.equal(confirmation.props.open, true);
    await confirmation.props.onConfirm();
    assert.deepEqual(calls, [[base, "delete"]]);
  }
});

test("the actual restaurant context filters SSE and HTTP, deduplicates successes and preserves delete tombstones", async (t) => {
  const h = hooks();
  let response = [];
  let release;
  const Context = load("contexts/restaurant.context.js", {
    react: h.react,
    "next/router": { useRouter: () => ({ pathname: "/dashboard/take-away", query: {} }) },
    axios: { get: async () => { if (release) await new Promise((resolve) => { release.resolve = resolve; }); return { data: { orders: response, pagination: { hasMore: false, nextCursor: null } } }; } },
    "@/_assets/utils/authenticated-events": { createAuthenticatedEventSource: () => ({}) },
    "@/_assets/utils/take-away-visibility": visibility,
  }).default;
  const oldWindow = global.window;
  const oldStorage = global.localStorage;
  global.window = {};
  global.localStorage = { getItem: () => "synthetic-test-token" };
  t.after(() => { global.window = oldWindow; global.localStorage = oldStorage; });
  const render = () => { h.reset(); return Context(); };
  let context = render();
  context.setRestaurantData({ _id: "restaurant" });
  context = render();
  const period = { restaurantId: "restaurant", from: "2000-01-01", to: "2099-12-31" };
  response = [{ ...base, paymentStatus: "pending" }, base, { ...base, _id: "hidden", deletedAt: new Date() }];
  await context.loadTakeAwayOrderPeriod(period);
  context = render();
  assert.deepEqual(context.takeAwayOrdersList.map((order) => order._id), ["order"]);
  context.applyTakeAwayOrderUpdate({ ...base, _id: "abandoned", paymentStatus: "pending", status: "canceled" });
  context.applyTakeAwayOrderUpdate(base);
  context.applyTakeAwayOrderUpdate(base);
  assert.equal(render().takeAwayOrdersList.length, 1);
  release = {};
  const staleRequest = context.loadTakeAwayOrderPeriod({ ...period, force: true });
  context.applyTakeAwayOrderUpdate({ ...base, deletedAt: new Date() });
  release.resolve();
  await staleRequest;
  context.applyTakeAwayOrderUpdate(base); // a delayed pre-delete SSE
  context = render();
  assert.equal(context.isTakeAwayOrderDeleted(base._id), true);
  assert.deepEqual(context.takeAwayOrdersList, []);
  assert.deepEqual(context.getCachedTakeAwayOrdersMonth(new Date(), "restaurant"), null);
});

test("both lists call DELETE, remove the order locally and close their drawer only on success", async (t) => {
  const originalStorage = global.localStorage;
  global.localStorage = { getItem: () => "synthetic-test-token" };
  t.after(() => { global.localStorage = originalStorage; });
  for (const file of ["components/dashboard/take-away/list.take-away.component.js",
    "components/dashboard/webapp/take-away/list.take-away.webapp.js"]) {
    const h = hooks();
    const requests = [];
    const updates = [];
    let fail = false;
    const restaurantContext = { restaurantData: { _id: "restaurant" }, takeAwayOrdersList: [base],
      getCachedTakeAwayOrdersMonth: () => [base], applyTakeAwayOrderUpdate: (order) => updates.push(order) };
    const stubs = { ...common, react: { ...h.react, useContext: () => ({ restaurantContext }) },
      axios: async (request) => { requests.push(request); if (fail) throw { response: { status: 409 } }; return { data: { orderId: base._id } }; },
      "next/router": { useRouter: () => ({ query: {}, pathname: "/dashboard/take-away", replace() {} }) },
      "@/contexts/global.context": { GlobalContext: {} },
      "./header.take-away.component": { default: empty, AddOrderAction: empty, __esModule: true },
      "./form.take-away.component": { EmptyState: empty },
      "@/components/_shared/_svgs/notification.svg": { NotificationSvg: empty },
    };
    for (const name of ["../_shared/catalog-header.dashboard.component", "./calendar-month.take-away.component",
      "./order-card.take-away.component", "./order-drawer.take-away.component", "./date-block-toggle.take-away.component",
      "@/components/_shared/notifications/notifications-drawer.component", "@/components/_shared/reservations/reservations-period-loading.component",
      "../_shared/bottom-sheet-change-restaurant.webapp", "../_shared/sidebar.webapp", "./order-card.take-away.webapp",
      "./order-drawer.take-away.webapp", "../../take-away/calendar-month.take-away.component", "../../take-away/date-block-toggle.take-away.component"]) stubs[name] = empty;
    const List = load(file, stubs).default;
    const render = () => { h.reset(); return List(); };
    let drawer = find(render(), (node) => typeof node.props?.onAction === "function")[0];
    fail = true;
    assert.equal(await drawer.props.onAction(base, "delete"), false);
    assert.equal(updates.length, 0);
    fail = false;
    assert.equal(await drawer.props.onAction(base, "delete"), true);
    assert.equal(requests.at(-1).method, "delete");
    assert.ok(requests.at(-1).url.endsWith("/take-away/orders/order"));
    assert.equal(updates[0]._id, base._id);
    assert.ok(updates[0].deletedAt);
    drawer = find(render(), (node) => typeof node.props?.onAction === "function")[0];
    assert.equal(drawer.props.open, false);
    assert.equal(drawer.props.order, null);
  }
});
