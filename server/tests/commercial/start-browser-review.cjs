const { mongoUri } = require("./isolated-environment.cjs");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { existsSync, writeFileSync } = require("node:fs");
const { dirname, join } = require("node:path");
const Admin = require("../../models/admin.model");
const CommercialAccount = require("../../models/commercial-account.model");
const Acquisition = require("../../models/commercial-acquisition.model");
const Document = require("../../models/document.model");
const Owner = require("../../models/owner.model");
const Restaurant = require("../../models/restaurant.model");
const { saveRestaurantWithEstablishment } = require("../../services/commercial/establishments.service");

async function start() {
  const db = new URL(mongoUri).pathname;
  const userReview = db === "/gusto_commercial_user_review_v4";
  if (!userReview && db !== "/gusto_commercial_chrome") throw new Error("Use a dedicated review fixture database.");
  if (userReview && !process.env.GUSTO_COMMERCIAL_TEST_FILES_DIR) throw new Error("Configure dedicated persistent review assets.");
  if (!process.env.NEXT_PUBLIC_API_URL) throw new Error("Configure the loopback NEXT_PUBLIC_API_URL for the fixture.");
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  const password = "recette-commerciale-fictive";
  const passwordHash = await bcrypt.hash(password, 4);
  await Promise.all([CommercialAccount.init(), Acquisition.init(), Document.init()]);
  for (const [role, email] of [
    ["super-admin", "super-admin@gusto-recette.invalid"],
    ["admin", "admin@gusto-recette.invalid"],
  ]) {
    await Admin.updateOne({ email }, { $setOnInsert: { role, status: "ACTIVE", password: passwordHash, sessionVersion: 0 } }, { upsert: true });
  }
  for (const [firstName, email] of [
    ["Alice", "alice@gusto-recette.invalid"],
    ["Benoît", "benoit@gusto-recette.invalid"],
  ]) {
    await CommercialAccount.updateOne({ email }, {
      $setOnInsert: { firstName, lastName: "Recette", status: "ACTIVE", password: passwordHash, sessionVersion: 0 },
    }, { upsert: true });
  }
  const restaurantName = "Le Bistro de Recette";
  if (!await Restaurant.exists({ name: restaurantName })) {
    const owner = await Owner.create({ firstname: "Camille", lastname: "Recette", email: "proprietaire@gusto-recette.invalid", password });
    const restaurant = await saveRestaurantWithEstablishment(new Restaurant({
      name: restaurantName, email: "bistro@gusto-recette.invalid", phone: "0101010101", owner_id: owner._id,
      address: { line1: "19 rue des Tests", city: "Paris", zipCode: "75020", country: "France" },
    }));
    await Owner.updateOne({ _id: owner._id }, { $addToSet: { restaurants: restaurant._id } });
  }
  await mongoose.disconnect();
  require("../../app");
  if (userReview) {
    const marker = join(dirname(process.env.GUSTO_COMMERCIAL_TEST_FILES_DIR), "seeded");
    if (!existsSync(marker)) {
      await mongoose.connection.asPromise();
      await require("./user-review-data.cjs")();
      writeFileSync(marker, "ready\n", { mode: 0o600, flag: "wx" });
    }
    console.info("Recette commerciale prête.");
  }
}

start().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
