const mongoose = require("mongoose");
const { Schema } = mongoose;

const ingredientRefSchema = new Schema(
  {
    name: String,
    lotNumber: String,
    qty: Number,
    unit: String,
    inventoryLotId: { type: Schema.Types.ObjectId, ref: "InventoryLot" },
  },
  { _id: false }
);

const recipeBatchSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    recipeId: String,
    batchId: String,
    preparedAt: { type: Date, default: Date.now, index: true },
    usedByServiceDate: Date,
    ingredients: { type: [ingredientRefSchema], default: [] },
    createdBy: {
      userId: { type: Schema.Types.ObjectId, required: true, index: true },
      role: { type: String, enum: ["owner", "employee"], required: true },
      firstName: { type: String },
      lastName: { type: String },
    },
    notes: String,
  },
  { versionKey: false, collection: "recipe_batch" }
);

recipeBatchSchema.index({ restaurantId: 1, preparedAt: -1 });

module.exports =
  mongoose.models.RecipeBatch ||
  mongoose.model("RecipeBatch", recipeBatchSchema);
