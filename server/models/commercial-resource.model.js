const { Schema, model } = require("mongoose");

const schema = new Schema({
  title: { type: String, required: true, maxlength: 150 },
  category: { type: String, required: true, maxlength: 60 },
  description: { type: String, maxlength: 700, default: "" },
  kind: { type: String, enum: ["FILE", "LINK"], required: true },
  link: String,
  file: { type: Schema.Types.Mixed, select: false },
  fileVersion: { type: Number, default: 0 },
  order: { type: Number, min: 0, max: 10000, default: 0, validate: Number.isSafeInteger },
  status: { type: String, enum: ["DRAFT", "PUBLISHED", "WITHDRAWN", "ARCHIVED"], default: "DRAFT" },
  endsAt: Date,
  publishedAt: Date,
  updatedBy: String,
  revision: { type: Number, default: 0 },
}, { timestamps: true });

schema.index({ status: 1, category: 1, order: 1, _id: 1 });

module.exports = model("CommercialResource", schema);
