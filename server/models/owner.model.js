const mongoose = require("mongoose");

const ownerSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String, // Mot de passe haché
  restaurant_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: "Restaurant" }], // Référence aux restaurants qu'il possède
  created_at: { type: Date, default: Date.now },
});

// Index sur le champ email pour rendre les recherches par email rapides
ownerSchema.index({ email: 1 });

// FUNCTIONS
ownerSchema.pre("save", async function (next) {
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

ownerSchema.methods.comparePassword = async function (
  enteredPassword,
  userPassword
) {
  try {
    return await bcrypt.compare(enteredPassword, userPassword);
  } catch (err) {
    return { err };
  }
};

const OwnerModel = mongoose.model("Owner", ownerSchema);
module.exports = OwnerModel;
