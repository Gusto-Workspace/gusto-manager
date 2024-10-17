const mongoose = require("mongoose");

// BCRYPT
const bcrypt = require("bcryptjs");

const ownerSchema = new mongoose.Schema({
  firstname: String,
  lastname: String,
  email: String,
  password: String,
  phoneNumber: String,
  stripeCustomerId: { type: String },
  restaurants: [{ type: mongoose.Schema.Types.ObjectId, ref: "Restaurant" }],
  created_at: { type: Date, default: Date.now },
});

// Index sur les champs pour rendre les recherches rapides
ownerSchema.index({ email: 1 });

ownerSchema.index({ restaurants: 1 });

ownerSchema.index({ firstname: 1, lastname: 1 });

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
