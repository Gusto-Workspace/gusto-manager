import { useContext, useState } from "react";
import Head from "next/head";

// I18N
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// COMPONENTS
import NavAdminComponent from "@/components/admin/_shared/nav/nav.admin.component";
import ListRestaurantsAdminComponent from "@/components/admin/restaurants/list-restaurants.admin.component";
import AddRestaurantModal from "@/components/admin/restaurants/add-restaurant-modal.admin.component";

export default function RestaurantsPage(props) {
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

  const [isModalOpen, setIsModalOpen] = useState(false);

  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [isExistingOwner, setIsExistingOwner] = useState(true);

  if (!adminContext.isAuth) return null;

  function handleAddRestaurant(newRestaurant) {
    adminContext.setRestaurantsList((prevRestaurants) => [
      ...prevRestaurants,
      newRestaurant,
    ]);
  }

  function handleEditRestaurant(updatedRestaurant) {
    adminContext.setRestaurantsList((prevRestaurants) =>
      prevRestaurants.map((restaurant) =>
        restaurant._id === updatedRestaurant._id
          ? updatedRestaurant
          : restaurant
      )
    );
    setSelectedRestaurant(null);
  }

  function handleEditClick(restaurant) {
    setIsExistingOwner(true);
    setSelectedRestaurant(restaurant);
    setIsModalOpen(true);
  }

  function handleAddClick() {
    setIsExistingOwner(false);
    setSelectedRestaurant(null);
    setIsModalOpen(true);
  }

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>

      <div className="flex">
        <NavAdminComponent />

        <div
           
          className="bg-lightGrey text-darkBlue overflow-y-auto flex-1 p-6 h-screen flex flex-col gap-6"
        >
          <ListRestaurantsAdminComponent
            handleAddClick={handleAddClick}
            handleEditClick={handleEditClick}
            restaurants={adminContext.restaurantsList}
            setRestaurants={adminContext.setRestaurantsList}
            loading={adminContext.restaurantsLoading}
          />
        </div>

        {isModalOpen && (
          <AddRestaurantModal
            closeModal={() => setIsModalOpen(false)}
            handleAddRestaurant={handleAddRestaurant}
            handleEditRestaurant={handleEditRestaurant}
            restaurant={selectedRestaurant}
            isExistingOwner={isExistingOwner}
            setIsExistingOwner={setIsExistingOwner}
          />
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
