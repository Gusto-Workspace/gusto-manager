import Link from "next/link";
import { useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import { useTranslation } from "next-i18next";

import { GlobalContext } from "@/contexts/global.context";

import {
  computeCatalogTotal,
  formatCatalogProductLabel,
  splitSubscriptionCatalogProducts,
} from "../_shared/utils/subscription-catalog.utils";

import {
  ArrowLeft,
  BadgeEuro,
  Calendar,
  CheckCircle2,
  Layers3,
  Loader2,
  Store,
  User,
} from "lucide-react";

function formatStripeDate(seconds) {
  if (!seconds) return null;
  return new Date(seconds * 1000).toLocaleDateString("fr-FR");
}

export default function EditSubscriptionAdminComponent() {
  const { t } = useTranslation("admin");
  const router = useRouter();
  const { adminContext } = useContext(GlobalContext);

  const subscriptionId =
    typeof router.query.subscriptionId === "string"
      ? router.query.subscriptionId
      : "";

  const catalogProducts = useMemo(
    () => adminContext?.subscriptionsList || [],
    [adminContext],
  );
  const { plans, addons } = useMemo(
    () => splitSubscriptionCatalogProducts(catalogProducts),
    [catalogProducts],
  );

  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");
  const [selectedPlanPriceId, setSelectedPlanPriceId] = useState("");
  const [selectedAddonPriceIds, setSelectedAddonPriceIds] = useState([]);
  const [updateDone, setUpdateDone] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!router.isReady || !subscriptionId) return;

    async function fetchPreview() {
      setLoadingPreview(true);
      setMessage("");
      setMessageType("info");
      setUpdateDone(false);
      setRedirecting(false);

      try {
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/admin/subscriptions/${subscriptionId}/edit-preview`,
        );

        const nextPreview = response.data.preview || null;
        setPreview(nextPreview);
        setSelectedPlanPriceId(nextPreview?.subscription?.planPriceId || "");
        setSelectedAddonPriceIds(
          nextPreview?.subscription?.addonPriceIds || [],
        );
      } catch (error) {
        console.error("Erreur chargement configuration abonnement:", error);
        setPreview(null);
        setMessageType("error");
        setMessage(
          error?.response?.data?.message ||
            "Erreur lors du chargement de la configuration d'abonnement",
        );
      } finally {
        setLoadingPreview(false);
      }
    }

    fetchPreview();
  }, [router.isReady, subscriptionId]);

  const { selectedPlan, selectedAddons, totalAmount, currency } = useMemo(
    () =>
      computeCatalogTotal({
        products: catalogProducts,
        selectedPlanPriceId,
        selectedAddonPriceIds,
      }),
    [catalogProducts, selectedPlanPriceId, selectedAddonPriceIds],
  );

  const currentPlanMissingFromCatalog =
    Boolean(preview?.subscription?.planPriceId) &&
    !plans.some(
      (product) => product?.default_price?.id === selectedPlanPriceId,
    );

  async function updateSubscriptionConfiguration() {
    if (!selectedPlanPriceId) {
      setMessageType("error");
      setMessage("Sélectionner un plan principal avant de continuer.");
      return;
    }

    setLoading(true);
    setMessage("");
    setMessageType("info");

    try {
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/update-subscription-configuration`,
        {
          subscriptionId,
          planPriceId: selectedPlanPriceId,
          addonPriceIds: selectedAddonPriceIds,
        },
      );

      setUpdateDone(true);
      setMessageType("success");
      setMessage(
        "La configuration de l’abonnement a été enregistrée pour la prochaine échéance.",
      );

      adminContext.fetchOwnersSubscriptionsList();

      setRedirecting(true);
      setTimeout(() => {
        router.push("/dashboard/admin/subscriptions");
      }, 3000);
    } catch (error) {
      console.error("Erreur mise à jour abonnement:", error);
      setMessageType("error");
      setMessage(
        error?.response?.data?.message ||
          "Erreur lors de la mise à jour de l'abonnement",
      );
    } finally {
      setLoading(false);
    }
  }

  const cardCls =
    "rounded-2xl border border-darkBlue/10 bg-white/60 shadow-sm p-4";
  const headerIconCls =
    "inline-flex size-9 items-center justify-center rounded-xl bg-darkBlue/5 border border-darkBlue/10";

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
        ) : (
          <BadgeEuro className="size-4 mt-0.5 text-darkBlue/60" />
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

  if (loadingPreview) {
    return (
      <section className="flex flex-col gap-4">
        <div className="sticky top-6 z-20 ml-16 mobile:ml-12 tablet:ml-0 px-4 pt-4 pb-3 bg-white/70 backdrop-blur border-b rounded-xl border-darkBlue/10">
          <h1 className="text-lg font-semibold text-darkBlue">
            Chargement de la configuration d'abonnement...
          </h1>
        </div>

        <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-6 shadow-sm">
          <div className="flex items-center gap-3 text-darkBlue/70">
            <Loader2 className="size-5 animate-spin" />
            <span>Chargement de la configuration d'abonnement...</span>
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
              Modifier un abonnement
            </h1>
            <p className="text-xs text-darkBlue/50">
              Les changements de plan et de modules s'appliqueront à la
              prochaine échéance, sans prorata immédiat.
            </p>
          </div>

          <Link
            href="/dashboard/admin/subscriptions"
            className="inline-flex items-center gap-2 rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm font-semibold text-darkBlue transition hover:bg-darkBlue/5"
          >
            <ArrowLeft className="size-4" />
            <span className="hidden mobile:inline">Retour aux abonnements</span>
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
                  <Store className="size-4 text-darkBlue/70" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-darkBlue">
                    Abonnement actuel
                  </p>
                  <p className="text-xs text-darkBlue/50">
                    {preview.restaurant?.name || "-"}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 text-sm text-darkBlue/80">
                <div className="flex items-start gap-2">
                  <User className="size-4 mt-0.5 text-darkBlue/40" />
                  <p>
                    {preview.owner?.firstname} {preview.owner?.lastname}
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <BadgeEuro className="size-4 mt-0.5 text-darkBlue/40" />
                  <p>
                    {preview.subscription?.plan?.name || "Aucun plan"} —{" "}
                    {preview.subscription?.totalAmount || 0}{" "}
                    {preview.subscription?.currency || "EUR"}
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <Calendar className="size-4 mt-0.5 text-darkBlue/40" />
                  <p>
                    Prochaine échéance :{" "}
                    {formatStripeDate(
                      preview.subscription?.nextChargeAt ||
                        preview.subscription?.currentPeriodEnd,
                    ) || "-"}
                  </p>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-darkBlue/10 bg-white/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-darkBlue/45">
                  Modules actuels
                </p>
                {preview.subscription?.addons?.length ? (
                  <ul className="mt-2 flex flex-col gap-1 text-sm text-darkBlue/80">
                    {preview.subscription.addons.map((addon) => (
                      <li key={addon.priceId}>{addon.name}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-darkBlue/50">
                    Aucun module additionnel
                  </p>
                )}
              </div>
            </div>

            <div className={cardCls}>
              <div className="flex items-center gap-2 mb-3">
                <div className={headerIconCls}>
                  <Layers3 className="size-4 text-darkBlue/70" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-darkBlue">
                    Nouvelle configuration
                  </p>
                  <p className="text-xs text-darkBlue/50">
                    Choisir le plan et les modules qui seront facturés à la
                    prochaine échéance.
                  </p>
                </div>
              </div>

              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-darkBlue/50">
                Plan principal
              </label>

              <select
                className="w-full rounded-xl border border-darkBlue/10 bg-white/70 px-3 py-2 text-sm text-darkBlue outline-none transition focus:border-blue/40"
                value={selectedPlanPriceId}
                onChange={(e) => {
                  setSelectedPlanPriceId(e.target.value);
                  setUpdateDone(false);
                }}
                disabled={loading || redirecting}
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

              {currentPlanMissingFromCatalog && (
                <div className="mt-3 rounded-xl border border-orange/20 bg-orange/10 p-3 text-xs text-orange">
                  Le plan actuellement associé à cet abonnement n'est pas dans
                  le catalogue actif. Choisis un plan ci-dessus avant
                  d'enregistrer.
                </div>
              )}

              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-darkBlue/50">
                  Modules additionnels
                </p>

                <div className="grid grid-cols-1 gap-2">
                  {addons.map((addon) => {
                    const priceId = addon?.default_price?.id || "";
                    const checked = selectedAddonPriceIds.includes(priceId);

                    return (
                      <label
                        key={addon.id}
                        className="flex items-start gap-3 rounded-xl border border-darkBlue/10 bg-white/70 px-3 py-3 cursor-pointer hover:bg-darkBlue/5 transition"
                      >
                        <input
                          className="mt-0.5 size-4 accent-blue"
                          type="checkbox"
                          checked={checked}
                          disabled={loading || redirecting}
                          onChange={() => {
                            setSelectedAddonPriceIds((prev) => {
                              if (prev.includes(priceId)) {
                                return prev.filter(
                                  (entry) => entry !== priceId,
                                );
                              }

                              return [...prev, priceId];
                            });
                            setUpdateDone(false);
                          }}
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
                  Total à la prochaine échéance
                </p>
                <p className="text-xs text-darkBlue/50">
                  Aucun montant n'est facturé immédiatement.
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
                <p className="mt-4 text-xs text-darkBlue/55">
                  Application prévue le{" "}
                  {formatStripeDate(
                    preview.subscription?.nextChargeAt ||
                      preview.subscription?.currentPeriodEnd,
                  ) || "-"}
                </p>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              {updateDone ? (
                <span className="inline-flex items-center gap-2 rounded-xl border border-green/20 bg-green/10 px-4 py-2 text-sm font-semibold text-green">
                  <CheckCircle2 className="size-4" />
                  Configuration enregistrée
                </span>
              ) : (
                <button
                  onClick={updateSubscriptionConfiguration}
                  disabled={!selectedPlanPriceId || loading || redirecting}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue px-4 py-2 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {t("buttons.loading")}
                    </>
                  ) : (
                    "Enregistrer pour la prochaine échéance"
                  )}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
