const mongoose = require("mongoose");
const { Schema } = mongoose;

const itemSchema = new Schema(
  {
    inventoryLotId: { type: Schema.Types.ObjectId, ref: "InventoryLot" },

    productName: { type: String, required: true },
    supplierName: String,
    lotNumber: String,

    quantity: Number,
    unit: String,
    bestBefore: Date,
    note: String,
  },
  { _id: false }
);

const attachmentSchema = new Schema(
  {
    url: { type: String, required: true },
    public_id: { type: String, required: true },
    filename: { type: String, required: true },
    mimetype: { type: String },
  },
  { _id: false }
);

const recallSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },

    initiatedAt: { type: Date, default: Date.now, index: true },

    item: { type: itemSchema, required: true },

    actionsTaken: String,
    attachments: { type: [attachmentSchema], default: [] },

    closedAt: { type: Date, index: true },

    recordedBy: {
      userId: { type: Schema.Types.ObjectId, required: true, index: true },
      role: { type: String, enum: ["owner", "employee"], required: true },
      firstName: { type: String },
      lastName: { type: String },
    },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false, collection: "recall" }
);

recallSchema.index({ restaurantId: 1, initiatedAt: -1 });
recallSchema.index({
  restaurantId: 1,
  "item.productName": 1,
  initiatedAt: -1,
});

recallSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports =
  mongoose.models.Recall || mongoose.model("Recall", recallSchema);
