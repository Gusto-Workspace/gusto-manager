import { serverSideTranslations } from "next-i18next/serverSideTranslations";

export async function getCommercialStaticProps({ locale }) {
  return { props: await serverSideTranslations(locale, ["common", "commercial"]) };
}
