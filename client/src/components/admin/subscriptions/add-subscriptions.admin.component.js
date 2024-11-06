import { useContext, useState } from "react";
import axios from "axios";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

export default function AddSubscriptionsAdminComponent() {
  const { adminContext } = useContext(GlobalContext);
  const [selectedOwner, setSelectedOwner] = useState(null);
  const [selectedRestaurant, setSelectedRestaurant] = useState("");
  const [selectedSubscription, setSelectedSubscription] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [restaurantData, setRestaurantData] = useState({});

  function handleOwnerChange(e) {
    const ownerId = e.target.value;
    const owner = adminContext.ownersList.find((o) => o._id === ownerId);
    setSelectedOwner(owner);
    setSelectedRestaurant("");
    setSelectedSubscription("");
    setRestaurantData({});
  }

  function handleRestaurantChange(e) {
    const restaurantId = e.target.value;
    const restaurant = selectedOwner.restaurants.find(
      (r) => r._id === restaurantId
    );
    setSelectedRestaurant(restaurantId);
    setRestaurantData({
      address: restaurant.address,
      phone: restaurant.phone,
      language: restaurant.language || "fr",
    });
  }

  function handleSubscriptionChange(e) {
    setSelectedSubscription(e.target.value);
  }

  function createSubscription() {
    if (!selectedOwner || !selectedSubscription || !selectedRestaurant) {
      setMessage(
        "Veuillez sélectionner un client, un restaurant, et un abonnement."
      );
      return;
    }

    setLoading(true);
    setMessage("");

    axios
      .post(`${process.env.NEXT_PUBLIC_API_URL}/admin/create-subscription`, {
        stripeCustomerId: selectedOwner.stripeCustomerId,
        priceId: selectedSubscription,
        billingAddress: restaurantData.address,
        phone: restaurantData.phone,
        language: restaurantData.language,
      })
      .then((response) => {
        setMessage(response.data.message);
      })
      .catch((error) => {
        console.error("Erreur lors de la création de l'abonnement:", error);
        setMessage("Erreur lors de la création de l'abonnement.");
      })
      .finally(() => {
        setLoading(false);
      });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Sélection du client */}
      <div>
        <label
          htmlFor="ownerSelect"
          className="block text-sm font-medium text-gray-700"
        >
          Sélectionner un client
        </label>
        <select
          id="ownerSelect"
          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          value={selectedOwner ? selectedOwner._id : ""}
          onChange={handleOwnerChange}
        >
          <option value="">-- Choisir un client --</option>
          {adminContext.ownersList.map((owner) => (
            <option key={owner._id} value={owner._id}>
              {owner.firstname} {owner.lastname}
            </option>
          ))}
        </select>
      </div>

      {/* Sélection du restaurant */}
      {selectedOwner && (
        <div>
          <label
            htmlFor="restaurantSelect"
            className="block text-sm font-medium text-gray-700"
          >
            Sélectionner un restaurant
          </label>
          <select
            id="restaurantSelect"
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            value={selectedRestaurant}
            onChange={handleRestaurantChange}
          >
            <option value="">-- Choisir un restaurant --</option>
            {selectedOwner.restaurants.map((restaurant) => (
              <option key={restaurant._id} value={restaurant._id}>
                {restaurant.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Sélection de l'abonnement */}
      {selectedRestaurant && (
        <div>
          <label
            htmlFor="subscriptionSelect"
            className="block text-sm font-medium text-gray-700"
          >
            Sélectionner un abonnement
          </label>
          <select
            id="subscriptionSelect"
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            value={selectedSubscription}
            onChange={handleSubscriptionChange}
          >
            <option value="">-- Choisir un abonnement --</option>
            {adminContext?.subscriptionsList?.map((subscription) => (
              <option
                key={subscription.id}
                value={subscription.default_price.id}
              >
                {subscription.name} -{" "}
                {subscription.default_price
                  ? subscription.default_price.unit_amount / 100
                  : "N/A"}{" "}
                {subscription.default_price
                  ? subscription.default_price.currency.toUpperCase()
                  : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Bouton pour créer l'abonnement */}
      {selectedSubscription && (
        <button
          onClick={createSubscription}
          disabled={loading}
          className="mt-4 bg-blue text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? "Création en cours..." : "Créer l'abonnement"}
        </button>
      )}

      {/* Message de confirmation ou d'erreur */}
      {message && (
        <div className="mt-4 text-center text-sm text-gray-700">{message}</div>
      )}
    </div>
  );
}
