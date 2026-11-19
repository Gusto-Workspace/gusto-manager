import Head from "next/head";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import TimeClockKiosk from "@/components/dashboard/time-clock/kiosk.time-clock.component";

export default function TimeClockWebAppPage() {
  return (
    <>
      <Head>
        <title>Pointeuse | Gusto Manager</title>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Pointeuse" />
        <link rel="apple-touch-icon" href="/icons/ios/time-clock-180.png?v=1" />
      </Head>
      <TimeClockKiosk />
    </>
  );
}

export async function getStaticProps({ locale }) {
  return { props: { ...(await serverSideTranslations(locale, ["common"])) } };
}
