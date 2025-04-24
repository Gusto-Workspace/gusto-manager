import { useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";

// REACT HOOK FORM
import { useForm } from "react-hook-form";

// I18N
import { useTranslation } from "next-i18next";

// AXIOS
import axios from "axios";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// SVG
import { DeleteSvg } from "../../_shared/_svgs/delete.svg";

// COMPONENTS
import GlobalDishesComponent from "../dishes/global.dishes.component";

export default function CustomMenuComponent(props) {
  const { t } = useTranslation("menus");
  const router = useRouter();
  const { locale } = router;
  const { restaurantContext } = useContext(GlobalContext);
  const currencySymbol = locale === "fr" ? "€" : "$";
  const [categories, setCategories] = useState(
    restaurantContext?.restaurantData?.dish_categories
  );
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDishes, setSelectedDishes] = useState({});
  const { register, handleSubmit, reset } = useForm();

  useEffect(() => {
    setCategories(restaurantContext?.restaurantData?.dish_categories);

    if (props.menu) {
      reset({
        name: props.menu.name || "",
        description: props.menu.description || "",
        price: props.menu.price || "",
      });

      // Initialiser les plats sélectionnés avec les données de props.selectedDishes
      if (props.selectedDishes && props.selectedDishes.length > 0) {
        const initialSelectedDishes = {};

        props.selectedDishes.forEach((category) => {
          initialSelectedDishes[category.category] = category.dishes;
        });

        setSelectedDishes(initialSelectedDishes);
      }
    }
  }, [
    props.menu,
    reset,
    categories,
    props.selectedDishes,
    restaurantContext?.restaurantData?.dish_categories,
  ]);

  function handleDishClick(category, dish) {
    setSelectedDishes((prev) => {
      const newDishes = { ...prev };
      if (!newDishes[category.name]) {
        newDishes[category.name] = [];
      }
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
    setIsLoading(true);

    const formattedData = {
      type: props.menuType,
      name: data.name,
      description: data.description,
      price: parseFloat(data.price),
      dishes: Object.values(selectedDishes)
        .flat()
        .map((dish) => dish._id),
    };

    const apiUrl = props?.menu
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/menus/${props.menu._id}/update`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/add-menus`;

    const method = props?.menu ? "put" : "post";

    axios[method](apiUrl, formattedData)
      .then((response) => {
        restaurantContext.setRestaurantData((prev) => ({
          ...prev,
          menus: response.data.restaurant.menus,
        }));
        router.push("/dashboard/menus");
      })
      .catch((error) => {
        console.error("Error saving menu:", error);
        setIsLoading(false);
      });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="flex flex-col tablet:flex-row gap-4">
        <div className="w-full flex flex-col gap-2">
          <div className="bg-white p-6 drop-shadow-sm rounded-lg flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="block font-semibold">
                <span>{t("form.fixed.labels.name")}</span>
              </label>

              <input
                type="text"
                placeholder="-"
                {...register("name", { required: true })}
                className="p-2 border rounded-lg w-full"
                disabled={!props.isEditing}
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
                disabled={!props.isEditing}
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
                  step="0.01"
                  {...register("price")}
                  className="p-2 border rounded-r-lg w-full"
                  disabled={!props.isEditing}
                  onWheel={(e) => e.target.blur()}
                />
              </div>
            </div>
          </div>

          {/* Affichage des plats sélectionnés par catégorie */}
          <div className="bg-white p-6 rounded-lg drop-shadow-sm">
            <h2 className="text-lg font-semibold">
              {t("form.custom.labels.selectedDishes")}
            </h2>

            {Object.keys(selectedDishes).length === 0 ? (
              <p className="text-center opacity-40 italic text-sm mt-4">
                {t("form.custom.labels.selectPlaceholder")}
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
                          <span className="w-full text-center px-6">
                            {dish.name}
                          </span>

                          {props.isEditing && (
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
                          )}
                        </div>

                        {i < selectedDishes[categoryName].length - 1 && (
                          <p className="opacity-50 text-sm">
                            - {t("form.custom.labels.or")} -
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>

          <div className="hidden tablet:flex gap-4 mx-auto pt-8">
            {props.isEditing && (
              <button
                type="submit"
                className="p-2 text-white rounded-lg bg-blue"
                disabled={isLoading}
              >
                {isLoading ? t("buttons.loading") : t("buttons.save")}
              </button>
            )}

            <button
              type="button"
              className="px-4 py-2 text-white bg-red rounded-lg"
              onClick={() => router.back()}
            >
              {props.isEditing ? t("buttons.cancel") : t("buttons.return")}
            </button>
          </div>
        </div>

        {props.isEditing && (
          <div className="w-full">
            <GlobalDishesComponent
              createMenu={true}
              categories={categories}
              onDishClick={handleDishClick}
            />
          </div>
        )}

        <div className="flex tablet:hidden gap-4 mx-auto pt-4">
          {props.isEditing && (
            <button
              type="submit"
              className="p-2 text-white rounded-lg bg-blue"
              disabled={isLoading}
            >
              {isLoading ? t("buttons.loading") : t("buttons.save")}
            </button>
          )}

          <button
            type="button"
            className="px-4 py-2 text-white bg-red rounded-lg"
            onClick={() => router.back()}
          >
            {props.isEditing ? t("buttons.cancel") : t("buttons.return")}
          </button>
        </div>
      </div>
    </form>
  );
}
