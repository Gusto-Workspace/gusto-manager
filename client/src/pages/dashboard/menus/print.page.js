import Head from "next/head";
import { useRouter } from "next/router";
import { ChevronLeft } from "lucide-react";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

const AMBASSADE_PRINT_URL =
  "https://www.lambassade-montauban.fr/menus?gustoPrint=1";

export default function MenuPrintPage() {
  const router = useRouter();
  // Deux destinations internes seulement, même si `from` est absent ou invalide.
  const fromDishes = router.query.from === "dishes";
  const returnPath = fromDishes ? "/dashboard/dishes" : "/dashboard/menus";
  const returnLabel = fromDishes ? "Retour à La Carte" : "Retour aux Menus";

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

      <button
        type="button"
        disabled={!router.isReady}
        onClick={() => void router.replace(returnPath)}
        aria-label={returnLabel}
        title={returnLabel}
        className="fixed left-4 top-4 z-10 inline-flex size-11 items-center justify-center rounded-full border border-darkBlue/15 bg-white text-darkBlue shadow-sm transition hover:bg-lightGrey active:scale-[0.98] print:hidden"
      >
        <ChevronLeft className="size-5" aria-hidden="true" />
      </button>
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
