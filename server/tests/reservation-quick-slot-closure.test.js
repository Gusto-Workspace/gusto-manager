const test = require("node:test");
const assert = require("node:assert/strict");

const {
  QUICK_SLOT_CLOSURE_SOURCE,
  buildQuickSlotClosureRanges,
  getConfiguredQuickClosureTimes,
  isDepartureCoveredByRange,
} = require("../services/reservation-quick-slot-closure.service");

function buildHours(mondayHours = []) {
  const names = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];
  return names.map((day, index) => ({
    day,
    isClosed: index !== 0,
    hours: index === 0 ? mondayHours : [],
  }));
}

function restaurantWith({ hours, interval = 30, exceptionalOpenings = [] }) {
  return {
    opening_hours: buildHours(hours),
    reservationsSettings: {
      same_hours_as_restaurant: true,
      interval,
      exceptional_openings: exceptionalOpenings,
      blocked_ranges: [],
    },
  };
}

test("un départ produit une fermeture de la durée exacte de l’intervalle", () => {
  const restaurant = restaurantWith({
    hours: [{ open: "19:00", close: "21:00" }],
  });
  const [range] = buildQuickSlotClosureRanges({
    restaurant,
    date: "2026-09-07",
    times: ["19:30"],
    now: new Date("2026-09-01T00:00:00.000Z"),
  });

  assert.equal(range.time, "19:30");
  assert.equal(range.endAt.getTime() - range.startAt.getTime(), 30 * 60 * 1000);
  assert.equal(range.source, QUICK_SLOT_CLOSURE_SOURCE);
});

test("plusieurs départs restent trois blocked_ranges indépendants", () => {
  const restaurant = restaurantWith({
    hours: [{ open: "19:00", close: "21:00" }],
  });
  const ranges = buildQuickSlotClosureRanges({
    restaurant,
    date: "2026-09-07",
    times: ["19:30", "20:00", "20:30"],
    now: new Date("2026-09-01T00:00:00.000Z"),
  });

  assert.deepEqual(
    ranges.map((range) => range.time),
    ["19:30", "20:00", "20:30"],
  );
  assert.equal(ranges.length, 3);
  ranges.forEach((range) => {
    assert.equal(
      range.endAt.getTime() - range.startAt.getTime(),
      30 * 60 * 1000,
    );
  });
});

test("un batch déduplique deux fois le même départ", () => {
  const restaurant = restaurantWith({
    hours: [{ open: "19:00", close: "21:00" }],
  });
  const ranges = buildQuickSlotClosureRanges({
    restaurant,
    date: "2026-09-07",
    times: ["19:30", "19:30", "20:00"],
    now: new Date("2026-09-01T00:00:00.000Z"),
  });

  assert.deepEqual(
    ranges.map((range) => range.time),
    ["19:30", "20:00"],
  );
});

test("une grande plage existante couvre chaque départ qu’elle contient", () => {
  const restaurant = restaurantWith({
    hours: [{ open: "19:00", close: "22:00" }],
  });
  const ranges = buildQuickSlotClosureRanges({
    restaurant,
    date: "2026-09-07",
    times: ["19:00", "19:30", "20:00", "20:30"],
    now: new Date("2026-09-01T00:00:00.000Z"),
  });
  const advancedRange = {
    startAt: ranges[0].startAt,
    endAt: new Date(ranges[0].startAt.getTime() + 3 * 60 * 60 * 1000),
  };

  ranges.forEach((range) => {
    assert.equal(isDepartureCoveredByRange(range.startAt, advancedRange), true);
  });
});

test("la fin d’une plage reste exclusive pour le départ suivant", () => {
  const restaurant = restaurantWith({
    hours: [{ open: "19:00", close: "21:00" }],
  });
  const ranges = buildQuickSlotClosureRanges({
    restaurant,
    date: "2026-09-07",
    times: ["19:30", "20:00"],
    now: new Date("2026-09-01T00:00:00.000Z"),
  });

  assert.equal(isDepartureCoveredByRange(ranges[0].startAt, ranges[0]), true);
  assert.equal(isDepartureCoveredByRange(ranges[1].startAt, ranges[0]), false);
});

test("les ouvertures exceptionnelles remplacent les horaires hebdomadaires", () => {
  const restaurant = restaurantWith({
    hours: [{ open: "19:00", close: "20:00" }],
    exceptionalOpenings: [
      {
        date: "2026-09-07",
        hours: [{ open: "12:00", close: "13:00" }],
      },
    ],
  });

  assert.deepEqual(getConfiguredQuickClosureTimes(restaurant, "2026-09-07"), [
    "12:00",
    "12:30",
    "13:00",
  ]);
});

test("un service après minuit rattache les heures de nuit à la date de service", () => {
  const restaurant = restaurantWith({
    hours: [{ open: "23:00", close: "01:00" }],
  });
  const [range] = buildQuickSlotClosureRanges({
    restaurant,
    date: "2026-09-07",
    times: ["00:30"],
    now: new Date("2026-09-01T00:00:00.000Z"),
  });

  assert.equal(range.startAt.getDate(), 8);
  assert.equal(range.startAt.getHours(), 0);
  assert.equal(range.startAt.getMinutes(), 30);
  assert.equal(range.endAt.getHours(), 1);
});

test("un horaire qui ne correspond pas à un départ configuré est refusé", () => {
  const restaurant = restaurantWith({
    hours: [{ open: "19:00", close: "21:00" }],
  });

  assert.throws(
    () =>
      buildQuickSlotClosureRanges({
        restaurant,
        date: "2026-09-07",
        times: ["19:15"],
        now: new Date("2026-09-01T00:00:00.000Z"),
      }),
    (error) => error?.code === "SLOT_NOT_CONFIGURED",
  );
});
