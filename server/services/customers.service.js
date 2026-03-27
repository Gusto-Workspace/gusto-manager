// services/customers.service.js
const CustomerModel = require("../models/customer.model");
const { recomputeCustomerTagsForId } = require("./customer-tags.service");

function normEmail(v) {
  const s = String(v || "")
    .trim()
    .toLowerCase();
  return s || null;
}

function normPhone(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  const out = s.replace(/[^\d+]/g, "");
  return out || null;
}

function cleanNamePart(v) {
  return String(v || "")
    .trim()
    .replace(/\s+/g, " ");
}

// ✅ Upsert “identité” + complète first/last si vides (sans écraser)
async function upsertCustomer({
  restaurantId,
  firstName,
  lastName,
  email,
  phone,
}) {
  const emailNorm = normEmail(email);
  const phoneNorm = normPhone(phone);

  const fn = cleanNamePart(firstName);
  const ln = cleanNamePart(lastName);

  // ⚠️ sans email ni tel => pas d'upsert (évite doublons)
  if (!emailNorm && !phoneNorm) return null;

  const now = new Date();

  const update = {
    $setOnInsert: {
      restaurant_id: restaurantId,
      createdAt: now,
      // ✅ On initialise l'identité uniquement à la création de la fiche
      ...(fn ? { firstName: fn } : {}),
      ...(ln ? { lastName: ln } : {}),
    },
    $set: {
      lastActivityAt: now,
    },
  };

  // ✅ email: on peut le mettre à jour (et il reste unique)
  if (emailNorm) {
    const rawEmail = String(email || "").trim();
    update.$set.email = rawEmail;
    update.$set.emailNorm = emailNorm;
  }

  // ✅ téléphone: on ne l’écrase PAS si déjà présent
  // -> on l'initialise seulement à la création
  if (phoneNorm) {
    const rawPhone = String(phone || "").trim();
    update.$setOnInsert.phone = rawPhone;
    update.$setOnInsert.phoneNorm = phoneNorm;
  }

  // ✅ Règle: 1 client = 1 email
  const query = { restaurant_id: restaurantId };
  if (emailNorm) query.emailNorm = emailNorm;
  else query.phoneNorm = phoneNorm;

  // 1) upsert standard
  const doc = await CustomerModel.findOneAndUpdate(query, update, {
    new: true,
    upsert: true,
  });

  // 2) ✅ Compléter uniquement si vide (sans écraser)
  const patch = {};

  // prénom/nom
  if (!cleanNamePart(doc.firstName) && fn) patch.firstName = fn;
  if (!cleanNamePart(doc.lastName) && ln) patch.lastName = ln;

  // téléphone (compléter si vide uniquement)
  if (!normPhone(doc.phone) && phoneNorm) {
    patch.phone = String(phone || "").trim();
    patch.phoneNorm = phoneNorm;
  }

  if (Object.keys(patch).length) {
    await CustomerModel.updateOne({ _id: doc._id }, { $set: patch });
    return CustomerModel.findById(doc._id);
  }

  return doc;
}

// ✅ Stats + mini-historique (réservation)
async function onReservationCreated(customerId, reservation) {
  if (!customerId) return;

  const now = new Date();
  await CustomerModel.updateOne(
    { _id: customerId },
    {
      $inc: { "stats.reservationsTotal": 1 },
      $set: {
        lastReservationAt: reservation.reservationDate,
        lastActivityAt: now,
      },
      $push: {
        lastReservations: {
          $each: [
            {
              reservationId: reservation._id,
              reservationDate: reservation.reservationDate,
              reservationTime: reservation.reservationTime,
              numberOfGuests: reservation.numberOfGuests,
              status: reservation.status,
            },
          ],
          $slice: -30,
        },
      },
    },
  );

  await recomputeCustomerTagsForId(customerId, now);
}

// ✅ Quand le statut change (pour canceled)
async function onReservationStatusChanged(
  customerId,
  reservation,
  prevStatus,
  nextStatus,
) {
  if (!customerId) return;

  const inc = {};
  if (prevStatus !== "Canceled" && nextStatus === "Canceled") {
    inc["stats.reservationsCanceled"] = 1;
  }
  if (prevStatus === "Canceled" && nextStatus !== "Canceled") {
    inc["stats.reservationsCanceled"] = -1;
  }

  const now = new Date();

  const update = {
    $set: { lastActivityAt: now },
    $push: {
      lastReservations: {
        $each: [
          {
            reservationId: reservation._id,
            reservationDate: reservation.reservationDate,
            reservationTime: reservation.reservationTime,
            numberOfGuests: reservation.numberOfGuests,
            status: nextStatus,
          },
        ],
        $slice: -30,
      },
    },
  };

  if (Object.keys(inc).length) update.$inc = inc;

  await CustomerModel.updateOne({ _id: customerId }, update);

  // sécurité: jamais négatif
  await CustomerModel.updateOne(
    { _id: customerId, "stats.reservationsCanceled": { $lt: 0 } },
    { $set: { "stats.reservationsCanceled": 0 } },
  );

  await recomputeCustomerTagsForId(customerId, now);
}

// ✅ Stats + mini-historique (gift purchase)
async function onGiftPurchased(customerId, purchaseSubdoc) {
  if (!customerId) return;

  const now = new Date();

  await CustomerModel.updateOne(
    { _id: customerId },
    {
      $inc: { "stats.giftCardsBought": 1 },
      $set: {
        lastGiftCardAt: purchaseSubdoc.created_at,
        lastActivityAt: now,
      },
      $push: {
        lastGiftPurchases: {
          $each: [
            {
              purchaseId: purchaseSubdoc._id,
              created_at: purchaseSubdoc.created_at,
              amount: purchaseSubdoc.amount, // centimes (comme ton modèle gift purchase)
              value: purchaseSubdoc.value, // euros si tu le stockes aussi
              purchaseCode: purchaseSubdoc.purchaseCode || "",
            },
          ],
          $slice: -30,
        },
      },
    },
  );

  await recomputeCustomerTagsForId(customerId, now);
}

module.exports = {
  upsertCustomer,
  onReservationCreated,
  onReservationStatusChanged,
  onGiftPurchased,
};
