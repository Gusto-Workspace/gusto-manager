import { serverSideTranslations } from "next-i18next/serverSideTranslations";

import TakeAwayPageShell from "@/components/dashboard/take-away/page-shell.take-away.component";
import TakeAwayParametersComponent from "@/components/dashboard/take-away/parameters.take-away.component";

export default function TakeAwayParametersPage() {
  return (
    <TakeAwayPageShell>
      <TakeAwayParametersComponent />
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
