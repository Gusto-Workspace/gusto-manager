const mongoose = require("mongoose");
const { Schema } = mongoose;

const recallSchema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    source: { type: String }, // "supplier", "authority"
    initiatedAt: { type: Date, default: Date.now },
    items: [{ productName: String, lotNumber: String }],
    actionsTaken: String,
    closedAt: Date,
    attachments: { type: [String], default: [] },
  },
  { versionKey: false }
);

recallSchema.index({ restaurantId: 1, initiatedAt: -1 });

module.exports =
  mongoose.models.Recall || mongoose.model("Recall", recallSchema);
