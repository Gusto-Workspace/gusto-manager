const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("next/dist/compiled/babel/core");
const packages = require("next/dist/compiled/babel-packages");
const origin = "https://gusto.example";
const configs = [
  ["reservations", "reservations", "sw-reservations.js", "reservationId"],
  ["gift_cards", "gift-cards", "sw-giftcards.js", "purchaseId"],
  ["take_away", "take-away", "sw-take-away.js", "orderId"],
];
const base = (slug) => `/dashboard/webapp/${slug}`;
function storage() {
  const data = new Map();
  return {
    getItem: (k) => data.get(k) || null,
    setItem: (k, v) => data.set(k, v),
  };
}
function load(file, sandbox = {}, stubs = {}) {
  const filename = path.join(__dirname, "../src", file);
  const code = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    filename,
    babelrc: false,
    configFile: false,
    presets: [[packages.presetReact().default, { runtime: "automatic" }]],
    plugins: [packages.pluginTransformModulesCommonjs().default],
  }).code;
  const mod = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, {
    URL,
    URLSearchParams,
    console,
    setTimeout,
    clearTimeout,
    ...sandbox,
  })((name) => (name in stubs ? stubs[name] : require(name)), mod, mod.exports);
  return mod.exports;
}
function page(initialPath, restaurantId = "A", sharedSession = storage()) {
  const window = { location: new URL(initialPath, origin) };
  const sandbox = { window, sessionStorage: sharedSession };
  const utils = load("_assets/utils/push-window.js", sandbox);
  const logs = [];
  const restaurant = {
    isAuth: true,
    dataLoading: false,
    restaurantData: { _id: restaurantId },
  };
  const router = {
    isReady: true,
    push: async (url) => {
      logs.push(["push", url]);
      window.location = new URL(url, origin);
      return true;
    },
  };
  const client = {
    get url() {
      return window.location.href;
    },
    postMessage(message, ports) {
      utils.handlePushWindowMessage(
        {
          data: message,
          ports,
          origin,
          source: {
            scriptURL: `${origin}/${configs.find(([m]) => m === message.module)?.[2]}`,
          },
        },
        { router, restaurant, userId: "user-A" },
      );
    },
    navigate() {
      throw new Error("The worker must never navigate a client directly");
    },
    async focus() {
      logs.push(["focus"]);
    },
  };
  return { utils, client, window, restaurant, router, sandbox, logs };
}
function worker(file, pages = [], openResult = null) {
  const handlers = {},
    shown = [],
    badges = [],
    opened = [],
    warnings = [];
  const self = {
    location: { origin },
    navigator: {
      setAppBadge: async (count) => badges.push(count),
      clearAppBadge: async () => badges.push(0),
    },
    registration: {
      showNotification: async (title, options) =>
        shown.push({ title, ...options }),
    },
    clients: {
      matchAll: async () => pages.map((p) => p.client),
      openWindow: async (url) => {
        opened.push(url);
        if (openResult instanceof Error) throw openResult;
        return openResult;
      },
    },
    skipWaiting: async () => {},
    addEventListener: (name, fn) => (handlers[name] = fn),
  };
  self.clients.claim = async () => {};
  const context = vm.createContext({
    self,
    URL,
    MessageChannel,
    clearTimeout,
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 40)),
    console: { warn: (...args) => warnings.push(args) },
  });
  const execute = (name) =>
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "../public", name), "utf8"),
      context,
    );
  context.importScripts = (url) =>
    execute(new URL(url, origin).pathname.slice(1));
  execute(file);
  return {
    shown,
    badges,
    opened,
    warnings,
    async dispatch(type, payload) {
      let pending,
        closed = false;
      const notification = {
        data: payload,
        close() {
          closed = true;
        },
      };
      handlers[type]({
        data: { json: () => payload },
        notification,
        waitUntil(p) {
          pending = p;
        },
      });
      await pending;
      return closed;
    },
  };
}

