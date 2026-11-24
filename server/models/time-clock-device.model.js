const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema.Types;

const deviceSchema = new mongoose.Schema({
  restaurant: { type: ObjectId, required: true, index: true },
  name: { type: String, required: true },
  pairingHash: String,
  pairingExpiresAt: Date,
  activatedAt: Date,
  revokedAt: Date,
  tokenHash: String,
  signingKey: String,
  wrappingKey: String,
  lastContactAt: Date,
  lastLimitedAt: Date,
  attemptWindowUntil: Date,
  attempts: Number,
  failedAttempts: Number,
}, { timestamps: true });
deviceSchema.index({ pairingHash: 1 }, { unique: true, sparse: true });

const pinSchema = new mongoose.Schema({
  restaurant: { type: ObjectId, required: true },
  employee: { type: ObjectId, required: true },
  profile: String,
  lookup: { type: String, required: true },
  sealedPin: { type: String, required: true },
  revision: { type: String, required: true },
  changedBy: { type: String, required: true },
  lastRotatedAt: Date,
}, { timestamps: true });
pinSchema.index({ restaurant: 1, employee: 1 }, { unique: true });
pinSchema.index({ restaurant: 1, lookup: 1 }, { unique: true });

const pinAuditSchema = new mongoose.Schema({
  restaurant: { type: ObjectId, required: true },
  employee: { type: ObjectId, required: true },
  actor: { type: ObjectId, required: true },
  actorRole: { type: String, enum: ["owner", "employee"], required: true },
  action: { type: String, enum: ["viewed", "reset"], required: true },
  at: { type: Date, default: Date.now, required: true },
});
pinAuditSchema.index({ restaurant: 1, at: -1 });

module.exports = {
  TimeClockDevice: mongoose.model("TimeClockDevice", deviceSchema),
  TimeClockPin: mongoose.model("TimeClockPin", pinSchema),
  TimeClockPinAudit: mongoose.model("TimeClockPinAudit", pinAuditSchema),
};
