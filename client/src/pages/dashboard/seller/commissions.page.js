import CommercialLayout from "@/components/commercial/commercial-layout";
import { SalesCommissions } from "@/components/commercial/sales-pilotage";

export default function SellerCommissionsPage() {
  return <CommercialLayout title="Mes commissions">{() => <SalesCommissions />}</CommercialLayout>;
}
export { getCommercialStaticProps as getStaticProps } from "@/components/commercial/commercial-translations.server";

