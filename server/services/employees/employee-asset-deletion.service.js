const { createHash } = require("node:crypto");
const cloudinary = require("cloudinary").v2;
const EmployeeAssetDeletion = require("../../models/employee-asset-deletion.model");

const CLOUDINARY_TIMEOUT_MS = 10_000;
const LEASE_MS = 60_000;
const BATCH_SIZE = 8;

async function enqueueEmployeeAssetDeletions(assets, session) {
  const jobs = new Map();
  for (const document of assets) {
    if (!document?.public_id) continue;
    const asset = {
      public_id: document.public_id,
      resource_type: document.resource_type || "raw",
      delivery_type: document.delivery_type || "",
    };
    const id = createHash("sha256").update(JSON.stringify(asset)).digest("hex");
    jobs.set(id, asset);
  }
  if (!jobs.size) return [];
  const nextAttemptAt = new Date();
  await EmployeeAssetDeletion.bulkWrite([...jobs].map(([_id, asset]) => ({
    updateOne: {
      filter: { _id },
      update: { $setOnInsert: { ...asset, nextAttemptAt, attempts: 0 } },
      upsert: true,
    },
  })), { session });
  return [...jobs.keys()];
}

async function deleteQueuedAsset(id, now) {
  const job = await EmployeeAssetDeletion.findOneAndUpdate(
    { _id: id, nextAttemptAt: { $lte: now } },
    { $set: { nextAttemptAt: new Date(+now + LEASE_MS) }, $inc: { attempts: 1 } },
    { new: true },
  ).lean();
  if (!job) return;

  const claim = { _id: job._id, attempts: job.attempts };
  try {
    if (job.delivery_type !== "authenticated" &&
        !(job.resource_type === "image" && job.delivery_type === "upload")) {
      throw new Error("Missing or unsupported Cloudinary delivery type");
    }
    const response = await cloudinary.uploader.destroy(job.public_id, {
      resource_type: job.resource_type,
      type: job.delivery_type,
      invalidate: true,
      timeout: CLOUDINARY_TIMEOUT_MS,
    });
    if (!["ok", "not found"].includes(response?.result)) {
      throw new Error("Cloudinary did not confirm asset deletion");
    }
    await EmployeeAssetDeletion.deleteOne(claim);
  } catch (error) {
    const delay = Math.min(60, 2 ** Math.min(job.attempts, 6)) * 60_000;
    await EmployeeAssetDeletion.updateOne(
      claim,
      { $set: { nextAttemptAt: new Date(+now + delay) } },
    );
    console.warn("[employee-asset-deletion] Retained job for retry:", job._id, error?.http_code || error?.code || "unconfirmed");
  }
}

async function retryEmployeeAssetDeletions({ ids, now, limit = 64 } = {}) {
  if (ids?.length === 0) return false;
  const scope = ids ? { _id: { $in: ids } } : {};
  const jobs = await EmployeeAssetDeletion.find({ ...scope, nextAttemptAt: { $lte: now || new Date() } })
    .select("_id").sort({ nextAttemptAt: 1 }).limit(limit).lean();
  for (let index = 0; index < jobs.length; index += BATCH_SIZE) {
    await Promise.all(jobs.slice(index, index + BATCH_SIZE).map(({ _id }) => deleteQueuedAsset(_id, now || new Date())));
  }
  return ids ? Boolean(await EmployeeAssetDeletion.exists(scope)) : undefined;
}

async function attemptEmployeeAssetDeletions(ids) {
  try {
    return await retryEmployeeAssetDeletions({ ids, limit: BATCH_SIZE });
  } catch (error) {
    console.warn("[employee-asset-deletion] Immediate cleanup deferred:", error?.code || "unavailable");
    return true;
  }
}

module.exports = {
  enqueueEmployeeAssetDeletions,
  retryEmployeeAssetDeletions,
  attemptEmployeeAssetDeletions,
};
