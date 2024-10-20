import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

// JWT
import { jwtDecode } from "jwt-decode";

// AXIOS
import axios from "axios";

// I18N
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

// COMPONENTS
import NavComponent from "@/components/_shared/nav/nav.component";
import SettingsComponent from "@/components/_shared/settings/settings.component";
import HoursRestaurantComponent from "@/components/restaurant/hours.restaurant.component";
import ContactRestaurantComponent from "@/components/restaurant/contact.restaurant.component";

export default function RestaurantPage(props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [restaurant, setRestaurant] = useState(null);
  const [restaurantsList, setRestaurantsList] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      router.push("/login");
    } else {
      try {
        const decodedToken = jwtDecode(token);

        if (!decodedToken.id) {
          throw new Error("Invalid token: ownerId is missing");
        }

        axios
          .get(`${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            params: {
              ownerId: decodedToken.id,
            },
          })
          .then((response) => {
            setRestaurantsList(response.data.restaurants);

            const selectedRestaurantId =
              decodedToken.restaurantId || response.data.restaurants[0]._id;

            return axios.get(
              `${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants/${selectedRestaurantId}`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            );
          })
          .then((response) => {
            setRestaurant(response.data.restaurant);
            setTimeout(() => {
              setIsFadingOut(true);
              setTimeout(() => {
                setLoading(false);
              }, 125);
            }, 250);
          })
          .catch((error) => {
            console.error(
              "Erreur lors de la récupération des restaurants:",
              error
            );
            localStorage.removeItem("token");
            router.push("/login");
          });
      } catch (error) {
        console.error("Invalid token:", error);
        localStorage.removeItem("token");
        router.push("/login");
      }
    }
  }, [router]);

  function handleRestaurantSelect(restaurantId) {
    const token = localStorage.getItem("token");
    if (token) {
      const delayTimeout = setTimeout(() => {
        setDataLoading(true);
      }, 1000);
  
      axios
        .post(
          `${process.env.NEXT_PUBLIC_API_URL}/owner/change-restaurant`,
          { restaurantId },
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        )
        .then((response) => {
          const { token: updatedToken } = response.data;
          localStorage.setItem("token", updatedToken);
  
          return axios.get(
            `${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants/${restaurantId}`,
            {
              headers: {
                Authorization: `Bearer ${updatedToken}`,
              },
            }
          );
        })
        .then((response) => {
          setRestaurant(response.data.restaurant);
          clearTimeout(delayTimeout);
          setDataLoading(false);
        })
        .catch((error) => {
          console.error(
            "Erreur lors de la mise à jour du restaurant sélectionné:",
            error
          );
          clearTimeout(delayTimeout);
          setDataLoading(false);
        });
    }
  }
  
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
        {loading ? (
          <div className="flex justify-center items-center h-screen">
            <img
              src="/img/logo.webp"
              alt="loader"
              draggable={false}
              className={`max-w-[125px] ${
                isFadingOut ? "fade-out" : "fade-in"
              }`}
            />
          </div>
        ) : (
          <div className="flex">
            <NavComponent />

            <div className="bg-lightGrey text-darkBlue overflow-y-auto flex-1 p-6 h-screen flex flex-col gap-6">
              <SettingsComponent
                restaurantName={restaurant?.name}
                ownerFirstname={restaurant?.owner_id?.firstname}
                restaurantsList={restaurantsList}
                onRestaurantSelect={handleRestaurantSelect}
                dataLoading={dataLoading}
              />
              <div className="flex gap-6">
                <HoursRestaurantComponent
                  openingHours={restaurant?.opening_hours}
                  restaurantId={restaurant._id}
                  dataLoading={dataLoading}
                />

                <ContactRestaurantComponent />
              </div>
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
      ...(await serverSideTranslations(locale, ["common", "restaurant"])),
    },
  };
}
