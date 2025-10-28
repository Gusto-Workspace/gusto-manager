// server/models/logs/pest-control.model.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const actionSchema = new Schema(
  {
    date: { type: Date, required: true },
    action: { type: String }, // ex: "Pose d'appâts", "Inspection", "Remplacement pièges"
    technician: { type: String },
    zone: { type: String }, // zone / local
    severity: {
      type: String,
      enum: ["none", "low", "medium", "high"],
      default: "none",
    },
    findings: { type: String }, // constats (traces, excréments, dégâts…)
    baitRefilled: { type: Number }, // nb postes rechargés
    proofUrls: { type: [String], default: [] },
    notes: { type: String },
  },
  { _id: true }
);

const pestControlSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },

    // Prestataire
    provider: { type: String, required: true },
    providerId: { type: Schema.Types.ObjectId, ref: "Supplier" },
    providerContactName: String,
    providerPhone: String,
    providerEmail: String,

    // Contrat
    contractStart: Date,
    contractEnd: Date,
    visitFrequency: {
      type: String,
      enum: [
        "monthly",
        "bimonthly",
        "quarterly",
        "semester",
        "yearly",
        "on_demand",
      ],
      default: "monthly",
      index: true,
    },

    // Parc pièges/appâts
    baitStationsCount: Number,
    trapsCount: Number,

    // Suivi visites / activité
    lastVisitAt: { type: Date, index: true },
    nextPlannedVisit: Date,
    activityLevel: {
      type: String,
      enum: ["none", "low", "medium", "high"],
      default: "none",
    },
    complianceStatus: {
      type: String,
      enum: ["compliant", "non_compliant", "pending"],
      default: "pending",
    },

    // Rapports et remarques
    reportUrls: { type: [String], default: [] },
    notes: String,

    // Journal d’actions
    actions: { type: [actionSchema], default: [] },

    // Traçabilité
    recordedBy: {
      userId: { type: Schema.Types.ObjectId, required: true, index: true },
      role: { type: String, enum: ["owner", "employee"], required: true },
      firstName: { type: String },
      lastName: { type: String },
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false, collection: "pest_control" }
);

pestControlSchema.index({ restaurantId: 1, lastVisitAt: -1 });

pestControlSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports =
  mongoose.models.PestControl ||
  mongoose.model("PestControl", pestControlSchema);
