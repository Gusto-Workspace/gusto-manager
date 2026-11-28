import CommercialLayout from "@/components/commercial/commercial-layout";
import SalesDocuments from "@/components/commercial/sales-documents";

export default function SellerInvoicesPage() {
  return <CommercialLayout title="Mes factures">{() => <SalesDocuments type="INVOICE" />}</CommercialLayout>;
}
export { getCommercialStaticProps as getStaticProps } from "@/components/commercial/commercial-translations.server";
