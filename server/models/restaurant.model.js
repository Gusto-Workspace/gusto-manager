const mongoose = require("mongoose");

const restaurantSchema = new mongoose.Schema({
  name: String,
  address: String,
  phone: String,
  website: String,
  owner_id: { type: mongoose.Schema.Types.ObjectId, ref: "Owner" }, // Référence au propriétaire
  opening_hours: [
    {
      day: String, // Ex: "lundi", "mardi"
      open: String, // Ex: "09:00"
      close: String, // Ex: "22:00"
    },
  ],
  menus: [{ type: mongoose.Schema.Types.ObjectId, ref: "Menu" }], // Référence aux menus
  news: [
    {
      title: String,
      content: String,
      published_at: { type: Date, default: Date.now },
    },
  ], // Embedding des actualités
  created_at: { type: Date, default: Date.now },
});

// Index sur le champ owner_id pour récupérer rapidement les restaurants d'un propriétaire
restaurantSchema.index({ owner_id: 1 });

// Index sur les horaires d'ouverture pour des recherches plus rapides par plages horaires
restaurantSchema.index({ "opening_hours.open": 1, "opening_hours.close": 1 });

const RestaurantModel = mongoose.model("Restaurant", restaurantSchema);
module.exports = RestaurantModel;
