const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  _id: String,
  public_id: { type: String, required: true },
  resource_type: { type: String, required: true },
  delivery_type: String,
  nextAttemptAt: { type: Date, required: true, index: true },
  attempts: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model("EmployeeAssetDeletion", schema);
