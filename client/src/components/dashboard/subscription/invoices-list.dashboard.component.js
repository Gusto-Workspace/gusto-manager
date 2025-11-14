import { useRouter } from "next/router";

// I18N
import { useTranslation } from "next-i18next";

// COMPONENTS
import SimpleSkeletonComponent from "../../_shared/skeleton/simple-skeleton.component";

export default function InvoicesListComponent(props) {
  const { t } = useTranslation("subscription");
  const router = useRouter();
  const { locale } = router;

  const cardSkeletonCls =
    "w-full rounded-2xl border border-darkBlue/10 bg-white/80 px-4 py-4 tablet:px-6 tablet:py-5 shadow-[0_18px_45px_rgba(19,30,54,0.06)] flex items-center";
  const listWrapCls = "flex flex-col gap-4";
  const itemCls =
    "w-full rounded-2xl border border-darkBlue/10 bg-white/80 px-4 py-4 tablet:px-6 tablet:py-4 shadow-[0_12px_30px_rgba(19,30,54,0.04)] flex items-center justify-between gap-4";
  const dateTextCls = "text-sm tablet:text-base font-medium text-darkBlue";
  const btnDownloadCls =
    "inline-flex items-center justify-center rounded-xl bg-blue px-4 py-2 text-xs tablet:text-sm font-medium text-white shadow hover:bg-blue/90 transition";
  const emptyCardCls =
    "w-full rounded-2xl border border-dashed border-darkBlue/10 bg-white/70 px-4 py-5 tablet:px-6 tablet:py-6 text-sm text-center text-darkBlue/60";

  if (props.isLoading) {
    return (
      <section className={cardSkeletonCls}>
        <SimpleSkeletonComponent />
      </section>
    );
  }

  const { invoices } = props?.subscriptionData || {};

  function formatDate(timestamp) {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  if (!invoices || invoices.length === 0) {
    return (
      <section className={emptyCardCls}>
        {t("text.noInvoices")}
      </section>
    );
  }

  return (
    <section className={listWrapCls}>
      <ul className="flex flex-col gap-3">
        {invoices.map((invoice) => (
          <li key={invoice.id} className={itemCls}>
            <div className="flex flex-col gap-1">
              <p className={dateTextCls}>
                {t("text.invoiceDate")} {formatDate(invoice.date)}
              </p>
              {invoice.amount && invoice.currency && (
                <p className="text-xs text-darkBlue/60">
                  {invoice.amount}{" "}
                  {invoice.currency === "eur" || invoice.currency === "EUR"
                    ? "€"
                    : invoice.currency.toUpperCase()}
                </p>
              )}
            </div>

            <a
              href={invoice.download_url}
              download
              rel="noopener noreferrer"
              className={btnDownloadCls}
            >
              {t("buttons.download")}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
