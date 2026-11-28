const { Schema, model } = require("mongoose");

const schema = new Schema({
  kind: { type: String, enum: ["ESTABLISHMENT", "CONFLICT", "CONTROL"], required: true },
  certainKeys: { type: [String], default: undefined },
  candidateKeys: { type: [String], default: undefined },
  location: { type: String, default: "" },
  siret: { type: String, default: "" },
  prospectId: Schema.Types.ObjectId,
  restaurants: { type: [Schema.Types.ObjectId], default: [] },
  opposedAt: Date,
  proposed: Schema.Types.Mixed,
  matchingIds: [Schema.Types.ObjectId],
  requestKey: String,
  conflictKind: String,
  decision: { type: String, enum: ["DISTINCT", "REJECTED"] },
  decidedAt: Date,
  decidedBy: String,
  decisionReason: String,
  readyAt: Date,
}, { timestamps: true });

schema.index({ certainKeys: 1 }, { unique: true, sparse: true });
schema.index({ candidateKeys: 1 });
schema.index({ prospectId: 1 }, { unique: true, sparse: true });
schema.index({ requestKey: 1 }, { unique: true, sparse: true });
schema.index({ kind: 1, decidedAt: 1, createdAt: -1 });

module.exports = model("CommercialEstablishment", schema);
