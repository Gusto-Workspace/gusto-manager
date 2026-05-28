import { serverSideTranslations } from "next-i18next/serverSideTranslations";

import TakeAwayCatalogComponent from "@/components/dashboard/take-away/catalog.take-away.component";
import TakeAwayPageShell from "@/components/dashboard/take-away/page-shell.take-away.component";

export default function TakeAwayCatalogPage() {
  return (
    <TakeAwayPageShell>
      <TakeAwayCatalogComponent />
    </TakeAwayPageShell>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common", "take-away"])),
    },
  };
}
