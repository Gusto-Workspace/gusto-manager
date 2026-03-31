const mongoose = require("mongoose");

const menuSchema = new mongoose.Schema({
  name: String,
  description: String,
  price: { type: Number },
  restaurant_id: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant" },
  type: {
    type: String,
    enum: ["fixed", "custom"],
    required: true,
  },
  // Combinations of categories with prices for fixed menus
  combinations: [
    {
      categories: [{ type: String, required: true }], // e.g., ["Entrée", "Plat", "Dessert"]
      description: { type: String },
      price: { type: Number, required: true },
    },
  ],
  // List of selected dishes for custom menus
  dishes: [{ type: mongoose.Schema.Types.ObjectId, ref: "Dish" }],
  customGroups: [
    {
      categoryId: { type: String },
      categoryName: { type: String },
      relation: {
        type: String,
        enum: ["or", "and"],
        default: "or",
      },
      relations: [
        {
          type: String,
          enum: ["or", "and"],
          default: "or",
        },
      ],
      dishes: [{ type: mongoose.Schema.Types.ObjectId, ref: "Dish" }],
    },
  ],
  visible: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now },
});

// Index sur le champ restaurant_id pour retrouver rapidement les menus d'un restaurant
menuSchema.index({ restaurant_id: 1 });

const MenuModel = mongoose.model("Menu", menuSchema);
module.exports = MenuModel;
