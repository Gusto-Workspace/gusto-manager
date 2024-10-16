import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

// AXIOS
import axios from "axios";

// I18N
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

// COMPONENTS
import NavAdminComponent from "@/components/admin/_shared/nav/nav.admin.component";
import ListRestaurantsAdminComponent from "@/components/admin/restaurants/list-restaurants.admin.component";
import AddRestaurantModal from "@/components/admin/restaurants/add-restaurant-modal.admin";

export default function RestaurantsPage(props) {
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

  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [restaurants, setRestaurants] = useState([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [isExistingOwner, setIsExistingOwner] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("admin-token");

    if (!token) {
      router.push("/admin/login");
    } else {
      setLoading(true);
    }
  }, [router]);

  useEffect(() => {
    const token = localStorage.getItem("admin-token");

    if (!token) {
      router.push("/admin/login");
    } else {
      axios
        .get(`${process.env.NEXT_PUBLIC_API_URL}/admin/restaurants`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
        .then((response) => {
          setRestaurants(response.data.restaurants);
          setLoading(false);
        })
        .catch((error) => {
          if (error.response && error.response.status === 403) {
            localStorage.removeItem("admin-token");
            router.push("/admin/login");
          } else {
            console.error(
              "Erreur lors de la récupération des restaurants:",
              error
            );
            setLoading(false);
          }
        });
    }
  }, [router]);

  function handleAddRestaurant(newRestaurant) {
    setRestaurants((prevRestaurants) => [...prevRestaurants, newRestaurant]);
  }

  function handleEditRestaurant(updatedRestaurant) {
    setRestaurants((prevRestaurants) =>
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

            <div className="border h-screen overflow-y-auto flex-1 p-12">
              <ListRestaurantsAdminComponent
                handleAddClick={() => {
                  setSelectedRestaurant(null);
                  setIsModalOpen(true);
                  setIsExistingOwner(true);
                }}
                handleEditClick={handleEditClick}
                restaurants={restaurants}
                loading={loading}
                setRestaurants={setRestaurants}
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
