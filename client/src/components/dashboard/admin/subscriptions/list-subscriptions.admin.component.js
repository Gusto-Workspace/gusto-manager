import { useRouter } from "next/router";
import { useCallback, useMemo, useState } from "react";
import axios from "axios";
import { useTranslation } from "next-i18next";

// COMPONENTS
import SimpleSkeletonComponent from "@/components/_shared/skeleton/simple-skeleton.component";
import DoubleSkeletonComponent from "@/components/_shared/skeleton/double-skeleton.component";
import InvoicesDrawerSubscriptionsComponent from "./invoices-drawer-subscriptions.admin.component";
import { getAdminAuthConfig } from "../_shared/utils/admin-auth.utils";
import PageHeaderAdminComponent from "../_shared/page-header.admin.component";

// ICONS (lucide)
import {
  ArrowRight,
  Plus,
  Receipt,
  Store,
  AlertTriangle,
  Ban,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export default function ListSubscriptionsAdminComponent(props) {
  const { t } = useTranslation("admin");
  const router = useRouter();

  const subscriptions = useMemo(
    () => props?.ownersSubscriptionsList || [],
    [props?.ownersSubscriptionsList],
  );
  const pagination = props?.pagination || {};
  const currentPage = Number(pagination?.page || 1);
  const totalPages = Math.max(1, Number(pagination?.totalPages || 1));
  const totalSubscriptions = Number(
    pagination?.total ?? props?.ownersSubscriptionsList?.length ?? 0,
  );

  const [invoicesBySub, setInvoicesBySub] = useState({});
  const [loadingInvoicesId, setLoadingInvoicesId] = useState(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedSubId, setSelectedSubId] = useState(null);

  const [subscriptionToCancel, setSubscriptionToCancel] = useState(null);
  const [cancelMode, setCancelMode] = useState("period_end");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [resumeLoadingId, setResumeLoadingId] = useState(null);
  const [listActionError, setListActionError] = useState("");

  const selectedSub = useMemo(() => {
    if (!selectedSubId) return null;
    return subscriptions.find((s) => s.id === selectedSubId) || null;
  }, [selectedSubId, subscriptions]);

  const selectedInvoices = useMemo(() => {
    if (!selectedSubId) return [];
    return invoicesBySub[selectedSubId] || [];
  }, [invoicesBySub, selectedSubId]);
  const selectedInvoicesLoaded = useMemo(() => {
    if (!selectedSubId) return false;
    return Object.prototype.hasOwnProperty.call(invoicesBySub, selectedSubId);
  }, [invoicesBySub, selectedSubId]);

  function handleAddClick() {
    router.push(`/dashboard/admin/subscriptions/add`);
  }

  function handleEditClick(subscriptionId) {
    setDrawerOpen(false);
    setSelectedSubId(null);
    router.push(`/dashboard/admin/subscriptions/edit/${subscriptionId}`);
  }

  function handleChangePayerClick(restaurantId) {
    setDrawerOpen(false);
    setSelectedSubId(null);
    router.push(`/dashboard/admin/subscriptions/change-payer/${restaurantId}`);
  }

  const fmtStripeDate = useCallback((seconds) => {
    if (!seconds) return "-";
    return new Date(seconds * 1000).toLocaleDateString("fr-FR");
  }, []);

  const statusUi = useCallback(
    (status) => {
      if (status === "paid")
        return { cls: "text-green", label: t("subscriptions.list.paid") };
      if (status === "open")
        return { cls: "text-violet", label: t("subscriptions.list.sent") };
      if (status === "draft")
        return { cls: "text-lightGrey", label: t("subscriptions.list.draft") };
      return { cls: "text-red", label: t("subscriptions.list.unpaid") };
    },
    [t],
  );

  function closeDrawer() {
    setDrawerOpen(false);
    setSelectedSubId(null);
  }

  const loadSubscriptionInvoices = useCallback(
    async (subscriptionId) => {
      if (!subscriptionId) return;
      if (invoicesBySub[subscriptionId]) return;

      setLoadingInvoicesId(subscriptionId);
      try {
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/admin/subscription-invoices/${subscriptionId}`,
          getAdminAuthConfig(),
        );
        setInvoicesBySub((prev) => ({
          ...prev,
          [subscriptionId]: response.data.invoices || [],
        }));
      } catch (error) {
        console.error("Erreur lors de la récupération des factures :", error);
        setInvoicesBySub((prev) => ({ ...prev, [subscriptionId]: [] }));
      } finally {
        setLoadingInvoicesId(null);
      }
    },
    [invoicesBySub],
  );

  const openSubscriptionDrawer = useCallback((subscriptionId) => {
    setSelectedSubId(subscriptionId);
    setDrawerOpen(true);
  }, []);

  function openCancelModal(subscription) {
    setSubscriptionToCancel(subscription);
    setCancelMode(subscription?.cancelAtPeriodEnd ? "immediate" : "period_end");
    setCancelError("");
    setListActionError("");
  }

  function closeCancelModal() {
    if (cancelLoading) return;
    setSubscriptionToCancel(null);
    setCancelError("");
    setCancelMode("period_end");
  }

  async function confirmCancelSubscription() {
    if (!subscriptionToCancel?.id) return;

    setCancelLoading(true);
    setCancelError("");
    setListActionError("");

    try {
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/subscriptions/${subscriptionToCancel.id}/cancel`,
        { mode: cancelMode },
        getAdminAuthConfig(),
      );

      closeCancelModal();
      setDrawerOpen(false);
      setSelectedSubId(null);
      props.refreshSubscriptions?.({
        page: currentPage,
        limit: pagination?.limit || 20,
      });
    } catch (error) {
      console.error("Erreur lors de l'arrêt de l'abonnement:", error);
      setCancelError(
        error?.response?.data?.message ||
          t(
            "subscriptions.list.cancelError",
            "Erreur lors de l'arrêt de l'abonnement.",
          ),
      );
    } finally {
      setCancelLoading(false);
    }
  }

  async function resumeScheduledCancellation(subscriptionId) {
    if (!subscriptionId) return;

    setResumeLoadingId(subscriptionId);
    setListActionError("");

    try {
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/subscriptions/${subscriptionId}/cancel`,
        { mode: "resume" },
        getAdminAuthConfig(),
      );

      props.refreshSubscriptions?.({
        page: currentPage,
        limit: pagination?.limit || 20,
      });
    } catch (error) {
      console.error("Erreur lors de l'annulation de l'arrêt programmé:", error);
      setListActionError(
        error?.response?.data?.message ||
          t(
            "subscriptions.list.restoreCancelError",
            "Erreur lors de l'annulation de l'arrêt programmé.",
          ),
      );
    } finally {
      setResumeLoadingId(null);
    }
  }

  function changePage(nextPage) {
    setListActionError("");
    props.refreshSubscriptions?.({
      page: nextPage,
      limit: pagination?.limit || 20,
    });
  }

  const cancelEffectiveAt = useMemo(() => {
    return (
      subscriptionToCancel?.nextChargeAt ||
      subscriptionToCancel?.currentPeriodEnd ||
      subscriptionToCancel?.cancelAt ||
      0
    );
  }, [
    subscriptionToCancel?.cancelAt,
    subscriptionToCancel?.currentPeriodEnd,
    subscriptionToCancel?.nextChargeAt,
  ]);

  const subscriptionCards = useMemo(() => {
    return subscriptions.map((sub) => {
      const displayInvoiceStatus = sub?.displayInvoiceStatus || "";
      const invoiceStatusUi = displayInvoiceStatus
        ? statusUi(displayInvoiceStatus)
        : null;
      const periodEnd = sub.currentPeriodEnd || sub.nextChargeAt || 0;

      return (
        <li
          key={sub.id}
          className="group rounded-xl bg-white/50 border border-darkBlue/10 shadow-sm hover:shadow-md transition-shadow p-4 flex flex-col gap-3 overflow-hidden"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex items-start gap-2">
              <div className="mt-0.5 inline-flex size-9 items-center justify-center rounded-xl bg-darkBlue/5 border border-darkBlue/10">
                <Store className="size-4 text-darkBlue/70" />
              </div>

              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-darkBlue truncate">
                  {sub.restaurantName ||
                    t("subscriptions.list.noRestaurant", "Restaurant")}
                </h2>
                <p className="text-xs text-darkBlue/50 truncate">
                  {t("subscriptions.list.owner")} :{" "}
                  {sub.displayOwnerName || "-"}
                </p>
              </div>
            </div>

            {invoiceStatusUi ? (
              <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-darkBlue/10 bg-white/80 px-3 py-1 text-xs font-semibold text-darkBlue">
                <Receipt className="size-3.5 text-darkBlue/50" />
                <span className={invoiceStatusUi.cls}>
                  {invoiceStatusUi.label}
                </span>
              </span>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-darkBlue/10 bg-white/70 px-3 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-darkBlue truncate">
                {sub.plan?.name || sub.productName || "-"}
              </p>
              <p className="mt-1 text-xs text-darkBlue/55 truncate">
                {sub.addonCount > 0
                  ? t(
                      "subscriptions.list.additionalModulesCount",
                      "{{count}} module(s) supplémentaire(s)",
                      { count: sub.addonCount },
                    )
                  : t(
                      "subscriptions.list.noAdditionalModules",
                      "Aucun module supplémentaire",
                    )}
              </p>
            </div>

            <button
              onClick={() => openSubscriptionDrawer(sub.id)}
              className="inline-flex shrink-0 items-center justify-center rounded-full border border-darkBlue/10 bg-white p-2 transition hover:border-darkBlue/20 hover:bg-darkBlue/5"
              aria-label={t(
                "subscriptions.list.showDetails",
                "Afficher le détail de l'abonnement",
              )}
            >
              <ArrowRight className="size-4 text-darkBlue/65" />
            </button>
          </div>

          {sub.cancelAtPeriodEnd && periodEnd ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-red/20 bg-red/10 px-3 py-1 text-xs font-semibold text-red">
                <Ban className="size-3.5" />
                {t(
                  "subscriptions.list.scheduledStop",
                  "Arrêt programmé le",
                )}{" "}
                {fmtStripeDate(periodEnd)}
              </span>
            </div>
          ) : null}
        </li>
      );
    });
  }, [fmtStripeDate, openSubscriptionDrawer, statusUi, subscriptions, t]);

  return (
    <section className="flex flex-col gap-4 relative">
      <PageHeaderAdminComponent
        title={t("nav.subscriptions")}
        subtitle={`${totalSubscriptions} ${
          totalSubscriptions > 1 ? "abonnements" : "abonnement"
        }`}
        action={
          <button
            onClick={handleAddClick}
            className="inline-flex size-11 items-center justify-center rounded-2xl border border-blue/10 bg-[linear-gradient(180deg,#5F94FF_0%,#3978FF_100%)] text-white shadow-[0_14px_30px_rgba(57,120,255,0.22)] transition hover:scale-[1.01] hover:shadow-[0_18px_34px_rgba(57,120,255,0.28)] active:scale-[0.98]"
          >
            <Plus className="size-4" />
          </button>
        }
      />

      <div>
        {listActionError ? (
          <div className="mb-4 rounded-xl border border-red/20 bg-red/10 px-4 py-3 text-sm text-red">
            {listActionError}
          </div>
        ) : null}

        {props?.loading ? (
          <div className="grid grid-cols-1 gap-3 midTablet:grid-cols-2 desktop:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="rounded-2xl w-full bg-white/50 border border-darkBlue/10 shadow-sm p-5 flex flex-col gap-3"
              >
                <DoubleSkeletonComponent height="h-4" justify="justify-start" />
                <SimpleSkeletonComponent height="h-4" />
                <SimpleSkeletonComponent height="h-4" />
              </div>
            ))}
          </div>
        ) : subscriptions.length === 0 ? (
          <div className="rounded-xl bg-white/50 border border-darkBlue/10 shadow-sm p-6 text-center">
            <div className="mx-auto mb-3 size-11 rounded-2xl bg-darkBlue/5 flex items-center justify-center">
              <AlertTriangle className="size-5 text-darkBlue/60" />
            </div>
            <p className="text-sm text-darkBlue/70">
              {t(
                "subscriptions.list.empty",
                "Aucun abonnement pour le moment.",
              )}
            </p>
          </div>
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-3 midTablet:grid-cols-2 desktop:grid-cols-3">
              {subscriptionCards}
            </ul>

            {totalPages > 1 ? (
              <div className="mt-4 flex items-center justify-between rounded-2xl border border-darkBlue/10 bg-white/60 px-4 py-3 shadow-sm">
                <button
                  onClick={() => changePage(currentPage - 1)}
                  disabled={!pagination?.hasPrevPage || props?.loading}
                  className="inline-flex items-center gap-2 rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm font-semibold text-darkBlue transition hover:bg-darkBlue/5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="size-4" />
                  {t("subscriptions.list.previousPage", "Précédent")}
                </button>

                <p className="text-sm text-darkBlue/60">
                  {t("subscriptions.list.page", "Page")} {currentPage} /{" "}
                  {totalPages}
                </p>

                <button
                  onClick={() => changePage(currentPage + 1)}
                  disabled={!pagination?.hasNextPage || props?.loading}
                  className="inline-flex items-center gap-2 rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm font-semibold text-darkBlue transition hover:bg-darkBlue/5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("subscriptions.list.nextPage", "Suivant")}
                  <ChevronRight className="size-4" />
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <InvoicesDrawerSubscriptionsComponent
        open={drawerOpen}
        onClose={closeDrawer}
        sub={selectedSub}
        invoices={selectedInvoices}
        loading={!!selectedSubId && loadingInvoicesId === selectedSubId}
        invoicesLoaded={selectedInvoicesLoaded}
        t={t}
        fmtStripeDate={fmtStripeDate}
        statusUi={statusUi}
        actionErrorMessage={listActionError}
        resumeLoading={!!selectedSub?.id && resumeLoadingId === selectedSub.id}
        onEdit={handleEditClick}
        onChangePayer={handleChangePayerClick}
        onStop={openCancelModal}
        onResumeScheduledStop={resumeScheduledCancellation}
        onLoadInvoices={loadSubscriptionInvoices}
      />

      {subscriptionToCancel ? (
        <div className="fixed inset-0 z-[140] flex items-end justify-center bg-darkBlue/35 p-4 tablet:items-center">
          <div className="w-full max-w-[560px] rounded-2xl border border-darkBlue/10 bg-lightGrey shadow-[0_25px_80px_rgba(19,30,54,0.25)]">
            <div className="border-b border-darkBlue/10 bg-white px-5 py-4">
              <h3 className="text-base font-semibold text-darkBlue">
                {t("subscriptions.list.stopTitle", "Arrêter cet abonnement")}
              </h3>
              <p className="mt-1 text-sm text-darkBlue/60">
                {subscriptionToCancel.restaurantName || "-"}
              </p>
            </div>

            <div className="flex flex-col gap-3 px-5 py-4">
              <button
                type="button"
                onClick={() => setCancelMode("period_end")}
                disabled={!cancelEffectiveAt}
                className={`rounded-xl border px-4 py-3 text-left transition ${
                  cancelMode === "period_end"
                    ? "border-blue/30 bg-blue/10"
                    : "border-darkBlue/10 bg-white"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <p className="text-sm font-semibold text-darkBlue">
                  {t(
                    "subscriptions.list.stopAtPeriodEnd",
                    "À la fin de la période actuelle",
                  )}
                </p>
                <p className="mt-1 text-xs text-darkBlue/60">
                  {t("subscriptions.list.stopEffectiveDate", "Date d'effet")} :{" "}
                  {fmtStripeDate(cancelEffectiveAt)}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setCancelMode("immediate")}
                className={`rounded-xl border px-4 py-3 text-left transition ${
                  cancelMode === "immediate"
                    ? "border-red/25 bg-red/10"
                    : "border-darkBlue/10 bg-white"
                }`}
              >
                <p className="text-sm font-semibold text-darkBlue">
                  {t("subscriptions.list.stopImmediate", "Immédiatement")}
                </p>
                <p className="mt-1 text-xs text-darkBlue/60">
                  {t(
                    "subscriptions.list.stopImmediateHint",
                    "L'abonnement sera arrêté tout de suite sur Stripe.",
                  )}
                </p>
              </button>

              {cancelError ? (
                <div className="rounded-xl border border-red/20 bg-red/10 px-4 py-3 text-sm text-red">
                  {cancelError}
                </div>
              ) : null}
            </div>

            <div className="flex gap-2 border-t border-darkBlue/10 bg-white px-5 py-4">
              <button
                type="button"
                onClick={closeCancelModal}
                disabled={cancelLoading}
                className="flex-1 rounded-xl border border-darkBlue/10 bg-white px-4 py-2.5 text-sm font-semibold text-darkBlue transition hover:bg-darkBlue/5 disabled:opacity-60"
              >
                {t("buttons.cancel", "Annuler")}
              </button>

              <button
                type="button"
                onClick={confirmCancelSubscription}
                disabled={cancelLoading}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-red px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red/90 disabled:opacity-60"
              >
                {cancelLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t("buttons.loading")}
                  </>
                ) : cancelMode === "immediate" ? (
                  t("subscriptions.list.stopNow", "Arrêter immédiatement")
                ) : (
                  t(
                    "subscriptions.list.stopConfirmPeriodEnd",
                    "Programmer l'arrêt",
                  )
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
