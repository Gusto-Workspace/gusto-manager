import { useContext } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { i18n } from "next-i18next";

import { GlobalContext } from "@/contexts/global.context";

import NavAdminComponent from "@/components/dashboard/admin/_shared/nav/nav.admin.component";
import SignDocumentAdminDocument from "@/components/dashboard/admin/documents/sign.documents.admin.component";

export default function SignDocumentPage(props) {
  const { adminContext } = useContext(GlobalContext);
  const router = useRouter();
  const { documentId } = router.query;

  let title = "Gusto Manager";

  if (!adminContext.isAuth) return null;

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>

      <div className="flex">
        <NavAdminComponent />

        <div className="tablet:ml-[270px] bg-lightGrey text-darkBlue flex-1 px-2 p-6 mobile:p-6 mobile:px-6 flex flex-col gap-6 min-h-screen">
          <SignDocumentAdminDocument documentId={documentId} />
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
