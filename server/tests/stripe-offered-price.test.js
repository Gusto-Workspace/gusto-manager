const assert = require("node:assert/strict");
const test = require("node:test");

process.env.STRIPE_API_SECRET_KEY ||= "sk_test_offered_price_unit_tests";

const {
  getOrCreateOfferedPrice,
} = require("../services/stripe-subscription-catalog.service");

function paidAddon(productId, overrides = {}) {
  return {
    offered: true,
    priceId: `price_${productId}_paid`,
    productId,
    currency: "EUR",
    interval: "month",
    intervalCount: 1,
    code: productId,
    price: {
      id: `price_${productId}_paid`,
      product: productId,
      active: true,
      type: "recurring",
      unit_amount: 4500,
      currency: "eur",
      recurring: { interval: "month", interval_count: 1 },
    },
    ...overrides,
  };
}

function offeredPrice(id, productId, created = 1) {
  return {
    id,
    product: productId,
    active: true,
    type: "recurring",
    unit_amount: 0,
    currency: "eur",
    recurring: { interval: "month", interval_count: 1 },
    created,
  };
}

function fakeStripe(initialPrices = []) {
  const prices = [...initialPrices];
  const calls = { create: [], list: [] };

  return {
    calls,
    prices: {
      async list(params) {
        calls.list.push(params);
        return {
          data: prices.filter(
            (price) =>
              price.product === params.product &&
              price.active === params.active,
          ),
          has_more: false,
        };
      },
      async create(params) {
        calls.create.push(params);
        const price = offeredPrice(
          `price_created_${calls.create.length}`,
          params.product,
          100 + calls.create.length,
        );
        prices.push(price);
        return price;
      },
    },
  };
}

test("crée un seul Price offert lorsqu'il n'en existe aucun", async () => {
  const stripe = fakeStripe();

  const priceId = await getOrCreateOfferedPrice(paidAddon("prod_a"), stripe);

  assert.equal(priceId, "price_created_1");
  assert.equal(stripe.calls.create.length, 1);
  assert.equal(stripe.calls.create[0].unit_amount, 0);
});

test("réutilise un Price offert existant sans en créer", async () => {
  const stripe = fakeStripe([offeredPrice("price_free_a", "prod_a")]);

  const priceId = await getOrCreateOfferedPrice(paidAddon("prod_a"), stripe);

  assert.equal(priceId, "price_free_a");
  assert.equal(stripe.calls.create.length, 0);
});

test("réutilise le même Price après des passages répétés payant et offert", async () => {
  const stripe = fakeStripe();
  const addon = paidAddon("prod_a");

  const firstOfferedPriceId = await getOrCreateOfferedPrice(addon, stripe);
  assert.equal(
    await getOrCreateOfferedPrice({ ...addon, offered: false }, stripe),
    addon.priceId,
  );
  const secondOfferedPriceId = await getOrCreateOfferedPrice(addon, stripe);

  assert.equal(secondOfferedPriceId, firstOfferedPriceId);
  assert.equal(stripe.calls.create.length, 1);
});

test("choisit le plus ancien Price parmi les doublons historiques", async () => {
  const stripe = fakeStripe([
    offeredPrice("price_free_recent", "prod_a", 20),
    offeredPrice("price_free_oldest", "prod_a", 10),
    offeredPrice("price_free_same_date_z", "prod_a", 10),
  ]);

  const priceId = await getOrCreateOfferedPrice(paidAddon("prod_a"), stripe);

  assert.equal(priceId, "price_free_oldest");
  assert.equal(stripe.calls.create.length, 0);
});

test("ne partage jamais un Price offert entre deux produits", async () => {
  const stripe = fakeStripe([offeredPrice("price_free_a", "prod_a")]);

  const productAPriceId = await getOrCreateOfferedPrice(
    paidAddon("prod_a"),
    stripe,
  );
  const productBPriceId = await getOrCreateOfferedPrice(
    paidAddon("prod_b"),
    stripe,
  );

  assert.equal(productAPriceId, "price_free_a");
  assert.equal(productBPriceId, "price_created_1");
  assert.equal(stripe.calls.create[0].product, "prod_b");
});
