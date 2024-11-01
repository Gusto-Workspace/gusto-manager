import { useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useForm } from "react-hook-form";
import { useTranslation } from "next-i18next";
import axios from "axios";
import { GlobalContext } from "@/contexts/global.context";
import GlobalDishesComponent from "../dishes/global.dishes.component";
import { DeleteSvg } from "../_shared/_svgs/delete.svg";

export default function CustomMenuComponent(props) {
  const { t } = useTranslation("menus");
  const router = useRouter();
  const { locale } = router;
  const { restaurantContext } = useContext(GlobalContext);
  const currencySymbol = locale === "fr" ? "€" : "$";
  const [categories, setCategories] = useState(
    restaurantContext?.restaurantData?.dish_categories
  );
  const [selectedDishes, setSelectedDishes] = useState({});
  const { register, handleSubmit } = useForm();

  useEffect(() => {
    setCategories(restaurantContext?.restaurantData?.dish_categories);
  }, [restaurantContext?.restaurantData]);

  function handleDishClick(category, dish) {
    setSelectedDishes((prev) => {
      const newDishes = { ...prev };
      if (!newDishes[category.name]) {
        newDishes[category.name] = [];
      }
      // Ajoute le plat si absent, sinon le retire
      const existingDishIndex = newDishes[category.name].findIndex(
        (d) => d._id === dish._id
      );
      if (existingDishIndex === -1) {
        newDishes[category.name].push(dish);
      }
      return { ...newDishes };
    });
  }

  function handleRemoveDish(categoryName, dishId) {
    setSelectedDishes((prev) => {
      const updatedDishes = { ...prev };
      updatedDishes[categoryName] = updatedDishes[categoryName].filter(
        (dish) => dish._id !== dishId
      );
      if (updatedDishes[categoryName].length === 0) {
        delete updatedDishes[categoryName];
      }
      return updatedDishes;
    });
  }

  function onSubmit(data) {
    const formattedData = {
      type: props.menuType,
      name: data.name,
      description: data.description,
      price: parseFloat(data.price),
      dishes: Object.values(selectedDishes)
        .flat()
        .map((dish) => dish._id),
    };

    console.log(formattedData);
    

    const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/add-menus`;

    axios
      .post(apiUrl, formattedData)
      .then((response) => {
        restaurantContext.setRestaurantData(response.data.restaurant);
        router.push("/menus");
      })
      .catch((error) => {
        console.error("Error saving menu:", error);
      });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-8">
      <div className="flex gap-4">
        <div className="w-full flex flex-col gap-2">
          <div className="bg-white p-6 drop-shadow-sm rounded-lg flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="block font-semibold">
                <span>{t("form.fixed.labels.name")}</span>
              </label>

              <input
                type="text"
                placeholder="-"
                {...register("name")}
                className="p-2 border rounded-lg w-full"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="block font-semibold">
                <span>{t("form.fixed.labels.description")}</span>
                <span className="text-xs opacity-50 ml-2 italic">
                  {t("form.fixed.labels.optional")}
                </span>
              </label>

              <textarea
                placeholder="-"
                rows="4"
                {...register("description")}
                className="p-2 resize-none border rounded-lg w-full"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="block font-semibold">
                <span>{t("form.fixed.labels.price")}</span>
              </label>

              <div className="flex items-center">
                <span className="px-3 py-2 rounded-l-lg border-t border-l border-b">
                  {currencySymbol}
                </span>

                <input
                  type="number"
                  placeholder="-"
                  {...register("price")}
                  className="p-2 border rounded-r-lg w-full"
                />
              </div>
            </div>
          </div>

          {/* Affichage des plats sélectionnés par catégorie */}
          <div className="bg-white p-6 rounded-lg drop-shadow-sm">
            <h2 className="text-lg font-semibold">Plats sélectionnés</h2>

            {Object.keys(selectedDishes).length === 0 ? (
              <p className="text-center opacity-40 italic text-sm mt-4">
                Sélectionnez des plats dans la carte pour les ajouter à votre
                menu
              </p>
            ) : (
              Object.keys(selectedDishes).map((categoryName) => (
                <div key={categoryName} className="flex flex-col gap-2">
                  <div className="relative mt-4">
                    <h2 className="relative font-semibold uppercase text-center bg-white px-6 w-fit mx-auto z-20">
                      {categoryName}
                    </h2>
                    <hr className="bg-darkBlue absolute h-[1px] w-full top-1/2 -translate-y-1/2 z-10 opacity-50" />
                  </div>

                  <ul>
                    {selectedDishes[categoryName].map((dish, i) => (
                      <li key={dish._id} className="flex flex-col items-center">
                        <div className="relative flex text-center items-center w-full">
                          <span className="w-full text-center">
                            {dish.name}
                          </span>

                          <button
                            className="absolute right-0 flex items-center justify-center desktop:opacity-30 hover:opacity-100 transition-all duration-300"
                            type="button"
                            onClick={() =>
                              handleRemoveDish(categoryName, dish._id)
                            }
                          >
                            <DeleteSvg
                              width={20}
                              height={20}
                              fillColor="#FF7664"
                            />
                          </button>
                        </div>

                        {i < selectedDishes[categoryName].length - 1 && (
                          <p className="opacity-50 text-sm">- ou -</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Affichage de la carte avec sélection des plats */}
        <div className="w-full">
          <GlobalDishesComponent
            createMenu={true}
            categories={categories}
            onDishClick={handleDishClick}
          />
        </div>
      </div>

      <button
        type="submit"
        className="px-4 py-2 text-white bg-blue rounded-lg w-fit mx-auto"
      >
        Sauvegarder le menu
      </button>
    </form>
  );
}
