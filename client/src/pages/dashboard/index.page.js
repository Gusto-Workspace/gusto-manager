import { useContext, useEffect, useState } from "react";
import Head from "next/head";

// I18N
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useTranslation } from "next-i18next";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// COMPONENTS
import NavComponent from "@/components/_shared/nav/nav.component";
import SettingsComponent from "@/components/_shared/settings/settings.component";
import DashboardComponent from "@/components/dashboard/dashboard/dashboard.component";

// SVG
import { AnalyticsSvg } from "@/components/_shared/_svgs/analytics.svg";

export default function DashboardPage(props) {
  const { t } = useTranslation("");
  const { restaurantContext } = useContext(GlobalContext);

  // 🔝 Forcer la page en (0,0) à l’arrivée (Safari + Chrome iPad + desktop)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!restaurantContext?.isAuth) return;

    // Désactive la restauration auto de scroll
    const hadSR = "scrollRestoration" in window.history;
    const prevSR = hadSR ? window.history.scrollRestoration : null;
    if (hadSR) window.history.scrollRestoration = "manual";

    const jumpTop = () =>
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });

    // 1) tout de suite
    jumpTop();
    // 2) juste après peinture/hydratation (double raf = plus robuste iOS/Chrome)
    const r1 = requestAnimationFrame(jumpTop);
    const r2 = requestAnimationFrame(jumpTop);

    // 3) si le viewport change (fermeture clavier, barre d’adresse, rotation)
    const keepTop = () => jumpTop();
    window.addEventListener("resize", keepTop, { passive: true });
    window.addEventListener("orientationchange", keepTop, { passive: true });
    window.addEventListener("focusout", keepTop);

    // 4) Chrome iPad : visualViewport bouge lors de l’ouverture/fermeture clavier
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", keepTop);
      vv.addEventListener("geometrychange", keepTop);
    }

    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
      window.removeEventListener("resize", keepTop);
      window.removeEventListener("orientationchange", keepTop);
      window.removeEventListener("focusout", keepTop);
      if (vv) {
        vv.removeEventListener("resize", keepTop);
        vv.removeEventListener("geometrychange", keepTop);
      }
      if (hadSR && prevSR) window.history.scrollRestoration = prevSR;
    };
  }, [restaurantContext?.isAuth]);

  let title;
  let description;
  switch (i18n.language) {
    case "en":
      title = "Gusto Manager";
      description = "";
      break;
    default:
      title = "Gusto Manager";
      description = "";
  }

  if (!restaurantContext.isAuth) return null;

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>

      <div>
        <div className="flex">
          <NavComponent />

          <div className="tablet:ml-[270px] bg-lightGrey text-darkBlue flex-1 px-2 p-6 mobile:p-6 mobile:px-6 flex flex-col gap-6 min-h-screen">
            <SettingsComponent
              dataLoading={restaurantContext.dataLoading}
              setDataLoading={restaurantContext.setDataLoading}
              closeEditing={restaurantContext.closeEditing}
              setRestaurantData={restaurantContext.setRestaurantData}
              restaurantData={restaurantContext.restaurantData}
            />

            <hr className="opacity-20" />

            <div className="flex justify-between">
              <div className="flex gap-2 items-center">
                <AnalyticsSvg width={30} height={30} strokeColor="#131E3690" />
                <h1 className="pl-2 text-2xl">{t("index:titles.main")}</h1>
              </div>
            </div>

            <DashboardComponent
              restaurantData={restaurantContext.restaurantData}
              dataLoading={restaurantContext.dataLoading}
            />
          </div>
        </div>
      </div>
    </>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, [
        "common",
        "index",
        "transactions",
      ])),
    },
  };
}
