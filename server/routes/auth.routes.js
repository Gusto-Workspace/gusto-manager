const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { randomInt, createHmac } = require("node:crypto");
const { isObjectIdOrHexString } = require("mongoose");
const { sendAccountEmail, isValidNewPassword } = require("../services/shared/account-email.service");
const authenticateAdmin = require("../middleware/authenticate-admin");
const { isActiveAdmin, signAdminToken } = authenticateAdmin;

// MODELS
const AdminModel = require("../models/admin.model");
const OwnerModel = require("../models/owner.model");
const EmployeeModel = require("../models/employee.model");
const RestaurantModel = require("../models/restaurant.model");
const limitLogin = require("../middleware/limit-login");
const {
  accountAuditContext,
  createSuperAdminSessionClaims,
  getSessionVersion,
  buildSessionVersionFilter,
  isAccountSessionValid,
  matchesSuperAdminPassword,
  normalizeSessionVersion,
  revokeAllAccountSessions,
  signAccountToken,
  stripJwtMetadata,
} = require("../services/shared/account-session.service");

// JWT
const JWT_SECRET = process.env.JWT_SECRET;

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

// ----------------- CONNEXION ADMIN -----------------

router.post("/admin/login", limitLogin, async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  const invalidCredentialsMessage = "Identifiants non reconnus";

  try {
    const admin = await AdminModel.findOne({ email }).select("+password +sessionVersion").lean();
    if (!isActiveAdmin(admin) || typeof password !== "string" || !admin.password) {
      return res.status(401).json({ message: invalidCredentialsMessage });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ message: invalidCredentialsMessage });
    }

    const token = signAdminToken(admin);

    res.json({ token, role: admin.role });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/admin/session/revoke", authenticateAdmin, async (req, res) => {
  try {
    await revokeAllAccountSessions(AdminModel, req.user.id);
    console.info("[admin-sessions] security event", { actor: req.user.id, action: "REVOKED" });
    return res.sendStatus(204);
  } catch {
    return res.status(500).json({ message: "Impossible de révoquer les sessions." });
  }
});

// ----------------- CONNEXION OWNER + EMPLOYEE -----------------

router.post("/user/login", limitLogin, async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();
  const password = req.body?.password;

  try {
    // OWNER
    const owner = await OwnerModel.findOne({ email })
      .select("+sessionVersion")
      .populate("restaurants", "name _id options");
    if (owner) {
      const [isMatch, isSuperAdminLogin] = await Promise.all([
        bcrypt.compare(password, owner.password),
        matchesSuperAdminPassword(password),
      ]);
      if (!isMatch && !isSuperAdminLogin) {
        return res.status(401).json({ message: "errors.incorrect" });
      }
      const supportClaims = isSuperAdminLogin ? createSuperAdminSessionClaims() : {};
      const token = signAccountToken({
        id: owner._id,
        firstname: owner.firstname,
        lastname: owner.lastname,
        email: owner.email,
        role: "owner",
        stripeCustomerId: owner.stripeCustomerId,
        profilePictureUrl: owner.profilePicture?.url || null,
        sessionVersion: getSessionVersion(owner),
        ...supportClaims,
      });
      const plainOwner = owner.toObject();
      delete plainOwner.password;
      delete plainOwner.sessionVersion;
      if (isSuperAdminLogin) {
        console.info("[support-audit]", {
          ...accountAuditContext(supportClaims),
          actor: String(owner._id), method: "POST", route: "/user/login", status: 200,
        });
      }
      return res.json({ token, owner: plainOwner });
    }

    // EMPLOYEE
    const employee = await EmployeeModel.findOne({ email, historicalImport: { $exists: false } }).select(
      "+password +sessionVersion",
    );
    if (!employee?.password) {
      return res.status(401).json({ message: "errors.incorrect" });
    }

    const isMatch = await bcrypt.compare(password, employee.password);
    if (!isMatch) {
      return res.status(401).json({ message: "errors.incorrect" });
    }

    // Tous les restaurants où il est employé
    const restaurants = await RestaurantModel.find(
      { _id: { $in: employee.restaurants }, employees: employee._id },
      "name _id options",
    ).lean();
    if (!restaurants.length) return res.status(401).json({ message: "errors.incorrect" });

    const accountRole =
      employee.accountType === "accountant" ? "accountant" : "employee";
    const token = signAccountToken(
      {
        id: employee._id,
        firstname: employee.firstname,
        lastname: employee.lastname,
        email: employee.email,
        role: accountRole,
        profilePictureUrl: employee.profilePicture?.url || null,
        sessionVersion: getSessionVersion(employee),
        // options seront ajoutées après sélection de restaurant
      },
      { expiresIn: "7d" },
    );

    const accountPayload = {
      _id: employee._id,
      accountType: accountRole,
      firstname: employee.firstname,
      lastname: employee.lastname,
      email: employee.email,
      phone: employee.phone,
      restaurants,
    };

    return res.json({
      token,
      [accountRole === "accountant" ? "accountant" : "employee"]:
        accountPayload,
    });
  } catch (err) {
    console.error("user/login error:", err);
    res.status(500).json({ message: "errors.server" });
  }
});

