const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const SibApiV3Sdk = require("sib-api-v3-sdk");

// MODELS
const AdminModel = require("../models/admin.model");
const OwnerModel = require("../models/owner.model");
const EmployeeModel = require("../models/employee.model");

// JWT
const JWT_SECRET = process.env.JWT_SECRET;

// CONNEXION ADMIN
router.post("/admin/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const admin = await AdminModel.findOne({ email });
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign({ id: admin._id, role: "admin" }, JWT_SECRET);

    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// CONNEXION USER
router.post("/user/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const owner = await OwnerModel.findOne({ email }).populate(
      "restaurants",
      "name _id"
    );
    if (owner) {
      const isMatch = await bcrypt.compare(password, owner.password);
      if (!isMatch) {
        return res.status(401).json({ message: "errors.incorrect" });
      }
      const token = jwt.sign(
        {
          id: owner._id,
          firstname: owner.firstname,
          role: "owner",
          stripeCustomerId: owner.stripeCustomerId,
        },
        JWT_SECRET
      );
      return res.json({ token, owner });
    }

    const employee = await EmployeeModel.findOne({ email }).populate(
      "restaurant",
      "name _id"
    );

    if (!employee) {
      return res.status(401).json({ message: "errors.incorrect" });
    }

    const isMatch = await bcrypt.compare(password, employee.password);
    if (!isMatch) {
      return res.status(401).json({ message: "errors.incorrect" });
    }
    const token = jwt.sign(
      {
        id: employee._id,
        firstname: employee.firstname,
        role: "employee",
        options: employee.options,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    return res.json({ token, employee });
  } catch (err) {
    res.status(500).json({ message: "errors.server" });
  }
});

// OWNER RESTAURANT SELECTION
router.post("/user/select-restaurant", async (req, res) => {
  const { token, restaurantId } = req.body;

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const newPayload = { ...decoded, restaurantId };
    const newToken = jwt.sign(newPayload, JWT_SECRET);
    return res.json({ token: newToken });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

function instantiateClient() {
  const defaultClient = SibApiV3Sdk.ApiClient.instance;
  const apiKey = defaultClient.authentications["api-key"];
  apiKey.apiKey = process.env.BREVO_API_KEY;
  return defaultClient;
}
function sendTransactionalEmail({ to, subject, htmlContent }) {
  instantiateClient();
  const api = new SibApiV3Sdk.TransactionalEmailsApi();
  const mail = new SibApiV3Sdk.SendSmtpEmail();
  mail.sender = { email: "no-reply@gusto-manager.com", name: "Gusto Manager" };
  mail.to = to;
  mail.subject = subject;
  mail.htmlContent = htmlContent;
  return api.sendTransacEmail(mail);
}

// util
async function findUserByEmail(email) {
  const normalized = (email || "").trim().toLowerCase();
  const [owner, employee] = await Promise.all([
    OwnerModel.findOne({ email: normalized }),
    EmployeeModel.findOne({ email: normalized }),
  ]);
  return owner || employee || null;
}

// ===================== FORGOT PASSWORD (owner + employee) =====================

// 1) envoyer le code
router.post("/auth/send-reset-code", async (req, res) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const user = await findUserByEmail(email);
    if (!user) return res.status(404).json({ message: "Email non trouvé" });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetCode = code;
    user.resetCodeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    await user.save();

    await sendTransactionalEmail({
      to: [{ email: user.email, name: user.firstname || "Utilisateur" }],
      subject: "Votre code de réinitialisation de mot de passe",
      htmlContent: `<p>Votre code de réinitialisation est : <strong>${code}</strong></p>`,
    });

    return res.json({ message: "Code envoyé par email" });
  } catch (e) {
    console.error("send-reset-code:", e);
    return res.status(500).json({ message: "Erreur serveur" });
  }
});

// 2) vérifier le code
router.post("/auth/verify-reset-code", async (req, res) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const { code } = req.body;
    const user = await findUserByEmail(email);
    if (!user) return res.status(404).json({ message: "Email non trouvé" });

    if (user.resetCode !== code || new Date() > user.resetCodeExpires) {
      return res.status(400).json({ message: "Code invalide ou expiré" });
    }
    return res.json({ message: "Code valide" });
  } catch (e) {
    console.error("verify-reset-code:", e);
    return res.status(500).json({ message: "Erreur serveur" });
  }
});

// 3) réinitialiser le mot de passe
router.put("/auth/reset-password", async (req, res) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const { code, newPassword } = req.body;
    const user = await findUserByEmail(email);
    if (!user) return res.status(404).json({ message: "Email non trouvé" });

    if (user.resetCode !== code || new Date() > user.resetCodeExpires) {
      return res.status(400).json({ message: "Code invalide ou expiré" });
    }

    user.password = newPassword;           // hash via pre('save')
    user.resetCode = undefined;
    user.resetCodeExpires = undefined;
    await user.save();

    return res.json({ message: "Mot de passe mis à jour avec succès" });
  } catch (e) {
    console.error("reset-password:", e);
    return res.status(500).json({ message: "Erreur serveur" });
  }
});

module.exports = router;
