const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const babel = require("next/dist/compiled/babel/core");
const packages = require("next/dist/compiled/babel-packages");
const translations = require("../public/locales/fr/reservations.json");

function load(file, stubs = {}) {
  const filename = path.join(__dirname, "../src", file);
  const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    filename,
    babelrc: false,
    configFile: false,
    presets: [[packages.presetReact().default, { runtime: "automatic" }]],
    plugins: [packages.pluginTransformModulesCommonjs().default],
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(
    (name) => name in stubs ? stubs[name] : require(name), module, module.exports,
  );
  return module.exports;
}

const utils = load("_assets/utils/reservation-arrival.js");
const utilStub = { "@/_assets/utils/reservation-arrival": utils };
const shared = "components/_shared/reservations";
const statusUtils = load(`${shared}/reservation-status.utils.js`);
const t = (key, { time } = {}) => {
  const label = key.split(".").reduce((value, segment) => value?.[segment], translations);
  return label?.replace("{{time}}", time) || key;
};
const reservation = {
  _id: "booking",
  customerFirstName: "Camille",
  reservationDate: "2026-11-18T00:00:00.000Z",
  reservationTime: "12:00",
  numberOfGuests: 2,
  status: "Confirmed",
};
const arrivedAt = "2026-11-18T11:05:00.000Z";

test("operational eligibility follows the Paris service day through midnight", () => {
  for (const status of ["Confirmed", "Active", "Late"]) {
    const entry = { ...reservation, status };
    assert.equal(utils.canSignalReservationArrival(entry, new Date(arrivedAt)), true);
    assert.equal(utils.canSignalReservationArrival(entry, new Date("2026-11-19T04:59:00Z")), true);
    assert.equal(utils.canSignalReservationArrival(entry, new Date("2026-11-19T05:00:00Z")), false);
  }
  assert.equal(utils.canSignalReservationArrival({ ...reservation, status: "Finished" }, new Date(arrivedAt)), false);
});

test("both cards render an accessible check beside the existing badge, including compact Dashboard cards", () => {
  const Indicator = load(`${shared}/reservation-arrival-indicator.component.js`, {
    ...utilStub,
    "./reservation-status.utils": statusUtils,
  }).default;
  const emptyIcon = () => null;
  const stubs = {
    "@/components/_shared/reservations/reservation-arrival-indicator.component": Indicator,
    "@/components/_shared/reservations/reservation-status.utils": statusUtils,
    "@/components/_shared/customers/customer-tags-ui": { getPrimaryCustomerTag: () => null },
  };
  const icons = { CommentarySvg: emptyIcon, CommunitySvg: emptyIcon, TableSvg: emptyIcon, UserSvg: emptyIcon };
  const cards = [
    load("components/dashboard/reservations/card.reservations.component.js", {
      ...stubs, "../../_shared/_svgs/_index": icons,
    }).default,
    load("components/dashboard/webapp/reservations/card.reservations.webapp.js", {
      ...stubs, "../../../_shared/_svgs/_index": icons,
    }).default,
  ];
  for (const Card of cards) {
    for (const status of ["Confirmed", "Active", "Late"]) {
      const render = (arrival, responsiveInlineLayout = false) => renderToStaticMarkup(
        React.createElement(Card, {
          reservation: { ...reservation, status, ...arrival }, responsiveInlineLayout, t,
        }),
      );
      assert.match(render({}), /Confirmée/);
      assert.doesNotMatch(render({}), /Client arrivé/);
      for (const compact of [false, true]) {
        assert.match(render({ arrivedAt }, compact), /Confirmée<\/span><span[^>]*title="Client arrivé à 12h05"/);
        assert.match(render({ arrivedAt }, compact), /class="sr-only">Client arrivé à 12h05/);
        assert.doesNotMatch(render({ arrivedAt }, compact), /Signaler l’arrivée|Effacer l’arrivée/);
      }
    }
    const finished = renderToStaticMarkup(React.createElement(Card, {
      reservation: { ...reservation, status: "Finished", arrivedAt }, t,
    }));
    assert.match(finished, /Terminée/);
    assert.doesNotMatch(finished, /Client arrivé/);
  }
});

test("shared panel row offers a single direct action and preserves finished arrival history", (context) => {
  context.mock.timers.enable({ apis: ["Date"], now: new Date(arrivedAt) });
  const Row = load(`${shared}/reservation-arrival-row.component.js`, {
    ...utilStub,
    "./reservation-status.utils": statusUtils,
  }).default;
  const render = (fields) => renderToStaticMarkup(React.createElement(Row, {
    reservation: { ...reservation, ...fields }, buttonClassName: "bg-white", t,
  }));
  assert.match(render({}), /Arrivée non signalée.*button[^>]*>Signaler l’arrivée/);
  assert.match(render({ arrivedAt }), /Arrivée à 12h05.*button[^>]*>Effacer l’arrivée/);
  assert.ok(render({ arrivedAt }).includes(statusUtils.CONFIRMED_RESERVATION_TEXT_CLASS));
  assert.doesNotMatch(render({ arrivedAt }), /underline/);
  assert.match(render({ arrivedAt, status: "Finished" }), /Arrivée signalée à 12h05.*Effacer l’arrivée/);
  assert.equal(render({ status: "Finished" }), "");
  assert.equal(render({ status: "NoShow", arrivedAt }), "");
});

