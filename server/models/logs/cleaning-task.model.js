// server/models/logs/cleaning-task.model.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const userRefSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, index: true },
    role: { type: String, enum: ["owner", "employee"] },
    firstName: String,
    lastName: String,
    avatarUrl: String, // <-- NEW: URL photo de profil (dénormalisée)
  },
  { _id: false }
);

const historySchema = new Schema(
  {
    doneAt: { type: Date, default: Date.now, index: true },
    doneBy: userRefSchema,
    proofUrls: { type: [String], default: [] },
    note: String,
    verified: { type: Boolean, default: false },
    verifiedAt: Date,
    verifiedBy: userRefSchema,
  },
  { _id: false }
);

const cleaningTaskSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },

    // === Plan (configuration) ===
    zone: { type: String, required: true, index: true },
    zoneId: { type: String },
    description: { type: String },

    frequency: {
      type: String,
      enum: ["daily", "weekly", "monthly", "on_demand"],
      default: "daily",
      index: true,
    },

    riskLevel: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "low",
      index: true,
    },

    protocolSteps: { type: [String], default: [] },
    dwellTimeMin: Number,

    // Produits
    products: { type: [String], default: [] },
    productFDSUrls: { type: [String], default: [] },

    // === Historique des exécutions ===
    history: { type: [historySchema], default: [] },

    // Dénormalisation pour la liste
    lastDoneAt: { type: Date, index: true },
    lastDoneBy: userRefSchema,
    lastProofCount: { type: Number, default: 0 },

    // Traçabilité création
    recordedBy: {
      userId: { type: Schema.Types.ObjectId, required: true, index: true },
      role: { type: String, enum: ["owner", "employee"], required: true },
      firstName: String,
      lastName: String,
    },

    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false, collection: "cleaning_task" }
);

// Index utiles
cleaningTaskSchema.index({ restaurantId: 1, createdAt: -1 });
cleaningTaskSchema.index({ restaurantId: 1, lastDoneAt: -1 });
cleaningTaskSchema.index({ restaurantId: 1, zone: 1 });

module.exports =
  mongoose.models.CleaningTask ||
  mongoose.model("CleaningTask", cleaningTaskSchema);
