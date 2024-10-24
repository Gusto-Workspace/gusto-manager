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

// ADD NEWS
router.post(
  "/restaurants/:id/news",
  upload.single("image"),
  async (req, res) => {
    const restaurantId = req.params.id;
    const { title, description } = req.body;
    const imageFile = req.file;

    try {
      let imageUrl = null;
      let imagePublicId = null;

      // Si une image est présente, la télécharger sur Cloudinary
      if (imageFile) {
        const cloudinaryResponse = await uploadFromBuffer(
          imageFile.buffer,
          `Gusto_Workspace/restaurants/${restaurantId}`
        );
        imageUrl = cloudinaryResponse.secure_url;
        imagePublicId = cloudinaryResponse.public_id;
      }

      // Créer la nouvelle actualité
      const newNews = {
        title,
        description,
        image: imageUrl,
        imagePublicId: imagePublicId,
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

// GET SINGLE NEWS BY ID
router.get("/news/:newsId", async (req, res) => {
  const { newsId } = req.params;

  try {
    // Rechercher le restaurant contenant la news avec cet ID
    const restaurant = await RestaurantModel.findOne({
      "news._id": newsId,
    }).populate("owner_id", "firstname");

    // Vérifier si le restaurant existe
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found." });
    }

    // Trouver la *news* spécifique dans le tableau *news* du restaurant
    const news = restaurant.news.find((n) => n._id.toString() === newsId);

    if (!news) {
      return res.status(404).json({ message: "News not found." });
    }

    // Retourner les données de la *news*
    res.status(200).json({ news });
  } catch (error) {
    console.error("Error fetching news:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

// UPDATE NEWS
router.put(
  "/restaurants/:id/news/:newsId",
  upload.single("image"),
  async (req, res) => {
    const restaurantId = req.params.id;
    const newsId = req.params.newsId;
    const { title, description, visible, removeImage } = req.body;
    const imageFile = req.file;

    try {
      const restaurant = await RestaurantModel.findById(restaurantId).populate(
        "owner_id",
        "firstname"
      );

      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found." });
      }

      const newsIndex = restaurant.news.findIndex(
        (n) => n._id.toString() === newsId
      );

      if (newsIndex === -1) {
        return res.status(404).json({ message: "News not found." });
      }

      if (title !== undefined) restaurant.news[newsIndex].title = title;
      if (description !== undefined)
        restaurant.news[newsIndex].description = description;
      if (visible !== undefined) {
        restaurant.news[newsIndex].visible =
          visible === "true" || visible === true;
      }

      // Suppression de l'image existante si `removeImage` est true
      if (removeImage === "true" && restaurant.news[newsIndex].imagePublicId) {
        await cloudinary.uploader.destroy(
          restaurant.news[newsIndex].imagePublicId
        );
        restaurant.news[newsIndex].image = null;
        restaurant.news[newsIndex].imagePublicId = null;
      }

      // Upload de la nouvelle image
      if (imageFile) {
        const oldImagePublicId = restaurant.news[newsIndex].imagePublicId;
        if (oldImagePublicId) {
          await cloudinary.uploader.destroy(oldImagePublicId);
        }

        const cloudinaryResponse = await uploadFromBuffer(
          imageFile.buffer,
          `Gusto_Workspace/restaurants/${restaurantId}`
        );
        restaurant.news[newsIndex].image = cloudinaryResponse.secure_url;
        restaurant.news[newsIndex].imagePublicId = cloudinaryResponse.public_id;
      }

      await restaurant.save();
      const updatedRestaurant = await RestaurantModel.findById(
        restaurantId
      ).populate("owner_id", "firstname");

      res.status(200).json({
        message: "News updated successfully",
        restaurant: updatedRestaurant,
      });
    } catch (error) {
      console.error("Error updating news:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// DELETE NEWS
router.delete("/restaurants/:id/news/:newsId", async (req, res) => {
  const restaurantId = req.params.id;
  const newsId = req.params.newsId;

  try {
    // Trouver le restaurant par son ID et s'assurer qu'il existe
    const restaurant = await RestaurantModel.findById(restaurantId);

    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found." });
    }

    // Trouver la news spécifique dans le tableau de news
    const newsIndex = restaurant.news.findIndex(
      (n) => n._id.toString() === newsId
    );

    if (newsIndex === -1) {
      return res.status(404).json({ message: "News not found." });
    }

    // Récupérer le `imagePublicId` de la news pour supprimer l'image de Cloudinary
    const imagePublicId = restaurant.news[newsIndex].imagePublicId;

    // Supprimer l'image de Cloudinary si `imagePublicId` existe
    if (imagePublicId) {
      await cloudinary.uploader.destroy(imagePublicId);
    }

    // Supprimer la news du tableau `news`
    restaurant.news.splice(newsIndex, 1);

    // Sauvegarder les modifications dans la base de données
    await restaurant.save();

    // Renvoyer le restaurant mis à jour
    const updatedRestaurant = await RestaurantModel.findById(
      restaurantId
    ).populate("owner_id", "firstname");

    res.status(200).json({
      message: "News deleted successfully",
      restaurant: updatedRestaurant,
    });
  } catch (error) {
    console.error("Error deleting news:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
