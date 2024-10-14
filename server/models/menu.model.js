const mongoose = require("mongoose");

const menuSchema = new mongoose.Schema({
  name: String,
  description: String,
  restaurant_id: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant" }, // Référence au restaurant
  dishes: [{ type: mongoose.Schema.Types.ObjectId, ref: "Dish" }], // Références des plats
  drinks: [{ type: mongoose.Schema.Types.ObjectId, ref: "Drink" }], // Références des boissons
  created_at: { type: Date, default: Date.now },
});

// Index sur le champ restaurant_id pour retrouver rapidement les menus d'un restaurant
menuSchema.index({ restaurant_id: 1 });

const MenuModel = mongoose.model("Menu", menuSchema);
module.exports = MenuModel;