for (const [module, slug, file, entityKey] of configs) {
  const payload = {
    module,
    restaurantId: "A",
    userId: "user-A",
    title: "Nouvelle activité",
    message: "Test",
    link: `${base(slug)}?${entityKey}=entity-1&day=2026-10-26#detail`,
    data: { notificationId: "notif-1", badgeCount: 3 },
  };
  test(`${module}: never reuses Manager, Pointage, or a foreign module`, async () => {
    for (const pathname of [
      "/dashboard/manager",
      base("time-clock"),
      ...configs.filter(([m]) => m !== module).map(([, s]) => base(s)),
    ]) {
      const foreign = page(pathname);
      const sw = worker(file, [foreign]);
      assert.equal(await sw.dispatch("notificationclick", payload), true);
      assert.equal(foreign.logs.length, 0);
      assert.equal(sw.opened.length, 1);
      const target = new URL(sw.opened[0]);
      assert.equal(target.pathname, base(slug));
      assert.equal(target.searchParams.get("restaurantId"), "A");
      assert.equal(target.searchParams.get(entityKey), "entity-1");
      assert.equal(target.hash, "#detail");
    }
  });
  test(`${module}: selects its own proven window among simultaneous apps`, async () => {
    const manager = page("/dashboard/manager");
    const target = page(base(slug));
    const sw = worker(file, [
      manager,
      page(base("time-clock")),
      target,
      ...configs.filter(([m]) => m !== module).map(([, s]) => page(base(s))),
    ]);
    await sw.dispatch("notificationclick", payload);
    assert.deepEqual(manager.logs, []);
    assert.equal(target.logs[0][0], "push");
    assert.equal(target.logs[1][0], "focus");
    assert.equal(sw.opened.length, 0);
  });
  test(`${module}: rejects a Manager window manually routed into the module, including after reload`, async () => {
    const session = storage();
    const manager = page("/dashboard/manager", "A", session);
    manager.window.location = new URL(base(slug), origin);
    assert.equal(manager.utils.canUsePushModule(module), false);
    const reloaded = page(base(slug), "A", session);
    const sw = worker(file, [reloaded]);
    await sw.dispatch("notificationclick", payload);
    assert.equal(reloaded.logs.length, 0);
    assert.equal(sw.opened.length, 1);
  });
  test(`${module}: receives/displays only matching or legacy payloads and updates badge`, async () => {
    const sw = worker(file);
    await sw.dispatch("push", payload);
    assert.equal(sw.shown.length, 1);
    assert.equal(sw.shown[0].data.module, module);
    assert.equal(sw.shown[0].data.restaurantId, "A");
    assert.deepEqual(sw.badges, [3]);
    await sw.dispatch("push", { ...payload, data: { badgeCount: 0 } });
    assert.deepEqual(sw.badges, [3, 0]);
    await sw.dispatch("push", { ...payload, module: "foreign" });
    assert.equal(sw.shown.length, 2);
    const legacy = { ...payload };
    delete legacy.module;
    delete legacy.restaurantId;
    await sw.dispatch("push", legacy);
    assert.equal(sw.shown.length, 3);
    await sw.dispatch("notificationclick", legacy);
    assert.equal(
      new URL(sw.opened[0]).searchParams.get("notificationId"),
      "notif-1",
    );
  });
  test(`${module}: sanitizes external, invalid and sibling-prefix links`, async () => {
    for (const link of [
      "https://evil.example/",
      "http://[",
      `${base(slug)}-other?secret=1`,
      "javascript:alert(1)",
    ]) {
      const sw = worker(file);
      await sw.dispatch("push", { ...payload, link });
      const target = new URL(sw.shown[0].data.link);
      assert.equal(target.origin, origin);
      assert.equal(target.pathname, base(slug));
      assert.equal(target.searchParams.has("secret"), false);
    }
  });
  test(`${module}: empty/legacy clients, openWindow null and rejection are handled`, async () => {
    for (const result of [null, new Error("blocked")]) {
      const sw = worker(file, [], result);
      await sw.dispatch("notificationclick", payload);
      assert.equal(sw.opened.length, 1);
    }
    const oldPage = { client: { url: origin + base(slug), postMessage() {} } };
    const sw = worker(file, [oldPage]);
    await sw.dispatch("notificationclick", payload);
    assert.equal(sw.opened.length, 1);
  });
  test(`${module}: never displays A's detail in B's window or another user's window`, async () => {
    const b = page(base(slug), "B");
    const sw = worker(file, [b]);
    await sw.dispatch("notificationclick", payload);
    assert.deepEqual(b.logs, []);
    assert.equal(sw.opened.length, 1);
    const a = page(base(slug), "A");
    const sw2 = worker(file, [a]);
    await sw2.dispatch("notificationclick", {
      ...payload,
      userId: "another-user",
    });
    assert.deepEqual(a.logs, []);
    assert.equal(sw2.opened.length, 1);
  });
}

