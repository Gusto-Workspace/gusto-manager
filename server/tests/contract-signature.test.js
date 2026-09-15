const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");

process.env.STRIPE_API_SECRET_KEY ||= "sk_test_contract_unit_tests";

const {
  buildManualCommercialSnapshot,
  buildStripeCommercialSnapshot,
  commercialSnapshotToDocumentFields,
  compareCommercialSnapshots,
  createCommercialSnapshot,
} = require("../services/contract-commercial.service");
const {
  buildContractContentSnapshot,
  buildSignatureProofSnapshot,
  createSignatureToken,
  decodeSignatureDataUrl,
  getRequestState,
  hashContractContent,
  hashSignatureToken,
  serializePublicContract,
  signatureRequestExpiresAt,
} = require("../services/contract-signature.service");
const {
  selectRestaurantSubscriptionCandidate,
} = require("../services/stripe-billing.service");
const {
  renderContractPdf,
} = require("../services/pdf/render-contract.service");
const DocumentModel = require("../models/document.model");

function countPdfPages(buffer) {
  return (buffer.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
}

test("le diff commercial détecte un module ajouté et une quantité modifiée", () => {
  const previous = createCommercialSnapshot({
    source: "STRIPE_SUBSCRIPTION",
    subscriptionId: "sub_1",
    items: [
      {
        kind: "PLAN",
        code: "essential",
        label: "Essentiel",
        quantity: 1,
        unitAmount: 95,
      },
      {
        kind: "ADDON",
        code: "tab_rental",
        label: "Location tablette",
        quantity: 1,
        unitAmount: 12,
      },
    ],
  });
  const current = createCommercialSnapshot({
    source: "STRIPE_SUBSCRIPTION",
    subscriptionId: "sub_1",
    items: [
      {
        kind: "PLAN",
        code: "essential",
        label: "Essentiel",
        quantity: 1,
        unitAmount: 95,
      },
      {
        kind: "ADDON",
        code: "tab_rental",
        label: "Location tablette",
        quantity: 3,
        unitAmount: 12,
      },
      {
        kind: "ADDON",
        code: "reservations",
        label: "Réservations",
        quantity: 1,
        unitAmount: 35,
      },
    ],
  });

  const comparison = compareCommercialSnapshots(previous, current);
  assert.equal(comparison.hasChanges, true);
  assert.deepEqual(
    comparison.changes.map((change) => [
      change.changeType,
      change.after?.code || change.before?.code,
    ]),
    [
      ["UPDATED", "tab_rental"],
      ["ADDED", "reservations"],
    ],
  );
});

test("le diff commercial distingue offert et payant sans faux changement de quantité", () => {
  const offered = createCommercialSnapshot({
    source: "MANUAL",
    items: [
      {
        kind: "ADDON",
        code: "reservations",
        label: "Réservations",
        quantity: 1,
        unitAmount: 0,
      },
    ],
  });
  const paid = createCommercialSnapshot({
    source: "STRIPE_SUBSCRIPTION",
    items: [
      {
        kind: "ADDON",
        code: "reservations",
        label: "Réservations",
        quantity: 1,
        unitAmount: 45,
      },
    ],
  });

  const offeredToPaid = compareCommercialSnapshots(offered, paid).changes[0];
  const paidToOffered = compareCommercialSnapshots(paid, offered).changes[0];

  assert.equal(offeredToPaid.changeType, "UPDATED");
  assert.equal(offeredToPaid.before.unitAmount, 0);
  assert.equal(offeredToPaid.after.unitAmount, 45);
  assert.equal(offeredToPaid.before.quantity, offeredToPaid.after.quantity);
  assert.equal(paidToOffered.before.unitAmount, 45);
  assert.equal(paidToOffered.after.unitAmount, 0);
  assert.equal(paidToOffered.before.quantity, paidToOffered.after.quantity);
});

test("le snapshot contractuel produit un hash stable et exclut les données techniques", () => {
  const document = {
    type: "CONTRACT",
    docNumber: "WD-C-TEST",
    issueDate: "2026-09-15T00:00:00.000Z",
    party: { restaurantName: "Test", email: "owner@example.com" },
    subscription: { name: "Essentiel", priceMonthly: 95 },
    modules: [],
    timeClockTerminalRental: { enabled: false },
    pdf: { url: "https://storage.example/private.pdf" },
    signature: { signerIp: "127.0.0.1" },
  };
  const snapshot = buildContractContentSnapshot(document, null);

  assert.equal(snapshot.pdf, undefined);
  assert.equal(snapshot.signature, undefined);
  assert.equal(hashContractContent(snapshot), hashContractContent(snapshot));
  assert.equal(
    hashContractContent({ party: { email: "a", name: "b" }, lines: [] }),
    hashContractContent({ lines: [], party: { name: "b", email: "a" } }),
  );
});

test("le brouillon manuel conserve le tarif, les quantités et les conditions négociées", () => {
  const draft = {
    type: "CONTRACT",
    docNumber: "WD-C-NEGOCIE",
    issueDate: "2026-09-15T00:00:00.000Z",
    party: { restaurantName: "Test", email: "owner@example.com" },
    subscription: {
      name: "Pack négocié",
      priceMonthly: 80,
      quantity: 2,
      currency: "CHF",
      interval: "year",
      intervalCount: 1,
    },
    modules: [
      {
        name: "Réservations offertes",
        offered: true,
        quantity: 3,
        priceMonthly: 45,
        currency: "CHF",
        interval: "year",
      },
    ],
    comments: "Tarif garanti pendant la première année.",
  };

  const commercial = buildManualCommercialSnapshot(draft);
  const snapshot = buildContractContentSnapshot(draft, commercial);

  assert.equal(commercial.source, "MANUAL");
  assert.equal(commercial.items[0].unitAmount, 80);
  assert.equal(commercial.items[0].quantity, 2);
  assert.equal(commercial.items[0].currency, "CHF");
  assert.equal(commercial.items[0].interval, "year");
  assert.equal(commercial.items[1].unitAmount, 0);
  assert.equal(commercial.items[1].quantity, 3);
  assert.equal(snapshot.comments, "Tarif garanti pendant la première année.");
});

test("un abonnement Stripe historique conserve tous ses postes à vérifier", () => {
  const snapshot = buildStripeCommercialSnapshot(
    {
      currency: "EUR",
      plan: {
        subscriptionItemId: "si_plan",
        productName: "Ancien Pack Essentiel",
        priceId: "price_plan",
        productId: "prod_plan",
        amount: 95,
        quantity: 1,
        currency: "EUR",
        interval: "month",
        intervalCount: 1,
        kind: "",
      },
      addons: [],
      otherItems: [
        {
          subscriptionItemId: "si_unknown",
          productName: "Ancienne prestation",
          priceId: "price_unknown",
          productId: "prod_unknown",
          amount: 24,
          quantity: 2,
          currency: "EUR",
          interval: "month",
          intervalCount: 1,
          kind: "",
        },
      ],
    },
    { id: "sub_historique" },
  );

  assert.equal(snapshot.items.length, 2);
  assert.equal(snapshot.items[0].kind, "PLAN");
  assert.equal(snapshot.items[1].kind, "OTHER");
  assert.equal(snapshot.items[1].quantity, 2);
  assert.equal(snapshot.reviewRequired, true);
  assert.equal(snapshot.reviewWarnings.length, 2);
});

test("un brouillon d'avenant reprend la nouvelle situation commerciale complète", () => {
  const current = createCommercialSnapshot({
    source: "STRIPE_SUBSCRIPTION",
    items: [
      { kind: "PLAN", code: "premium", label: "Premium", unitAmount: 130 },
      {
        kind: "ADDON",
        code: "reservations",
        label: "Réservations",
        productId: "prod_reservations",
        priceId: "price_reservations_offered",
        unitAmount: 0,
      },
      {
        kind: "ADDON",
        code: "gift_cards",
        label: "Cartes cadeaux",
        unitAmount: 45,
      },
    ],
  });
  const fields = commercialSnapshotToDocumentFields(current);
  const draftSnapshot = buildManualCommercialSnapshot(fields);

  assert.deepEqual(
    draftSnapshot.items.map((item) => [
      item.code,
      item.quantity,
      item.unitAmount,
      item.totalAmount,
    ]),
    [
      ["premium", 1, 130, 130],
      ["reservations", 1, 0, 0],
      ["gift_cards", 1, 45, 45],
    ],
  );
  assert.equal(fields.modules[0].offered, true);
  assert.equal(fields.modules[0].priceMonthly, 0);
});

test("les renderers produisent les PDF du contrat et de l'avenant complet", async () => {
  const base = {
    type: "CONTRACT",
    docNumber: "WD-C-RENDER",
    issueDate: "2026-09-15T00:00:00.000Z",
    party: {
      restaurantName: "Restaurant Test",
      ownerName: "Jean Test",
      email: "jean@example.com",
    },
    subscription: {
      name: "Essentiel",
      priceMonthly: 95,
      quantity: 1,
      currency: "EUR",
      interval: "month",
      intervalCount: 1,
    },
    modules: [
      {
        name: "Réservations",
        priceMonthly: 45,
        quantity: 1,
        currency: "EUR",
        interval: "month",
        intervalCount: 1,
      },
    ],
    timeClockTerminalRental: {
      enabled: true,
      priceMonthly: 12,
      quantity: 2,
      currency: "EUR",
      interval: "month",
      intervalCount: 1,
    },
    engagementMonths: 12,
    comments: "Tarif négocié et validé.",
  };
  const contract = await renderContractPdf(base, {}, null);
  const amendmentCommercial = buildManualCommercialSnapshot(base);
  const amendment = await renderContractPdf(
    {
      ...base,
      contractKind: "AMENDMENT",
      amendment: {
        baseContractNumber: "WD-C-INITIAL",
        baseContractSignedAt: "2026-08-01T00:00:00.000Z",
      },
      commercialSnapshot: amendmentCommercial,
    },
    {},
    null,
  );

  assert.equal(contract.subarray(0, 4).toString(), "%PDF");
  assert.equal(amendment.subarray(0, 4).toString(), "%PDF");
  assert.ok(countPdfPages(contract) >= 1);
  assert.ok(countPdfPages(amendment) >= 1);
});

test("la sélection Stripe privilégie le catalogue et refuse une ambiguïté", () => {
  const restaurantId = "restaurant_1";
  const selected = selectRestaurantSubscriptionCandidate(
    [
      {
        id: "sub_legacy",
        status: "active",
        metadata: { restaurantId },
      },
      {
        id: "sub_catalog",
        status: "past_due",
        metadata: {
          restaurantId,
          subscriptionCatalog: "restaurant_subscription",
        },
      },
    ],
    { restaurantId },
  );
  assert.equal(selected.id, "sub_catalog");

  assert.throws(
    () =>
      selectRestaurantSubscriptionCandidate(
        ["sub_a", "sub_b"].map((id) => ({
          id,
          status: "active",
          metadata: {
            restaurantId,
            subscriptionCatalog: "restaurant_subscription",
          },
        })),
        { restaurantId },
      ),
    (error) =>
      error.code === "AMBIGUOUS_RESTAURANT_SUBSCRIPTION" &&
      error.statusCode === 409,
  );
});

test("le lieu de signature est couvert par l'empreinte de preuve", () => {
  const base = {
    contractContentHash: "a".repeat(64),
    presentedPdfHash: "b".repeat(64),
    signerName: "Jean Test",
    signerEmail: "jean@example.com",
    signedAt: "2026-09-15T12:00:00.000Z",
    acceptedAt: "2026-09-15T12:00:00.000Z",
    signatureImageHash: "c".repeat(64),
    method: "REMOTE",
  };
  const paris = buildSignatureProofSnapshot({
    ...base,
    placeOfSignature: "Paris",
  });
  const lyon = buildSignatureProofSnapshot({
    ...base,
    placeOfSignature: "Lyon",
  });

  assert.notEqual(hashContractContent(paris), hashContractContent(lyon));
});

test("le renderer place la signature sur le contrat depuis le snapshot figé", async () => {
  const snapshot = {
    docNumber: "WD-C-PDF",
    party: { restaurantName: "Restaurant test", email: "test@example.com" },
    issueDate: "2026-09-01T00:00:00.000Z",
    subscription: { name: "Essentiel", priceMonthly: 95 },
    engagementMonths: 12,
    modules: [],
  };
  const signature = await sharp({
    create: {
      width: 400,
      height: 120,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  const presented = await renderContractPdf(snapshot, {}, null);
  const signed = await renderContractPdf(
    {
      ...snapshot,
      placeOfSignature: "Montauban",
      signatureDate: "2026-09-15T12:00:00.000Z",
    },
    {},
    signature,
  );

  assert.equal(countPdfPages(signed), countPdfPages(presented));
  assert.ok(signed.length > presented.length);
  assert.notDeepEqual(signed, presented);
});

test("le renderer place aussi la signature dans le template de l'avenant", async () => {
  const snapshot = {
    docNumber: "WD-C-SLOT-A1",
    contractKind: "AMENDMENT",
    party: { restaurantName: "Restaurant test", email: "test@example.com" },
    issueDate: "2026-09-01T00:00:00.000Z",
    subscription: { name: "Premium", priceMonthly: 130 },
    engagementMonths: 12,
    modules: [],
    amendment: {
      baseContractNumber: "WD-C-SLOT",
      baseContractSignedAt: "2026-08-01T00:00:00.000Z",
    },
    commercialSnapshot: {
      items: [
        {
          kind: "PLAN",
          label: "Premium",
          unitAmount: 130,
          quantity: 1,
          currency: "EUR",
          interval: "month",
        },
      ],
    },
  };
  const signature = await sharp({
    create: {
      width: 240,
      height: 80,
      channels: 4,
      background: { r: 20, g: 30, b: 54, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  const presented = await renderContractPdf(snapshot, {}, null);
  const signed = await renderContractPdf(
    {
      ...snapshot,
      placeOfSignature: "Montauban",
      signatureDate: "2026-09-15T12:00:00.000Z",
    },
    {},
    signature,
  );

  assert.equal(countPdfPages(signed), countPdfPages(presented));
  assert.ok(signed.length > presented.length);
  assert.notDeepEqual(signed, presented);
});

test("le token public est aléatoire et seul son hash est destiné au stockage", () => {
  const first = createSignatureToken();
  const second = createSignatureToken();
  assert.equal(first.length, 64);
  assert.notEqual(first, second);
  assert.equal(hashSignatureToken(first).length, 64);
  assert.notEqual(hashSignatureToken(first), first);
});

test("un lien de signature expire au plus tard 24 heures après son émission", () => {
  const issuedAt = new Date("2026-09-15T10:00:00.000Z");
  assert.equal(
    signatureRequestExpiresAt(issuedAt).toISOString(),
    "2026-09-16T10:00:00.000Z",
  );
});

test("la validation refuse une fausse image de signature", () => {
  assert.throws(
    () =>
      decodeSignatureDataUrl(
        `data:image/png;base64,${Buffer.from("not-a-png").toString("base64")}`,
      ),
    /image valide/,
  );
});

test("un lien expiré ne révèle plus le contenu contractuel public", () => {
  const document = {
    status: "SENT",
    signatureRequest: {
      status: "PENDING",
      expiresAt: new Date("2026-09-14T00:00:00.000Z"),
    },
    contractSnapshot: {
      docNumber: "WD-C-EXPIRED",
      party: { restaurantName: "Test", email: "secret@example.com" },
    },
  };
  const now = new Date("2026-09-15T00:00:00.000Z");

  assert.equal(getRequestState(document, now), "EXPIRED");
  assert.equal(serializePublicContract(document, now).document, null);
});

test("un token révoqué reste inutilisable après une signature physique", () => {
  const document = {
    status: "SIGNED",
    signatureRequest: {
      status: "REVOKED",
      expiresAt: new Date("2026-10-15T00:00:00.000Z"),
    },
    contractSnapshot: {
      docNumber: "WD-C-REVOKED",
      party: { restaurantName: "Test" },
    },
  };

  assert.equal(getRequestState(document), "REVOKED");
  assert.equal(serializePublicContract(document).document, null);
});

test("la vue publique active masque les coordonnées privées", () => {
  const result = serializePublicContract({
    status: "SENT",
    signatureRequest: {
      status: "PENDING",
      expiresAt: new Date("2026-10-15T00:00:00.000Z"),
    },
    contractSnapshot: {
      docNumber: "WD-C-PUBLIC",
      party: {
        restaurantName: "Restaurant Test",
        ownerName: "Jean Test",
        address: "1 rue Test",
        email: "secret@example.com",
        phone: "0600000000",
      },
    },
  });

  assert.equal(result.document.party.restaurantName, "Restaurant Test");
  assert.equal(result.document.party.email, undefined);
  assert.equal(result.document.party.phone, undefined);
});

test("la vue publique d'un avenant n'expose pas le diff administratif", () => {
  const result = serializePublicContract({
    status: "SENT",
    signatureRequest: {
      status: "PENDING",
      expiresAt: new Date("2026-10-15T00:00:00.000Z"),
    },
    contractSnapshot: {
      docNumber: "WD-C-A1",
      contractKind: "AMENDMENT",
      party: { restaurantName: "Restaurant Test" },
      amendment: {
        baseContractNumber: "WD-C-INITIAL",
        baseContractSignedAt: "2026-08-01T00:00:00.000Z",
        changes: [
          {
            changeType: "UPDATED",
            before: { label: "Tarif confidentiel" },
            after: { label: "Nouveau tarif" },
          },
        ],
      },
    },
  });

  assert.equal(result.document.amendment.baseContractNumber, "WD-C-INITIAL");
  assert.equal(result.document.amendment.changes, undefined);
});

test("un ancien contrat signé reste valide sans les nouveaux champs", () => {
  const legacyDocument = new DocumentModel({
    type: "CONTRACT",
    docNumber: "WD-C-LEGACY",
    status: "SIGNED",
    party: {
      restaurantName: "Restaurant historique",
      email: "legacy@example.com",
    },
    signature: { signedAt: new Date("2025-01-10T12:00:00.000Z") },
  });

  assert.equal(legacyDocument.validateSync(), undefined);
  assert.equal(legacyDocument.status, "SIGNED");
  assert.equal(legacyDocument.contractKind, "INITIAL");
});
