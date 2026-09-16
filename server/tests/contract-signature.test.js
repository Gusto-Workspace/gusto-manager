const test = require("node:test");
const assert = require("node:assert/strict");
const PDFDocument = require("pdfkit");
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
const {
  buildContractDurationCopy,
  earlyTerminationFromContractState,
  formatMonthsWithNumber,
  normalizeEarlyTermination,
  validateEarlyTermination,
} = require("../services/contract-terms.service");
const DocumentModel = require("../models/document.model");

function countPdfPages(buffer) {
  return (buffer.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
}

async function capturePdfKitText(render) {
  const originalText = PDFDocument.prototype.text;
  const calls = [];

  PDFDocument.prototype.text = function captureText(value, ...args) {
    calls.push({
      value: value == null ? "" : String(value),
      page: this.page,
      y: this.y,
    });
    return originalText.call(this, value, ...args);
  };

  try {
    const buffer = await render();
    return {
      buffer,
      calls,
      text: calls.map((call) => call.value).join("\n"),
    };
  } finally {
    PDFDocument.prototype.text = originalText;
  }
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
  assert.equal(snapshot.contractTermsVersion, 2);
  assert.deepEqual(snapshot.earlyTermination, {
    enabled: false,
    minimumCommitmentMonths: 12,
    noticeMonths: 3,
  });
  assert.equal(hashContractContent(snapshot), hashContractContent(snapshot));
  assert.equal(
    hashContractContent({ party: { email: "a", name: "b" }, lines: [] }),
    hashContractContent({ lines: [], party: { name: "b", email: "a" } }),
  );
});

test("la résiliation anticipée est désactivée par défaut et figée dans le snapshot", () => {
  const legacy = normalizeEarlyTermination(undefined);
  assert.deepEqual(legacy, {
    enabled: false,
    minimumCommitmentMonths: 12,
    noticeMonths: 3,
  });

  const source = {
    type: "CONTRACT",
    docNumber: "WD-C-EARLY",
    issueDate: "2026-09-15T00:00:00.000Z",
    party: { restaurantName: "Test", email: "owner@example.com" },
    engagementMonths: 24,
    earlyTermination: {
      enabled: true,
      minimumCommitmentMonths: 12,
      noticeMonths: 3,
    },
  };
  const snapshot = buildContractContentSnapshot(source, null);
  source.earlyTermination.minimumCommitmentMonths = 18;

  assert.deepEqual(snapshot.earlyTermination, {
    enabled: true,
    minimumCommitmentMonths: 12,
    noticeMonths: 3,
  });
  assert.notEqual(
    hashContractContent(snapshot),
    hashContractContent(buildContractContentSnapshot(source, null)),
  );
});

test("les conditions de sortie valident les fenêtres 12/3 et 18/2", () => {
  assert.deepEqual(
    validateEarlyTermination(
      { enabled: true, minimumCommitmentMonths: 12, noticeMonths: 3 },
      24,
    ),
    { enabled: true, minimumCommitmentMonths: 12, noticeMonths: 3 },
  );
  assert.deepEqual(
    validateEarlyTermination(
      { enabled: true, minimumCommitmentMonths: 18, noticeMonths: 2 },
      24,
    ),
    { enabled: true, minimumCommitmentMonths: 18, noticeMonths: 2 },
  );
  assert.equal(formatMonthsWithNumber(15), "quinze (15) mois");
  assert.equal(formatMonthsWithNumber(20), "vingt (20) mois");
  assert.throws(
    () =>
      validateEarlyTermination(
        { enabled: true, minimumCommitmentMonths: 23, noticeMonths: 1 },
        24,
      ),
    /avant le terme/,
  );
});

