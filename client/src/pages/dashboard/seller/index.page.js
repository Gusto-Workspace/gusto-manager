import CommercialLayout from "@/components/commercial/commercial-layout";
import { SalesDashboard } from "@/components/commercial/sales-pilotage";

export default function CommercialDashboardPage() {
  return <CommercialLayout title="Tableau de bord">
    {() => <SalesDashboard />}
  </CommercialLayout>;
}
export { getCommercialStaticProps as getStaticProps } from "@/components/commercial/commercial-translations.server";

