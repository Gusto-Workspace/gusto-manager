import { useContext } from "react";
import Head from "next/head";

// I18N
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useTranslation } from "next-i18next";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// COMPONENTS
import NavComponent from "@/components/_shared/nav/nav.component";
import SettingsComponent from "@/components/_shared/settings/settings.component";
import DocumentsMySpaceComponent from "@/components/dashboard/my-space/documents.my-space.component";
import PlanningMySpaceComponent from "@/components/dashboard/my-space/planning.my-space.component";
import NoAvailableComponent from "@/components/_shared/options/no-available.options.component";
import DaysOffMySpaceComponent from "@/components/dashboard/my-space/days-off.my-space.component";
import TrainingSessionsMySpaceComponent from "@/components/dashboard/my-space/training-sessions.my-space.component";

export default function MySpacePage(props) {
  const { t } = useTranslation("");
  const { restaurantContext } = useContext(GlobalContext);

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

  if (!restaurantContext.isAuth) return null;

  return (
    <>
      <Head>
        <title>{title}</title>

        {/* <>
          {description && <meta name="description" content={description} />}
          {title && <meta property="og:title" content={title} />}
          {description && (
            <meta property="og:description" content={description} />
          )}
          <meta
            property="og:url"
            content="https://lespetitsbilingues-newham.com/"
          />
          <meta property="og:type" content="website" />
          <meta property="og:image" content="/img/open-graph.jpg" />
          <meta property="og:image:width" content="1200" />
          <meta property="og:image:height" content="630" />
        </> */}
      </Head>

      <div>
        <div className="flex">
          <NavComponent />

          <div className="tablet:ml-[270px] bg-lightGrey text-darkBlue flex-1 px-2 p-6 mobile:p-6 mobile:px-6 flex flex-col gap-6 min-h-screen">
            <SettingsComponent
              dataLoading={restaurantContext.dataLoading}
              setDataLoading={restaurantContext.setDataLoading}
              closeEditing={restaurantContext.closeEditing}
              setRestaurantData={restaurantContext.setRestaurantData}
              restaurantData={restaurantContext.restaurantData}
            />

            <hr className="opacity-20" />

            {restaurantContext?.userConnected?.role === "employee" ? (
              <>
                <DocumentsMySpaceComponent
                  employeeId={restaurantContext?.userConnected?.id}
                />

                <PlanningMySpaceComponent
                  employeeId={restaurantContext?.userConnected?.id}
                />

                <DaysOffMySpaceComponent
                  employeeId={restaurantContext?.userConnected?.id}
                />

                <TrainingSessionsMySpaceComponent
                  employeeId={restaurantContext?.userConnected?.id}
                />
              </>
            ) : (
              <NoAvailableComponent
                dataLoading={restaurantContext.dataLoading}
                mySpace={true}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common", "myspace"])),
    },
  };
}
