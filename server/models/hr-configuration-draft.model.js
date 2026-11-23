const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  revision: { type: Number, required: true },
  step: { type: Number, required: true },
  families: { type: mongoose.Schema.Types.Mixed, required: true },
  intents: { type: mongoose.Schema.Types.Mixed, default: {} },
  effects: { type: mongoose.Schema.Types.Mixed, default: {} },
  applications: { type: Number, default: 0, select: false },
}, { minimize: false, timestamps: true });

module.exports = mongoose.model("HrConfigurationDraft", schema);
