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

  const user = restaurantContext?.userConnected;
  const employeeId = user?.role === "employee" ? user.id : null;

  // restaurant sélectionné pour cet employé
  const restaurantId =
    restaurantContext?.restaurantData?._id || user?.restaurantId || null;

  return (
    <>
      <Head>
        <title>{title}</title>
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

            {user?.role === "employee" && employeeId && restaurantId ? (
              <>
                <DocumentsMySpaceComponent
                  employeeId={employeeId}
                  restaurantId={restaurantId}
                />

                <PlanningMySpaceComponent
                  employeeId={employeeId}
                  restaurantId={restaurantId}
                />

                <DaysOffMySpaceComponent
                  employeeId={employeeId}
                  restaurantId={restaurantId}
                />

                <TrainingSessionsMySpaceComponent
                  employeeId={employeeId}
                  restaurantId={restaurantId}
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
