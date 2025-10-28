const mongoose = require("mongoose");
const { Schema } = mongoose;

const auditSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      index: true,
    },
    who: { type: Schema.Types.ObjectId, ref: "Employee" },
    actorRole: { type: String }, // ex: "manager", "admin"
    action: { type: String }, // "create_temperature", "close_nonconformity", etc.
    targetCollection: String,
    targetId: String,
    prev: Schema.Types.Mixed, // keep small summary if possible
    next: Schema.Types.Mixed,
    meta: {
      // utile pour ip / request id
      ip: String,
      requestId: String,
      userAgent: String,
    },
    at: { type: Date, default: Date.now, immutable: true },
  },
  { versionKey: false }
);

auditSchema.index({ restaurantId: 1, at: -1 });

module.exports = mongoose.models.Audit || mongoose.model("Audit", auditSchema);
