require("dotenv").config();
require("./services/backup");
const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const { mountSseRoute } = require("./services/sse-bus.service");

// APP
const app = express();
const PORT = process.env.PORT || 8012;

// HTTP
const server = http.createServer(app);

// JSON
app.use("/api/stripe/wh", express.raw({ type: "application/json" }));
app.use(express.json());

// MONGOOSE
mongoose
  .connect(process.env.CONNECTION_STRING, { connectTimeoutMS: 5000 })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.log("MongoDB connection error:", err));

// CORS
app.use(
  cors({
    origin: [
      "https://www.gusto-manager.com", // Client
      "https://www.lacoquille-concarneau.fr", // Client La coquille
      "https://www.embrunslorient.fr", // Client Embruns
      "https://www.bourrasquekerroch.fr", // Client Bourrasque
      "https://gusto-manager.onrender.com", // Server
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true,
    allowedHeaders: [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "Authorization",
      "x-gusto-timestamp",
      "x-gusto-signature",
    ],
  })
);

// SSE BUS
mountSseRoute(app);

// ROUTES
const apiRoutes = "/api";
const authRoutes = require("./routes/auth.routes");

app.use(apiRoutes, authRoutes);

// ADMIN
const dashboardAdminRoutes = require("./routes/admin/dashboard.routes");
const restaurantsAdminRoutes = require("./routes/admin/restaurants.routes");
const ownersAdminRoutes = require("./routes/admin/owners.routes");
const subscriptionsAdminRoutes = require("./routes/admin/subscriptions.routes");

app.use(apiRoutes, dashboardAdminRoutes);
app.use(apiRoutes, restaurantsAdminRoutes);
app.use(apiRoutes, ownersAdminRoutes);
app.use(apiRoutes, subscriptionsAdminRoutes);

// OWNER
const restaurantsRoutes = require("./routes/restaurants.routes");
const hoursRoutes = require("./routes/hours.routes");
const contactRoutes = require("./routes/contact.routes");
const dishesRoutes = require("./routes/dishes.routes");
const newsRoutes = require("./routes/news.routes");
const giftsRoutes = require("./routes/gifts.routes");
const drinksRoutes = require("./routes/drinks.routes");
const winesRoutes = require("./routes/wines.routes");
const ownersRoutes = require("./routes/owners.routes");
const menusRoutes = require("./routes/menus.routes");
const transactionsRoutes = require("./routes/transactions.routes");
const reservationsRoutes = require("./routes/reservations.routes");
const employeesRoutes = require("./routes/employees.routes");

app.use(apiRoutes, restaurantsRoutes);
app.use(apiRoutes, hoursRoutes);
app.use(apiRoutes, contactRoutes);
app.use(apiRoutes, dishesRoutes);
app.use(apiRoutes, newsRoutes);
app.use(apiRoutes, giftsRoutes);
app.use(apiRoutes, drinksRoutes);
app.use(apiRoutes, winesRoutes);
app.use(apiRoutes, ownersRoutes);
app.use(apiRoutes, menusRoutes);
app.use(apiRoutes, transactionsRoutes);
app.use(apiRoutes, reservationsRoutes);
app.use(apiRoutes, employeesRoutes);

// HACCP
const fridge_temperature = require("./routes/health-control-plan/fridge-temperature.routes");
const preheat_temperature = require("./routes/health-control-plan/preheat-temperature.routes");
const postheat_temperature = require("./routes/health-control-plan/postheat-temperature.routes");
const service_temperature = require("./routes/health-control-plan/service-temperature.routes");
const generic_temperature = require("./routes/health-control-plan/generic-temperature.routes");
const reception_delivery = require("./routes/health-control-plan/reception-delivery.routes");
const inventory_lot = require("./routes/health-control-plan/inventory-lot.routes");
const recipe_batches = require("./routes/health-control-plan/recipe-batches.routes");
const oil_change = require("./routes/health-control-plan/oil-change.routes");
const cleaning_task = require("./routes/health-control-plan/cleaning-task.routes");
const pest_control = require("./routes/health-control-plan/pest-control.routes");
const allergen_incidents = require("./routes/health-control-plan/allergen-incidents.routes");
const microbiology = require("./routes/health-control-plan/microbiology.routes");
const non_conformity = require("./routes/health-control-plan/non-conformity.routes");
const supplier_certificate = require("./routes/health-control-plan/suppliers-certificates.routes");
const recalls = require("./routes/health-control-plan/recalls.routes");
const calibration = require("./routes/health-control-plan/calibration.routes");
const training_sessions = require("./routes/health-control-plan/training-sessions.routes");
const maintenance = require("./routes/health-control-plan/maintenance.routes");
const waste_entries = require("./routes/health-control-plan/waste-entries.routes");
const health_mesures = require("./routes/health-control-plan/health-mesures.routes");
const cooking_equipments = require("./routes/health-control-plan/cooking-equipments.routes");
const zones = require("./routes/health-control-plan/zone.routes")
const haccp_report = require('./routes/health-control-plan/haccp-report.routes')

app.use(apiRoutes, fridge_temperature);
app.use(apiRoutes, preheat_temperature);
app.use(apiRoutes, postheat_temperature);
app.use(apiRoutes, service_temperature);
app.use(apiRoutes, generic_temperature);
app.use(apiRoutes, reception_delivery);
app.use(apiRoutes, inventory_lot);
app.use(apiRoutes, recipe_batches);
app.use(apiRoutes, oil_change);
app.use(apiRoutes, cleaning_task);
app.use(apiRoutes, pest_control);
app.use(apiRoutes, allergen_incidents);
app.use(apiRoutes, microbiology);
app.use(apiRoutes, non_conformity);
app.use(apiRoutes, supplier_certificate);
app.use(apiRoutes, recalls);
app.use(apiRoutes, calibration);
app.use(apiRoutes, training_sessions);
app.use(apiRoutes, maintenance);
app.use(apiRoutes, waste_entries);
app.use(apiRoutes, health_mesures);
app.use(apiRoutes, cooking_equipments);
app.use(apiRoutes, zones);
app.use(apiRoutes, haccp_report)

// ÉCOUTE DU PORT
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
