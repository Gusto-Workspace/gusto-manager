import { useContext } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

// I18N
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// COMPONENTS
import NavAdminComponent from "@/components/dashboard/admin/_shared/nav/nav.admin.component";
import DetailsDocumentAdminPage from "@/components/dashboard/admin/documents/details.documents.admin.component";

export default function AddSubscriptionsPage(props) {
  const { adminContext } = useContext(GlobalContext);
    const router = useRouter();

  const { documentId } = router.query;

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

  if (!adminContext.isAuth) return null;

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>

      <div className="flex">
        <NavAdminComponent />

        <div className="tablet:ml-[270px] bg-lightGrey text-darkBlue flex-1 px-2 p-6 mobile:p-6 mobile:px-6 flex flex-col gap-6 min-h-screen">
          <DetailsDocumentAdminPage documentId={documentId} />
        </div>
      </div>
    </>
  );
}

export async function getServerSideProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common", "admin"])),
    },
  };
}
