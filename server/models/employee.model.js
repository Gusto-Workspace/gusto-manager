const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// Sous-schéma pour les options d'accès (par restaurant)
const optionsSchema = new mongoose.Schema(
  {
    dashboard: { type: Boolean, default: false },
    restaurant: { type: Boolean, default: false },
    dishes: { type: Boolean, default: false },
    menus: { type: Boolean, default: false },
    drinks: { type: Boolean, default: false },
    wines: { type: Boolean, default: false },
    news: { type: Boolean, default: false },
    gift_card: { type: Boolean, default: false },
    reservations: { type: Boolean, default: false },
    take_away: { type: Boolean, default: false },
    employees: { type: Boolean, default: false },
    health_control_plan: { type: Boolean, default: false },
  },
  { _id: false }
);

const documentSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    public_id: { type: String, required: true },
    filename: { type: String, required: true },
    title: { type: String, required: true },
  },
  { _id: false }
);

const shiftSchema = new mongoose.Schema({
  title: { type: String, required: true },
  start: { type: Date, required: true },
  end: { type: Date, required: true },
  leaveRequestId: { type: mongoose.Schema.Types.ObjectId, default: null },
});

const leaveRequestSchema = new mongoose.Schema(
  {
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    type: {
      type: String,
      enum: ["full", "morning", "afternoon"],
      default: "full",
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending",
    },
  },
  {
    _id: true,
    timestamps: { createdAt: "createdAt", updatedAt: false },
  }
);

const employeeSnapshotSchema = new mongoose.Schema(
  {
    firstname: String,
    lastname: String,
    email: String,
    phone: String,
    secuNumber: String,
    address: String,
    emergencyContact: String,
    post: String,
    dateOnPost: Date,
  },
  { _id: false }
);

/**
 * Données spécifiques à un restaurant pour un employé :
 * - options (droits d'accès)
 * - documents
 * - shifts (planning)
 * - leaveRequests (congés)
 */
const restaurantProfileSchema = new mongoose.Schema(
  {
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    options: { type: optionsSchema, default: {} },
    documents: { type: [documentSchema], default: [] },
    shifts: { type: [shiftSchema], default: [] },
    leaveRequests: { type: [leaveRequestSchema], default: [] },
    snapshot: { type: employeeSnapshotSchema, default: {} },
  },
  { _id: true }
);

const employeeSchema = new mongoose.Schema({
  // Identité globale
  firstname: { type: String, required: true },
  lastname: { type: String, required: true },
  email: { type: String }, // normalisé côté routes
  password: { type: String },
  phone: { type: String, required: true },
  secuNumber: { type: String },
  address: { type: String },
  emergencyContact: { type: String },
  post: { type: String },
  dateOnPost: { type: Date },

  profilePicture: {
    url: String,
    public_id: String,
  },

  // Multi-restaurants : liste des restos où il travaille
  restaurants: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
    },
  ],

  // Données spécifiques par restaurant
  restaurantProfiles: {
    type: [restaurantProfileSchema],
    default: [],
  },

  created_at: { type: Date, default: Date.now },
  trainingSessions: [
    { type: mongoose.Schema.Types.ObjectId, ref: "TrainingSession" },
  ],

  resetCode: String,
  resetCodeExpires: Date,
});

// Index pour des recherches optimisées
employeeSchema.index({ email: 1 });
employeeSchema.index({ restaurants: 1 });
employeeSchema.index({ "restaurantProfiles.restaurant": 1 });
employeeSchema.index({ firstname: 1, lastname: 1 });
employeeSchema.index({ "restaurantProfiles.shifts.leaveRequestId": 1 });
employeeSchema.index({ trainingSessions: 1 });

// Hachage du mot de passe avant sauvegarde
employeeSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

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

// Méthode de comparaison de mot de passe
employeeSchema.methods.comparePassword = async function (
  enteredPassword,
  userPassword
) {
  try {
    return await bcrypt.compare(enteredPassword, userPassword);
  } catch (err) {
    return { err };
  }
};

const EmployeeModel = mongoose.model("Employee", employeeSchema);
module.exports = EmployeeModel;
