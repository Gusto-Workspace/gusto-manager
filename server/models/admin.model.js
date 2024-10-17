const mongoose = require("mongoose");

// BCRYPT
const bcrypt = require("bcryptjs");

const adminSchema = new mongoose.Schema({
  email: String,
  password: String, // Mot de passe haché
  role: { type: String, default: "admin" },
  created_at: { type: Date, default: Date.now },
});

// Index sur le champ email pour rendre les recherches par email rapides
adminSchema.index({ email: 1 });

adminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }

  try {
    if (this.password) {
      const salt = await bcrypt.genSalt(13);
      this.password = await bcrypt.hash(this.password, salt);
    }
    next();
  } catch (err) {
    next(err);
  }
});

adminSchema.methods.comparePassword = async function (enteredPassword) {
  try {
    return await bcrypt.compare(enteredPassword, this.password);
  } catch (err) {
    return { err };
  }
};

const AdminModel = mongoose.model("Admin", adminSchema);
module.exports = AdminModel;
