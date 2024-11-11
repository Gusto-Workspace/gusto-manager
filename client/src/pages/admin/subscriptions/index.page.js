import { useContext } from "react";
import Head from "next/head";

// I18N
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// COMPONENTS
import NavAdminComponent from "@/components/admin/_shared/nav/nav.admin.component";
import ListSubscriptionsAdminComponent from "@/components/admin/subscriptions/list-subscriptions.admin.component";

export default function SubscriptionsPage(props) {
  const { adminContext } = useContext(GlobalContext);

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

        <div
          style={{ willChange: "transform" }}
          className="bg-lightGrey text-darkBlue overflow-y-auto flex-1 p-6 h-screen flex flex-col gap-6"
        >
          <ListSubscriptionsAdminComponent
            loading={adminContext.ownersSubscriptionsLoading}
            setOwnersSubscriptionsList={adminContext.setOwnersSubscriptionsList}
            ownersSubscriptionsList={adminContext.ownersSubscriptionsList}
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
