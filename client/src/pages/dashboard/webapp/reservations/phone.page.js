import { useContext, useState } from "react";
import Head from "next/head";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { Menu } from "lucide-react";
import { GlobalContext } from "@/contexts/global.context";
import { useCallSense } from "@/components/_shared/callsense/callsense-context";
import { CallSenseHistory } from "@/components/_shared/callsense/callsense-panel";
import SidebarReservationsWebapp from "@/components/dashboard/webapp/_shared/sidebar.webapp";
import NotGoodDeviceWebAppComponent from "@/components/dashboard/webapp/_shared/not-good-device.webapp";
import SplashScreenWebAppComponent from "@/components/dashboard/webapp/_shared/splashscreen.webapp";

export default function ReservationsPhonePage() {
  const { restaurantContext } = useContext(GlobalContext);
  const state = useCallSense();
  const [menu, setMenu] = useState(false);
  if (!restaurantContext.isAuth) return null;
  return <>
    <Head><title>Téléphone — Gusto Manager</title><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" /></Head>
    <div className="gm-webapp-device-content"><div className="hide-scrollbar flex h-[100dvh] flex-col gap-4 overflow-y-auto overscroll-none bg-lightGrey p-4 pb-24 text-darkBlue">
      <SidebarReservationsWebapp open={menu} onClose={() => setMenu(false)} title="Réservations" module="reservations" />
      <header className="flex items-center gap-3"><button onClick={() => setMenu(true)} aria-label="Menu" className="rounded-full border border-darkBlue/10 bg-white/50 p-3"><Menu className="size-5" /></button><div><h1 className="text-xl font-semibold">Téléphone</h1><p className="text-xs text-darkBlue/50">Appels et historique</p></div></header>
      {state?.enabled ? <CallSenseHistory webapp /> : state?.loading ? <p>Chargement…</p> : <p className="rounded-2xl bg-white p-5 text-sm text-darkBlue/60">Le téléphone n’est pas disponible pour ce restaurant ou votre compte.</p>}
    </div></div>
    <NotGoodDeviceWebAppComponent />
    <SplashScreenWebAppComponent loading={restaurantContext.dataLoading} storageKey="gm:splash:webapp:reservations" enabled={restaurantContext.isAuth} lastActiveKey="gm:lastActive:webapp:reservations" thresholdMs={300000} onSoftReturn={() => restaurantContext.resyncAfterForeground?.({ hard: false })} onHardReturn={() => restaurantContext.resyncAfterForeground?.({ hard: true })} />
  </>;
}

export async function getStaticProps({ locale }) {
  return { props: { ...(await serverSideTranslations(locale, ["common", "reservations", "customers"])) } };
}
