import CommercialLayout from "@/components/commercial/commercial-layout";
import SalesResources from "@/components/commercial/sales-resources";

export default function SellerResourcesPage() {
  return <CommercialLayout title="Ressources">{() => <SalesResources />}</CommercialLayout>;
}
export { getCommercialStaticProps as getStaticProps } from "@/components/commercial/commercial-translations.server";

