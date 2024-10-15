import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

// I18N
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

// AXIOS
import axios from "axios";

// COMPONENTS
import NavAdminComponent from "@/components/admin/_shared/nav/nav.admin.component";
import DashboardAdminComponent from "@/components/admin/dashboard/dashboard.admin.component";

export default function AdminPage(props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("admin-token");

    if (!token) {
      router.push("/admin/login");
    } else {
      axios
        .get(`${process.env.NEXT_PUBLIC_API_URL}/admin/dashboard`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
        .then((response) => {
          console.log(response.data.message);
          setLoading(false);
        })
        .catch((error) => {
          if (error.response.status === 403) {
            localStorage.removeItem("admin-token");
            router.push("/admin/login");
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

      <div className="w-[100vw]">
        {loading ? (
          <div className="flex justify-center items-center ">
            <div className="loader">Loading...</div>
          </div>
        ) : (
          <div className="flex">
            <NavAdminComponent />
            <div className="border h-screen overflow-y-auto flex-1">
              <DashboardAdminComponent />
            </div>
          </div>
        )}
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
