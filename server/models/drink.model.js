const mongoose = require("mongoose");

const drinkSchema = new mongoose.Schema({
  name: String,
  description: String,
  type: { type: String, enum: ["vin", "cocktail", "bière", "soft", "autres"] }, // Type de boisson
  price: Number,
  image_url: String, // URL de l'image de la boisson
  availability: { type: Boolean, default: true }, // Indique si la boisson est disponible
  alcohol_content: Number, // Pourcentage d'alcool, si applicable
  created_at: { type: Date, default: Date.now },
});

// Index sur le champ type pour les recherches par type de boisson (vin, cocktail, etc.)
drinkSchema.index({ type: 1 });

// Index sur availability pour les recherches de boissons disponibles
drinkSchema.index({ availability: 1 });

const DrinkModel = mongoose.model("Drink", drinkSchema);
module.exports = DrinkModel;
