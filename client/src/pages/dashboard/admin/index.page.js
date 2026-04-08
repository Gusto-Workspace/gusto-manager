import { useContext, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

// I18N
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// COMPONENTS
import NavAdminComponent from "@/components/dashboard/admin/_shared/nav/nav.admin.component";
import DashboardAdminComponent from "@/components/dashboard/admin/dashboard/dashboard.admin.component";

export default function AdminPage(props) {
  const router = useRouter();
  const { adminContext } = useContext(GlobalContext);
  const { dashboardData, dashboardLoading, dashboardError, fetchDashboard } =
    adminContext;

  useEffect(() => {
    const token = localStorage.getItem("admin-token");

    if (!token) {
      router.push("/dashboard/admin/login");
      return;
    }

    if (!dashboardData && !dashboardLoading) {
      fetchDashboard();
    }
  }, [dashboardData, dashboardLoading, fetchDashboard, router]);

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
  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>

      <div className="flex">
        <NavAdminComponent />

        <div className="tablet:ml-[270px] bg-lightGrey text-darkBlue flex-1 px-2 p-6 mobile:p-6 mobile:px-6 flex flex-col gap-6 min-h-screen">
          <DashboardAdminComponent
            loading={dashboardLoading}
            data={dashboardData}
            errorMessage={dashboardError}
          />
        </div>
      </div>
    </>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common", "admin"])),
    },
  };
}
