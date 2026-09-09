import { useContext } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { ChevronLeft } from "lucide-react";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { GlobalContext } from "@/contexts/global.context";
import { buildRestaurantMenuPrintUrl } from "@/_assets/utils/restaurant-menu-print";

export default function MenuPrintPage() {
  const router = useRouter();
  const { restaurantContext } = useContext(GlobalContext);
  const fromDishes = router.query.from === "dishes";
  const returnPath = fromDishes ? "/dashboard/dishes" : "/dashboard/menus";
  const returnLabel = fromDishes ? "Retour à La Carte" : "Retour aux Menus";
  const restaurant = restaurantContext?.restaurantData;
  const printUrl = buildRestaurantMenuPrintUrl(restaurant?.website);

  return (
    <>
      <Head>
        <title>Imprimer la carte | Gusto Manager</title>
      </Head>

      {printUrl ? (
        <iframe
          src={printUrl}
          title={`Carte imprimable${restaurant?.name ? ` de ${restaurant.name}` : ""}`}
          className="fixed inset-0 h-[100dvh] w-full border-0 bg-white"
        />
      ) : (
        <div className="fixed inset-0 flex items-center justify-center bg-white px-6 text-center text-darkBlue">
          <p>
            {restaurantContext?.dataLoading
              ? "Chargement de la carte…"
              : "Aucune page d’impression sécurisée n’est configurée pour ce restaurant."}
          </p>
        </div>
      )}

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
