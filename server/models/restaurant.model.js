const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema({
  line1: { type: String, required: true },
  zipCode: { type: String, required: true },
  city: { type: String, required: true },
  country: { type: String, required: true, default: "France" },
});

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

// Sous-schéma pour les options
const optionsSchema = new mongoose.Schema(
  {
    gift_card: { type: Boolean, default: false },
    reservations: { type: Boolean, default: false },
    take_away: { type: Boolean, default: false },
  },
  { _id: false }
);

// Sous-schéma pour les plats
const dishSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  price: { type: Number },
  showOnWebsite: { type: Boolean, default: true },
  vegan: { type: Boolean, default: false },
  vegetarian: { type: Boolean, default: false },
  bio: { type: Boolean, default: false },
  glutenFree: { type: Boolean, default: false },
});

// Sous-schéma pour les catégories de plats
const dishCategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  visible: { type: Boolean, default: true },
  dishes: { type: [dishSchema], default: [] },
});

// Sous-schéma pour les volumes
const volumeSchema = new mongoose.Schema({
  volume: { type: String, required: true },
  price: { type: Number, required: true },
});

// Sous-schéma pour les vins
const wineSchema = new mongoose.Schema({
  name: { type: String, required: true },
  appellation: { type: String },
  volumes: { type: [volumeSchema], required: true },
  showOnWebsite: { type: Boolean, default: true },
  year: { type: String },
  bio: { type: Boolean, default: false },
});

// Sous-schéma pour les sous-catégories de vins
const wineSubCategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  visible: { type: Boolean, default: true },
  wines: { type: [wineSchema], default: [] },
});

// Schéma pour les catégories de vins
const wineCategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  visible: { type: Boolean, default: true },
  subCategories: { type: [wineSubCategorySchema], default: [] },
  wines: { type: [wineSchema], default: [] },
});

// Sous-schéma pour les boissons
const drinkSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  price: { type: Number, required: true },
  showOnWebsite: { type: Boolean, default: true },
  bio: { type: Boolean, default: false },
});

// Sous-schéma pour les sous-catégories de boissons
const drinkSubCategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  visible: { type: Boolean, default: true },
  drinks: { type: [drinkSchema], default: [] },
});

// Schéma pour les catégories de boissons
const drinkCategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  visible: { type: Boolean, default: true },
  subCategories: { type: [drinkSubCategorySchema], default: [] },
  drinks: { type: [drinkSchema], default: [] },
});

// Schéma pour les notifications
const notificationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  read: { type: Boolean, default: true },
});

// Schéma pour les cartes cadeaux
const giftCardSchema = new mongoose.Schema({
  value: { type: Number, required: true },
  description: { type: String },
  visible: { type: Boolean, default: true },
});

// Schéma pour les achats de cartes cadeaux
const giftCardPurchaseSchema = new mongoose.Schema({
  value: { type: Number, required: true },
  description: { type: String },
  purchaseCode: { type: String, required: true },
  validUntil: { type: Date, required: true },
  status: {
    type: String,
    enum: ["Valid", "Used", "Expired"],
    default: "Valid",
  },
  beneficiaryFirstName: { type: String, required: true },
  beneficiaryLastName: { type: String, required: true },
  sender: { type: String },
  sendEmail: { type: String },
  created_at: { type: Date, default: Date.now },
});

// Sous-schéma pour les actualités
const newsSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  image: { type: String },
  imagePublicId: { type: String },
  visible: { type: Boolean, default: true },
  published_at: { type: Date, default: Date.now },
});

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
  address: { type: addressSchema, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: true },
  website: { type: String },
  stripeSecretKey: { type: String },
  social_media: { type: socialMediaSchema, default: {} },
  owner_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Owner",
    required: true,
  },
  opening_hours: { type: [openingHourSchema], default: [] },
  dish_categories: { type: [dishCategorySchema], default: [] },
  drink_categories: { type: [drinkCategorySchema], default: [] },
  wine_categories: { type: [wineCategorySchema], default: [] },
  news: { type: [newsSchema], default: [] },
  notifications: { type: [notificationSchema], default: [] },
  menus: [{ type: mongoose.Schema.Types.ObjectId, ref: "Menu" }],
  giftCards: { type: [giftCardSchema], default: [] },
  purchasesGiftCards: { type: [giftCardPurchaseSchema], default: [] },
  options: { type: optionsSchema, default: {} },
  created_at: { type: Date, default: Date.now },
});

// Index sur le champ owner_id pour récupérer rapidement les restaurants d'un propriétaire
restaurantSchema.index({ owner_id: 1 });

const RestaurantModel = mongoose.model("Restaurant", restaurantSchema);
module.exports = RestaurantModel;
