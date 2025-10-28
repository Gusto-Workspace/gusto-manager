const mongoose = require("mongoose");
const { Schema } = mongoose;

const maintenanceSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    equipment: { type: String, required: true }, // ex "Friteuse 1"
    equipmentId: { type: String }, // id interne si besoin
    type: {
      type: String,
      enum: ["filter_change", "inspection", "repair", "other"],
      default: "inspection",
    },
    performedAt: { type: Date, required: true, default: Date.now, index: true },
    nextDue: { type: Date, index: true },

    provider: String,
    notes: String,
    proofUrls: { type: [String], default: [] },

    recordedBy: {
      userId: { type: Schema.Types.ObjectId, required: true, index: true },
      role: { type: String, enum: ["owner", "employee"], required: true },
      firstName: { type: String },
      lastName: { type: String },
    },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false, collection: "maintenance" }
);

maintenanceSchema.index({ restaurantId: 1, equipment: 1, performedAt: -1 });

maintenanceSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports =
  mongoose.models.Maintenance ||
  mongoose.model("Maintenance", maintenanceSchema);
