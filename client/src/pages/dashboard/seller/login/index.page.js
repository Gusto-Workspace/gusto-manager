import AccessFormCommercial from "@/components/commercial/access-form.commercial";

export default function CommercialLoginPage() {
  return <AccessFormCommercial mode="login" />;
}
export { getCommercialStaticProps as getStaticProps } from "@/components/commercial/commercial-translations.server";

