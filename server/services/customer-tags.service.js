const CustomerModel = require("../models/customer.model");

const LIFECYCLE_TAG_KEYS = [
  "new",
  "regular",
  "very_regular",
  "to_reconquer",
  "lost",
];

const NEW_WINDOW_DAYS = 30;
const RECONQUER_WINDOW_DAYS = 120;
const LOST_WINDOW_DAYS = 365;
const REGULAR_MIN_RESERVATIONS = 2;
const VERY_REGULAR_MIN_RESERVATIONS = 6;
const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeTagList(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
}

function stripLifecycleTags(values = []) {
  return normalizeTagList(values).filter(
    (tag) => !LIFECYCLE_TAG_KEYS.includes(tag),
  );
}

function sameTags(left, right) {
  const a = normalizeTagList(left);
  const b = normalizeTagList(right);

  if (a.length !== b.length) return false;

  const bSet = new Set(b);
  return a.every((tag) => bSet.has(tag));
}

function toValidDate(value) {
  if (!value) return null;
  const out = value instanceof Date ? value : new Date(value);
  return Number.isNaN(out.getTime()) ? null : out;
}

function maxDate(...values) {
  const valid = values
    .map((value) => toValidDate(value))
    .filter((value) => value instanceof Date);

  if (!valid.length) return null;

  return new Date(Math.max(...valid.map((value) => value.getTime())));
}

function getReservationsTotal(source) {
  const raw =
    source?.stats?.reservationsTotal ??
    source?.bookingsTotal ??
    source?.reservationsTotal ??
    0;
  const out = Number(raw);
  if (!Number.isFinite(out) || out < 0) return 0;
  return Math.trunc(out);
}

function getLastEngagementAt(source) {
  const transactionalActivity = maxDate(
    source?.lastReservationAt,
    source?.lastGiftCardAt,
  );

  if (transactionalActivity) return transactionalActivity;

  return maxDate(source?.lastActivityAt, source?.updatedAt, source?.createdAt);
}

function getDaysSince(date, now = new Date()) {
  const safeDate = toValidDate(date);
  const safeNow = toValidDate(now) || new Date();
  if (!safeDate) return null;

  const diff = safeNow.getTime() - safeDate.getTime();
  if (!Number.isFinite(diff)) return null;

  return Math.max(0, Math.floor(diff / DAY_MS));
}

function deriveCustomerLifecycleTag(source, now = new Date()) {
  const reservationsTotal = getReservationsTotal(source);
  const daysSinceLastEngagement = getDaysSince(
    getLastEngagementAt(source),
    now,
  );

  // Business rule:
  // - new: 0/1 confirmed reservation and recent activity (<= 30 days)
  // - to_reconquer: low-engagement client after 30 days, or any inactive client after 120 days
  // - lost: no activity for more than 365 days
  // - regular: 2-5 confirmed reservations with recent activity
  // - very_regular: 6+ confirmed reservations with recent activity
  if (reservationsTotal <= 1) {
    if (
      daysSinceLastEngagement == null ||
      daysSinceLastEngagement <= NEW_WINDOW_DAYS
    ) {
      return "new";
    }
    if (daysSinceLastEngagement > LOST_WINDOW_DAYS) {
      return "lost";
    }
    return "to_reconquer";
  }

  if (
    daysSinceLastEngagement != null &&
    daysSinceLastEngagement > LOST_WINDOW_DAYS
  ) {
    return "lost";
  }

  if (
    daysSinceLastEngagement != null &&
    daysSinceLastEngagement > RECONQUER_WINDOW_DAYS
  ) {
    return "to_reconquer";
  }

  if (reservationsTotal >= VERY_REGULAR_MIN_RESERVATIONS) {
    return "very_regular";
  }

  if (reservationsTotal >= REGULAR_MIN_RESERVATIONS) {
    return "regular";
  }

  return "new";
}

function buildCustomerTags(
  source,
  existingTags = source?.tags,
  now = new Date(),
) {
  const lifecycleTag = deriveCustomerLifecycleTag(source, now);
  return normalizeTagList([...stripLifecycleTags(existingTags), lifecycleTag]);
}

function getCustomerTagUpdate(customer, now = new Date()) {
  const nextTags = buildCustomerTags(customer, customer?.tags, now);
  if (sameTags(customer?.tags, nextTags)) return null;
  return nextTags;
}

async function recomputeCustomerTagsForId(customerId, now = new Date()) {
  if (!customerId) return { found: false, changed: false, tags: [] };

  const customer = await CustomerModel.findById(customerId)
    .select(
      "_id tags stats lastReservationAt lastGiftCardAt lastActivityAt createdAt updatedAt",
    )
    .lean();

  if (!customer) {
    return { found: false, changed: false, tags: [] };
  }

  const nextTags = getCustomerTagUpdate(customer, now);
  if (!nextTags) {
    return {
      found: true,
      changed: false,
      tags: normalizeTagList(customer.tags),
    };
  }

  await CustomerModel.updateOne(
    { _id: customerId },
    { $set: { tags: nextTags } },
  );

  return { found: true, changed: true, tags: nextTags };
}

async function recomputeCustomerTags(filter = {}, options = {}) {
  const { dryRun = false, limit = null, now = new Date() } = options;

  let query = CustomerModel.find(filter)
    .select(
      "_id restaurant_id firstName lastName tags stats lastReservationAt lastGiftCardAt lastActivityAt createdAt updatedAt",
    )
    .sort({ _id: 1 })
    .lean();

  if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
    query = query.limit(Math.trunc(limit));
  }

  const customers = await query;
  const operations = [];
  const preview = [];

  for (const customer of customers) {
    const nextTags = getCustomerTagUpdate(customer, now);
    if (!nextTags) continue;

    operations.push({
      updateOne: {
        filter: { _id: customer._id },
        update: { $set: { tags: nextTags } },
      },
    });

    if (preview.length < 10) {
      preview.push({
        id: String(customer._id),
        name:
          `${customer.firstName || ""} ${customer.lastName || ""}`.trim() ||
          "(sans nom)",
        from: normalizeTagList(customer.tags),
        to: nextTags,
      });
    }
  }

  if (!dryRun && operations.length) {
    await CustomerModel.bulkWrite(operations, { ordered: false });
  }

  return {
    scanned: customers.length,
    updated: operations.length,
    dryRun: Boolean(dryRun),
    preview,
  };
}

module.exports = {
  LIFECYCLE_TAG_KEYS,
  buildCustomerTags,
  deriveCustomerLifecycleTag,
  normalizeTagList,
  recomputeCustomerTags,
  recomputeCustomerTagsForId,
  sameTags,
  stripLifecycleTags,
};
