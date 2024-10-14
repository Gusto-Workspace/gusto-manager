const mongoose = require("mongoose");

const dishSchema = new mongoose.Schema({
  name: String,
  description: String,
  type: { type: String, enum: ["entree", "plat", "dessert"] }, // Entrée, plat ou dessert
  price: Number,
  image_url: String, // URL vers l'image du plat
  availability: { type: Boolean, default: true }, // Indique si le plat est disponible
  created_at: { type: Date, default: Date.now },
});

// Index sur le champ type pour les recherches par type de plat (entrée, plat, dessert)
dishSchema.index({ type: 1 });

// Index sur availability pour les recherches de plats disponibles
dishSchema.index({ availability: 1 });

const DishModel = mongoose.model("Dish", dishSchema);
module.exports = DishModel;
