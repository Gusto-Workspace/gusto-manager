import { useState } from "react";

// AXIOS
import axios from "axios";

 // I18N
import { useTranslation } from "next-i18next";

// COMPONENTS
import SimpleSkeletonComponent from "@/components/_shared/skeleton/simple-skeleton.component";
import DoubleSkeletonComonent from "@/components/_shared/skeleton/double-skeleton.component";

export default function ListRestaurantsAdminComponent(props) {
  const { t } = useTranslation("admin");
  const [restaurantToDelete, setRestaurantToDelete] = useState(null);
  const [loadingDelete, setLoadingDelete] = useState(false);

  async function confirmDelete(restaurantId) {
    setLoadingDelete(true);

    try {
      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/restaurants/${restaurantId}`
      );

      props.setRestaurants((prevRestaurants) =>
        prevRestaurants.filter((restaurant) => restaurant._id !== restaurantId)
      );

      setRestaurantToDelete(null);
      setLoadingDelete(false);
    } catch (error) {
      console.error("Erreur lors de la suppression du restaurant:", error);
      setLoadingDelete(false);
    }
  }

  return (
    <div>
      <div className="flex justify-between">
        <h1 className="text-4xl">{t("nav.restaurants")}</h1>

        <button
          className="bg-blue text-white px-4 py-2 rounded-lg"
          onClick={props.handleAddClick}
        >
          {t("restaurants.form.add")}
        </button>
      </div>

      <div className="mt-4">
        {props.loading ? (
          <div className="bg-white p-6 drop-shadow-sm flex flex-col gap-2 rounded-lg">
            <DoubleSkeletonComonent justify="justify-start"/>
            <SimpleSkeletonComponent />
            <SimpleSkeletonComponent />
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {props.restaurants.map((restaurant) => (
              <li key={restaurant._id} className="bg-white p-6 rounded-lg drop-shadow-sm">
                <h2 className="text-2xl">{restaurant.name}</h2>
                <p>
                  {t("restaurants.form.address.title")} :{" "}
                  {restaurant.address ? (
                    <>
                      {restaurant.address.line1}, {restaurant.address.zipCode}{" "}
                      {restaurant.address.city}, {restaurant.address.country}
                    </>
                  ) : (
                    <span className="text-sm italic opacity-40">
                      {t("restaurants.list.noAddress")}
                    </span>
                  )}
                </p>
                <p>
                  {t("restaurants.form.phone")} : {restaurant.phone}
                </p>
                <p>
                  {t("restaurants.form.web")} : {restaurant.website}
                </p>
                <p>
                  {t("restaurants.form.owner")} :{" "}
                  {restaurant.owner_id ? (
                    <>
                      {restaurant.owner_id.firstname}{" "}
                      {restaurant.owner_id.lastname}{" "}
                      <span className="text-sm italic opacity-40">
                        ({restaurant.owner_id.email})
                      </span>
                    </>
                  ) : (
                    <span className="text-sm italic opacity-40">
                      {t("restaurants.list.noOwner")}
                    </span>
                  )}
                </p>

                {restaurantToDelete === restaurant._id ? (
                  <div className="flex gap-2 mt-2">
                    <button
                      className="bg-red text-white px-4 py-2 rounded-lg"
                      onClick={() => confirmDelete(restaurant._id)}
                      disabled={loadingDelete}
                    >
                      {loadingDelete
                        ? t("buttons.loading")
                        : t("buttons.confirm")}
                    </button>
                    <button
                      className="bg-blue text-white px-4 py-2 rounded-lg"
                      onClick={() => setRestaurantToDelete(null)}
                    >
                      {t("restaurants.form.buttons.cancel")}
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2 mt-2">
                    <button
                      className="bg-darkBlue text-white px-4 py-2 rounded-lg"
                      onClick={() => props.handleEditClick(restaurant)}
                    >
                      {t("restaurants.form.buttons.edit")}
                    </button>
                    <button
                      className="bg-red text-white px-4 py-2 rounded-lg"
                      onClick={() => setRestaurantToDelete(restaurant._id)}
                    >
                      {t("buttons.delete")}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
