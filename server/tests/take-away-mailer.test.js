const test = require("node:test");
const assert = require("node:assert/strict");
const { buildTakeAwayEmail } = require("../services/take-away-mailer.service");

const restaurant = { name: "Restaurant", takeAwaySettings: {} };
function fixture(extra = {}) {
  return {
    orderNumber: "TA-TEST",
    customerFirstName: "Ada",
    customerEmail: "ada@example.com",
    scheduledFor: new Date("2099-09-07T18:00:00Z"),
    status: "confirmed",
    fulfillmentMode: "pickup",
    paymentMethod: "online",
    paymentStatus: "paid",
    total: 30,
    remainingAmountCents: 3000,
    refundedAmountCents: 0,
    currency: "eur",
    items: [
      {
        name: "Burger",
        quantity: 2,
        refusedQuantity: 1,
        unitPrice: 10,
        optionsTotal: 2,
        lineTotal: 24,
        options: [{ name: "Fromage", price: 2 }],
      },
      { name: "Dessert", quantity: 1, unitPrice: 6, lineTotal: 6 },
    ],
    adjustments: [],
    ...extra,
  };
}
function operation(state, extra = {}) {
  return {
    id: "op-1",
    state,
    amountCents: 1200,
    lines: [{ quantity: 1, name: "Burger" }],
    ...extra,
  };
}
function render(eventType, extra = {}, targetRestaurant = restaurant) {
  return buildTakeAwayEmail({
    eventType,
    order: fixture(extra),
    restaurant: targetRestaurant,
  });
}
function money(value) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

test("on-site emails never imply an online charge or refund throughout the journey", async (t) => {
  for (const fulfillmentMode of ["pickup", "delivery"]) {
    for (const eventType of [
      "received",
      "confirmed",
      "rejected",
      "canceled",
      "ready",
      "out_for_delivery",
      "partial_rejection:op-1",
      "expired:op-1",
    ]) {
      await t.test(`${fulfillmentMode} / ${eventType}`, () => {
        const kind = eventType.split(":")[0];
        const html = render(eventType, {
          fulfillmentMode,
          paymentMethod: "on_site",
          paymentStatus: "not_required",
          status:
            kind === "expired"
              ? "canceled"
              : ["rejected", "canceled"].includes(kind)
                ? kind
                : "confirmed",
          remainingAmountCents: ["expired", "rejected", "canceled"].includes(
            kind,
          )
            ? 0
            : 1800,
          adjustments: [operation("not_required")],
        }).htmlContent;
        assert.doesNotMatch(html, /en ligne|rembours|encaiss/i);
        assert.match(
          html,
          new RegExp(
            fulfillmentMode === "delivery"
              ? "Paiement à la livraison"
              : "Paiement au retrait",
          ),
        );
        if (kind === "partial_rejection") {
          assert.match(html, /Les articles conservés restent confirmés/);
          assert.ok(
            html.includes(
              `Montant à régler ${fulfillmentMode === "delivery" ? "à la livraison" : "au retrait"} : ${money(18)}`,
            ),
          );
        }
      });
    }
  }
  // Even inconsistent legacy financial fields cannot override the chosen method.
  const html = render("rejected", {
    status: "rejected",
    paymentMethod: "on_site",
    paymentStatus: "refunded",
    stripeRefundStatus: "succeeded",
    refundedAmountCents: 3000,
  }).htmlContent;
  assert.doesNotMatch(html, /en ligne|rembours/i);
  assert.equal(
    render("refund_update:op-1", {
      paymentMethod: "on_site",
      adjustments: [operation("succeeded")],
    }),
    null,
  );
});

const states = {
  queued: /est demandé.*prise en charge.*pas encore confirmée/,
  pending: /en cours de traitement.*pas encore confirmé/,
  uncertain: /en cours de vérification.*pas encore confirmé/,
  failed: /a échoué ou a été annulé.*contacter le restaurant/,
  succeeded: /est confirmé.*délai d&#39;affichage/,
};
test("online refunds describe the recorded operation state for each financial email", async (t) => {
  for (const eventType of [
    "rejected",
    "canceled",
    "partial_rejection:op-1",
    "expired:op-1",
    "refund_update:op-1:0:state",
  ]) {
    for (const [state, expected] of Object.entries(states)) {
      await t.test(`${eventType} / ${state}`, () => {
        const terminal = ["rejected", "canceled", "expired:op-1"].includes(
          eventType,
        );
        const amountCents = terminal ? 3000 : 1200;
        const html = render(eventType, {
          status: terminal
            ? eventType === "rejected"
              ? "rejected"
              : "canceled"
            : "confirmed",
          paymentStatus:
            terminal && state === "succeeded" ? "refunded" : "paid",
          remainingAmountCents: terminal ? 0 : 1800,
          adjustments: [operation(state, { amountCents })],
        }).htmlContent;
        assert.match(html, expected);
        assert.ok(
          html.includes(`Le remboursement de ${money(amountCents / 100)}`),
        );
        assert.doesNotMatch(html, /a été initié|sera repris/);
        if (state === "succeeded") {
          assert.ok(
            html.includes(
              `Remboursement confirmé : ${money(amountCents / 100)}`,
            ),
          );
        } else {
          assert.doesNotMatch(html, /Remboursement confirmé :|est confirmé\./);
        }
      });
    }
  }
});