test("la rédaction conditionnelle n'accorde aucun préavis au contrat ferme", () => {
  const firmCopy = buildContractDurationCopy({
    engagementMonths: 24,
    earlyTermination: {
      enabled: false,
      minimumCommitmentMonths: 12,
      noticeMonths: 3,
    },
  });
  const firmText = [
    firmCopy.financialDurationText,
    ...firmCopy.durationParagraphs,
  ].join(" ");
  assert.match(firmText, /durée ferme de vingt-quatre \(24\) mois/);
  assert.equal(firmCopy.durationParagraphs.length, 1);
  assert.doesNotMatch(
    firmText,
    /convenance personnelle|évolution de ses besoins professionnels/,
  );
  assert.doesNotMatch(firmText, /préavis de trois \(3\) mois/);
  assert.doesNotMatch(firmText, /après douze \(12\) mois/);

  const negotiatedCopy = buildContractDurationCopy({
    engagementMonths: 24,
    earlyTermination: {
      enabled: true,
      minimumCommitmentMonths: 18,
      noticeMonths: 2,
    },
  });
  const negotiatedText = [
    negotiatedCopy.financialDurationText,
    ...negotiatedCopy.durationParagraphs,
  ].join(" ");
  assert.match(negotiatedText, /dix-huit \(18\) mois/);
  assert.match(negotiatedText, /préavis de deux \(2\) mois/);
  assert.match(negotiatedText, /après vingt \(20\) mois/);
  assert.doesNotMatch(negotiatedText, /douze \(12\)|trois \(3\)/);
});

test("un snapshot sans condition conserve la rédaction historique", () => {
  const legacyCopy = buildContractDurationCopy({ engagementMonths: 24 });
  assert.equal(legacyCopy.legacy, true);
  assert.equal(legacyCopy.durationParagraphs.length, 1);
  assert.match(
    legacyCopy.durationParagraphs[0],
    /Aucune résiliation anticipée n’est possible durant cette période/,
  );
  assert.doesNotMatch(
    legacyCopy.durationParagraphs[0],
    /cessation définitive|vente ou de cession/i,
  );
});

