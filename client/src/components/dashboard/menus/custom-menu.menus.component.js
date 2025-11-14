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
    restaurantContext?.restaurantData?.dish_categories || []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDishes, setSelectedDishes] = useState({});

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      name: props.menu?.name || "",
      description: props.menu?.description || "",
      price:
        typeof props.menu?.price === "number"
          ? props.menu.price.toFixed(2)
          : "",
    },
  });

  useEffect(() => {
    setCategories(restaurantContext?.restaurantData?.dish_categories || []);

    if (props.menu) {
      reset({
        name: props.menu.name || "",
        description: props.menu.description || "",
        price:
          typeof props.menu.price === "number"
            ? props.menu.price.toFixed(2)
            : "",
      });
    }

    // Initialiser les plats sélectionnés
    if (props.selectedDishes && props.selectedDishes.length > 0) {
      const initialSelectedDishes = {};
      props.selectedDishes.forEach((category) => {
        initialSelectedDishes[category.category] = category.dishes;
      });
      setSelectedDishes(initialSelectedDishes);
    }
  }, [
    restaurantContext?.restaurantData?.dish_categories,
    props.menu,
    props.selectedDishes,
    reset,
  ]);

  function handleDishClick(category, dish) {
    setSelectedDishes((prev) => {
      const newDishes = { ...prev };
      if (!newDishes[category.name]) {
        newDishes[category.name] = [];
      }

      const exists = newDishes[category.name].some((d) => d._id === dish._id);
      if (!exists) {
        newDishes[category.name].push(dish);
      }

      return newDishes;
    });
  }

  function handleRemoveDish(categoryName, dishId) {
    setSelectedDishes((prev) => {
      const updated = { ...prev };
      updated[categoryName] = updated[categoryName].filter(
        (dish) => dish._id !== dishId
      );
      if (!updated[categoryName].length) {
        delete updated[categoryName];
      }
      return updated;
    });
  }

  function onSubmit(data) {
    setIsLoading(true);

    const priceValue =
      data.price === "" || data.price === null
        ? null
        : parseFloat(String(data.price).replace(",", "."));

    const formattedData = {
      type: props.menuType,
      name: data.name,
      description: data.description || "",
      price: priceValue,
      dishes: Object.values(selectedDishes)
        .flat()
        .map((dish) => dish._id),
    };

    const baseUrl = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}`;

    const apiUrl = props?.menu
      ? `${baseUrl}/menus/${props.menu._id}/update`
      : `${baseUrl}/add-menus`;

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

  const hasSelectedDishes = Object.keys(selectedDishes).length > 0;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="flex flex-col gap-2 tablet:flex-row tablet:items-start">
        {/* Colonne gauche : formulaire + sélection (sticky) */}
        <div
          className={`w-full ${props.isEditing ? "tablet:w-2/5 mi" : "tablet:w-full"} tablet:shrink-0 tablet:top-6 flex flex-col gap-4`}
        >
          {/* Carte formulaire */}
          <div className="rounded-2xl border border-darkBlue/10 bg-white/50 px-4 py-4 tablet:px-6 tablet:py-5 shadow-[0_18px_45px_rgba(19,30,54,0.06)] flex flex-col gap-4">
            {/* Nom */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-[0.08em] text-darkBlue/70">
                {t("form.fixed.labels.name")}
              </label>
              <input
                type="text"
                placeholder="-"
                {...register("name", { required: true })}
                className={`h-11 w-full rounded-xl border bg-white/80 px-3 text-sm outline-none transition ${
                  errors.name
                    ? "border-red/70"
                    : "border-darkBlue/10 focus:border-darkBlue/40"
                }`}
                disabled={!props.isEditing}
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold uppercase tracking-[0.08em] text-darkBlue/70">
                  {t("form.fixed.labels.description")}
                </label>
                <span className="text-[11px] text-darkBlue/40 italic">
                  {t("form.fixed.labels.optional")}
                </span>
              </div>

              <textarea
                placeholder="-"
                rows={4}
                {...register("description")}
                className="w-full rounded-xl border border-darkBlue/10 bg-white/80 px-3 py-2 text-sm resize-none outline-none transition"
                disabled={!props.isEditing}
              />
            </div>

            {/* Prix */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-[0.08em] text-darkBlue/70">
                {t("form.fixed.labels.price")}
              </label>

              <div className="flex items-center rounded-xl border border-darkBlue/10 bg-white/80 overflow-hidden">
                <span className="px-3 text-sm text-darkBlue/70 select-none">
                  {currencySymbol}
                </span>

                <input
                  type="number"
                  placeholder="-"
                  step="0.01"
                  inputMode="decimal"
                  {...register("price")}
                  className="h-11 w-full border-l border-darkBlue/10 px-3 text-sm outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  disabled={!props.isEditing}
                  onWheel={(e) => e.target.blur()}
                />
              </div>
            </div>
          </div>

          {/* Carte : plats sélectionnés */}
          <div className="rounded-2xl border border-darkBlue/10 bg-white/50 px-4 py-4 shadow-[0_18px_45px_rgba(19,30,54,0.06)]">
            <h2 className="text-center text-base font-semibold text-darkBlue">
              {t("form.custom.labels.selectedDishes")}
            </h2>

            {!hasSelectedDishes ? (
              <p className="mt-4 text-xs tablet:text-sm text-darkBlue/40 italic text-center">
                {t("form.custom.labels.selectPlaceholder")}
              </p>
            ) : (
              <div className="mt-4 flex flex-col gap-4">
                {Object.keys(selectedDishes).map((categoryName) => {
                  const dishes = selectedDishes[categoryName];

                  return (
                    <div key={categoryName} className="flex flex-col gap-2">
                      {/* Titre de catégorie */}
                      <div className="relative py-1">
                        <h3 className="relative mx-auto w-fit rounded-full border border-darkBlue/10 bg-white px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-darkBlue z-10">
                          {categoryName}
                        </h3>
                        <hr className="pointer-events-none absolute left-0 top-1/2 h-px w-full -translate-y-1/2 border-0 bg-darkBlue/10" />
                      </div>

                      <ul className="flex flex-col gap-2">
                        {dishes.map((dish, i) => (
                          <li
                            key={dish._id}
                            className="flex flex-col gap-1 items-stretch"
                          >
                            {/* Carte plat */}
                            <div className="rounded-xl bg-white/80 border border-darkBlue/5 px-3 py-2 text-sm tablet:text-sm flex items-center justify-between gap-2">
                              <span
                                className={`flex-1 ${props.isEditing ? "text-left" : "text-center"} text-darkBlue`}
                              >
                                {dish.name}
                              </span>

                              {props.isEditing && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRemoveDish(categoryName, dish._id)
                                  }
                                  className="ml-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-red/5 hover:bg-red/10 transition desktop:opacity-60 hover:opacity-100"
                                >
                                  <DeleteSvg
                                    width={18}
                                    height={18}
                                    fillColor="#FF7664"
                                  />
                                </button>
                              )}
                            </div>

                            {/* Séparateur "ou" entre les plats */}
                            {i < dishes.length - 1 && (
                              <div className="flex items-center justify-center gap-2 text-[11px] tablet:text-xs text-darkBlue/40">
                                <span className="h-px w-6 bg-darkBlue/10" />
                                <span>{t("form.custom.labels.or")}</span>
                                <span className="h-px w-6 bg-darkBlue/10" />
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Boutons desktop */}
          <div className="hidden tablet:flex gap-3 pt-4">
            {props.isEditing && (
              <button
                type="submit"
                className="inline-flex min-w-[120px] items-center justify-center rounded-xl bg-blue text-white text-sm font-medium px-4 py-2.5 shadow-sm hover:bg-blue/90 transition disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={isLoading}
              >
                {isLoading ? t("buttons.loading") : t("buttons.save")}
              </button>
            )}

            <button
              type="button"
              className="inline-flex min-w-[120px] items-center justify-center rounded-xl bg-red text-white text-sm font-medium px-4 py-2.5 shadow-sm hover:bg-red/90 transition"
              onClick={() => {
                props.isEditing ? props.setIsEditing(false) : router.back();
              }}
            >
              {props.isEditing ? t("buttons.cancel") : t("buttons.return")}
            </button>
          </div>
        </div>

        {/* Colonne droite : liste des plats */}
        {props.isEditing && (
          <div className="w-full flex-1">
            <GlobalDishesComponent
              createMenu={true}
              categories={categories}
              onDishClick={handleDishClick}
            />
          </div>
        )}
      </div>

      {/* Boutons mobile */}
      <div className="flex tablet:hidden gap-3 pt-2 justify-center">
        {props.isEditing && (
          <button
            type="submit"
            className="inline-flex min-w-[120px] items-center justify-center rounded-xl bg-darkBlue text-white text-sm font-medium px-4 py-2.5 shadow-sm hover:bg-darkBlue/90 transition disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={isLoading}
          >
            {isLoading ? t("buttons.loading") : t("buttons.save")}
          </button>
        )}

        <button
          type="button"
          className="inline-flex min-w-[120px] items-center justify-center rounded-xl bg-red text-white text-sm font-medium px-4 py-2.5 shadow-sm hover:bg-red/90 transition"
          onClick={() => {
            props.isEditing ? props.setIsEditing(false) : router.back();
          }}
        >
          {props.isEditing ? t("buttons.cancel") : t("buttons.return")}
        </button>
      </div>
    </form>
  );
}
