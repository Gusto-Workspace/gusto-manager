import { useContext, useMemo, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import { useTranslation } from "next-i18next";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// STRIPE
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";

// COMPONENTS
import SepaMandateForm from "./sepa-mandate-form.admin.component";
import {
  computeCatalogTotal,
  formatCatalogProductLabel,
  splitSubscriptionCatalogProducts,
} from "../_shared/utils/subscription-catalog.utils";

// ICONS (lucide)
import {
  User,
  Store,
  BadgeEuro,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowRight,
  Hash,
  Layers3,
} from "lucide-react";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY);

export default function AddSubscriptionsAdminComponent() {
  const { t } = useTranslation("admin");
  const router = useRouter();
  const { adminContext } = useContext(GlobalContext);

  const owners = useMemo(() => adminContext?.ownersList || [], [adminContext]);
  const subscriptionProducts = useMemo(
    () => adminContext?.subscriptionsList || [],
    [adminContext],
  );
  const { plans, addons } = useMemo(
    () => splitSubscriptionCatalogProducts(subscriptionProducts),
    [subscriptionProducts],
  );

  const [selectedOwnerId, setSelectedOwnerId] = useState("");
  const [selectedRestaurantId, setSelectedRestaurantId] = useState("");
  const [selectedPlanPriceId, setSelectedPlanPriceId] = useState("");
  const [selectedAddonPriceIds, setSelectedAddonPriceIds] = useState([]);

  const [restaurantData, setRestaurantData] = useState({});
  const [loading, setLoading] = useState(false);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info"); // info | error | success

  const [clientSecret, setClientSecret] = useState(null);
  const [paymentMethodId, setPaymentMethodId] = useState(null);
  const [subscriptionCreated, setSubscriptionCreated] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  const selectedOwner = useMemo(
    () => owners.find((o) => o._id === selectedOwnerId) || null,
    [owners, selectedOwnerId],
  );

  const ownerRestaurants = useMemo(
    () => selectedOwner?.restaurants || [],
    [selectedOwner],
  );

  const selectedRestaurant = useMemo(
    () => ownerRestaurants.find((r) => r._id === selectedRestaurantId) || null,
    [ownerRestaurants, selectedRestaurantId],
  );

  const { selectedPlan, selectedAddons, totalAmount, currency } = useMemo(
    () =>
      computeCatalogTotal({
        products: subscriptionProducts,
        selectedPlanPriceId,
        selectedAddonPriceIds,
      }),
    [subscriptionProducts, selectedPlanPriceId, selectedAddonPriceIds],
  );

  function resetStripeFlow() {
    setMessage("");
    setMessageType("info");
    setClientSecret(null);
    setPaymentMethodId(null);
    setSubscriptionCreated(false);
    setRedirecting(false);
  }

  function handleOwnerChange(e) {
    const ownerId = e.target.value;
    setSelectedOwnerId(ownerId);
    setSelectedRestaurantId("");
    setSelectedPlanPriceId("");
    setSelectedAddonPriceIds([]);
    setRestaurantData({});
    resetStripeFlow();
  }

  function handleRestaurantChange(e) {
    const restaurantId = e.target.value;
    setSelectedRestaurantId(restaurantId);

    const restaurant = ownerRestaurants.find(
      (entry) => entry._id === restaurantId,
    );
    setRestaurantData({
      address: restaurant?.address,
      phone: restaurant?.phone,
      language: restaurant?.language || "fr",
      name: restaurant?.name || "",
    });

    setSelectedPlanPriceId("");
    setSelectedAddonPriceIds([]);
    resetStripeFlow();
  }

  function handlePlanChange(e) {
    setSelectedPlanPriceId(e.target.value);
    resetStripeFlow();
  }

  function handleAddonToggle(priceId) {
    setSelectedAddonPriceIds((prev) => {
      if (prev.includes(priceId)) {
        return prev.filter((entry) => entry !== priceId);
      }

      return [...prev, priceId];
    });
    resetStripeFlow();
  }

  async function createSetupIntent() {
    if (!selectedOwner || !selectedPlanPriceId || !selectedRestaurantId) {
      setMessageType("error");
      setMessage(t("subscriptions.add.errors.select"));
      return;
    }

    setLoading(true);
    setMessage("");
    setMessageType("info");

    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/create-setup-intent`,
        { restaurantId: selectedRestaurantId },
      );
      setClientSecret(response.data.clientSecret);
    } catch (error) {
      console.error(error);
      setMessageType("error");
      setMessage("Erreur lors de la création du SetupIntent");
    } finally {
      setLoading(false);
    }
  }

  function handleSetupSuccess(pmId) {
    setPaymentMethodId(pmId);
    setMessage("");
    setMessageType("info");
  }

  async function createSepaSubscription() {
    if (!paymentMethodId) {
      setMessageType("error");
      setMessage(
        "Aucun mandat SEPA confirmé. Veuillez d'abord confirmer l’IBAN.",
      );
      return;
    }

    setLoading(true);
    setMessage("");
    setMessageType("info");

    try {
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/create-subscription-sepa`,
        {
          planPriceId: selectedPlanPriceId,
          addonPriceIds: selectedAddonPriceIds,
          paymentMethodId,
          billingAddress: restaurantData.address,
          phone: restaurantData.phone,
          language: restaurantData.language,
          restaurantId: selectedRestaurantId,
          restaurantName: restaurantData.name,
        },
      );

      setSubscriptionCreated(true);
      setMessageType("success");
      setMessage("Abonnement créé avec succès ! Redirection dans un instant…");
      adminContext.fetchOwnersSubscriptionsList();
      setRedirecting(true);
      setTimeout(() => {
        router.push("/dashboard/admin/subscriptions");
      }, 3000);
    } catch (error) {
      const errorMsg =
        t(error?.response?.data?.message) ||
        t("subscriptions.add.errors.create");
      setMessageType("error");
      setMessage(errorMsg);
      console.error(t("subscriptions.add.errors.create"), error);
    } finally {
      setLoading(false);
    }
  }

  const selectBaseCls =
    "mt-1 w-full rounded-xl border bg-white/70 px-3 py-2 text-sm outline-none transition focus:border-blue/40";
  const cardCls =
    "rounded-2xl bg-white/60 border border-darkBlue/10 shadow-sm p-4";
  const headerIconCls =
    "inline-flex size-9 items-center justify-center rounded-xl bg-darkBlue/5 border border-darkBlue/10";
  const stepRowBase =
    "rounded-2xl bg-white/60 border border-darkBlue/10 shadow-sm p-4";
  const stepLeftIcon =
    "inline-flex size-9 items-center justify-center rounded-xl bg-darkBlue/5 border border-darkBlue/10";
  const stepCheck =
    "inline-flex items-center gap-1 text-green text-sm font-semibold";

  const banner = message ? (
    <div
      className={`
        rounded-xl border p-3 text-sm
        ${
          messageType === "success"
            ? "border-green/20 bg-green/10 text-green"
            : messageType === "error"
              ? "border-red/20 bg-red/10 text-red"
              : "border-darkBlue/10 bg-white/70 text-darkBlue/80"
        }
      `}
    >
      <div className="flex items-start gap-2">
        {messageType === "success" ? (
          <CheckCircle2 className="size-4 mt-0.5" />
        ) : messageType === "error" ? (
          <AlertTriangle className="size-4 mt-0.5" />
        ) : (
          <CreditCard className="size-4 mt-0.5 text-darkBlue/60" />
        )}
        <p className="min-w-0">{message}</p>
      </div>

      {redirecting && (
        <div className="mt-2 flex items-center gap-2 text-xs text-darkBlue/60">
          <Loader2 className="size-3 animate-spin" />
          <span>Redirection dans 3s…</span>
        </div>
      )}
    </div>
  ) : null;

  const isStep1Done = !!clientSecret;
  const isStep2Done = !!paymentMethodId;
  const isStep3Done = !!subscriptionCreated;

  const step1Enabled =
    !!selectedOwner && !!selectedRestaurantId && !!selectedPlanPriceId;
  const step2Enabled = isStep1Done;
  const step3Enabled = isStep2Done;

  return (
    <section className="flex flex-col gap-4">
      <div className="sticky top-6 z-20 ml-16 mobile:ml-12 tablet:ml-0 px-4 pt-4 pb-3 bg-white/70 backdrop-blur border-b rounded-xl border-darkBlue/10">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-darkBlue truncate">
              {t("subscriptions.add.title", "Ajouter un abonnement")}
            </h1>
            <p className="text-xs text-darkBlue/50">
              {t(
                "subscriptions.add.subtitle",
                "Créer un mandat SEPA puis activer l’abonnement.",
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {banner}

        <div className="grid grid-cols-1 desktop:grid-cols-2 gap-3">
          <div className={cardCls}>
            <div className="flex items-center gap-2 mb-3">
              <div className={headerIconCls}>
                <User className="size-4 text-darkBlue/70" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-darkBlue">
                  {t("subscriptions.add.owner")}
                </p>
                <p className="text-xs text-darkBlue/50">
                  {t(
                    "subscriptions.add.ownerHint",
                    "Choisis le propriétaire du compte Stripe.",
                  )}
                </p>
              </div>
            </div>

            <select
              id="ownerSelect"
              className={`${selectBaseCls} border-darkBlue/10`}
              value={selectedOwnerId}
              onChange={handleOwnerChange}
              disabled={loading || redirecting}
            >
              <option value="" disabled>
                -
              </option>
              {owners.map((owner) => (
                <option key={owner._id} value={owner._id}>
                  {owner.firstname} {owner.lastname}
                </option>
              ))}
            </select>
          </div>

          <div className={cardCls}>
            <div className="flex items-center gap-2 mb-3">
              <div className={headerIconCls}>
                <Store className="size-4 text-darkBlue/70" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-darkBlue">
                  {t("subscriptions.add.restaurant")}
                </p>
                <p className="text-xs text-darkBlue/50">
                  {t(
                    "subscriptions.add.restaurantHint",
                    "Sert à pré-remplir l’adresse de facturation.",
                  )}
                </p>
              </div>
            </div>

            <select
              id="restaurantSelect"
              className={`${selectBaseCls} border-darkBlue/10`}
              value={selectedRestaurantId}
              onChange={handleRestaurantChange}
              disabled={!selectedOwner || loading || redirecting}
            >
              <option value="" disabled>
                -
              </option>
              {ownerRestaurants.map((restaurant) => (
                <option key={restaurant._id} value={restaurant._id}>
                  {restaurant.name}
                </option>
              ))}
            </select>
          </div>

          <div className={`${cardCls} desktop:col-span-2`}>
            <div className="flex items-center gap-2 mb-3">
              <div className={headerIconCls}>
                <BadgeEuro className="size-4 text-darkBlue/70" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-darkBlue">
                  Plan principal
                </p>
                <p className="text-xs text-darkBlue/50">
                  Choisir l’abonnement de base mensuel.
                </p>
              </div>
            </div>

            <select
              id="subscriptionPlanSelect"
              className={`${selectBaseCls} border-darkBlue/10`}
              value={selectedPlanPriceId}
              onChange={handlePlanChange}
              disabled={!selectedRestaurantId || loading || redirecting}
            >
              <option value="" disabled>
                -
              </option>
              {plans.map((plan) => (
                <option
                  key={plan.id}
                  value={plan?.default_price?.id || ""}
                  disabled={!plan?.default_price?.id}
                >
                  {formatCatalogProductLabel(plan)}
                </option>
              ))}
            </select>
          </div>

          <div className={`${cardCls} desktop:col-span-2`}>
            <div className="flex items-center gap-2 mb-3">
              <div className={headerIconCls}>
                <Layers3 className="size-4 text-darkBlue/70" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-darkBlue">
                  Modules additionnels
                </p>
                <p className="text-xs text-darkBlue/50">
                  Les modules cochés seront ajoutés au total mensuel.
                </p>
              </div>
            </div>

            {addons.length === 0 ? (
              <div className="rounded-xl border border-darkBlue/10 bg-white/50 p-3 text-xs text-darkBlue/50">
                Aucun module Stripe disponible dans le catalogue.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 mobile:grid-cols-2">
                {addons.map((addon) => {
                  const priceId = addon?.default_price?.id || "";
                  const checked = selectedAddonPriceIds.includes(priceId);

                  return (
                    <label
                      key={addon.id}
                      className="flex items-start gap-3 rounded-xl border border-darkBlue/10 bg-white/60 px-3 py-3 hover:bg-darkBlue/5 transition cursor-pointer"
                    >
                      <input
                        className="mt-0.5 size-4 accent-blue"
                        type="checkbox"
                        checked={checked}
                        disabled={
                          !selectedRestaurantId || loading || redirecting
                        }
                        onChange={() => handleAddonToggle(priceId)}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-darkBlue">
                          {addon.name}
                        </span>
                        <span className="block text-xs text-darkBlue/50">
                          {formatCatalogProductLabel(addon)}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className={`${cardCls} desktop:col-span-2`}>
            <div className="flex items-center gap-2 mb-3">
              <div className={headerIconCls}>
                <Hash className="size-4 text-darkBlue/70" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-darkBlue">
                  Récapitulatif mensuel
                </p>
                <p className="text-xs text-darkBlue/50">
                  Le total facturé sur Stripe sera la somme du plan et des
                  modules sélectionnés.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 desktop:grid-cols-[1.4fr_1fr]">
              <div className="rounded-xl border border-darkBlue/10 bg-white/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-darkBlue/45">
                  Plan
                </p>
                <p className="mt-1 text-sm font-semibold text-darkBlue">
                  {selectedPlan ? selectedPlan.name : "Aucun plan sélectionné"}
                </p>

                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-darkBlue/45">
                  Modules
                </p>
                {selectedAddons.length === 0 ? (
                  <p className="mt-1 text-sm text-darkBlue/50">
                    Aucun module additionnel
                  </p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-1 text-sm text-darkBlue/80">
                    {selectedAddons.map((addon) => (
                      <li key={addon.id}>{addon.name}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-xl border border-blue/20 bg-blue/10 p-4 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue/70">
                    Total mensuel
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-darkBlue">
                    {totalAmount || 0} {currency || "EUR"}
                  </p>
                </div>

                {selectedRestaurant ? (
                  <p className="mt-4 text-xs text-darkBlue/55">
                    Facturation pour {selectedRestaurant.name}
                  </p>
                ) : (
                  <p className="mt-4 text-xs text-darkBlue/45">
                    Sélectionner un restaurant pour poursuivre.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className={stepRowBase}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className={stepLeftIcon}>
                  <CreditCard className="size-4 text-darkBlue/70" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-darkBlue">Étape 1</p>
                  <p className="text-xs text-darkBlue/50 mt-0.5">
                    Créer le mandat SEPA
                  </p>
                </div>
              </div>

              {isStep1Done ? (
                <span className={stepCheck}>
                  <CheckCircle2 className="size-4" />
                  OK
                </span>
              ) : (
                <button
                  onClick={createSetupIntent}
                  disabled={loading || redirecting || !step1Enabled}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue px-4 py-2 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {t("buttons.loading")}
                    </>
                  ) : (
                    <>
                      Créer
                      <ArrowRight className="size-4" />
                    </>
                  )}
                </button>
              )}
            </div>

            {!step1Enabled && !isStep1Done && (
              <div className="mt-3 text-xs text-darkBlue/50">
                Sélectionner un propriétaire, un restaurant et un plan pour
                activer l’étape 1.
              </div>
            )}
          </div>

          <div className={stepRowBase}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className={stepLeftIcon}>
                  <Hash className="size-4 text-darkBlue/70" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-darkBlue">Étape 2</p>
                  <p className="text-xs text-darkBlue/50 mt-0.5">Saisie IBAN</p>
                </div>
              </div>

              {isStep2Done ? (
                <span className={stepCheck}>
                  <CheckCircle2 className="size-4" />
                  OK
                </span>
              ) : (
                <span
                  className={`text-xs font-semibold ${
                    step2Enabled ? "text-darkBlue/60" : "text-darkBlue/30"
                  }`}
                >
                  {step2Enabled ? "En attente" : "Verrouillé"}
                </span>
              )}
            </div>

            {!step2Enabled ? (
              <div className="rounded-xl border border-darkBlue/10 bg-white/50 p-3 text-xs text-darkBlue/50 mt-3">
                Terminer l’étape 1 pour déverrouiller la saisie IBAN.
              </div>
            ) : isStep2Done ? null : (
              <Elements stripe={stripePromise} options={{ clientSecret }}>
                <SepaMandateForm
                  clientSecret={clientSecret}
                  handleSetupSuccess={handleSetupSuccess}
                  paymentMethodId={paymentMethodId}
                />
              </Elements>
            )}
          </div>

          <div className={stepRowBase}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className={stepLeftIcon}>
                  <BadgeEuro className="size-4 text-darkBlue/70" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-darkBlue">Étape 3</p>
                  <p className="text-xs text-darkBlue/50 mt-0.5">
                    Créer l’abonnement
                  </p>
                </div>
              </div>

              {isStep3Done ? (
                <span className={stepCheck}>
                  <CheckCircle2 className="size-4" />
                  OK
                </span>
              ) : (
                <span
                  className={`text-xs font-semibold ${
                    step3Enabled ? "text-darkBlue/60" : "text-darkBlue/30"
                  }`}
                >
                  {step3Enabled ? "En attente" : "Verrouillé"}
                </span>
              )}
            </div>

            <div className="mt-3">
              {!step3Enabled ? (
                <div className="rounded-xl border border-darkBlue/10 bg-white/50 p-3 text-xs text-darkBlue/50">
                  Terminer l’étape 2 pour déverrouiller la création.
                </div>
              ) : subscriptionCreated ? (
                <div className="rounded-xl border border-green/20 bg-green/10 p-3 text-sm text-green">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="size-4 mt-0.5" />
                    <div className="min-w-0">
                      <p className="font-semibold">
                        Abonnement créé avec succès
                      </p>
                      <p className="text-xs text-darkBlue/60 mt-0.5">
                        Redirection vers la liste des abonnements dans 3
                        secondes…
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  onClick={createSepaSubscription}
                  disabled={loading || redirecting}
                  className="inline-flex items-center gap-2 rounded-xl bg-green px-4 py-2 text-white text-sm font-semibold shadow-sm hover:bg-green/90 disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {t("buttons.loading")}
                    </>
                  ) : (
                    <>
                      Créer l’abonnement
                      <ArrowRight className="size-4" />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