test("bridge rejects wrong worker, origin, module, restaurant and unavailable context", async () => {
  const p = page(base("reservations"));
  const event = {
    origin,
    source: { scriptURL: origin + "/sw-reservations.js?v=old" },
    data: {
      type: "notification:navigate",
      module: "reservations",
      restaurantId: "A",
      targetUrl: origin + base("reservations") + "?restaurantId=A",
    },
  };
  const options = {
    router: p.router,
    restaurant: p.restaurant,
    userId: "user-A",
  };
  for (const bad of [
    { ...event, origin: "https://evil.example" },
    { ...event, source: { scriptURL: origin + "/sw.js" } },
    { ...event, data: { ...event.data, module: "take_away" } },
    { ...event, data: { ...event.data, restaurantId: "B" } },
    {
      ...event,
      data: {
        ...event.data,
        targetUrl: origin + base("gift-cards") + "?restaurantId=A",
      },
    },
  ])
    await p.utils.handlePushWindowMessage(bad, options);
  assert.deepEqual(p.logs, []);
  p.restaurant.dataLoading = true;
  await p.utils.handlePushWindowMessage(event, options);
  assert.deepEqual(p.logs, []);
  p.restaurant.dataLoading = false;
  await p.utils.handlePushWindowMessage(event, options);
  assert.equal(p.logs.length, 1);
});

test("existing subscription survives worker update, refresh and reconnect; module switching cannot subscribe", async () => {
  const p = page(base("reservations"));
  const calls = [],
    sub = { endpoint: "existing-endpoint", keys: {} };
  const reg = {
    active: {},
    update: async () => calls.push("update"),
    pushManager: {
      getSubscription: async () => sub,
      subscribe: async () => {
        throw Error("Must retain endpoint");
      },
    },
  };
  const api = load(
    "_assets/utils/webpush.js",
    {
      ...p.sandbox,
      atob,
      window: {
        ...p.window,
        isSecureContext: true,
        PushManager: {},
        Notification: {},
      },
      navigator: {
        serviceWorker: {
          register: async (url, options) => {
            calls.push([url, options.scope]);
            return reg;
          },
        },
      },
      Notification: { permission: "granted" },
      process: { env: { NEXT_PUBLIC_VAPID_PUBLIC_KEY: "AQID" } },
      fetch: async (_url, request) => {
        calls.push(JSON.parse(request.body));
        return {
          ok: true,
          headers: { get: () => "application/json" },
          json: async () => ({}),
        };
      },
    },
    { "./push-window": p.utils },
  );
  const input = {
    module: "reservations",
    restaurantId: "A",
    token: "token",
    apiUrl: origin + "/api",
  };
  for (let n = 0; n < 3; n++)
    assert.equal((await api.setupPushForModule(input)).subscription, sub);
  assert.equal(calls.filter((value) => value === "update").length, 3);
  assert.ok(
    calls
      .filter(Array.isArray)
      .every(([, scope]) => scope === base("reservations") + "/"),
  );
  await api.setupPushForModule({ ...input, restaurantId: "B" });
  assert.equal(calls.at(-1).restaurantId, "B");
  assert.equal(calls.at(-1).subscription.endpoint, "existing-endpoint");
  await assert.rejects(
    api.setupPushForModule({ ...input, module: "unknown" }),
    { code: "INVALID_MODULE" },
  );
  p.window.location = new URL(base("take-away"), origin);
  await assert.rejects(
    api.setupPushForModule({ ...input, module: "take_away" }),
    { code: "WINDOW_MODULE_MISMATCH" },
  );
});

