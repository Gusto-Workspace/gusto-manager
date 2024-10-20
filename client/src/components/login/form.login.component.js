import { useForm } from "react-hook-form";
import { useRouter } from "next/router";
import { useState } from "react";
import axios from "axios";

export default function FormLoginComponent() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [restaurants, setRestaurants] = useState([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState("");

  async function onSubmit(data) {
    setLoading(true);
    setErrorMessage("");

    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/owner/login`,
        data
      );

      const { token, owner } = response.data;

      // Stocker le token dans le localStorage pour authentification future
      localStorage.setItem("token", token);

      // Vérifier le nombre de restaurants du propriétaire
      if (owner.restaurants.length > 1) {
        setRestaurants(owner.restaurants); // Masquer les inputs de connexion et afficher la sélection de restaurants
      } else {
        // Si le propriétaire n'a qu'un restaurant, regénérer le token avec l'ID du restaurant
        handleRestaurantSelect(owner.restaurants[0]._id, token);
      }
    } catch (error) {
      if (error.response && error.response.data) {
        setErrorMessage(error.response.data.message || "Login failed");
      } else {
        setErrorMessage("An error occurred. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRestaurantSelect(restaurantId, token) {
    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/owner/select-restaurant`,
        { token, restaurantId }
      );

      const newToken = response.data.token;

      // Stocker le nouveau token contenant l'ID du restaurant
      localStorage.setItem("token", newToken);

      // Rediriger l'utilisateur vers sa page d'accueil ou tableau de bord
      router.push("/");
    } catch (error) {
      console.error("Erreur lors de la sélection du restaurant:", error);
      setErrorMessage("An error occurred. Please try again.");
    }
  }

  return (
    <section className="bg-white flex flex-col justify-center items-center gap-8 rounded-xl p-12 w-[500px]">
      <h1 className="text-4xl">Welcome</h1>

      {restaurants.length === 0 ? (
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="w-full flex flex-col items-center gap-4"
        >
          <div className="flex flex-col gap-2 items-center w-full">
            <input
              id="email"
              type="email"
              placeholder="Email"
              className={`border rounded-lg p-2 w-full ${errors.email ? "border-red" : ""}`}
              {...register("email", { required: "Email is required" })}
            />
          </div>

          <div className="flex flex-col gap-2 items-center w-full">
            <input
              id="password"
              type="password"
              placeholder="Password"
              className={`border rounded-lg p-2 w-full ${errors.password ? "border-red" : ""}`}
              {...register("password", { required: "Password is required" })}
            />
          </div>

          {errorMessage && <p className="text-red-500">{errorMessage}</p>}

          <button
            type="submit"
            className="bg-black text-white rounded-full py-2 px-12 hover:bg-opacity-70 w-fit mt-6"
            disabled={loading}
          >
            {loading ? "Loading..." : "Login"}
          </button>
        </form>
      ) : (
        <div className="w-full mt-4">
          <h2 className="text-lg">Select a Restaurant</h2>
          <select
            className="border rounded-lg p-2 w-full"
            value={selectedRestaurant}
            onChange={(e) => setSelectedRestaurant(e.target.value)}
          >
            <option value="">Select a restaurant</option>
            {restaurants.map((restaurant) => (
              <option key={restaurant._id} value={restaurant._id}>
                {restaurant.name}
              </option>
            ))}
          </select>
          <button
            className={`bg-blue text-white px-4 py-2 rounded mt-4 ${
              !selectedRestaurant ? "opacity-50 cursor-not-allowed" : ""
            }`}
            onClick={() => handleRestaurantSelect(selectedRestaurant, localStorage.getItem("token"))}
            disabled={!selectedRestaurant}
          >
            Go to Restaurant
          </button>
        </div>
      )}
    </section>
  );
}
