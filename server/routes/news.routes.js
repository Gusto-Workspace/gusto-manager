const express = require("express");
const router = express.Router();
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const streamifier = require("streamifier");

const RestaurantModel = require("../models/restaurant.model");

// Configuration de Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configuration de multer pour stocker les images en mémoire
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Fonction pour uploader une image depuis un buffer sur Cloudinary
const uploadFromBuffer = (buffer, folder) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, format: "webp" },
      (error, result) => {
        if (result) {
          resolve(result);
        } else {
          reject(error);
        }
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
};

// Route pour ajouter une actualité à un restaurant
router.post(
  "/restaurants/:id/news",
  upload.single("image"),
  async (req, res) => {
    const restaurantId = req.params.id;
    const { title, description } = req.body;
    const imageFile = req.file; // Image uploadée

    try {
      let imageUrl = null;

      // Si une image est présente, la télécharger sur Cloudinary
      if (imageFile) {
        const cloudinaryResponse = await uploadFromBuffer(
          imageFile.buffer,
          `Gusto_Workspace/restaurants/${restaurantId}`
        );
        imageUrl = cloudinaryResponse.secure_url;
      }

      // Créer la nouvelle actualité
      const newNews = {
        title,
        description,
        image: imageUrl,
        published_at: new Date(),
      };

      // Ajouter l'actualité au restaurant
      const restaurant = await RestaurantModel.findByIdAndUpdate(
        restaurantId,
        { $push: { news: newNews } },
        { new: true }
      ).populate("owner_id", "firstname");

      // Vérifier si le restaurant existe
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      res.status(200).json({
        message: "News added successfully",
        restaurant,
      });
    } catch (error) {
      console.error("Error adding news:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

module.exports = router;