function guardHarness({
  current = "B",
  legacy = false,
  denied = false,
  start = base("reservations"),
  failedSwitch = false,
} = {}) {
  const p = page(start, current);
  const query = {
    reservationId: "entity-1",
    notificationId: "notif-1",
    pushModule: "reservations",
  };
  if (!legacy) query.restaurantId = "A";
  const router = {
    isReady: true,
    pathname: base("reservations"),
    query,
    asPath: base("reservations") + "?" + new URLSearchParams(query),
    async replace(url) {
      const next = new URL(url, origin);
      this.asPath = next.pathname + next.search + next.hash;
      this.query = Object.fromEntries(next.searchParams);
      dirty = true;
      return true;
    },
  };
  let reads = 0,
    switches = 0,
    dirty = false,
    index = 0;
  const slots = [],
    effects = [],
    previous = [];
  const context = {
    ...p.restaurant,
    restaurantsList: [{ _id: "A" }, { _id: "B" }],
    handleRestaurantSelect(id) {
      switches++;
      context.dataLoading = true;
      setImmediate(() =>
        setImmediate(() => {
          context.dataLoading = false;
          if (!failedSwitch) context.restaurantData = { _id: id };
          dirty = true;
        }),
      );
      dirty = true;
    },
  };
  const react = {
    useContext: () => ({ restaurantContext: context }),
    useRef(value) {
      const i = index++;
      return (slots[i] ||= { current: value });
    },
    useState(value) {
      const i = index++;
      if (!(i in slots)) slots[i] = value;
      return [
        slots[i],
        (next) => {
          if (slots[i] !== next) {
            slots[i] = next;
            dirty = true;
          }
        },
      ];
    },
    useEffect(fn, deps) {
      const i = index++;
      if (!previous[i] || deps.some((d, n) => !Object.is(d, previous[i][n]))) {
        previous[i] = deps;
        effects.push(() => {
          slots[i]?.();
          slots[i] = fn();
        });
      }
    },
  };
  const Guard = load(
    "components/_shared/notifications/push-restaurant-guard.js",
    {
      ...p.sandbox,
      localStorage: { getItem: () => "test-token" },
      process: { env: { NEXT_PUBLIC_API_URL: origin + "/api" } },
    },
    {
      react,
      "next/router": { useRouter: () => router },
      "@/contexts/global.context": {},
      "@/_assets/utils/push-window": p.utils,
      axios: {
        get: async () => {
          reads++;
          if (denied) throw Error("Forbidden");
          return { data: { restaurantId: "A", module: "reservations" } };
        },
      },
    },
  ).default;
  const seen = [];
  function render() {
    index = 0;
    const result = Guard({ children: "DETAIL" });
    if (result === "DETAIL") seen.push(context.restaurantData._id);
    return result;
  }
  return {
    context,
    router,
    seen,
    get switches() {
      return switches;
    },
    get reads() {
      return reads;
    },
    render,
    async settle() {
      let result;
      for (let n = 0; n < 15; n++) {
        dirty = false;
        result = render();
        while (effects.length) effects.shift()();
        await new Promise(setImmediate);
        if (!dirty && !effects.length) return result;
      }
      throw Error("Guard failed to settle");
    },
  };
}

test("restaurant guard holds the entity page until A is active and preserves deep links", async () => {
  const h = guardHarness();
  assert.equal(h.render(), null);
  assert.equal(await h.settle(), "DETAIL");
  assert.deepEqual(h.seen, ["A"]);
  assert.equal(h.switches, 1);
  assert.equal(h.router.query.reservationId, "entity-1");
  assert.equal(h.router.query.notificationId, "notif-1");
  assert.equal(h.router.query.restaurantId, undefined);
  h.context.restaurantData = { _id: "B" }; // subsequent manual restaurant switch
  assert.equal(h.render(), null);
  assert.equal(await h.settle(), "DETAIL");
  assert.equal(h.router.query.reservationId, undefined);
  assert.equal(h.router.query.notificationId, undefined);
  assert.equal(h.switches, 1);
});

test("historical notification resolves its authorized restaurant before exposing a detail", async () => {
  const h = guardHarness({ legacy: true });
  assert.equal(await h.settle(), "DETAIL");
  assert.deepEqual(h.seen, ["A"]);
  assert.equal(h.reads, 1);
});

