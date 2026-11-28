const mongoose = require("mongoose");
const { createHash } = require("node:crypto");
const { parsePhoneNumberFromString } = require("libphonenumber-js");
const Establishment = require("../../models/commercial-establishment.model");
const Restaurant = require("../../models/restaurant.model");
const restaurantIdentityFields = "name address siret";

const registryControlId = "000000000000000000000001";
const conflictMessage = "Cet établissement ne peut pas être ajouté à votre portefeuille. Veuillez contacter l'administrateur.";
const normal = (value) => String(value || "").normalize("NFD").replace(/\p{M}/gu, "")
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const hash = (value) => createHash("sha256").update(value).digest("hex");
const unique = (values) => [...new Set(values.filter(Boolean))];

function keysForEstablishment(profile) {
  const name = normal(profile.restaurantName || profile.name);
  const address = profile.address;
  const street = normal(typeof address === "string" ? address : address?.line1);
  const postal = normal(profile.postalCode || address?.zipCode);
  const city = normal(profile.city || address?.city);
  const location = street && (postal || city) ? `${street}|${postal || city}` : "";
  const siret = /^\d{14}$/.test(profile.siret || "") ? profile.siret : "";
  const phone = parsePhoneNumberFromString(String(profile.phone || ""), "FR")?.number || "";
  const email = String(profile.email || "").trim().toLowerCase();
  let domain = "";
  try {
    const website = String(profile.website || "").trim();
    if (website) domain = new URL(website.includes("://") ? website : `https://${website}`).hostname.replace(/^www\./, "");
  } catch {
    // Invalid legacy URLs do not participate in matching.
  }
  return {
    location, siret,
    certainKeys: unique([siret && `siret:${siret}`, name && location && `place:${hash(`${name}|${location}`)}`]),
    candidateKeys: unique([
      name && (postal || city) && `area:${hash(`${name}|${postal || city}`)}`,
      phone && `phone:${hash(phone)}`, email && `email:${hash(email)}`, domain && `domain:${hash(domain)}`,
    ]),
  };
}

function matchesRestaurantIdentity(prospect, restaurant) {
  const prospectKeys = keysForEstablishment(prospect);
  const restaurantKeys = keysForEstablishment(restaurant);
  if (prospectKeys.siret && restaurantKeys.siret && prospectKeys.siret !== restaurantKeys.siret) return false;
  return restaurantKeys.certainKeys.some((key) => prospectKeys.certainKeys.includes(key));
}

async function currentRegistryRestaurants(establishment, prospect, session = null) {
  if (!establishment?.restaurants?.length) return [];
  const restaurants = await Restaurant.find({ _id: { $in: establishment.restaurants } })
    .select(restaurantIdentityFields).session(session).lean();
  return restaurants.filter((restaurant) => matchesRestaurantIdentity(prospect, restaurant));
}

async function registryReady(session = null) {
  const query = Establishment.exists({ _id: registryControlId, kind: "CONTROL", readyAt: { $type: "date" } });
  if (session) query.session(session);
  return Boolean(await query);
}

async function matchingEstablishments(keys, session, exceptId) {
  const found = await Establishment.find({
    kind: "ESTABLISHMENT",
    ...(exceptId && { _id: { $ne: exceptId } }),
    $or: [
      { certainKeys: { $in: keys.certainKeys } },
      { candidateKeys: { $in: keys.candidateKeys } },
    ],
  }).select("certainKeys candidateKeys location siret opposedAt restaurants").session(session).limit(100).lean();
  return found.flatMap((item) => {
    if (item.certainKeys?.some((key) => keys.certainKeys.includes(key))) {
      return [{ id: item._id, kind: item.opposedAt ? "OPPOSITION" : "CERTAIN" }];
    }
    if (keys.siret && item.siret && keys.siret !== item.siret) return [];
    if (keys.location && item.location && keys.location !== item.location) return [];
    return [{ id: item._id, kind: item.opposedAt ? "OPPOSITION" : "AMBIGUOUS" }];
  });
}

async function recordConflict(profile, matches, actor, session = null) {
  const matchIds = matches.map(({ id }) => id);
  const key = hash(`${actor}|${JSON.stringify(keysForEstablishment(profile))}`);
  await Establishment.updateOne({ requestKey: key }, {
    $setOnInsert: {
      kind: "CONFLICT", proposed: { ...profile, requestedBy: String(actor) },
      matchingIds: matchIds, conflictKind: matches.some(({ kind }) => kind === "OPPOSITION") ? "OPPOSITION" :
        matches.some(({ kind }) => kind === "CERTAIN") ? "CERTAIN" : "AMBIGUOUS",
    },
  }, { upsert: true, ...(session && { session }) });
}

async function syncRestaurantEstablishment(restaurant, session) {
  const keys = keysForEstablishment(restaurant);
  // Serialize identity edits with a completion that is checking an old registry link.
  if (!restaurant.isNew && ["name", "address", "siret"].some((field) => restaurant.isModified?.(field))) {
    await Establishment.updateMany({ kind: "ESTABLISHMENT", restaurants: restaurant._id },
      { $inc: { __v: 1 } }, { session });
  }
  const matches = keys.certainKeys.length ? await Establishment.find({
    kind: "ESTABLISHMENT", certainKeys: { $in: keys.certainKeys },
  }).session(session).lean() : [];
  if (matches.length > 1) {
    const ids = matches.map(({ _id }) => _id);
    // All strong keys remain reserved. Preserve linked prospects for admin arbitration.
    await Establishment.updateMany({ _id: { $in: ids } }, {
      $addToSet: { restaurants: restaurant._id, candidateKeys: { $each: keys.candidateKeys } },
    }, { session });
    const alreadyReserved = new Set(matches.flatMap(({ certainKeys }) => certainKeys || []));
    const missing = keys.certainKeys.filter((key) => !alreadyReserved.has(key));
    if (missing.length) await Establishment.updateOne({ _id: ids[0] }, {
      $addToSet: { certainKeys: { $each: missing } },
    }, { session });
    return;
  }
  const filter = matches.length ? { _id: matches[0]._id } : { _id: restaurant._id };
  await Establishment.updateOne(filter, {
    $setOnInsert: { kind: "ESTABLISHMENT", location: keys.location, siret: keys.siret },
    $addToSet: {
      restaurants: restaurant._id,
      ...(keys.certainKeys.length && { certainKeys: { $each: keys.certainKeys } }),
      ...(keys.candidateKeys.length && { candidateKeys: { $each: keys.candidateKeys } }),
    },
  }, { upsert: true, setDefaultsOnInsert: false, session });
}

async function saveRestaurantWithEstablishment(restaurant) {
  if (!await registryReady()) return restaurant.save();
  return mongoose.connection.transaction(async (session) => {
    await syncRestaurantEstablishment(restaurant, session);
    return restaurant.save({ session });
  });
}

module.exports = {
  registryControlId, registryReady, conflictMessage, keysForEstablishment,
  matchingEstablishments, recordConflict, syncRestaurantEstablishment, saveRestaurantWithEstablishment,
  restaurantIdentityFields, matchesRestaurantIdentity, currentRegistryRestaurants,
};
