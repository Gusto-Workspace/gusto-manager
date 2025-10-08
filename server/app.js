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
  .connect(process.env.CONNECTION_STRING_TEST, { connectTimeoutMS: 5000 })
  .then(() => console.log("Connected to MongoDB Test BDD"))
  .catch((err) => console.log("MongoDB connection error:", err));

// CORS
app.use(
  cors({
    origin: [
      "http://localhost:8002", // Client
      "http://localhost:8003", // Client site restaurant
      "http://localhost:8006", // Client module réservation
      "http://localhost:8012", // Server
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true,
    allowedHeaders: [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "Authorization",
    ],
  })
);

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
const reception_temperature = require("./routes/health-control-plan/reception-temperature.routes");
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

app.use(apiRoutes, reception_temperature);
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

// SSE BUS
mountSseRoute(app);

// ÉCOUTE DU PORT
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
