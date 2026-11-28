import CommercialLayout from "@/components/commercial/commercial-layout";
import SalesDocuments from "@/components/commercial/sales-documents";

export default function SellerQuotesPage() {
  return <CommercialLayout title="Mes devis">{() => <SalesDocuments type="QUOTE" />}</CommercialLayout>;
}
export { getCommercialStaticProps as getStaticProps } from "@/components/commercial/commercial-translations.server";

