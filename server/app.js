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
      "http://localhost:8002", // Client
      "http://localhost:8012", // Server
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

// ROUTES
const apiRoutes = "/api";
const authRoutes = require("./routes/auth.routes");

app.use(apiRoutes, authRoutes);

// ÉCOUTE DU PORT
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