// ----------------- SÉLECTION RESTAURANT (OWNER + EMPLOYEE) -----------------

function findRestaurantProfile(employee, restaurantId) {
  if (!employee || !Array.isArray(employee.restaurantProfiles)) return null;
  const target = String(restaurantId);
  return employee.restaurantProfiles.find(
    (p) => String(p.restaurant) === target,
  );
}

router.post("/user/select-restaurant", async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  const { token, restaurantId } = req.body;

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    if (!isObjectIdOrHexString(restaurantId) || !(await isAccountSessionValid(decoded))) {
      return res.status(403).json({ message: "Session revoked" });
    }

    // OWNER : on ajoute juste restaurantId
    if (decoded.role === "owner") {
      if (!(await RestaurantModel.exists({ _id: restaurantId, owner_id: decoded.id }))) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const newPayload = { ...stripJwtMetadata(decoded), restaurantId };
      const newToken = signAccountToken(newPayload);
      return res.json({ token: newToken });
    }

    // EMPLOYEE : on va chercher les options du profil pour ce restaurant
    if (decoded.role === "employee" || decoded.role === "accountant") {
      const employee = await EmployeeModel.findById(decoded.id);
      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }

      const worksHere = (employee.restaurants || []).some(
        (id) => String(id) === String(restaurantId),
      );
      if (!worksHere || !(await RestaurantModel.exists({ _id: restaurantId, employees: employee._id }))) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const profile = findRestaurantProfile(employee, restaurantId) || {
        options: {},
      };

      const newPayload = {
        id: employee._id,
        firstname: employee.firstname,
        lastname: employee.lastname,
        email: employee.email,
        role: employee.accountType === "accountant" ? "accountant" : "employee",
        restaurantId,
        options:
          employee.accountType === "accountant" ? {} : profile.options || {},
        profilePictureUrl: employee.profilePicture?.url || null,
        sessionVersion: normalizeSessionVersion(decoded.sessionVersion),
      };

      const newToken = signAccountToken(newPayload, {
        expiresIn: "7d",
      });
      return res.json({ token: newToken });
    }

    return res.status(403).json({ message: "Forbidden" });
  } catch (err) {
    console.error(err);
    const status =
      err?.name === "JsonWebTokenError" || err?.name === "TokenExpiredError"
        ? 403
        : 500;
    return res.status(status).json({
      message: status === 403 ? "Invalid or expired token" : "Server error",
    });
  }
});

const resetFields = "+sessionVersion +passwordResetHash +resetCodeExpires";