function hookState() {
  const slots = [];
  let index = 0;
  let identityEffect;
  return {
    render(Context) {
      index = 0;
      const value = Context();
      identityEffect?.();
      return value;
    },
    react: {
      ...React,
      useCallback: (fn) => fn,
      useMemo: (fn) => fn(),
      useEffect(fn) {
        if (String(fn).includes("currentRestaurantIdRef.current = restaurantData")) identityEffect = fn;
      },
      useState(initial) {
        const slot = index++;
        if (!(slot in slots)) slots[slot] = typeof initial === "function" ? initial() : initial;
        return [slots[slot], (next) => { slots[slot] = typeof next === "function" ? next(slots[slot]) : next; }];
      },
      useRef(initialValue) {
        return slots[index++] ||= { current: initialValue };
      },
    },
  };
}

function findElement(element, component) {
  if (Array.isArray(element)) {
    return element.map((child) => findElement(child, component)).find(Boolean);
  }
  if (element?.type === component) return element;
  return element?.props ? findElement(element.props.children, component) : null;
}

test("an open panel follows the live booking in both views, even if the booking leaves the selected tab", () => {
  const Card = () => null;
  const Drawer = () => null;
  for (const [file, cardImport] of [
    ["dashboard/reservations/day-list.reservations.component.js", "./card.reservations.component"],
    ["dashboard/webapp/reservations/day-list.reservations.webapp.js", "./card.reservations.webapp"],
  ]) {
    const hooks = hookState();
    const DayList = load(`components/${file}`, {
      react: hooks.react,
      "next-i18next": { useTranslation: () => ({ t }) },
      [cardImport]: Card,
      "@/components/_shared/reservations/reservations-drawer.component": Drawer,
      "@/components/_shared/_svgs/_index": { CommunitySvg: () => null },
      "@/_assets/utils/reservation-service-time": load("_assets/utils/reservation-service-time.js"),
    }).default;
    const render = (data, filtered = [data]) => hooks.render(() => DayList({
      selectedDay: reservation.reservationDate,
      activeDayTab: "Confirmed",
      dayData: {
        byStatus: { All: [data], Confirmed: filtered },
        reservations: [data],
      },
    }));
    findElement(render(reservation), Card).props.onOpenDetails(reservation);

    const marked = { ...reservation, arrivedAt };
    const open = findElement(render(marked), Drawer).props;
    assert.equal(open.open, true, file);
    assert.equal(open.reservation.arrivedAt, arrivedAt, file);
    const finished = { ...marked, status: "Finished" };
    const finishedDrawer = findElement(render(finished, []), Drawer).props;
    assert.equal(finishedDrawer.open, true, file);
    assert.equal(finishedDrawer.reservation.status, "Finished", file);
  }
});

test("SSE, stale HTTP responses and planned finish converge on the highest arrival revision", async (context) => {
  const { window, localStorage } = global;
  global.window = {};
  global.localStorage = { getItem: () => "test-token" };
  context.after(() => { global.window = window; global.localStorage = localStorage; });

  const hooks = hookState();
  const eventSource = { close() {} };
  let respond;
  const Context = load("contexts/restaurant.context.js", {
    ...utilStub,
    react: hooks.react,
    "next/router": { useRouter: () => ({ pathname: "/dashboard/reservations", query: {} }) },
    "@/_assets/utils/authenticated-events": { createAuthenticatedEventSource: () => eventSource },
    "@/_assets/utils/take-away-visibility": load("_assets/utils/take-away-visibility.js"),
    axios: { get: () => new Promise((resolve) => { respond = resolve; }) },
  }).default;
  const render = () => hooks.render(Context);
  render().setRestaurantData({ _id: "restaurant" });
  render().setUserConnected({ role: "owner" });
  let state = render();
  state.reconnectRealtime();
  const loading = state.loadReservationPeriod({
    restaurantId: "restaurant", from: "2026-11-18", to: "2026-11-18",
  });
  const send = (payload) => eventSource.onmessage({ data: JSON.stringify({
    type: "reservation_arrival_updated", reservationId: "booking", restaurantId: "restaurant", ...payload,
  }) });
  send({ arrivedAt, arrivalRevision: 1 });
  respond({ data: { reservations: [reservation] } });
  await loading;
  state = render();
  assert.equal(state.reservationsList[0].arrivedAt, arrivedAt);

  state.applyReservationUpdate({ ...reservation, status: "Finished" });
  assert.equal(render().reservationsList[0].arrivedAt, arrivedAt);
  send({ arrivedAt: null, arrivalRevision: 2 });
  state.applyReservationArrival({ reservationId: "booking", arrivedAt, arrivalRevision: 1 }, "restaurant");
  send({ arrivedAt, arrivalRevision: 10, restaurantId: "other" });
  const current = render().reservationsList[0];
  assert.equal(current.status, "Finished");
  assert.equal(current.arrivedAt, null);
  assert.equal(current.arrivalRevision, 2);
});

test("arrival leaves month categories and their palette unchanged", () => {
  assert.deepEqual(statusUtils.RESERVATION_DISPLAY_STATUS_KEYS, [
    "Waitlist", "Pending", "Confirmed", "Finished", "Expired", "NoShow", "Canceled",
  ]);
  for (const file of [
    "dashboard/reservations/calendar-month.reservations.component.js",
    "dashboard/webapp/reservations/calendar-month.reservations.webapp.js",
  ]) {
    const source = fs.readFileSync(path.join(__dirname, "../src/components", file), "utf8");
    assert.doesNotMatch(source, /arrival|arrivedAt/i);
    assert.match(source, /"Confirmed"\s*\? "#22c55e"/);
  }
});
