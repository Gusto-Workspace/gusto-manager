import { useContext, useState } from "react";

// AXIOS
import axios from "axios";

// I18N
import { useTranslation } from "next-i18next";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

export default function AddSubscriptionsAdminComponent() {
  const { t } = useTranslation("admin");

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
      setMessage(t("subscriptions.add.errors.select"));
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
        restaurantId: selectedRestaurant,
        restaurantName: selectedOwner.restaurants.find(
          (r) => r._id === selectedRestaurant
        ).name,
      })
      .then((response) => {
        setMessage(response.data.message);
      })
      .catch((error) => {
        const errorMsg =
          t(error.response?.data?.message) ||
          t("subscriptions.add.errors.create");
        setMessage(errorMsg);
        console.error(t("subscriptions.add.errors.create"), error);
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
          {t("subscriptions.add.owner")}
        </label>
        <select
          id="ownerSelect"
          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          value={selectedOwner ? selectedOwner._id : ""}
          onChange={handleOwnerChange}
        >
          <option disabled value="">
            -
          </option>
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
            {t("subscriptions.add.restaurant")}
          </label>
          <select
            id="restaurantSelect"
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            value={selectedRestaurant}
            onChange={handleRestaurantChange}
          >
            <option disabled value="">
              -
            </option>
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
            className="block text-sm font-medium"
          >
            {t("subscriptions.add.subscription")}
          </label>

          <select
            id="subscriptionSelect"
            className="mt-1 block w-full border rounded-md shadow-sm"
            value={selectedSubscription}
            onChange={handleSubscriptionChange}
          >
            <option disabled value="">
              -
            </option>

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
          className="mt-4 bg-blue text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {loading
            ? t("subscriptions.add.buttons.loading")
            : t("subscriptions.add.buttons.create")}
        </button>
      )}

      {/* Message de confirmation ou d'erreur */}
      {message && <div className="mt-4 text-center text-sm">{message}</div>}
    </div>
  );
}
