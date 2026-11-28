const { Schema, model } = require("mongoose");

const stages = [
  "TO_CONTACT", "CONTACTED", "INTERESTED", "APPOINTMENT", "DEMO", "QUOTE_SENT",
  "NEGOTIATION", "CONTRACT_SENT", "ACQUIRED", "NOT_INTERESTED", "LOST",
];
const interactionTypes = ["CALL", "EMAIL", "APPOINTMENT", "DEMO", "NOTE", "FOLLOW_UP", "OTHER"];
const manualStages = ["TO_CONTACT", "CONTACTED", "INTERESTED", "NEGOTIATION", "NOT_INTERESTED", "LOST"];
const documentStages = { contractSentAt: "CONTRACT_SENT", quoteSentAt: "QUOTE_SENT" };
const legacyStages = { APPOINTMENT: "INTERESTED", DEMO: "NEGOTIATION" };
const pipelineStages = [...manualStages.slice(0, 4), "QUOTE_SENT", "CONTRACT_SENT", "ACQUIRED", ...manualStages.slice(4), "OPPOSED"];
const closedStages = manualStages.slice(4);
const eventTypes = ["APPOINTMENT", "DEMO", "FOLLOW_UP", "OTHER"];

function computedStage(prospect) {
  if (prospect.opposedAt) return "OPPOSED";
  const facts = prospect.milestones || {};
  if (facts.acquiredAt) return "ACQUIRED";
  if (closedStages.includes(prospect.stage)) return prospect.stage;
  for (const [field, stage] of Object.entries(documentStages)) if (facts[field]) return stage;
  return legacyStages[prospect.stage] || (manualStages.includes(prospect.stage) ? prospect.stage : "TO_CONTACT");
}

const pipelineStage = { $switch: {
  branches: [
    { case: { $toBool: "$opposedAt" }, then: "OPPOSED" },
    { case: { $toBool: "$milestones.acquiredAt" }, then: "ACQUIRED" },
    { case: { $in: ["$stage", closedStages] }, then: "$stage" },
    ...Object.entries(documentStages).map(([field, stage]) => ({ case: { $toBool: `$milestones.${field}` }, then: stage })),
    ...Object.entries(legacyStages).map(([old, stage]) => ({ case: { $eq: ["$stage", old] }, then: stage })),
  ],
  default: { $cond: [{ $in: ["$stage", manualStages] }, "$stage", "TO_CONTACT"] },
} };

const identity = {
  restaurantName: { type: String, trim: true, maxlength: 160, required: true },
  address: { type: String, trim: true, maxlength: 250, default: "" },
  postalCode: { type: String, trim: true, maxlength: 12, default: "" },
  city: { type: String, trim: true, maxlength: 120, default: "" },
  siret: { type: String, match: /^(?:\d{14})?$/, default: "" },
  phone: { type: String, maxlength: 40, default: "" },
  email: { type: String, maxlength: 254, default: "" },
  website: { type: String, maxlength: 500, default: "" },
};

const prospectSchema = new Schema({
  ...identity,
  contactName: { type: String, maxlength: 160, default: "" },
  source: { type: String, maxlength: 160, default: "" },
  needs: { type: String, maxlength: 4000, default: "" },
  notes: { type: String, maxlength: 4000, default: "" },
  modules: { type: [String], default: [] },
  stage: { type: String, enum: stages, default: "TO_CONTACT" },
  salesOwnerId: { type: Schema.Types.ObjectId, ref: "CommercialAccount", required: true },
  createdBy: { type: String, required: true },
  firstContactAt: Date,
  lastContactAt: Date,
  nextFollowUpAt: Date,
  nextAppointmentAt: Date,
  milestones: {
    quoteSentAt: Date,
    contractSentAt: Date,
    contractSignedAt: Date,
    acquiredAt: Date,
  },
  archivedAt: Date,
  archivePurgeAt: Date,
  operationsPurgedAt: Date,
  opposedAt: Date,
}, { timestamps: true });
prospectSchema.index({ salesOwnerId: 1, archivedAt: 1, updatedAt: -1, _id: -1 });
prospectSchema.index({ salesOwnerId: 1, nextFollowUpAt: 1 });
prospectSchema.index({ salesOwnerId: 1, createdAt: 1 });

const interactionSchema = new Schema({
  prospectId: { type: Schema.Types.ObjectId, ref: "CommercialProspect", required() { return !this.state; } },
  salesOwnerId: { type: Schema.Types.ObjectId, ref: "CommercialAccount", required: true },
  actorId: { type: String, required: true },
  type: { type: String, enum: [...interactionTypes, "ASSIGNMENT", "OPPOSITION", "ARCHIVED", "RESTORED", "STAGE_CHANGED", "PROFILE_UPDATED"], required: true },
  message: { type: String, maxlength: 4000, default: "" },
  occurredAt: { type: Date, required() { return !this.state || this.state === "COMPLETED"; } },
  state: { type: String, enum: ["SCHEDULED", "COMPLETED", "CANCELLED"] },
  title: { type: String, maxlength: 160 },
  startsAt: Date,
  endsAt: Date,
  allDay: Boolean,
  location: { type: String, maxlength: 250 },
  cancelledAt: Date,
  eventChanges: [{ _id: false, actorId: String, action: String, at: Date }],
  previousStage: String,
  nextStage: String,
  private: { type: Boolean, default: false },
  previousOwnerId: Schema.Types.ObjectId,
}, { timestamps: true });
interactionSchema.index({ prospectId: 1, occurredAt: -1, _id: -1 });
interactionSchema.index({ salesOwnerId: 1, type: 1, occurredAt: -1 });
interactionSchema.index({ salesOwnerId: 1, startsAt: 1 }, { partialFilterExpression: { startsAt: { $type: "date" } } });
interactionSchema.index({ startsAt: 1 }, { partialFilterExpression: { startsAt: { $type: "date" } } });
interactionSchema.index({ prospectId: 1, state: 1, type: 1, startsAt: 1 });

module.exports = {
  CommercialProspect: model("CommercialProspect", prospectSchema),
  CommercialInteraction: model("CommercialInteraction", interactionSchema),
  manualStages, closedStages, legacyStages, pipelineStages, pipelineStage, eventTypes,
  computedStage,
  interactionTypes,
};
