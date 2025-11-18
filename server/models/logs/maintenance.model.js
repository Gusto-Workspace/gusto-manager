const mongoose = require("mongoose");
const { Schema } = mongoose;

const userRefSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, index: true },
    role: { type: String, enum: ["owner", "employee"] },
    firstName: String,
    lastName: String,
    avatarUrl: String,
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

const maintenanceSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },

    // === Plan / équipement ===
    equipment: { type: String, required: true }, // ex "Friteuse 1"
    equipmentId: { type: String }, // id interne si besoin

    type: {
      type: String,
      enum: ["filter_change", "inspection", "repair", "other"],
      default: "inspection",
    },

    // Fréquence d’exécution (même logique que cleaning-tasks)
    frequency: {
      type: String,
      enum: ["daily", "weekly", "monthly", "on_demand"],
      default: "monthly",
      index: true,
    },

    // Prochaine échéance théorique
    nextDue: { type: Date, index: true },

    provider: String,
    notes: String,

    // Preuves “statiques” liées au plan
    proofUrls: { type: [String], default: [] },

    // === Historique des exécutions ===
    history: { type: [historySchema], default: [] },

    // Dénormalisation pour la liste
    lastDoneAt: { type: Date, index: true },
    lastDoneBy: userRefSchema,
    lastProofCount: { type: Number, default: 0 },

    // Trace de création du plan
    recordedBy: {
      userId: { type: Schema.Types.ObjectId, required: true, index: true },
      role: { type: String, enum: ["owner", "employee"], required: true },
      firstName: { type: String },
      lastName: { type: String },
    },

    createdAt: { type: Date, default: Date.now, index: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false, collection: "maintenance" }
);

// Index utiles
maintenanceSchema.index({ restaurantId: 1, equipment: 1, createdAt: -1 });
maintenanceSchema.index({ restaurantId: 1, lastDoneAt: -1 });
maintenanceSchema.index({ restaurantId: 1, nextDue: 1 });

maintenanceSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports =
  mongoose.models.Maintenance ||
  mongoose.model("Maintenance", maintenanceSchema);
