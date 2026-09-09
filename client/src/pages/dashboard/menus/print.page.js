import Head from "next/head";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

const AMBASSADE_PRINT_URL =
  "https://www.lambassade-montauban.fr/menus?gustoPrint=1";

export default function MenuPrintPage() {
  return (
    <>
      <Head>
        <title>Imprimer la carte | Gusto Manager</title>
      </Head>

      <iframe
        src={AMBASSADE_PRINT_URL}
        title="Carte imprimable de L’Ambassade"
        className="fixed inset-0 h-[100dvh] w-full border-0 bg-white"
      />
    </>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common"])),
    },
  };
}