test("historical refund pending markers do not prove submission to Stripe", async (t) => {
  for (const eventType of ["rejected", "canceled"]) {
    for (const [stripeRefundStatus, stripeRefundId, expected] of [
      ["pending", "", states.queued],
      ["failed", "", states.uncertain],
      ["pending", "re_1", states.pending],
      ["requires_action", "re_1", states.pending],
      ["failed", "re_1", states.failed],
      ["canceled", "re_1", states.failed],
      ["", "re_1", states.uncertain],
      ["succeeded", "re_1", states.succeeded],
    ]) {
      await t.test(
        `${eventType} / ${stripeRefundStatus} / ${stripeRefundId || "no id"}`,
        () => {
          const html = render(eventType, {
            status: eventType,
            remainingAmountCents: null,
            stripeRefundStatus,
            stripeRefundId,
          }).htmlContent;
          assert.match(html, expected);
        },
      );
    }
    const html = render(eventType, {
      status: eventType,
      paymentStatus: "refunded",
      remainingAmountCents: null,
    }).htmlContent;
    assert.ok(html.includes(`Remboursement confirmé : ${money(30)}`));
  }
});

test("unsettled online payments never announce a charge or a refund amount", async (t) => {
  for (const eventType of ["rejected", "canceled"]) {
    const html = render(eventType, {
      status: eventType,
      paymentStatus: "failed",
    }).htmlContent;
    assert.match(html, /paiement en ligne n&#39;a pas été finalisé/);
    assert.doesNotMatch(
      html,
      /Payé en ligne|Le remboursement de|Remboursement confirmé :/,
    );
  }
  for (const paymentStatus of ["pending", "failed", "not_required"]) {
    for (const state of ["not_required", "queued", "uncertain"]) {
      for (const eventType of ["rejected", "canceled", "expired:op-1"]) {
        await t.test(`${paymentStatus} / ${state} / ${eventType}`, () => {
          const html = render(eventType, {
            status: "canceled",
            paymentStatus,
            remainingAmountCents: 0,
            adjustments: [operation(state)],
          }).htmlContent;
          assert.doesNotMatch(
            html,
            /Payé en ligne|Le remboursement de|Remboursement confirmé :|est confirmé\./,
          );
          assert.match(
            html,
            state === "not_required"
              ? /paiement en ligne n&#39;a pas été finalisé/
              : /situation du paiement en ligne est en cours de vérification/,
          );
        });
      }
    }
  }
});

test("partial refusals preserve retained/refused quantities, options and adjusted amounts", () => {
  const html = render("partial_rejection:op-1", {
    remainingAmountCents: 1800,
    adjustments: [operation("succeeded")],
  }).htmlContent;
  assert.match(html, /Articles concernés : 1 × Burger/);
  assert.match(html, /1 × Burger<br.*1 refusé\(s\) sur 2 commandé\(s\)/);
  assert.match(html, /Fromage/);
  assert.match(html, /1 × Dessert/);
  for (const text of [
    `Total initial : ${money(30)}`,
    `Montant ajusté : ${money(18)}`,
    `Remboursement confirmé : ${money(12)}`,
  ])
    assert.ok(html.includes(text));
});

test("a later cancellation separates confirmed partial refunds from outstanding amounts", () => {
  const adjustments = [
    operation("succeeded"),
    operation("uncertain", { id: "op-2", amountCents: 1800 }),
  ];
  const extra = {
    status: "canceled",
    remainingAmountCents: 0,
    adjustments,
    stripeRefundStatus: "failed",
  };
  const html = render("canceled", extra).htmlContent;
  assert.ok(html.includes(`Le remboursement de ${money(12)} est confirmé`));
  assert.ok(
    html.includes(
      `Le remboursement de ${money(18)} est en cours de vérification`,
    ),
  );
  assert.ok(html.includes(`Remboursement confirmé : ${money(12)}`));
  assert.doesNotMatch(html, /remboursement échoué|remboursé/);
  const delayed = render("partial_rejection:op-1", extra).htmlContent;
  assert.doesNotMatch(delayed, /restent confirmés/);
  assert.match(delayed, /commande a depuis été annulée/);
});

test("received, confirmed and fulfillment emails distinguish payment methods and preserve custom copy", () => {
  for (const eventType of [
    "received",
    "confirmed",
    "ready",
    "out_for_delivery",
  ]) {
    const html = render(eventType).htmlContent;
    assert.match(html, /Payé en ligne/);
    assert.doesNotMatch(html, /rembours/i);
  }
  const email = render(
    "confirmed",
    {},
    {
      name: "Restaurant <test>",
      takeAwaySettings: {
        email_templates: {
          confirmationSubject: "Merci {{customerName}} — {{orderNumber}}",
          confirmationBody: "À bientôt chez {{restaurantName}}",
        },
      },
    },
  );
  assert.equal(email.subject, "Merci Ada — TA-TEST");
  assert.match(email.htmlContent, /À bientôt chez Restaurant &lt;test&gt;/);
});
