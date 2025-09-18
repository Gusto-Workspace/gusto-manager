const mongoose = require("mongoose");
const { Schema } = mongoose;

const ingredientRefSchema = new Schema(
  {
    name: String,
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier" },
    lotNumber: String,
    stockLotId: { type: Schema.Types.ObjectId, ref: "InventoryLot" },
    qty: Number,
    unit: String,
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
    recipeId: { type: Schema.Types.ObjectId, ref: "Recipe" },
    batchId: String,
    preparedAt: { type: Date, default: Date.now, index: true },
    usedByServiceDate: Date,
    ingredients: { type: [ingredientRefSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: "Employee" },
    notes: String,
  },
  { versionKey: false }
);

recipeBatchSchema.index({ restaurantId: 1, preparedAt: -1 });

module.exports =
  mongoose.models.RecipeBatch ||
  mongoose.model("RecipeBatch", recipeBatchSchema);