test("un avenant hérite la condition du dernier snapshot signé", () => {
  assert.deepEqual(
    earlyTerminationFromContractState({
      earlyTermination: { enabled: false },
      contractSnapshot: {
        earlyTermination: {
          enabled: true,
          minimumCommitmentMonths: 12,
          noticeMonths: 3,
        },
      },
    }),
    { enabled: true, minimumCommitmentMonths: 12, noticeMonths: 3 },
  );
  assert.deepEqual(
    earlyTerminationFromContractState({
      earlyTermination: {
        enabled: true,
        minimumCommitmentMonths: 12,
        noticeMonths: 3,
      },
      contractSnapshot: { docNumber: "WD-C-LEGACY" },
    }),
    { enabled: false, minimumCommitmentMonths: 12, noticeMonths: 3 },
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
      {
        kind: "ADDON",
        code: "tab_rental",
        label: "Location tablette",
        quantity: 2,
        unitAmount: 12,
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
      ["tab_rental", 2, 12, 24],
    ],
  );
  assert.equal(fields.timeClockTerminalRental.enabled, false);
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
    earlyTermination: {
      enabled: false,
      minimumCommitmentMonths: 12,
      noticeMonths: 3,
    },
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

test("le stream PDFKit du nouveau contrat contient la clause de propriété dans les deux modes de résiliation", async () => {
  const base = {
    type: "CONTRACT",
    docNumber: "WD-C-PROPRIETE",
    issueDate: "2026-09-16T00:00:00.000Z",
    party: {
      restaurantName: "Restaurant Test",
      ownerName: "Jean Test",
      email: "jean@example.com",
    },
    lines: [
      {
        label: "Site internet",
        qty: 1,
        unitPrice: 0,
        offered: true,
        active: true,
        kind: "WEBSITE",
      },
      {
        label: "Frais de mise en service",
        qty: 1,
        unitPrice: 250,
        active: true,
        kind: "NORMAL",
      },
    ],
    website: { enabled: true, offered: true, paymentSplit: 1 },
    subscription: {
      name: "Gusto Manager",
      priceMonthly: 95,
      quantity: 1,
      currency: "EUR",
      interval: "month",
      intervalCount: 1,
    },
    modules: [
      {
        name: "Réservations",
        offered: true,
        priceMonthly: 0,
        quantity: 1,
        currency: "EUR",
        interval: "month",
        intervalCount: 1,
      },
    ],
    timeClockTerminalRental: { enabled: false },
    engagementMonths: 24,
  };
  const firmSnapshot = buildContractContentSnapshot(
    {
      ...base,
      earlyTermination: {
        enabled: false,
        minimumCommitmentMonths: 12,
        noticeMonths: 3,
      },
    },
    buildManualCommercialSnapshot(base),
  );
  const earlySnapshot = buildContractContentSnapshot(
    {
      ...base,
      earlyTermination: {
        enabled: true,
        minimumCommitmentMonths: 12,
        noticeMonths: 3,
      },
    },
    buildManualCommercialSnapshot(base),
  );

  const firm = await capturePdfKitText(() =>
    renderContractPdf(firmSnapshot, {}, null),
  );
  const early = await capturePdfKitText(() =>
    renderContractPdf(earlySnapshot, {}, null),
  );

  for (const rendered of [firm, early]) {
    assert.equal(rendered.buffer.subarray(0, 4).toString(), "%PDF");
    assert.match(
      rendered.text,
      /Propriété du site, des contenus et du nom de domaine/,
    );
    assert.match(
      rendered.text,
      /demeure également titulaire de son nom de domaine/,
    );
    assert.match(
      rendered.text,
      /sans obligation pour le Prestataire de poursuivre gratuitement l’hébergement/,
    );
    assert.match(
      rendered.text,
      /cessent systématiquement d’être fournies par la plateforme et ne sont plus affichées sur le site/,
    );
    assert.match(
      rendered.text,
      /Aucune copie figée ni aucun maintien automatique de ces données dynamiques ne fait partie du site conservé/,
    );
    assert.match(
      rendered.text,
      /ne confère au Client aucun droit de propriété sur la plateforme Gusto Manager, son dashboard, son back-office, ses API internes, le code source de la plateforme et de ses services/,
    );
    assert.match(
      rendered.text,
      /Le Client conserve en revanche les éléments spécifiques constituant son site vitrine/,
    );
    assert.match(
      rendered.text,
      /y compris le code spécifique propre à ce site dans la mesure nécessaire à sa conservation, à son fonctionnement autonome ou à son transfert vers un autre hébergement/,
    );
    assert.match(
      rendered.text,
      /les connexions aux API, les services dynamiques et les fonctionnalités dépendant de la plateforme, doivent être exclus, supprimés, désactivés ou rendus inopérants/,
    );
    assert.match(
      rendered.text,
      /ne peut donner accès aux services Gusto Manager après la fin de l’abonnement/,
    );
    assert.doesNotMatch(
      rendered.text,
      /son dashboard, ses API internes, son code source, ses composants génériques/,
    );
    assert.doesNotMatch(
      rendered.text,
      /données dynamiques[^.]*peuvent continuer à être affichées/i,
    );

    const titleCall = rendered.calls.find((call) =>
      call.value.includes(
        "Propriété du site, des contenus et du nom de domaine",
      ),
    );
    const firstParagraphCall = rendered.calls.find((call) =>
      call.value.startsWith("Le Client demeure propriétaire du site vitrine"),
    );
    assert.ok(titleCall);
    assert.ok(firstParagraphCall);
    assert.equal(titleCall.page, firstParagraphCall.page);
  }
});

test("le même snapshot produit la clause dans le PDF présenté et le PDF signé", async () => {
  const snapshot = buildContractContentSnapshot(
    {
      type: "CONTRACT",
      docNumber: "WD-C-PROPRIETE-SIGNE",
      issueDate: "2026-09-16T00:00:00.000Z",
      party: {
        restaurantName: "Restaurant Test",
        email: "test@example.com",
      },
      lines: [
        {
          label: "Site internet",
          qty: 1,
          unitPrice: 0,
          offered: true,
          active: true,
          kind: "WEBSITE",
        },
      ],
      subscription: { name: "Gusto Manager", priceMonthly: 95 },
      engagementMonths: 24,
      earlyTermination: { enabled: false },
    },
    null,
  );
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

  const presented = await capturePdfKitText(() =>
    renderContractPdf(snapshot, {}, null),
  );
  const signed = await capturePdfKitText(() =>
    renderContractPdf(
      {
        ...snapshot,
        placeOfSignature: "Paris",
        signatureDate: "2026-09-16T12:00:00.000Z",
      },
      {},
      signature,
    ),
  );
  const ownershipText = (rendered) =>
    rendered.calls
      .map((call) => call.value)
      .filter(
        (value) =>
          value.includes(
            "Propriété du site, des contenus et du nom de domaine",
          ) ||
          value.startsWith("Le Client demeure propriétaire du site vitrine") ||
          value.startsWith("Le Client demeure également titulaire") ||
          value.startsWith("La fin du contrat Gusto Manager") ||
          value.startsWith("Certains contenus ou fonctionnalités") ||
          value.startsWith("À compter de la date effective") ||
          value.startsWith("Même lorsque le site est conservé") ||
          value.startsWith("La présente clause ne confère") ||
          value.startsWith("Le Client conserve en revanche"),
      );

  assert.deepEqual(ownershipText(signed), ownershipText(presented));
});

test("un snapshot legacy et un avenant n’injectent pas la nouvelle clause", async () => {
  const legacySnapshot = {
    type: "CONTRACT",
    docNumber: "WD-C-LEGACY-PDF",
    issueDate: "2025-01-10T00:00:00.000Z",
    party: {
      restaurantName: "Restaurant historique",
      email: "legacy@example.com",
    },
    lines: [
      {
        label: "Site internet",
        qty: 1,
        unitPrice: 0,
        offered: true,
        active: true,
        kind: "WEBSITE",
      },
    ],
    subscription: { name: "Gusto Manager", priceMonthly: 95 },
    engagementMonths: 24,
  };
  const legacy = await capturePdfKitText(() =>
    renderContractPdf(legacySnapshot, {}, null),
  );
  const amendment = await capturePdfKitText(() =>
    renderContractPdf(
      {
        ...legacySnapshot,
        contractKind: "AMENDMENT",
        contractTermsVersion: 2,
        amendment: {
          baseContractNumber: "WD-C-LEGACY-PDF",
          baseContractSignedAt: "2025-01-10T00:00:00.000Z",
        },
        commercialSnapshot: {
          items: [
            {
              kind: "PLAN",
              label: "Gusto Manager",
              unitAmount: 95,
              quantity: 1,
              currency: "EUR",
              interval: "month",
            },
          ],
        },
      },
      {},
      null,
    ),
  );

  assert.doesNotMatch(
    legacy.text,
    /Propriété du site, des contenus et du nom de domaine/,
  );
  assert.doesNotMatch(
    amendment.text,
    /Propriété du site, des contenus et du nom de domaine/,
  );
  assert.match(
    amendment.text,
    /Toutes les clauses du contrat initial non modifiées par cet avenant restent pleinement applicables/,
  );
});

test("le renderer contractuel varie selon la condition de résiliation figée", async () => {
  const base = {
    type: "CONTRACT",
    docNumber: "WD-C-TERMS",
    issueDate: "2026-09-15T00:00:00.000Z",
    party: { restaurantName: "Restaurant Test", email: "test@example.com" },
    subscription: { name: "Essentiel", priceMonthly: 95 },
    engagementMonths: 24,
    earlyTermination: {
      enabled: false,
      minimumCommitmentMonths: 12,
      noticeMonths: 3,
    },
    modules: [],
  };
  const firm = await renderContractPdf(base, {}, null);
  const twelveThree = await renderContractPdf(
    {
      ...base,
      earlyTermination: {
        enabled: true,
        minimumCommitmentMonths: 12,
        noticeMonths: 3,
      },
    },
    {},
    null,
  );
  const eighteenTwo = await renderContractPdf(
    {
      ...base,
      earlyTermination: {
        enabled: true,
        minimumCommitmentMonths: 18,
        noticeMonths: 2,
      },
    },
    {},
    null,
  );

  assert.notDeepEqual(firm, twelveThree);
  assert.notDeepEqual(twelveThree, eighteenTwo);
  assert.ok(countPdfPages(firm) >= 1);
  assert.ok(countPdfPages(twelveThree) >= 1);
  assert.ok(countPdfPages(eighteenTwo) >= 1);
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
  assert.equal(legacyDocument.earlyTermination.enabled, false);
  assert.equal(legacyDocument.earlyTermination.minimumCommitmentMonths, 12);
  assert.equal(legacyDocument.earlyTermination.noticeMonths, 3);
});
