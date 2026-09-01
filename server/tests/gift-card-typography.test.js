const assert = require("node:assert/strict");
const test = require("node:test");

const {
  generateGiftCardPdfBuffer,
} = require("../services/gift-card-mailer.service");
const {
  inferGiftCardTypographyPreset,
  resolveGiftCardTypographyPreset,
} = require("../services/gift-card-typography.service");

const BASE_PURCHASE = {
  value: 150,
  beneficiaryFirstName: "Léo dit Bébé",
  beneficiaryLastName: "",
  sender: "Gusto Manager",
  purchaseCode: "TEST42",
  validUntil: new Date("2027-12-01T00:00:00Z"),
};

test("les restaurants existants connus reçoivent automatiquement leur preset", () => {
  assert.equal(
    inferGiftCardTypographyPreset({ name: "L’Ambassade" }),
    "ambassade",
  );
  assert.equal(
    inferGiftCardTypographyPreset({ name: "La Coquille" }),
    "coquille",
  );
  assert.equal(
    inferGiftCardTypographyPreset({ name: "Restaurant Exemple" }),
    "classic",
  );
});

test("un preset interne explicite prime sur la détection automatique", () => {
  const restaurant = {
    name: "L’Ambassade",
    giftCardSettings: { typographyPreset: "classic" },
  };

  assert.equal(resolveGiftCardTypographyPreset(restaurant), "classic");
  assert.equal(
    resolveGiftCardTypographyPreset(restaurant, {
      typographyPreset: "coquille",
    }),
    "coquille",
  );
});

for (const preset of ["ambassade", "coquille", "classic"]) {
  test(`le PDF ${preset} incorpore sa typographie sans dépendance externe`, async () => {
    const pdf = await generateGiftCardPdfBuffer({
      restaurant: { name: "Restaurant de test" },
      purchase: {
        ...BASE_PURCHASE,
        visualSnapshot: {
          typographyPreset: preset,
          textColor: "#000000",
          textLayout: "right",
        },
      },
      message: "Joyeux anniversaire !",
      hidePrice: false,
    });

    assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
    assert.ok(pdf.length > 1000);
  });
}
