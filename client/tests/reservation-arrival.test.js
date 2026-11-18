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

const serviceTime = load("_assets/utils/reservation-service-time.js");
const utils = load("_assets/utils/reservation-arrival.js", {
  "./reservation-service-time": serviceTime,
});
const utilStub = { "@/_assets/utils/reservation-arrival": utils };
const shared = "components/_shared/reservations";
const statusUtils = load(`${shared}/reservation-status.utils.js`);
const { getTableReservationState } = load(
  "components/dashboard/reservations/floor-plan-canvas.reservations.component.js",
  {
    "react-konva": {},
    "@/components/_shared/reservations/reservation-status.utils": statusUtils,
    "@/_assets/utils/reservation-service-time": serviceTime,
  },
);
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
const markedReservation = { ...reservation, arrivedAt };

function floorState(reservations, now, options = {}) {
  return getTableReservationState({
    reservations,
    now: new Date(now),
    serviceDateKey: "2026-11-18",
    liveMode: true,
    parameters: {
      table_occupancy_lunch_minutes: 60,
      table_occupancy_dinner_minutes: 90,
    },
    ...options,
  });
}

test("live floor plan distinguishes a booking from a recorded arrival, including late or extended stays", () => {
  const duringSlot = "2026-11-18T11:20:00Z";
  const afterSlot = "2026-11-18T12:10:00Z";
  const expected = floorState([reservation], duringSlot);
  assert.equal(expected.tableStatus, "assigned");
  assert.equal(expected.displayReservation, reservation);
  assert.equal(floorState([reservation], afterSlot).tableStatus, "free");

  for (const at of [duringSlot, afterSlot]) {
    const state = floorState([markedReservation], at);
    assert.equal(state.tableStatus, "occupied");
    assert.equal(state.realCurrent, markedReservation);
  }
  const lateArrival = { ...reservation, arrivedAt: afterSlot };
  assert.equal(floorState([lateArrival], afterSlot).tableStatus, "occupied");
  assert.equal(floorState([{ ...lateArrival, arrivedAt: null }], afterSlot).tableStatus, "free");
});

test("finishing a booking releases its table while retaining arrival history", () => {
  const at = "2026-11-18T11:30:00Z";
  for (const status of ["Finished", "Canceled", "Rejected", "Expired", "NoShow", "Waitlist"]) {
    const terminal = { ...markedReservation, status };
    assert.equal(floorState([terminal], at).tableStatus, "free", status);
  }
  for (const status of ["Pending", "AwaitingBankHold"]) {
    const pending = { ...markedReservation, status };
    assert.equal(floorState([pending], at).tableStatus, "assigned", status);
  }
});

test("the upcoming time and running conflicts can require an occupied table to be released", () => {
  const upcoming = { ...reservation, _id: "next", reservationTime: "13:30" };
  const early = floorState([markedReservation, upcoming], "2026-11-18T12:10:00Z");
  assert.equal(early.tableStatus, "occupied");
  assert.equal(early.nextReservation, upcoming);

  for (const at of ["2026-11-18T12:15:00Z", "2026-11-18T12:35:00Z"]) {
    const state = floorState([markedReservation, upcoming], at);
    assert.equal(state.tableStatus, "to_release");
    assert.equal(state.currentReservation, markedReservation);
  }
  const nextArrives = { ...upcoming, arrivedAt: "2026-11-18T12:35:00Z" };
  assert.equal(floorState([markedReservation, nextArrives], "2026-11-18T12:35:00Z").tableStatus, "to_release");
  const finished = { ...markedReservation, status: "Finished" };
  assert.equal(floorState([finished, upcoming], "2026-11-18T12:35:00Z").tableStatus, "assigned");
  assert.equal(floorState([finished, nextArrives], "2026-11-18T12:35:00Z").currentReservation, nextArrives);
});

test("the live plan keeps the same service after midnight and ignores old arrivals after rollover", () => {
  const evening = { ...markedReservation, reservationTime: "23:30", arrivedAt: "2026-11-18T22:36:00Z" };
  const nightBooking = { ...reservation, _id: "night", reservationTime: "00:45" };
  const beforeMidnight = floorState([evening, nightBooking], "2026-11-18T22:55:00Z");
  assert.equal(beforeMidnight.tableStatus, "occupied");
  assert.equal(beforeMidnight.nextReservation, nightBooking);
  assert.equal(floorState([evening, nightBooking], "2026-11-18T23:35:00Z").tableStatus, "to_release");

  assert.equal(floorState([evening], "2026-11-19T01:30:00Z").tableStatus, "occupied");
  for (const at of ["2026-11-19T05:00:00Z", "2026-11-21T12:00:00Z"]) {
    assert.equal(floorState([evening], at).tableStatus, "free");
  }
  assert.equal(floorState([nightBooking], "2026-11-19T00:00:00Z").tableStatus, "assigned");
  assert.equal(serviceTime.getReservationServiceClock(new Date("2026-11-19T01:00:00Z")).dateKey, "2026-11-18");
  assert.equal(serviceTime.getReservationServiceClock(new Date("2026-11-19T05:00:00Z")).dateKey, "2026-11-19");
});

test("Late retains its live behavior and the table picker remains a forecast", () => {
  const at = "2026-11-18T12:20:00Z";
  const late = { ...reservation, status: "Late", _id: "late" };
  const obsolete = { ...markedReservation, status: "Active" };
  assert.equal(floorState([late], at).tableStatus, "occupied");
  assert.equal(floorState([obsolete], at).tableStatus, "free");
  assert.equal(floorState([markedReservation, late], at).currentReservation, markedReservation);

  const preview = { liveMode: false, selectedTime: "12:30" };
  assert.equal(floorState([markedReservation], at, preview).tableStatus, "assigned");
  assert.equal(floorState([markedReservation], at, { ...preview, selectionMode: true }).tableStatus, "occupied");
  assert.equal(floorState([reservation], at, { ...preview, selectionMode: true }).tableStatus, "occupied");
});

test("operational eligibility follows the Paris service day through midnight", () => {
  for (const status of ["Confirmed", "Late"]) {
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
    for (const status of ["Confirmed", "Late"]) {
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
  assert.equal(floorState(state.reservationsList, "2026-11-18T11:30:00Z").tableStatus, "occupied");

  send({ arrivedAt: null, arrivalRevision: 2 });
  assert.equal(floorState(render().reservationsList, "2026-11-18T11:30:00Z").tableStatus, "assigned");
  send({ arrivedAt, arrivalRevision: 3 });
  state.applyReservationUpdate({ ...reservation, status: "Finished" });
  assert.equal(render().reservationsList[0].arrivedAt, arrivedAt);
  assert.equal(floorState(render().reservationsList, "2026-11-18T11:30:00Z").tableStatus, "free");
  send({ arrivedAt: null, arrivalRevision: 4 });
  state.applyReservationArrival({ reservationId: "booking", arrivedAt, arrivalRevision: 1 }, "restaurant");
  send({ arrivedAt, arrivalRevision: 10, restaurantId: "other" });
  const current = render().reservationsList[0];
  assert.equal(current.status, "Finished");
  assert.equal(current.arrivedAt, null);
  assert.equal(current.arrivalRevision, 4);
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
