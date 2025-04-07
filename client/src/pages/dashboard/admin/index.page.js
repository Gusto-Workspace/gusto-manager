import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

// I18N
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

// AXIOS
import axios from "axios";

// COMPONENTS
import NavAdminComponent from "@/components/dashboard/admin/_shared/nav/nav.admin.component";
import DashboardAdminComponent from "@/components/dashboard/admin/dashboard/dashboard.admin.component";

export default function AdminPage(props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("admin-token");

    if (!token) {
      router.push("/dashboard/admin/login");
    } else {
      axios
        .get(`${process.env.NEXT_PUBLIC_API_URL}/admin/dashboard`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
        .then((response) => {
          setLoading(false);
        })
        .catch((error) => {
          if (error.response.status === 403) {
            localStorage.removeItem("admin-token");
            router.push("/dashboard/admin/login");
          }
        });
    }
  }, [router]);

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

        <div className="ml-[250px] bg-lightGrey text-darkBlue overflow-y-auto flex-1 p-6 h-screen flex flex-col gap-6">
          <DashboardAdminComponent />
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
