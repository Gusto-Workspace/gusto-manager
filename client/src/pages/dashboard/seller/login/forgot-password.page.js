import AccessFormCommercial from "@/components/commercial/access-form.commercial";

export default function CommercialRecoveryPage() {
  return <AccessFormCommercial mode="recover" />;
}
export { getCommercialStaticProps as getStaticProps } from "@/components/commercial/commercial-translations.server";

