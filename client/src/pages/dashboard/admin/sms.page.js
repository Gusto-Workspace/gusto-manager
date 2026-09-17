import { useContext } from "react";
import Head from "next/head";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { GlobalContext } from "@/contexts/global.context";
import NavAdminComponent from "@/components/dashboard/admin/_shared/nav/nav.admin.component";
import SmsMonitoringAdminComponent from "@/components/dashboard/admin/sms/sms-monitoring.admin.component";

export default function SmsAdminPage() {
  const { adminContext } = useContext(GlobalContext);
  if (!adminContext.isAuth) return null;
  return <><Head><title>Rappels SMS | Gusto Manager</title></Head><div className="flex"><NavAdminComponent /><main className="tablet:ml-[88px] min-h-screen flex-1 bg-lightGrey p-6 text-darkBlue"><SmsMonitoringAdminComponent /></main></div></>;
}

export async function getStaticProps({ locale }) {
  return { props: { ...(await serverSideTranslations(locale, ["common", "admin"])) } };
}
