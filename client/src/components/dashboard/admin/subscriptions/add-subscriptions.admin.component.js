import { useContext, useState } from "react";

// AXIOS
import axios from "axios";

// I18N
import { useTranslation } from "next-i18next";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// STRIPE
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";

// COMPONENTS
import SepaMandateForm from "./sepa-mandate-form.admin.component";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY);

export default function AddSubscriptionsAdminComponent() {
  const { t } = useTranslation("admin");
  const { adminContext } = useContext(GlobalContext);

  const [selectedOwner, setSelectedOwner] = useState(null);
  const [selectedRestaurant, setSelectedRestaurant] = useState("");
  const [selectedSubscription, setSelectedSubscription] = useState("");
  const [restaurantData, setRestaurantData] = useState({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [clientSecret, setClientSecret] = useState(null);
  const [paymentMethodId, setPaymentMethodId] = useState(null);
  const [subscriptionCreated, setSubscriptionCreated] = useState(false);

  // === Handlers de sélection ===
  function handleOwnerChange(e) {
    const ownerId = e.target.value;
    const owner = adminContext.ownersList.find((o) => o._id === ownerId);
    setSelectedOwner(owner);
    setSelectedRestaurant("");
    setSelectedSubscription("");
    setRestaurantData({});
    setMessage("");
    setClientSecret(null);
    setPaymentMethodId(null);
    setSubscriptionCreated(false);
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
    setMessage("");
    setClientSecret(null);
    setPaymentMethodId(null);
    setSubscriptionCreated(false);
  }

  function handleSubscriptionChange(e) {
    setSelectedSubscription(e.target.value);
    setMessage("");
    setClientSecret(null);
    setPaymentMethodId(null);
    setSubscriptionCreated(false);
  }

  // === Étape 1 : Créer le SetupIntent pour SEPA ===
  async function createSetupIntent() {
    if (!selectedOwner || !selectedSubscription || !selectedRestaurant) {
      setMessage(t("subscriptions.add.errors.select"));
      return;
    }
    setLoading(true);
    setMessage("");

    try {
      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/create-setup-intent`,
        {
          stripeCustomerId: selectedOwner.stripeCustomerId,
        }
      );
      setClientSecret(res.data.clientSecret);
    } catch (err) {
      console.error(err);
      setMessage("Erreur lors de la création du SetupIntent");
    } finally {
      setLoading(false);
    }
  }

  // Callback quand le SetupIntent est confirmé => on récupère l'ID PaymentMethod
  function handleSetupSuccess(pmId) {
    setPaymentMethodId(pmId);
  }

  // === Étape 2 : Créer l'abonnement SEPA automatiquement ===
  async function createSepaSubscription() {
    if (!paymentMethodId) {
      setMessage(
        "Aucun Mandat SEPA confirmé. Veuillez d'abord confirmer le mandat."
      );
      return;
    }
    setLoading(true);
    setMessage("");

    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/create-subscription-sepa`,
        {
          stripeCustomerId: selectedOwner.stripeCustomerId,
          priceId: selectedSubscription,
          paymentMethodId: paymentMethodId, // on envoie le PaymentMethod
          billingAddress: restaurantData.address,
          phone: restaurantData.phone,
          language: restaurantData.language,
          restaurantId: selectedRestaurant,
          restaurantName: selectedOwner.restaurants.find(
            (r) => r._id === selectedRestaurant
          ).name,
        }
      );
      setSubscriptionCreated(true);
    } catch (error) {
      const errorMsg =
        t(error.response?.data?.message) ||
        t("subscriptions.add.errors.create");
      setMessage(errorMsg);
      console.error(t("subscriptions.add.errors.create"), error);
    } finally {
      setLoading(false);
    }
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
          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm"
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
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm"
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

      {/* Bouton pour créer le SetupIntent (et donc afficher le mandat SEPA) */}
      {selectedSubscription && !clientSecret && (
        <button
          onClick={createSetupIntent}
          disabled={loading}
          className="mt-4 bg-blue text-white px-4 py-2 rounded disabled:opacity-50 w-fit"
        >
          {loading ? "Chargement..." : "Créer un mandat SEPA"}
        </button>
      )}

      {/* Si on a un clientSecret, on affiche le composant Stripe pour saisir l'IBAN */}
      {clientSecret && (
        <div className="mt-4">
          <p>
            Vous pouvez maintenant saisir l’IBAN du client pour générer le
            mandat SEPA :
          </p>
          <Elements stripe={stripePromise} options={{ clientSecret }}>
            <SepaMandateForm
              clientSecret={clientSecret}
              handleSetupSuccess={handleSetupSuccess}
              paymentMethodId={paymentMethodId}
            />
          </Elements>
        </div>
      )}

      {/* Quand le mandat est confirmé, on a paymentMethodId => bouton pour créer l'abonnement */}
      {paymentMethodId && (
        <>
          {!subscriptionCreated ? (
            <button
              onClick={createSepaSubscription}
              disabled={loading}
              className="mt-4 bg-green text-white px-4 py-2 rounded w-fit mx-auto disabled:opacity-50"
            >
              {loading ? "Création en cours..." : "Créer l'abonnement SEPA"}
            </button>
          ) : (
            // Abonnement créé => on affiche ce message
            <div className="mt-4 bg-green text-white px-4 py-2 rounded w-fit mx-auto">
              Abonnement créé avec succès !
            </div>
          )}
        </>
      )}

      {/* Message de confirmation ou d'erreur */}
      {message && <div className="mt-4 text-center text-sm">{message}</div>}
    </div>
  );
}
