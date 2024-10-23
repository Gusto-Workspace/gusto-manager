const mongoose = require("mongoose");

// Sous-schéma pour les horaires d'ouverture
const openingHourSchema = new mongoose.Schema(
  {
    day: { type: String, required: true },
    isClosed: { type: Boolean, default: false },
    hours: [
      {
        open: { type: String },
        close: { type: String },
      },
    ],
  },
  { _id: false }
);

// Sous-schéma pour les plats
const dishSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    price: { type: Number, required: true },
    showOnWebsite: { type: Boolean, default: true },
    vegan: { type: Boolean, default: false },
    vegetarian: { type: Boolean, default: false },
    bio: { type: Boolean, default: false },
    glutenFree: { type: Boolean, default: false },
  },
 
);

// Sous-schéma pour les catégories de plats
const dishCategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  visible: { type: Boolean, default: true },
  dishes: { type: [dishSchema], default: [] },
});

// Sous-schéma pour les boissons
const drinkSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    type: {
      type: String,
      enum: ["wine", "cocktail", "beer", "soft drink", "hot drink"],
      required: true,
    },
    price: { type: Number, required: true },
  },
  { _id: false }
);

// Sous-schéma pour les actualités
const newsSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    image: { type: String },
    published_at: { type: Date, default: Date.now },
  },
  { _id: false }
);

// Sous-schéma pour les réseaux sociaux
const socialMediaSchema = new mongoose.Schema(
  {
    facebook: { type: String, default: null },
    instagram: { type: String, default: null },
    twitter: { type: String, default: null },
    linkedIn: { type: String, default: null },
    youtube: { type: String, default: null },
  },
  { _id: false }
);

// Schéma principal pour le restaurant
const restaurantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: true },
  website: { type: String },
  social_media: { type: socialMediaSchema, default: {} },
  owner_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Owner",
    required: true,
  },
  opening_hours: { type: [openingHourSchema], default: [] },
  dish_categories: { type: [dishCategorySchema], default: [] },
  drinks: { type: [drinkSchema], default: [] },
  news: { type: [newsSchema], default: [] },
  menus: [{ type: mongoose.Schema.Types.ObjectId, ref: "Menu" }],
  created_at: { type: Date, default: Date.now },
});

// Index sur le champ owner_id pour récupérer rapidement les restaurants d'un propriétaire
restaurantSchema.index({ owner_id: 1 });

const RestaurantModel = mongoose.model("Restaurant", restaurantSchema);
module.exports = RestaurantModel;
