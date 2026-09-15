const DocumentModel = require("../models/document.model");
const {
  commercialSnapshotToDocumentFields,
  compareCommercialSnapshots,
  createCommercialSnapshot,
  normalizeCommercialItem,
} = require("./contract-commercial.service");

function plain(value) {
  if (value == null) return value;
  if (typeof value.toObject === "function") return value.toObject();
  return JSON.parse(JSON.stringify(value));
}

function itemKey(item = {}) {
  return item.code || item.priceId || item.productId || `${item.kind}:${item.label}`;
}

// Stripe décrit le plan et ses modules facturés. Les prestations libres restent
// contractuelles et sont donc reprises du document (signé ou brouillon) courant.
function mergeCommercialSnapshots(stripeSnapshot, contractualSnapshot) {
  const stripeItems = Array.isArray(stripeSnapshot?.items)
    ? stripeSnapshot.items.map(normalizeCommercialItem)
    : [];
  const knownKeys = new Set(stripeItems.map(itemKey));
  const contractualOnlyItems = (contractualSnapshot?.items || [])
    .map(normalizeCommercialItem)
    .filter((item) => item.kind === "OTHER" && !knownKeys.has(itemKey(item)));

  return createCommercialSnapshot({
    source: "STRIPE_SUBSCRIPTION",
    subscriptionId: stripeSnapshot?.subscriptionId || "",
    currency: stripeSnapshot?.currency || contractualSnapshot?.currency || "EUR",
    items: [...stripeItems, ...contractualOnlyItems],
    capturedAt: new Date(),
    reviewWarnings: stripeSnapshot?.reviewWarnings || [],
  });
}

async function getContractFamily(restaurantId) {
  const latestSigned = await DocumentModel.findOne({
    type: "CONTRACT",
    restaurantId,
    status: "SIGNED",
  }).sort({ versionNumber: -1, createdAt: -1 });
  if (!latestSigned) return { rootContract: null, family: [], latestSigned: null };

  const rootContract = latestSigned.rootContractId
    ? await DocumentModel.findById(latestSigned.rootContractId)
    : latestSigned;
  if (!rootContract) return { rootContract: null, family: [], latestSigned: null };

  const family = await DocumentModel.find({
    type: "CONTRACT",
    restaurantId,
    $or: [{ _id: rootContract._id }, { rootContractId: rootContract._id }],
  }).sort({ versionNumber: 1, createdAt: 1 });

  return {
    rootContract,
    family,
    latestSigned: family.filter((document) => document.status === "SIGNED").at(-1) || null,
  };
}

async function prepareSubscriptionAmendment({ restaurantId, stripeSnapshot }) {
  if (!restaurantId || !stripeSnapshot) {
    return { document: null, reason: "NO_SUBSCRIPTION_SNAPSHOT" };
  }

  const { rootContract, family, latestSigned } = await getContractFamily(restaurantId);
  if (!rootContract || !latestSigned) {
    return { document: null, reason: "NO_SIGNED_CONTRACT" };
  }

  const draft = family
    .filter(
      (document) =>
        document.contractKind === "AMENDMENT" && document.status === "DRAFT",
    )
    .at(-1);
  const previousSnapshot =
    latestSigned.commercialSnapshot || latestSigned.contractSnapshot?.commercialSnapshot;
  if (!previousSnapshot?.items?.length) {
    return { document: null, reason: "NO_COMPARABLE_SIGNED_SNAPSHOT" };
  }

  const currentSnapshot = mergeCommercialSnapshots(
    stripeSnapshot,
    draft?.commercialSnapshot || previousSnapshot,
  );
  const comparison = compareCommercialSnapshots(previousSnapshot, currentSnapshot);
  if (!comparison.hasChanges) {
    return { document: draft || null, reason: "NO_COMMERCIAL_CHANGE" };
  }

  const commercialFields = commercialSnapshotToDocumentFields(currentSnapshot);
  // A website is contractual but not a Stripe subscription item. Preserve the
  // draft value when present; otherwise inherit it from the latest signed state.
  const fieldSource = draft || latestSigned.contractSnapshot || latestSigned;
  const sharedFields = {
    subscription: commercialFields.subscription,
    modules: commercialFields.modules,
    timeClockTerminalRental: commercialFields.timeClockTerminalRental,
    commercialSnapshot: currentSnapshot,
    commercialReviewConfirmedAt: currentSnapshot.reviewRequired ? null : new Date(),
    website: plain(fieldSource.website) || {},
    lines: plain(fieldSource.lines) || [],
    amendment: {
      baseContractNumber: rootContract.docNumber,
      baseContractSignedAt:
        rootContract.signature?.signedAt || rootContract.issueDate || null,
      changes: comparison.changes,
    },
  };

  if (draft) {
    draft.set(sharedFields);
    await draft.save();
    return { document: draft, created: false, updated: true };
  }

  const versionNumber = Math.max(...family.map((item) => Number(item.versionNumber || 1))) + 1;
  const amendment = await DocumentModel.create({
    type: "CONTRACT",
    docNumber: `${rootContract.docNumber}-A${versionNumber - 1}`,
    status: "DRAFT",
    restaurantId: rootContract.restaurantId,
    contractKind: "AMENDMENT",
    rootContractId: rootContract._id,
    parentDocumentId: latestSigned._id,
    versionNumber,
    party: plain(rootContract.party),
    issueDate: new Date(),
    engagementMonths:
      latestSigned.contractSnapshot?.engagementMonths || latestSigned.engagementMonths || 12,
    comments: fieldSource.comments || "",
    ...sharedFields,
  });
  return { document: amendment, created: true, updated: false };
}

module.exports = {
  getContractFamily,
  mergeCommercialSnapshots,
  prepareSubscriptionAmendment,
};
