const { Types } = require("mongoose");
const Employee = require("../../models/employee.model");
const Restaurant = require("../../models/restaurant.model");
const TimeClockSession = require("../../models/time-clock-session.model");
const EmployeeAssetDeletion = require("../../models/employee-asset-deletion.model");
const { TimeClockPin } = require("../../models/time-clock-device.model");
const { clockTransaction, lockClockEmployees } = require("./time-clock-write.service");
const { attemptEmployeeAssetDeletions, enqueueEmployeeAssetDeletions } = require("./employee-asset-deletion.service");
const { isValidDateKey, toLocalDateKey } = require("./time-clock.service");

const fail = (message, status) => Object.assign(new Error(message), { status });
const eligibleDocument = ({ delivery_type, resource_type }) =>
  delivery_type === "authenticated" && ["raw", "image", "video"].includes(resource_type || "raw");

async function archivedRecord(restaurantId, employeeId, session) {
  const restaurant = new Types.ObjectId(restaurantId);
  const employee = await Employee.collection.findOne({ _id: new Types.ObjectId(employeeId) }, {
    projection: { restaurants: 1, restaurantProfiles: 1, firstname: 1, lastname: 1, profilePicture: 1, __v: 1 }, session,
  });
  const profiles = (employee?.restaurantProfiles || []).filter((entry) => String(entry.restaurant) === restaurantId);
  if (profiles.length > 1) throw fail("Plusieurs profils partagent ce compte dans cet établissement. La suppression est bloquée.", 409);
  const [profile] = profiles;
  if (!profile) throw fail("Membre introuvable dans cet établissement.", 404);
  if (!profile._id || !profile.archivedAt || employee.restaurants?.some((entry) => String(entry) === restaurantId) ||
      await Restaurant.exists({ _id: restaurant, employees: employee._id }).session(session)) {
    throw fail("Seul un membre archivé dans cet établissement peut être supprimé.", 409);
  }
  const shared = Boolean(employee.restaurants?.length ||
    employee.restaurantProfiles.some((entry) => entry !== profile && !entry.erasure?.at) ||
    await Restaurant.exists({ _id: { $ne: restaurant }, employees: employee._id }).session(session));
  return { employee, profile, restaurant, shared };
}

function publicResult({ at, accountErased, removedDocuments, retainedDocuments, retentionUntil }, assetCleanupPending) {
  return { erasedAt: at, accountErased, removedDocuments, retainedDocuments, assetCleanupPending, retentionUntil };
}

async function previewEmployeeErasure(restaurantId, employeeId) {
  const { employee, profile, shared } = await archivedRecord(restaurantId, employeeId, null);
  if (profile.erasure?.at) {
    const pending = await EmployeeAssetDeletion.exists({ _id: { $in: profile.erasure.assetJobs || [] } });
    return { result: publicResult(profile.erasure, Boolean(pending)) };
  }
  return { revision: employee.__v ?? 0, shared, minimumRetentionDate: toLocalDateKey(new Date()), documents: (profile.documents || []).map((document) => ({
    id: document.public_id, title: document.title || document.filename, eligible: eligibleDocument(document),
  })) };
}

function referencedElsewhere(employee, publicId, session) {
  return Employee.exists({ _id: { $ne: employee._id }, $or: [
    { "profilePicture.public_id": publicId },
    { "restaurantProfiles.documents.public_id": publicId },
    { "restaurantProfiles.planningFiles.public_id": publicId },
  ] }).session(session);
}

