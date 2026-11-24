const { createHmac, randomBytes } = require("node:crypto");
const bcrypt = require("bcryptjs");
const Employee = require("../../models/employee.model");
const Owner = require("../../models/owner.model");
const resendDelay = 60 * 1000;
const activationFields = "+password +loginDelivery";
const fail = (status, message) => Object.assign(new Error(message), { status });
const staleRecord = "Le dossier a changé ou un envoi est en cours. Rechargez la fiche avant de réessayer.";

// Reconstruct an initial password for delivery without storing it in plain text.
function generatedPassword(nonce) {
  return createHmac("sha256", process.env.JWT_SECRET).update(`employee-login-delivery:${nonce}`)
    .digest("base64url").slice(0, 24);
}

function createEmployeeCredentials({ email, restaurant }) {
  const nonce = randomBytes(24).toString("base64url");
  return {
    password: generatedPassword(nonce),
    loginDelivery: {
      nonce, email, restaurant, resendAfter: new Date(Date.now() + resendDelay), delivery: "sending",
    },
  };
}

async function deliverEmployeeCredentials(employee, password, sendCredentials) {
  const initial = employee.loginDelivery;
  let delivery;
  try {
    await sendCredentials(employee, password);
    delivery = "sent";
  } catch {
    delivery = "failed";
  }
  if (initial) {
    await Employee.updateOne({ _id: employee._id, "loginDelivery.nonce": initial.nonce,
      "loginDelivery.resendAfter": initial.resendAfter }, { $set: {
      "loginDelivery.delivery": delivery,
      ...(delivery === "failed" && { "loginDelivery.resendAfter": new Date() }),
    } });
  }
  return { delivery };
}

async function activateEmployeeAccount({ employeeId, restaurantId, expectedEmail, resend, sendCredentials }) {
  const employee = await Employee.findOne({
    _id: employeeId, restaurants: restaurantId, historicalImport: { $exists: false }, accountType: { $ne: "accountant" },
  }).select(activationFields);
  const profiles = (employee?.restaurantProfiles || []).filter(({ restaurant }) => String(restaurant) === restaurantId);
  const [profile] = profiles;
  if (profiles.length !== 1 || profile.archivedAt || profile.erasure?.at) {
    throw fail(404, "Salarié actif introuvable dans ce restaurant.");
  }
  if (employee.password && !resend) throw fail(409, "Ce compte est déjà actif.");
  if (!employee.email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(employee.email) || !employee.phone?.trim()) {
    throw fail(400, "Renseignez une adresse e-mail valide et le téléphone du salarié dans Informations personnelles.");
  }
  if (employee.email !== expectedEmail) {
    throw fail(409, "L’adresse e-mail a changé. Rechargez la fiche et confirmez le nouveau destinataire.");
  }
  if (employee.loginDelivery?.resendAfter > new Date()) {
    throw fail(429, "Attendez une minute entre deux demandes d’envoi.");
  }
  const collation = { locale: "en", strength: 2 };
  const [duplicate, owner] = await Promise.all([
    Employee.exists({ _id: { $ne: employeeId }, email: employee.email }).collation(collation),
    Owner.exists({ email: employee.email }).collation(collation),
  ]);
  if (duplicate || owner) throw fail(409, "Cette adresse e-mail est déjà utilisée par un autre compte.");

  employee.$where = {
    __v: employee.__v ?? { $exists: false }, email: employee.email, phone: employee.phone,
    password: employee.password || { $in: [null, ""] }, restaurants: profile.restaurant,
    restaurantProfiles: { $elemMatch: { restaurant: profile.restaurant, _id: profile._id, archivedAt: null, "erasure.at": null } },
  };
  let password;
  if (resend) {
    const delivery = employee.loginDelivery;
    if (!delivery || delivery.email !== employee.email || String(delivery.restaurant) !== restaurantId || !employee.password) {
      throw fail(409, "Ces identifiants ne peuvent pas être renvoyés. Le salarié peut utiliser « Mot de passe oublié ».");
    }
    password = generatedPassword(delivery.nonce);
    if (!(await bcrypt.compare(password, employee.password))) {
      throw fail(409, "Le mot de passe initial n’est plus utilisable. Le salarié peut utiliser « Mot de passe oublié ».");
    }
    delivery.delivery = "sending";
    delivery.resendAfter = new Date(Date.now() + resendDelay);
  } else {
    const next = createEmployeeCredentials({ email: employee.email, restaurant: restaurantId });
    password = next.password;
    employee.password = next.password;
    employee.loginDelivery = next.loginDelivery;
  }
  employee.increment();
  try {
    await employee.save();
  } catch (error) {
    if (["VersionError", "DocumentNotFoundError"].includes(error.name)) throw fail(409, staleRecord);
    throw error;
  }
  return deliverEmployeeCredentials(employee, password, sendCredentials);
}

module.exports = {
  activationFields, activateEmployeeAccount, createEmployeeCredentials, deliverEmployeeCredentials,
};
