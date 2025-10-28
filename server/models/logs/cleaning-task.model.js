const mongoose = require("mongoose");
const { Schema } = mongoose;

const cleaningTaskSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },

    // Cible
    zone: { type: String, required: true },
    zoneId: { type: String },

    description: { type: String },

    frequency: {
      type: String,
      enum: ["daily", "weekly", "monthly", "on_demand"],
      default: "daily",
      index: true,
    },

    // Planification
    dueAt: { type: Date, index: true }, // quand c’est prévu
    assignedTo: { type: Schema.Types.ObjectId, ref: "Employee" },

    // Exécution
    done: { type: Boolean, default: false, index: true },
    doneAt: Date,

    // Preuves
    proofUrls: { type: [String], default: [] }, // plusieurs preuves possibles (photos/URLs)

    // Produits/protocoles
    productUsed: String,
    productFDSUrl: String,
    protocolSteps: { type: [String], default: [] }, // étapes/checklist
    dwellTimeMin: Number, // temps de contact en minutes

    // Qualité/risque
    riskLevel: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "low",
    },

    // Vérification (optionnelle)
    verified: { type: Boolean, default: false },
    verifiedAt: Date,
    verifiedBy: {
      userId: { type: Schema.Types.ObjectId, index: true },
      role: { type: String, enum: ["owner", "employee"] },
      firstName: { type: String },
      lastName: { type: String },
    },

    // Traçabilité auteur création
    recordedBy: {
      userId: { type: Schema.Types.ObjectId, required: true, index: true },
      role: { type: String, enum: ["owner", "employee"], required: true },
      firstName: { type: String },
      lastName: { type: String },
    },

    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false, collection: "cleaning_task" }
);

// Index utiles
cleaningTaskSchema.index({ restaurantId: 1, createdAt: -1 });
cleaningTaskSchema.index({ restaurantId: 1, dueAt: -1 });
cleaningTaskSchema.index({ restaurantId: 1, done: 1, doneAt: -1 });

module.exports =
  mongoose.models.CleaningTask ||
  mongoose.model("CleaningTask", cleaningTaskSchema);