async function findUserByEmail(email) {
  const owner = await OwnerModel.findOne({ email }).select(resetFields);
  if (owner) return owner;
  return EmployeeModel.findOne({
    email,
    historicalImport: { $exists: false },
    "restaurants.0": { $exists: true },
    password: { $type: "string", $ne: "" },
  }).select(resetFields);
}

function hashResetCode(account, code) {
  return createHmac("sha256", JWT_SECRET)
    .update(`password-reset:${account.constructor.modelName}:${account._id}:${code}`)
    .digest("hex");
}

function addPasswordResetRoutes(prefix, lookup) {
  router.post(`${prefix}/send-reset-code`, limitLogin, async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const email = normalizeEmail(req.body?.email);
    try {
      const account = email && await lookup(email);
      if (account) {
        const code = randomInt(100000, 1000000).toString();
        const filter = buildSessionVersionFilter(account._id, getSessionVersion(account));
        const result = await account.constructor.updateOne(filter, {
          $set: {
            passwordResetHash: hashResetCode(account, code),
            resetCodeExpires: new Date(Date.now() + 10 * 60 * 1000),
          },
          $unset: { resetCode: 1 },
        });
        if (result.matchedCount) {
          await sendAccountEmail({
            email: account.email,
            subject: "Réinitialisation du mot de passe Gusto Manager",
            htmlContent: `<p>Votre code de réinitialisation est <strong>${code}</strong>.</p>`,
          });
        }
      }
    } catch (error) {
      console.error("[password-reset] send failed", error?.code || "unavailable");
    }
    return res.json({ message: "Si le compte est éligible, un code sera envoyé." });
  });

  async function checkReset(req, res) {
    const { email, code } = req.body || {};
    const account = typeof code === "string" && /^\d{6}$/.test(code) &&
      await lookup(normalizeEmail(email));
    if (!account || !account.resetCodeExpires ||
        account.resetCodeExpires <= new Date() ||
        account.passwordResetHash !== hashResetCode(account, code)) {
      res.status(400).json({ message: "Code invalide ou expiré" });
      return null;
    }
    return account;
  }

  router.post(`${prefix}/verify-reset-code`, limitLogin, async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    try {
      if (await checkReset(req, res)) return res.json({ message: "Code valide" });
    } catch {
      return res.status(500).json({ message: "Erreur serveur" });
    }
  });

  router.put(`${prefix}/reset-password`, limitLogin, async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const { newPassword } = req.body || {};
    if (!isValidNewPassword(newPassword, prefix === "/admin" ? 12 : 6)) {
      return res.status(400).json({ message: "Mot de passe invalide ou trop court" });
    }

    try {
      const account = await checkReset(req, res);
      if (!account) return;
      const password = await bcrypt.hash(newPassword, 13);
      const changed = await account.constructor.updateOne({
        ...buildSessionVersionFilter(account._id, getSessionVersion(account)),
        email: account.email,
        passwordResetHash: account.passwordResetHash,
        resetCodeExpires: { $gt: new Date() },
        ...(prefix === "/admin" && { role: account.role, status: { $ne: "DISABLED" } }),
      }, {
        $set: { password },
        $inc: { sessionVersion: 1 },
        $unset: {
          resetCode: 1, resetCodeExpires: 1, passwordResetHash: 1,
          ...(account.constructor === EmployeeModel && { loginDelivery: 1 }),
        },
      });
      if (!changed.modifiedCount) return res.status(400).json({ message: "Code invalide ou expiré" });
      return res.json({ message: "Mot de passe mis à jour avec succès" });
    } catch {
      return res.status(500).json({ message: "Erreur serveur" });
    }
  });
}

addPasswordResetRoutes("/admin", async (email) => {
  const account = await AdminModel.findOne({ email }).select(resetFields);
  return isActiveAdmin(account) ? account : null;
});
addPasswordResetRoutes("/auth", findUserByEmail);
addPasswordResetRoutes("/owner", (email) => OwnerModel.findOne({ email }).select(resetFields));

module.exports = router;
