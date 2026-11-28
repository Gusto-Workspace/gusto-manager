import CommercialLayout from "@/components/commercial/commercial-layout";
import SalesDocuments from "@/components/commercial/sales-documents";

export default function SellerContractsPage() {
  return <CommercialLayout title="Mes contrats">{() => <SalesDocuments type="CONTRACT" />}</CommercialLayout>;
}
export { getCommercialStaticProps as getStaticProps } from "@/components/commercial/commercial-translations.server";

