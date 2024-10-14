const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String, // Mot de passe haché
  role: { type: String, default: "admin" }, // Rôle spécifique pour l'administrateur
  created_at: { type: Date, default: Date.now },
});

// Index sur le champ email pour les recherches rapides lors de l'authentification
adminSchema.index({ email: 1 });

const AdminModel = mongoose.model("Admin", adminSchema);
module.exports = AdminModel;