async function eraseArchivedEmployee({ restaurantId, employeeId, actor, authMethod, superAdminSessionId, revision, confirmation, retentionReviewed, documentIds,
  retentionUntil, retentionReason }) {
  if (confirmation !== "SUPPRIMER" || retentionReviewed !== true || !Number.isSafeInteger(revision) || revision < 0 ||
      !Array.isArray(documentIds) || documentIds.length > 100 ||
      documentIds.some((id) => typeof id !== "string" || !id || id.length > 512) ||
      new Set(documentIds).size !== documentIds.length) {
    throw fail("Vérifiez les pièces à conserver et saisissez SUPPRIMER pour confirmer.", 400);
  }
  const selected = new Set(documentIds);
  const result = await clockTransaction(async (session) => {
    await lockClockEmployees(restaurantId, [employeeId], session);
    const { employee, profile, restaurant, shared } = await archivedRecord(restaurantId, employeeId, session);
    if (profile.erasure?.at) return profile.erasure;
    if (!retentionUntil) throw fail("Renseignez la date de fin de conservation de l’identité RH.", 400);
    if (typeof retentionUntil !== "string" || !isValidDateKey(retentionUntil)) {
      throw fail("La date de fin de conservation est invalide.", 400);
    }
    if (retentionUntil < toLocalDateKey(new Date())) {
      throw fail("Le dernier jour de conservation doit être aujourd’hui ou une date ultérieure, en heure de Paris.", 400);
    }
    if (typeof retentionReason !== "string" || !retentionReason.trim() || retentionReason.length > 500) {
      throw fail("Renseignez un motif de conservation de 500 caractères maximum.", 400);
    }
    if ((employee.__v ?? 0) !== revision) throw fail("Le dossier a changé. Rouvrez la confirmation.", 409);

    const documents = profile.documents || [];
    const removed = documents.filter(({ public_id }) => selected.has(public_id));
    if (removed.length !== selected.size || removed.some((document) => !eligibleDocument(document))) {
      throw fail("Une pièce sélectionnée est indisponible pour un retrait sécurisé.", 409);
    }
    const retained = documents.filter(({ public_id }) => !selected.has(public_id));
    const retainedAssets = employee.restaurantProfiles.flatMap((entry) =>
      [...(entry.planningFiles || []), ...(entry === profile ? retained : entry.documents || [])]);
    for (const { public_id } of removed) {
      if (employee.profilePicture?.public_id === public_id || retainedAssets.some((asset) => asset.public_id === public_id) ||
          await referencedElsewhere(employee, public_id, session)) {
        throw fail("Une pièce sélectionnée sert encore de justificatif dans un autre dossier.", 409);
      }
    }

    const assets = [...removed];
    const photoId = employee.profilePicture?.public_id;
    if (!shared && photoId && !retainedAssets.some(({ public_id }) => public_id === photoId) &&
        !await referencedElsewhere(employee, photoId, session)) {
      assets.push({ public_id: photoId, resource_type: "image", delivery_type: "upload" });
    }
    const pseudonym = { firstname: "Ancien membre", lastname: profile._id.toString().slice(-8).toUpperCase() };
    const erasure = {
      at: new Date(), actor, authMethod, superAdminSessionId,
      accountErased: !shared, removedDocuments: removed.length, retainedDocuments: retained.length,
      retentionUntil,
      assetJobs: await enqueueEmployeeAssetDeletions(assets, session),
    };
    const scoped = "restaurantProfiles.$[profile]";
    await Employee.updateOne({ _id: employee._id }, {
      $set: {
        [`rhArchiveIdentities.${restaurantId}`]: { firstname: profile.snapshot?.firstname || employee.firstname,
          lastname: profile.snapshot?.lastname || employee.lastname, until: retentionUntil, reason: retentionReason.trim() },
        [`${scoped}.erasure`]: erasure,
        [`${scoped}.snapshot`]: { post: profile.snapshot?.post ?? "", dateOnPost: profile.snapshot?.dateOnPost, ...pseudonym },
        [`${scoped}.documents`]: retained,
        [`${scoped}.options`]: {},
        ...(!shared && pseudonym),
      },
      $inc: { __v: 1, ...(!shared && { sessionVersion: 1 }) },
      $unset: { [`${scoped}.skelloNameKey`]: "", ...(!shared && { email: "", password: "", phone: "", secuNumber: "", address: "", emergencyContact: "",
        resetCode: "", resetCodeExpires: "", profilePicture: "" }) },
    }, { session, arrayFilters: [{ "profile._id": profile._id }] });
    await TimeClockSession.updateMany({ restaurant, employee: employee._id }, {
      $set: { "employeeSnapshot.firstname": pseudonym.firstname, "employeeSnapshot.lastname": pseudonym.lastname },
      $unset: { "employeeSnapshot.email": "" },
      // Reject corrections prepared from a session that still held the former identity.
      $inc: { __v: 1 },
    }, { session, timestamps: false });
    await TimeClockPin.deleteOne({ restaurant, employee: employee._id }, { session });
    return erasure;
  });

  return publicResult(result, await attemptEmployeeAssetDeletions(result.assetJobs || []));
}

module.exports = { previewEmployeeErasure, eraseArchivedEmployee };
