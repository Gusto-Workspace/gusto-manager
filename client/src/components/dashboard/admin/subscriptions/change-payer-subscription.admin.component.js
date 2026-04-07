import Link from "next/link";
import { useContext, useEffect, useState } from "react";
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

// ICONS
import {
  ArrowLeft,
  ArrowRight,
  BadgeEuro,
  CheckCircle2,
  CreditCard,
  Loader2,
  MapPin,
  Receipt,
  ShieldAlert,
  Store,
  User,
} from "lucide-react";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY);

function formatStripeDate(seconds) {
  if (!seconds) return null;
  return new Date(seconds * 1000).toLocaleDateString("fr-FR");
}

export default function ChangePayerSubscriptionAdminComponent() {
  const { t } = useTranslation("admin");
  const router = useRouter();
  const { adminContext } = useContext(GlobalContext);

  const restaurantId =
    typeof router.query.restaurantId === "string"
      ? router.query.restaurantId
      : "";

  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [loading, setLoading] = useState(false);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");

  const [clientSecret, setClientSecret] = useState(null);
  const [paymentMethodId, setPaymentMethodId] = useState(null);
  const [updateDone, setUpdateDone] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!router.isReady || !restaurantId) return;

    async function fetchPreview() {
      setLoadingPreview(true);
      setMessage("");
      setMessageType("info");
      setClientSecret(null);
      setPaymentMethodId(null);
      setUpdateDone(false);
      setRedirecting(false);

      try {
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/admin/restaurants/${restaurantId}/payer-change-preview`,
        );

        const nextPreview = response.data.preview || null;
        setPreview(nextPreview);
      } catch (error) {
        console.error("Erreur chargement changement payeur:", error);
        setPreview(null);
        setMessageType("error");
        setMessage(
          error?.response?.data?.message ||
            t(
              "subscriptions.payerChange.errors.preview",
              "Erreur lors du chargement du changement de payeur",
            ),
        );
      } finally {
        setLoadingPreview(false);
      }
    }

    fetchPreview();
  }, [restaurantId, router.isReady, t]);

  async function createSetupIntent() {
    if (!preview?.restaurant?.id) return;

    setLoading(true);
    setMessage("");
    setMessageType("info");

    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/create-setup-intent`,
        { restaurantId: preview.restaurant.id },
      );
      setClientSecret(response.data.clientSecret);
    } catch (error) {
      console.error("Erreur setup payer:", error);
      setMessageType("error");
      setMessage(
        error?.response?.data?.message ||
          t(
            "subscriptions.payerChange.errors.setup",
            "Erreur lors de la création du SetupIntent",
          ),
      );
    } finally {
      setLoading(false);
    }
  }

  function handleSetupSuccess(pmId) {
    setPaymentMethodId(pmId);
    setMessage("");
    setMessageType("info");
  }

  async function updatePayer() {
    if (!paymentMethodId) {
      setMessageType("error");
      setMessage(
        t(
          "subscriptions.payerChange.errors.paymentMethod",
          "Aucun mandat SEPA confirmé. Veuillez d'abord confirmer l’IBAN.",
        ),
      );
      return;
    }

    if (!preview?.restaurant?.id) return;

    setLoading(true);
    setMessage("");
    setMessageType("info");

    try {
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/update-subscription-payer-sepa`,
        {
          restaurantId: preview.restaurant.id,
          paymentMethodId,
          billingAddress: preview.restaurant.address,
          phone: preview.restaurant.phone,
          language: preview.restaurant.language,
        },
      );

      setUpdateDone(true);
      setMessageType("success");
      setMessage(
        t(
          "subscriptions.payerChange.done",
          "Le payeur de l’abonnement a été mis à jour. Redirection dans un instant…",
        ),
      );

      adminContext.fetchOwnersSubscriptionsList();
      adminContext.fetchRestaurantsList();
      adminContext.fetchOwnersList();

      setRedirecting(true);
      setTimeout(() => {
        router.push("/dashboard/admin/subscriptions");
      }, 3000);
    } catch (error) {
      console.error("Erreur changement payeur:", error);
      setMessageType("error");
      setMessage(
        error?.response?.data?.message ||
          t(
            "subscriptions.payerChange.errors.update",
            "Erreur lors de la mise à jour du payeur",
          ),
      );
    } finally {
      setLoading(false);
    }
  }

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
          <ShieldAlert className="size-4 mt-0.5" />
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

  const cardCls =
    "rounded-2xl border border-darkBlue/10 bg-white/60 shadow-sm p-4";
  const headerIconCls =
    "inline-flex size-9 items-center justify-center rounded-xl bg-darkBlue/5 border border-darkBlue/10";
  const stepCls =
    "rounded-2xl bg-white/60 border border-darkBlue/10 shadow-sm p-4";

  const isStep1Done = !!clientSecret;
  const isStep2Done = !!paymentMethodId;
  const isStep3Done = !!updateDone;
  const chargesImmediately =
    preview?.subscription?.chargesImmediately !== false;

  if (loadingPreview) {
    return (
      <section className="flex flex-col gap-4">
        <div className="sticky top-6 z-20 ml-16 mobile:ml-12 tablet:ml-0 px-4 pt-4 pb-3 bg-white/70 backdrop-blur border-b rounded-xl border-darkBlue/10">
          <h1 className="text-lg font-semibold text-darkBlue">
            {t(
              "subscriptions.payerChange.loading",
              "Chargement du changement de payeur...",
            )}
          </h1>
        </div>

        <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-6 shadow-sm">
          <div className="flex items-center gap-3 text-darkBlue/70">
            <Loader2 className="size-5 animate-spin" />
            <span>
              {t(
                "subscriptions.payerChange.loading",
                "Chargement du changement de payeur...",
              )}
            </span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="sticky top-6 z-20 ml-16 mobile:ml-12 tablet:ml-0 px-4 pt-4 pb-3 bg-white/70 backdrop-blur border-b rounded-xl border-darkBlue/10">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-darkBlue truncate">
              {t(
                "subscriptions.payerChange.title",
                "Changer le payeur du restaurant",
              )}
            </h1>
            <p className="text-xs text-darkBlue/50">
              {t(
                "subscriptions.payerChange.subtitle",
                "Collecter le mandat SEPA du nouveau propriétaire et l'appliquer à l'abonnement existant.",
              )}
            </p>
          </div>

          <Link
            href="/dashboard/admin/subscriptions"
            className="inline-flex items-center gap-2 rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm font-semibold text-darkBlue transition hover:bg-darkBlue/5"
          >
            <ArrowLeft className="size-4" />
            <span className="hidden mobile:inline">
              {t("subscriptions.payerChange.back", "Retour aux abonnements")}
            </span>
          </Link>
        </div>
      </div>

      {banner}

      {preview && (
        <>
          <div className="grid grid-cols-1 gap-3 desktop:grid-cols-2">
            <div className={cardCls}>
              <div className="flex items-center gap-2 mb-3">
                <div className={headerIconCls}>
                  <Receipt className="size-4 text-darkBlue/70" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-darkBlue">
                    {t("subscriptions.payerChange.source", "Abonnement actuel")}
                  </p>
                  <p className="text-xs text-darkBlue/50">
                    {preview.subscription?.plan?.name || "-"}
                    {preview.subscription?.totalAmount != null
                      ? ` — ${preview.subscription.totalAmount} ${preview.subscription.currency}`
                      : ""}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 text-sm text-darkBlue/80">
                <div className="flex items-start gap-2">
                  <Store className="size-4 mt-0.5 text-darkBlue/40" />
                  <p>{preview.restaurant?.name || "-"}</p>
                </div>
                <div className="flex items-start gap-2">
                  <User className="size-4 mt-0.5 text-darkBlue/40" />
                  <p>
                    {preview.owner?.firstname} {preview.owner?.lastname}
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <CreditCard className="size-4 mt-0.5 text-darkBlue/40" />
                  <p>
                    {t(
                      "subscriptions.payerChange.currentPayer",
                      "Payeur actuel",
                    )}{" "}
                    : {preview.subscription?.currentPayerOwnerName || "-"}
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="size-4 mt-0.5 text-darkBlue/40" />
                  <p>
                    {t(
                      "subscriptions.payerChange.nextCharge",
                      "Premier prélèvement",
                    )}{" "}
                    :{" "}
                    {chargesImmediately
                      ? t("subscriptions.payerChange.immediate", "Immédiat")
                      : formatStripeDate(
                          preview.subscription?.currentPeriodEnd,
                        ) || "-"}
                  </p>
                </div>
              </div>
            </div>

            <div className={cardCls}>
              <div className="flex items-center gap-2 mb-3">
                <div className={headerIconCls}>
                  <BadgeEuro className="size-4 text-darkBlue/70" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-darkBlue">
                    {t(
                      "subscriptions.payerChange.target",
                      "Nouveau mandat attendu",
                    )}
                  </p>
                  <p className="text-xs text-darkBlue/50">
                    {t(
                      "subscriptions.payerChange.targetHint",
                      "Le mandat SEPA confirmé ci-dessous sera utilisé immédiatement pour redémarrer la facturation du restaurant.",
                    )}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-darkBlue/10 bg-white/70 p-3 text-sm text-darkBlue/80">
                <p>{t("subscriptions.payerChange.flow")}</p>
              </div>

              <div className="mt-3 rounded-xl border border-darkBlue/10 bg-white/70 p-3 text-sm text-darkBlue/80">
                <p className="font-semibold text-darkBlue">
                  Configuration conservée
                </p>
                <p className="mt-1">
                  {preview.subscription?.plan?.name || "-"} —{" "}
                  {preview.subscription?.totalAmount || 0}{" "}
                  {preview.subscription?.currency || "EUR"}
                </p>

                {preview.subscription?.addons?.length ? (
                  <p className="mt-2 text-xs text-darkBlue/55">
                    Modules :{" "}
                    {preview.subscription.addons
                      .map((addon) => addon.name)
                      .join(", ")}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-darkBlue/45">
                    Aucun module additionnel
                  </p>
                )}
              </div>

              {preview.restaurant?.address?.line1 && (
                <div className="mt-3 flex items-start gap-2 text-sm text-darkBlue/80">
                  <MapPin className="size-4 mt-0.5 text-darkBlue/40" />
                  <p>
                    {preview.restaurant.address.line1},{" "}
                    {preview.restaurant.address.zipCode}{" "}
                    {preview.restaurant.address.city}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className={stepCls}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={headerIconCls}>
                    <CreditCard className="size-4 text-darkBlue/70" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-darkBlue">
                      Étape 1
                    </p>
                    <p className="text-xs text-darkBlue/50 mt-0.5">
                      {t(
                        "subscriptions.payerChange.step1",
                        "Créer le SetupIntent",
                      )}
                    </p>
                  </div>
                </div>

                {isStep1Done ? (
                  <span className="inline-flex items-center gap-1 text-green text-sm font-semibold">
                    <CheckCircle2 className="size-4" />
                    OK
                  </span>
                ) : (
                  <button
                    onClick={createSetupIntent}
                    disabled={loading || redirecting}
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
            </div>

            <div className={stepCls}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={headerIconCls}>
                    <ShieldAlert className="size-4 text-darkBlue/70" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-darkBlue">
                      Étape 2
                    </p>
                    <p className="text-xs text-darkBlue/50 mt-0.5">
                      {t(
                        "subscriptions.payerChange.step2",
                        "Confirmer le nouveau mandat SEPA",
                      )}
                    </p>
                  </div>
                </div>

                {isStep2Done ? (
                  <span className="inline-flex items-center gap-1 text-green text-sm font-semibold">
                    <CheckCircle2 className="size-4" />
                    OK
                  </span>
                ) : (
                  <span
                    className={`text-xs font-semibold ${
                      isStep1Done ? "text-darkBlue/60" : "text-darkBlue/30"
                    }`}
                  >
                    {isStep1Done ? "En attente" : "Verrouillé"}
                  </span>
                )}
              </div>

              {!isStep1Done ? (
                <div className="mt-3 rounded-xl border border-darkBlue/10 bg-white/50 p-3 text-xs text-darkBlue/50">
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

            <div className={stepCls}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={headerIconCls}>
                    <Receipt className="size-4 text-darkBlue/70" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-darkBlue">
                      Étape 3
                    </p>
                    <p className="text-xs text-darkBlue/50 mt-0.5">
                      {t(
                        "subscriptions.payerChange.step3",
                        "Appliquer le nouveau payeur",
                      )}
                    </p>
                  </div>
                </div>

                {isStep3Done ? (
                  <span className="inline-flex items-center gap-1 text-green text-sm font-semibold">
                    <CheckCircle2 className="size-4" />
                    OK
                  </span>
                ) : (
                  <button
                    onClick={updatePayer}
                    disabled={!isStep2Done || loading || redirecting}
                    className="inline-flex items-center gap-2 rounded-xl bg-red px-4 py-2 text-white text-sm font-semibold shadow-sm hover:bg-red/90 disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        {t("buttons.loading")}
                      </>
                    ) : (
                      t(
                        "subscriptions.payerChange.cta",
                        "Mettre à jour le payeur",
                      )
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
