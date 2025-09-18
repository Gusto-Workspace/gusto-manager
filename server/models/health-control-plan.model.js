const mongoose = require("mongoose");
const { Schema } = mongoose;

const healthControlPlanSettingsSchema = new Schema(
  {
    enabled: { type: Boolean, default: true },
    thresholds: {
      type: Map,
      of: new Schema(
        { min: Number, max: Number, unit: { type: String, default: "°C" } },
        { _id: false }
      ),
      default: {},
    },
    notificationEmails: { type: [String], default: [] },
    notificationPhones: { type: [String], default: [] },
    autoCreateNonConformityOnAlert: { type: Boolean, default: true },
    archiveAfterDays: { type: Number, default: 365 * 2 },
  },
  { _id: false }
);

const healthControlPlanDocumentSchema = new Schema(
  {
    title: String,
    type: String,
    version: String, // ex "v1.2"
    effectiveDate: Date,
    replacedBy: { type: String }, // id ou nom du doc remplaçant
    fileUrl: String,
    publicId: String,
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "Employee" },
  },
  { _id: false }
);

const sensorMetaSchema = new Schema(
  {
    name: String,
    type: {
      type: String,
      enum: ["temperature", "humidity", "door", "other"],
      default: "temperature",
    },
    identifier: String,
    locationId: String,
    settings: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const scheduledTaskMetaSchema = new Schema(
  {
    title: String,
    description: String,
    cronLike: String,
    assignedTo: { type: Schema.Types.ObjectId, ref: "Employee" },
    nextRunAt: Date,
  },
  { _id: false }
);

const trainingRecordSchema = new Schema(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee" },
    name: String,
    date: Date,
    validUntil: Date,
    provider: String,
    certificateUrl: String,
  },
  { _id: false }
);

const ccpDefinitionSchema = new Schema({
  id: String,
  name: String,
  description: String,
  criticalLimit: String, // ex: ">=63°C"
  monitoringFrequency: String, // "per service", "daily"
  responsible: { type: Schema.Types.ObjectId, ref: "Employee" },
  verificationRecords: [
    {
      date: Date,
      method: String,
      result: String,
      by: { type: Schema.Types.ObjectId, ref: "Employee" },
    },
  ],
});

const healthControlPlanEmbeddedSchema = new Schema(
  {
    settings: { type: healthControlPlanSettingsSchema, default: () => ({}) },
    documents: { type: [healthControlPlanDocumentSchema], default: [] },
    sensorsMeta: { type: [sensorMetaSchema], default: [] },
    scheduledTasksMeta: { type: [scheduledTaskMetaSchema], default: [] },
    trainings: { type: [trainingRecordSchema], default: [] },
    ccpDefinition: { type: [ccpDefinitionSchema], default: [] },
    lastUpdatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

module.exports = healthControlPlanEmbeddedSchema;
