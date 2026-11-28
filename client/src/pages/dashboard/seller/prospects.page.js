import CommercialLayout from "@/components/commercial/commercial-layout";
import ProspectsBoard from "@/components/commercial/prospects-board";
import { useRouter } from "next/router";

export default function CommercialProspectsPage() {
  const { query } = useRouter();
  const id = typeof query.prospectId === "string" && /^[0-9a-f]{24}$/i.test(query.prospectId) ? query.prospectId : "";
  return <CommercialLayout title="Mes prospects">{() => <ProspectsBoard initialProspectId={id} />}</CommercialLayout>;
}
export { getCommercialStaticProps as getStaticProps } from "@/components/commercial/commercial-translations.server";

