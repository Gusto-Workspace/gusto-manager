const mongoose = require("mongoose");
const { Schema } = mongoose;

const correctiveActionSchema = new Schema(
  {
    action: { type: String, required: true },
    done: { type: Boolean, default: false },
    doneAt: Date,
    doneBy: { type: Schema.Types.ObjectId, ref: "Employee" },
    note: String,
  },
  { _id: false }
);

const allergenIncidentSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    source: {
      type: String,
      enum: ["supplier", "customer", "internal", "lab", "other"],
      default: "internal",
    },
    itemName: String, // plat / ingrédient
    itemId: { type: Schema.Types.ObjectId, refPath: "itemRefModel" }, // optionnel (Recipe/Dish)
    itemRefModel: {
      type: String,
      enum: ["Recipe", "Dish", null],
      default: null,
    },
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier" },
    detectedAt: { type: Date, default: Date.now, index: true },
    detectedBy: { type: Schema.Types.ObjectId, ref: "Employee" },
    allergens: { type: [String], default: [] }, // ex: ["gluten","lait"]
    severity: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    description: String,
    immediateAction: String, // ex: "isolation lot", "recall"
    correctiveActions: { type: [correctiveActionSchema], default: [] },
    attachments: { type: [String], default: [] }, // urls
    closed: { type: Boolean, default: false },
    closedAt: Date,
    createdAt: { type: Date, default: Date.now },
    
    // Qui a enregistré (snapshot à la création)
    recordedBy: {
      userId: { type: Schema.Types.ObjectId, required: true, index: true },
      role: { type: String, enum: ["owner", "employee"], required: true },
      firstName: { type: String },
      lastName: { type: String },
    },
  },
  { versionKey: false, collection: "allergen_incidents" }
);

allergenIncidentSchema.index({ restaurantId: 1, detectedAt: -1 });
allergenIncidentSchema.index({ restaurantId: 1, closed: 1, severity: 1 });

module.exports =
  mongoose.models.AllergenIncident ||
  mongoose.model("AllergenIncident", allergenIncidentSchema);
