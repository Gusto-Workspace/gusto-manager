import Head from "next/head";
import { useEffect } from "react";
import { useRouter } from "next/router";

// I18N
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

// COMPONENTS
import FormAdminComponent from "@/components/admin/_shared/form/form.admin.component";

export default function AdminLoginPage(props) {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("admin-token");

    if (token) {
      router.push("/admin");
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

      <div className="min-h-[100vh] bg-black bg-opacity-20 flex justify-center items-center">
        <FormAdminComponent />
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
