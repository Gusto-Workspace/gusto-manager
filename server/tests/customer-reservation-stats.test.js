const test = require("node:test");
const assert = require("node:assert/strict");

const {
  deriveCustomerLifecycleTag,
} = require("../services/customer-tags.service");

const NOW = new Date("2026-08-20T12:00:00.000Z");

function recentCustomer(stats) {
  return {
    stats,
    lastReservationAt: new Date("2026-08-19T12:00:00.000Z"),
  };
}

test("les réservations annulées sont exclues des statistiques de fidélité", () => {
  const tag = deriveCustomerLifecycleTag(
    recentCustomer({ reservationsTotal: 6, reservationsCanceled: 1 }),
    NOW,
  );

  assert.equal(tag, "regular");
});

test("un client dont toutes les réservations sont annulées reste nouveau", () => {
  const tag = deriveCustomerLifecycleTag(
    recentCustomer({ reservationsTotal: 3, reservationsCanceled: 3 }),
    NOW,
  );

  assert.equal(tag, "new");
});

test("le compteur effectif ne devient jamais négatif", () => {
  const tag = deriveCustomerLifecycleTag(
    recentCustomer({ reservationsTotal: 1, reservationsCanceled: 4 }),
    NOW,
  );

  assert.equal(tag, "new");
});
