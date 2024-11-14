require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");

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
      "http://localhost:8003", // Client La coquille
      "https://gusto-manager.onrender.com", // Server
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
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

// ÉCOUTE DU PORT
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
