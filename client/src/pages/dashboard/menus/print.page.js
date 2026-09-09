import Head from "next/head";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

const AMBASSADE_PRINT_URL =
  "https://www.lambassade-montauban.fr/menus?gustoPrint=1";

export default function MenuPrintPage() {
  return (
    <>
      <Head>
        <title>Imprimer la carte | Gusto Manager</title>
      </Head>

      <div className="flex h-[100dvh] min-h-0 flex-col bg-white text-darkBlue">
        <header className="flex min-h-16 shrink-0 items-center justify-between gap-4 bg-darkBlue px-4 py-3 text-white shadow-md mobile:px-6">
          <strong className="text-base font-semibold">Gusto Manager</strong>
          <Link
            href="/dashboard/menus"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-darkBlue transition hover:bg-lightGrey active:scale-[0.98]"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
            Retour vers La Carte
          </Link>
        </header>

        <iframe
          src={AMBASSADE_PRINT_URL}
          title="Carte imprimable de L’Ambassade"
          className="min-h-0 w-full flex-1 border-0 bg-white"
        />
      </div>
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