test("each new restaurant/notification destination is validated even when the pathname and entity are unchanged", async () => {
  for (const notificationId of ["notif-1", "notif-2"]) {
    const h = guardHarness({ current: "A" });
    assert.equal(await h.settle(), "DETAIL");
    assert.deepEqual(h.seen, ["A"]);
    const initialDisplays = h.seen.length;
    // Same path and entity, but a newly received push belongs to restaurant B.
    h.router.query = {
      reservationId: "entity-1",
      notificationId,
      restaurantId: "B",
      pushModule: "reservations",
    };
    h.router.asPath =
      base("reservations") + "?" + new URLSearchParams(h.router.query);
    assert.equal(
      h.render(),
      null,
      "A's previous validation must not authorize B's destination",
    );
    assert.equal(h.seen.length, initialDisplays);
    assert.equal(await h.settle(), "DETAIL");
    assert.equal(h.switches, 1);
    assert.equal(h.context.restaurantData._id, "B");
    assert.ok(h.seen.slice(initialDisplays).every((id) => id === "B"));
    assert.equal(h.router.query.notificationId, notificationId);
  }
});

test("a different notification without restaurant metadata must resolve its context again", async () => {
  const h = guardHarness({ current: "A" });
  assert.equal(await h.settle(), "DETAIL");
  h.router.query = { reservationId: "entity-1", notificationId: "notif-2" };
  h.router.asPath =
    base("reservations") + "?" + new URLSearchParams(h.router.query);
  assert.equal(h.render(), null);
  assert.equal(await h.settle(), "DETAIL");
  assert.equal(h.reads, 1);
});

test("unavailable legacy context, failed switch and wrong window never mount entity page", async () => {
  for (const options of [
    { legacy: true, denied: true },
    { failedSwitch: true },
    { start: "/dashboard/manager" },
  ]) {
    const h = guardHarness(options);
    const result = await h.settle();
    assert.equal(result.props.role, "alert");
    assert.deepEqual(h.seen, []);
  }
});

test("automatic sync responds to reconnect/foreground events and stops across modules", async () => {
  const p = page(base("reservations"));
  const windowListeners = new Map(),
    swListeners = new Map(),
    documentListeners = new Map();
  const target = (listeners) => ({
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
  });
  const document = { ...target(documentListeners), visibilityState: "visible" };
  const window = {
    ...p.window,
    ...target(windowListeners),
    setTimeout,
    clearTimeout,
  };
  const navigator = { onLine: true, serviceWorker: target(swListeners) };
  let effect,
    calls = 0;
  const router = { pathname: base("reservations") };
  const source = fs.readFileSync(
    path.join(__dirname, "../src/pages/_app.page.js"),
    "utf8",
  );
  const sync = source.slice(
    source.indexOf("function WebAppPushSubscriptionSync()"),
    source.indexOf("function OwnerOnlyWebAppGuard"),
  );
  const run = vm.runInNewContext(`(${sync.trim()})`, {
    window,
    document,
    navigator,
    process: { env: { NEXT_PUBLIC_API_URL: origin + "/api" } },
    useRouter: () => router,
    useContext: () => ({ restaurantContext: p.restaurant }),
    useMemo: (fn) => fn(),
    useEffect: (fn) => (effect = fn),
    GlobalContext: {},
    getPushPermissionStatus: () => "granted",
    isPushDisabledForModule: () => false,
    canUsePushModule: p.utils.canUsePushModule,
    setupPushForModule: async () => {
      calls++;
      return { status: "subscribed" };
    },
    localStorage: { getItem: () => "test-token" },
  });
  run();
  const cleanup = effect();
  await new Promise(setImmediate);
  for (const [listeners, event] of [
    [windowListeners, "online"],
    [windowListeners, "pageshow"],
    [documentListeners, "visibilitychange"],
    [swListeners, "controllerchange"],
  ]) {
    listeners.get(event)();
    await new Promise(setImmediate);
  }
  assert.equal(calls, 5);
  cleanup();
  assert.equal(
    windowListeners.size + documentListeners.size + swListeners.size,
    0,
  );
  router.pathname = base("take-away");
  p.window.location = new URL(base("take-away"), origin);
  run();
  effect();
  assert.equal(calls, 5);
});

