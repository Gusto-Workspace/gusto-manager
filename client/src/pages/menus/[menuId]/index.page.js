import { useContext } from "react";
import Head from "next/head";
import axios from "axios";

// I18N
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// COMPONENTS
import NavComponent from "@/components/_shared/nav/nav.component";
import SettingsComponent from "@/components/_shared/settings/settings.component";
import MenuDetailsComponent from "@/components/menus/list.menus.component";

export default function MenuDetailsPage(props) {
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


  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>

      <div>
        <div className="flex">
          <NavComponent />

          <div className="bg-lightGrey text-darkBlue overflow-y-auto flex-1 p-6 h-screen flex flex-col gap-6">
            <SettingsComponent
              dataLoading={restaurantContext.dataLoading}
              setDataLoading={restaurantContext.setDataLoading}
              closeEditing={restaurantContext.closeEditing}
              setRestaurantData={restaurantContext.setRestaurantData}
              restaurantData={restaurantContext.restaurantData}
            />

            <MenuDetailsComponent menu={props?.menu} />
          </div>
        </div>
      </div>
    </>
  );
}

// export async function getServerSideProps({ params, locale }) {
//   const { menuId } = params;

//   const actualMenuId = menuId.split("-").pop();

//   try {
//     const response = await axios.get(
//       `${process.env.NEXT_PUBLIC_API_URL}/menus/${actualMenuId}`
//     );
//     const { menu } = response.data;

//     return {
//       props: {
//         menu,
//         ...(await serverSideTranslations(locale, ["common", "menus"])),
//       },
//     };
//   } catch (error) {
//     console.error("Error fetching menu data:", error);
//     return {
//       props: {
//         menu: null,
//         ...(await serverSideTranslations(locale, ["common", "menus"])),
//       },
//     };
//   }
// }
