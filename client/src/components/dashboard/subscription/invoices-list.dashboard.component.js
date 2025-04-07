import { useRouter } from "next/router";

// I18N
import { useTranslation } from "next-i18next";

// COMPONENTS
import SimpleSkeletonComponent from "../../_shared/skeleton/simple-skeleton.component";

export default function InvoicesListComponent(props) {
  const { t } = useTranslation("subscription");
  const router = useRouter();
  const { locale } = router;

  if (props.isLoading) {
    return (
      <div className="bg-white p-6 rounded-lg drop-shadow-sm min-h-[100px] flex items-center">
        <SimpleSkeletonComponent />
      </div>
    );
  }

  const { invoices } = props?.subscriptionData;

  function formatDate(timestamp) {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }
  
  return (
    <div className="flex flex-col gap-4">
      {invoices?.length > 0 ? (
        <ul className=" flex flex-col gap-4 items-center">
          {invoices.map((invoice) => (
            <li
              key={invoice.id}
              className="bg-white p-6 rounded-lg drop-shadow-sm min-h-[100px] flex justify-between items-center w-full"
            >
              <div>
                <p className="text-base font-medium">
                  {t("text.invoiceDate")} {formatDate(invoice.date)}
                </p>
              </div>
              <a
                href={invoice.download_url}
                download
                rel="noopener noreferrer"
                className="text-blue px-4 py-2 rounded-lg hover:bg-blue-600 transition"
              >
                {t("buttons.download")}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="bg-white p-6 rounded-lg drop-shadow-sm min-h-[100px] flex items-center">
          {t("text.noInvoices")}
        </p>
      )}
    </div>
  );
}