test("disabling A preserves the browser endpoint used by B and ignores a root registration fallback", async () => {
  const p = page(base("reservations"));
  let unsubscribed = 0,
    requests = 0,
    exact = true;
  const sub = {
    endpoint: "shared-endpoint",
    unsubscribe: async () => unsubscribed++,
  };
  const api = load(
    "_assets/utils/webpush.js",
    {
      ...p.sandbox,
      window: {
        ...p.window,
        isSecureContext: true,
        PushManager: {},
        Notification: {},
      },
      navigator: {
        serviceWorker: {
          getRegistration: async () => ({
            scope: origin + (exact ? base("reservations") + "/" : "/"),
            pushManager: { getSubscription: async () => sub },
          }),
        },
      },
      Notification: { permission: "granted" },
      fetch: async () => {
        requests++;
        return {
          ok: true,
          headers: { get: () => "application/json" },
          json: async () => ({ hasOtherRestaurants: true }),
        };
      },
    },
    { "./push-window": p.utils },
  );
  const input = {
    module: "reservations",
    restaurantId: "A",
    token: "token",
    apiUrl: origin + "/api",
  };
  await api.disablePushForModule(input);
  assert.equal(requests, 1);
  assert.equal(unsubscribed, 0);
  exact = false;
  await api.disablePushForModule(input);
  assert.equal(requests, 1);
});

test("a module change during service worker activation cannot persist a late subscription", async () => {
  const p = page(base("reservations"));
  let subscriptions = 0,
    requests = 0;
  const api = load(
    "_assets/utils/webpush.js",
    {
      ...p.sandbox,
      atob,
      window: {
        ...p.window,
        isSecureContext: true,
        PushManager: {},
        Notification: {},
      },
      navigator: {
        serviceWorker: {
          register: async () => ({
            active: {},
            update: async () => {
              p.window.location = new URL(base("take-away"), origin);
            },
            pushManager: {
              getSubscription: async () => {
                subscriptions++;
                return {};
              },
            },
          }),
        },
      },
      Notification: { permission: "granted" },
      process: { env: { NEXT_PUBLIC_VAPID_PUBLIC_KEY: "AQID" } },
      fetch: async () => {
        requests++;
      },
    },
    { "./push-window": p.utils },
  );
  await assert.rejects(
    api.setupPushForModule({
      module: "reservations",
      restaurantId: "A",
      token: "token",
      apiUrl: origin + "/api",
    }),
    { code: "WINDOW_MODULE_MISMATCH" },
  );
  assert.equal(subscriptions, 0);
  assert.equal(requests, 0);
});

test("legacy take-away subscription is retired only after the backend confirms its transfer", async () => {
  for (const confirmed of [false, true]) {
    const p = page(base("take-away"));
    const actions = [];
    const current = { endpoint: "new-endpoint" };
    const legacy = {
      scope: origin + "/dashboard/take-away/",
      pushManager: {
        getSubscription: async () => ({
          endpoint: "old-endpoint",
          unsubscribe: async () => actions.push("unsubscribe-old"),
        }),
      },
      unregister: async () => actions.push("unregister-old"),
    };
    const api = load(
      "_assets/utils/webpush.js",
      {
        ...p.sandbox,
        atob,
        window: {
          ...p.window,
          isSecureContext: true,
          PushManager: {},
          Notification: {},
        },
        navigator: {
          serviceWorker: {
            getRegistrations: async () => [legacy],
            register: async () => ({
              active: {},
              update: async () => {},
              pushManager: { getSubscription: async () => current },
            }),
          },
        },
        Notification: { permission: "granted" },
        process: { env: { NEXT_PUBLIC_VAPID_PUBLIC_KEY: "AQID" } },
        fetch: async (url, request) => {
          if (url.endsWith("/push/subscribe")) {
            assert.equal(
              JSON.parse(request.body).previousEndpoint,
              "old-endpoint",
            );
            actions.push("subscribe-new");
          } else actions.push("detach-old");
          return {
            ok: true,
            headers: { get: () => "application/json" },
            json: async () => ({
              legacyTransferred: confirmed,
              hasOtherRestaurants: false,
            }),
          };
        },
      },
      { "./push-window": p.utils },
    );
    await api.setupPushForModule({
      module: "take_away",
      restaurantId: "A",
      token: "token",
      apiUrl: origin + "/api",
    });
    assert.deepEqual(
      actions,
      confirmed
        ? ["subscribe-new", "detach-old", "unsubscribe-old", "unregister-old"]
        : ["subscribe-new"],
    );
  }
});
