import { useRouter } from "next/router";
import { useMemo, useState, useEffect } from "react";
import axios from "axios";
import { useTranslation } from "next-i18next";

// COMPONENTS
import SimpleSkeletonComponent from "@/components/_shared/skeleton/simple-skeleton.component";
import DoubleSkeletonComponent from "@/components/_shared/skeleton/double-skeleton.component";

// ICONS (lucide)
import {
  Plus,
  Receipt,
  Calendar,
  Mail,
  Store,
  Loader2,
  ChevronDown,
  ExternalLink,
  AlertTriangle,
  Tag,
  X,
} from "lucide-react";
import InvoicesDrawerSubscriptionsComponent from "./invoices-drawer-subscriptions.admin.component";

export default function ListSubscriptionsAdminComponent(props) {
  const { t } = useTranslation("admin");
  const router = useRouter();

  const subscriptions = useMemo(
    () => props?.ownersSubscriptionsList || [],
    [props?.ownersSubscriptionsList],
  );

  const [invoicesBySub, setInvoicesBySub] = useState({});
  const [loadingInvoicesId, setLoadingInvoicesId] = useState(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedSubId, setSelectedSubId] = useState(null);

  const selectedSub = useMemo(() => {
    if (!selectedSubId) return null;
    return subscriptions.find((s) => s.id === selectedSubId) || null;
  }, [selectedSubId, subscriptions]);

  const selectedInvoices = useMemo(() => {
    if (!selectedSubId) return [];
    return invoicesBySub[selectedSubId] || [];
  }, [invoicesBySub, selectedSubId]);

  function handleAddClick() {
    router.push(`/dashboard/admin/subscriptions/add`);
  }

  const fmtStripeDate = (seconds) => {
    if (!seconds) return "-";
    return new Date(seconds * 1000).toLocaleDateString("fr-FR");
  };

  const statusUi = (status) => {
    if (status === "paid")
      return { cls: "text-green", label: t("subscriptions.list.paid") };
    if (status === "open")
      return { cls: "text-violet", label: t("subscriptions.list.sent") };
    if (status === "draft")
      return { cls: "text-lightGrey", label: t("subscriptions.list.draft") };
    return { cls: "text-red", label: t("subscriptions.list.unpaid") };
  };

  function closeDrawer() {
    setDrawerOpen(false);
    // optionnel : ne pas reset selectedSubId pour garder l’item sélectionné
    // setSelectedSubId(null);
  }

  async function openInvoicesDrawer(subscriptionId) {
    setSelectedSubId(subscriptionId);
    setDrawerOpen(true);

    // déjà en cache => pas besoin de refetch
    if (invoicesBySub[subscriptionId]) return;

    setLoadingInvoicesId(subscriptionId);
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/subscription-invoices/${subscriptionId}`,
      );
      setInvoicesBySub((prev) => ({
        ...prev,
        [subscriptionId]: response.data.invoices || [],
      }));
    } catch (error) {
      console.error("Erreur lors de la récupération des factures :", error);
      // on met quand même un tableau vide pour éviter refetch infini au clic
      setInvoicesBySub((prev) => ({ ...prev, [subscriptionId]: [] }));
    } finally {
      setLoadingInvoicesId(null);
    }
  }

  return (
    <section className="flex flex-col gap-4 relative">
      {/* Header sticky */}
      <div className="sticky top-6 z-20 ml-16 mobile:ml-12 tablet:ml-0 px-4 pt-4 pb-3 bg-white/50 backdrop-blur border-b rounded-xl border-darkBlue/10">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-darkBlue truncate">
              {t("nav.subscriptions")}
            </h1>
            <p className="text-xs text-darkBlue/50">
              {subscriptions.length}{" "}
              {subscriptions.length > 1 ? "abonnements" : "abonnement"}
            </p>
          </div>

          <button
            onClick={handleAddClick}
            className="inline-flex items-center gap-2 rounded-xl bg-blue px-3 py-2 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 active:scale-[0.98] transition"
          >
            <Plus className="size-4" />
            <span className="hidden mobile:inline">
              {t("subscriptions.list.add")}
            </span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div>
        {props?.loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="rounded-2xl bg-white/50 border border-darkBlue/10 shadow-sm p-5 flex flex-col gap-3"
              >
                <DoubleSkeletonComponent justify="justify-start" />
                <SimpleSkeletonComponent />
                <SimpleSkeletonComponent />
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
          <ul className="grid grid-cols-1 gap-3 midTablet:grid-cols-2 desktop:grid-cols-3">
            {subscriptions.map((sub) => {
              const lastInvoice = sub?.latest_invoice || null;
              const st = statusUi(lastInvoice?.status);
              const isLoadingInv = loadingInvoicesId === sub.id;
              const isSelected = selectedSubId === sub.id;

              return (
                <li
                  key={sub.id}
                  className={`group rounded-xl bg-white/50 border border-darkBlue/10 shadow-sm hover:shadow-md transition-shadow p-4 flex flex-col gap-3 overflow-hidden`}
                >
                  {/* Header row */}
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
                          {lastInvoice?.customer_name || "-"}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => openInvoicesDrawer(sub.id)}
                      className="inline-flex items-center justify-center rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition p-2"
                      aria-label={t(
                        "subscriptions.list.showInvoices",
                        "Afficher les factures",
                      )}
                    >
                      {isLoadingInv ? (
                        <Loader2 className="size-4 animate-spin text-darkBlue/70" />
                      ) : (
                        <ExternalLink className="size-4 text-darkBlue/70" />
                      )}
                    </button>
                  </div>

                  {/* Subscription data */}
                  <span className="w-fit inline-flex items-center gap-2 rounded-full border border-darkBlue/10 bg-white/70 px-3 py-1 text-xs font-semibold text-darkBlue">
                    <Tag className="size-3.5 text-darkBlue/50" />
                    <span className="truncate">
                      {sub.productName || "-"} — {sub.productAmount}{" "}
                      {sub.productCurrency}
                    </span>
                  </span>

                  <div className="flex flex-col gap-2">
                    {lastInvoice?.status && (
                      <span className="inline-flex items-center gap-2 pt-2 text-xs font-semibold text-darkBlue">
                        <Receipt className="size-3.5 text-darkBlue/50" />
                        <span className={st.cls}>{st.label}</span>
                      </span>
                    )}

                    <div className="flex items-start gap-2 text-sm text-darkBlue/80">
                      <Mail className="size-4 mt-0.5 text-darkBlue/40" />
                      <p className="min-w-0 truncate">
                        {lastInvoice?.customer_email || "-"}
                      </p>
                    </div>

                    {lastInvoice?.created ? (
                      <div className="flex items-start gap-2 text-sm text-darkBlue/80">
                        <Calendar className="size-4 mt-0.5 text-darkBlue/40" />
                        <p className="min-w-0 truncate">
                          {t("subscriptions.list.lastInvoice")} :{" "}
                          {fmtStripeDate(lastInvoice.created)}
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2 text-sm text-darkBlue/80">
                        <Calendar className="size-4 mt-0.5 text-darkBlue/40" />
                        <p className="italic text-darkBlue/40">-</p>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <InvoicesDrawerSubscriptionsComponent
        open={drawerOpen}
        onClose={closeDrawer}
        sub={selectedSub}
        invoices={selectedInvoices}
        loading={!!selectedSubId && loadingInvoicesId === selectedSubId}
        t={t}
        fmtStripeDate={fmtStripeDate}
        statusUi={statusUi}
      />
    </section>
  );
}
