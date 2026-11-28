import AccessFormCommercial from "@/components/commercial/access-form.commercial";

export default function CommercialActivationPage() {
  return <AccessFormCommercial mode="activate" />;
}
export { getCommercialStaticProps as getStaticProps } from "@/components/commercial/commercial-translations.server";

