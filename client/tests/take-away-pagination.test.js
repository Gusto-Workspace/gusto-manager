const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const React = require("react");
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
function hooks() {
  const slots = [];
  let index;
  let effects;
  return {
    reset() { index = 0; effects = []; },
    identityEffects() { effects.slice(0, 2).forEach((effect) => effect()); },
    flushEffects() { effects.forEach((effect) => effect()); },
    react: { ...React, useCallback: (fn) => fn, useMemo: (fn) => fn(),
      useEffect(fn) { effects.push(fn); },
      useRef(initial) { const i = index++; return slots[i] ||= { current: initial }; },
      useState(initial) {
        const i = index++;
        if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
        return [slots[i], (next) => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }];
      },
    },
  };
}
const id = (n) => n.toString(16).padStart(24, "0");
const period = { restaurantId: "restaurant", from: "2026-10-01", to: "2026-10-31" };
function orders(count, date = "2026-10-15T12:00:00Z") {
  return Array.from({ length: count }, (_, n) => ({
    _id: id(n + 1), restaurant_id: "restaurant", orderNumber: `TA-${n + 1}`,
    scheduledFor: date, createdAt: "2026-10-01T12:00:00Z",
    paymentMethod: "on_site", status: "confirmed", fulfillmentMode: "pickup",
    customerFirstName: n === 0 ? "Élodie" : "Client",
  }));
}
function page(docs, params) {
  const remaining = docs.filter((order) =>
    (!params.cursor || order._id < params.cursor) &&
    order.scheduledFor.slice(0, 10) >= params.dateFrom &&
    order.scheduledFor.slice(0, 10) <= params.dateTo && visibility.isTakeAwayOrderVisible(order),
  ).sort((a, b) => b._id.localeCompare(a._id));
  const items = remaining.slice(0, params.limit);
  return { data: { orders: structuredClone(items), pagination: {
    hasMore: remaining.length > params.limit,
    nextCursor: remaining.length > params.limit ? items.at(-1)._id : null,
  } } };
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
function setup(t, get) {
  const original = { window: global.window, localStorage: global.localStorage };
  global.window = { location: { pathname: "/dashboard/take-away" } };
  global.localStorage = { getItem: () => "synthetic-test-token" };
  t.after(() => { global.window = original.window; global.localStorage = original.localStorage; });
  const h = hooks();
  const events = { close() {} };
  const Context = load("contexts/restaurant.context.js", {
    react: h.react,
    "next/router": { useRouter: () => ({ pathname: "/dashboard/take-away", query: {} }) },
    "jwt-decode": { jwtDecode: () => ({ role: "owner", id: "owner" }) },
    axios: { get },
    "@/_assets/utils/authenticated-events": { createAuthenticatedEventSource: () => events },
    "@/_assets/utils/take-away-visibility": visibility,
  }).default;
  const render = () => { h.reset(); const context = Context(); h.identityEffects(); return context; };
  let context = render();
  context.setRestaurantData({ _id: "restaurant" });
  context.setUserConnected({ role: "owner" });
  context = render();
  context.reconnectRealtime();
  return { render, context, emit(payload) { events.onmessage({ data: JSON.stringify({ restaurantId: "restaurant", ...payload }) }); } };
}

for (const count of [199, 200, 201, 300, 301, 701]) {
  test(`context loads and caches all ${count} orders, using only the requested month`, async (t) => {
    const docs = [...orders(count), ...orders(5, "2020-01-01T12:00:00Z")];
    const calls = [];
    const h = setup(t, async (url, { params }) => { calls.push({ url, params }); return page(docs, params); });
    const result = await h.context.loadTakeAwayOrderPeriod(period);
    assert.equal(result.length, count);
    assert.equal(new Set(result.map((order) => order._id)).size, count);
    assert.deepEqual(result.map((order) => order._id), orders(count).reverse().map((order) => order._id));
    assert.equal(h.render().takeAwayOrdersList.length, count);
    assert.equal(h.render().getCachedTakeAwayOrdersMonth(new Date(2026, 9, 1)).length, count);
    assert.equal(calls.length, Math.ceil(count / 200));
    assert.ok(calls.every(({ params }) => params.dateFrom === period.from && params.dateTo === period.to && params.limit === 200));
    await h.context.loadTakeAwayOrderPeriod(period);
    assert.equal(calls.length, Math.ceil(count / 200));
  });
}

test("SSE creation/update/deletion between pages overrides stale HTTP without duplicates or partial caching", async (t) => {
  const docs = orders(301);
  const waiting = deferred();
  const release = deferred();
  const h = setup(t, async (url, { params }) => {
    const result = page(docs, params);
    if (params.cursor) { waiting.resolve(); await release.promise; }
    return result;
  });
  const loading = h.context.loadTakeAwayOrderPeriod(period);
  await waiting.promise;
  assert.equal(h.render().takeAwayOrdersLoading, true);
  assert.equal(h.render().getCachedTakeAwayOrdersMonth(new Date(2026, 9, 1)), null);
  const newOrder = { ...docs[0], _id: id(900) };
  h.emit({ type: "takeaway_order_created", order: newOrder });
  h.emit({ type: "takeaway_order_created", order: newOrder });
  h.emit({ type: "takeaway_order_updated", order: { ...docs[0], status: "ready" } });
  h.emit({ type: "takeaway_order_updated", order: { ...docs[1], scheduledFor: "2026-11-01T12:00:00Z" } });
  h.emit({ type: "takeaway_order_deleted", orderId: docs[200]._id });
  h.emit({ type: "takeaway_orders_deleted", orderIds: [docs[2]._id, docs[3]._id] });
  h.emit({ type: "takeaway_order_updated", order: { ...docs[4], paymentMethod: "online", paymentStatus: "pending" } });
  h.emit({ restaurantId: "other", type: "takeaway_order_created", order: { ...newOrder, _id: id(901), restaurant_id: "other" } });
  release.resolve();
  const result = await loading;
  assert.equal(result.length, 297); // +1 creation, -1 moved, -3 deleted, -1 invisible
  assert.equal(new Set(result.map((order) => order._id)).size, result.length);
  assert.equal(result.find((order) => order._id === id(1)).status, "ready");
  assert.equal(result.filter((order) => order._id === newOrder._id).length, 1);
  h.emit({ type: "takeaway_order_updated", order: docs[200] });
  assert.equal(h.render().takeAwayOrdersList.length, 297);
  assert.equal(h.render().takeAwayOrdersLoading, false);
});

test("more than 500 SSE mutations during pagination survive the bounded override cache", async (t) => {
  const docs = orders(701);
  const waiting = deferred();
  const release = deferred();
  const h = setup(t, async (url, { params }) => {
    const result = page(docs, params);
    if (params.cursor && !waiting.done) { waiting.done = true; waiting.resolve(); await release.promise; }
    return result;
  });
  const loading = h.context.loadTakeAwayOrderPeriod(period);
  await waiting.promise;
  h.emit({ type: "takeaway_orders_deleted", orderIds: docs.slice(0, 600).map((order) => order._id) });
  h.emit({ type: "takeaway_order_updated", order: docs[0] }); // delayed after its override was evicted
  release.resolve();
  assert.equal((await loading).length, 101);
});

test("period changes, restaurant changes and a superseding forced request cannot replace the active result", async (t) => {
  const oldResponse = deferred();
  const docs = orders(301);
  const calls = [];
  const h = setup(t, async (url, { params }) => {
    calls.push(params);
    if (calls.length === 1) await oldResponse.promise;
    return page(docs, params);
  });
  const first = h.context.loadTakeAwayOrderPeriod(period);
  const november = { ...period, from: "2026-11-01", to: "2026-11-30" };
  await h.context.loadTakeAwayOrderPeriod(november);
  oldResponse.resolve();
  await first;
  assert.deepEqual(h.render().takeAwayOrdersList, []);
  assert.equal(h.render().getCachedTakeAwayOrdersMonth(new Date(2026, 9, 1)).length, 301);

  const pending = deferred();
  let active = pending;
  const second = setup(t, async (url, { params }) => { const gate = active; if (gate) await gate.promise; return page(docs, params); });
  const stale = second.context.loadTakeAwayOrderPeriod(period);
  active = null;
  await second.context.loadTakeAwayOrderPeriod({ ...period, force: true });
  pending.resolve();
  assert.equal(await stale, null);
  assert.equal(second.render().takeAwayOrdersList.length, 301);
  const restaurantGate = deferred();
  active = restaurantGate;
  const switched = second.context.loadTakeAwayOrderPeriod({ ...period, force: true });
  second.context.setRestaurantData({ _id: "other" });
  second.render();
  restaurantGate.resolve();
  assert.equal(await switched, null);
});

test("failed or malformed later pages never cache a truncated period, and retry reads all pages", async (t) => {
  const docs = orders(301);
  let failure = true;
  const h = setup(t, async (url, { params }) => {
    if (params.cursor && failure) throw new Error("Synthetic page failure");
    return page(docs, params);
  });
  assert.equal(await h.context.loadTakeAwayOrderPeriod(period), null);
  assert.equal(h.render().getCachedTakeAwayOrdersMonth(new Date(2026, 9, 1)), null);
  assert.deepEqual(h.render().takeAwayOrdersList, []);
  assert.equal(h.render().takeAwayOrdersLoading, false);
  failure = false;
  assert.equal((await h.context.loadTakeAwayOrderPeriod(period)).length, 301);
  for (const pagination of [undefined, { hasMore: true, nextCursor: "invalid" },
    { hasMore: true, nextCursor: id(102) }]) {
    const broken = setup(t, async (url, { params }) => {
      const response = page(docs, params);
      if (params.cursor) response.data.pagination = pagination;
      return response;
    });
    assert.equal(await broken.context.loadTakeAwayOrderPeriod(period), null);
    assert.equal(broken.render().getCachedTakeAwayOrdersMonth(new Date(2026, 9, 1)), null);
  }
});

test("foreground resync reloads every page and removes deletions missed during SSE suspension", async (t) => {
  let docs = orders(301);
  const h = setup(t, async (url, config) => url.endsWith("/take-away/orders")
    ? page(docs, config.params) : { data: { restaurant: { _id: "restaurant" } } });
  await h.context.loadTakeAwayOrderPeriod(period);
  h.emit({ type: "takeaway_order_updated", order: { ...docs[0], status: "ready" } });
  docs = docs.slice(1);
  await h.render().resyncAfterForeground();
  assert.equal(h.render().takeAwayOrdersList.length, 300);
  assert.equal(h.render().takeAwayOrdersList.some((order) => order._id === id(1)), false);
});

function find(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap((child) => find(child, predicate));
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...find(tree.props?.children, predicate)];
}
const empty = () => null;
function listHarness(file, restaurantContext) {
  const h = hooks();
  const router = { query: {}, isReady: true, pathname: "/dashboard/take-away",
    replace({ query }) { this.query = query; }, push({ query }) { this.query = query; } };
  const context = { ...restaurantContext,
    ensureTakeAwayOrdersMonth: async (date) => restaurantContext.getCachedTakeAwayOrdersMonth(date) };
  const stubs = { react: { ...h.react, useContext: () => ({ restaurantContext: context }) },
    "next/router": { useRouter: () => router },
    "@/contexts/global.context": { GlobalContext: {} },
    "./take-away.utils": utils, "../../take-away/take-away.utils": utils,
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
  return { render() { h.reset(); return List(); }, flushEffects: h.flushEffects };
}

test("both real interfaces include orders beyond page 1 in calendars, search, day lists and status counts", async (t) => {
  const today = new Date();
  const day = new Date(today.getFullYear(), today.getMonth(), 15, 12).toISOString();
  const docs = orders(701, day);
  docs[0].status = "ready";
  for (const file of ["components/dashboard/take-away/list.take-away.component.js",
    "components/dashboard/webapp/take-away/list.take-away.webapp.js"]) {
    await t.test(file, async (t) => {
    const h = setup(t, async (url, { params }) => page(docs, params));
    await h.context.loadTakeAwayOrderPeriod({ restaurantId: "restaurant",
      from: utils.toDateKey(new Date(today.getFullYear(), today.getMonth(), 1)),
      to: utils.toDateKey(new Date(today.getFullYear(), today.getMonth() + 1, 0)) });
    const list = listHarness(file, h.render());
    let tree = list.render();
    let calendar = find(tree, (node) => Array.isArray(node.props?.monthGridDays))[0];
    assert.equal(calendar.props.monthGridDays.reduce((total, cell) => total + cell.total, 0), 701, file);
    const search = find(tree, (node) => node.type === "input" && node.props.inputMode === "search")[0];
    search.props.onChange({ target: { value: "elodie" } });
    calendar = find(list.render(), (node) => Array.isArray(node.props?.monthGridDays))[0];
    assert.deepEqual(calendar.props.monthGridDays.flatMap((cell) => cell.orders).map((order) => order._id), [id(1)], file);
    search.props.onChange({ target: { value: "" } });
    const status = find(list.render(), (node) => node.type === "select")[0];
    status.props.onChange({ target: { value: "ready" } });
    calendar = find(list.render(), (node) => Array.isArray(node.props?.monthGridDays))[0];
    assert.deepEqual(calendar.props.monthGridDays.flatMap((cell) => cell.orders).map((order) => order._id), [id(1)], file);
    status.props.onChange({ target: { value: "all" } });
    calendar.props.setSelectedDay(new Date(day));
    list.render();
    list.flushEffects();
    tree = list.render();
    const all = find(tree, (node) => node.type === "option" && node.props.value === "all")[0];
    assert.ok(JSON.stringify(all.props.children).includes("701"));
    assert.equal(find(tree, (node) => node.props?.order && typeof node.props?.onOpenDetails === "function").length, 701);
    // SSE deletion updates the same cache consumed by both calendars.
    h.emit({ type: "takeaway_order_deleted", orderId: id(1) });
    const refreshed = listHarness(file, h.render());
    calendar = find(refreshed.render(), (node) => Array.isArray(node.props?.monthGridDays))[0];
    assert.equal(calendar.props.monthGridDays.reduce((total, cell) => total + cell.total, 0), 700);
    });
  }
});
