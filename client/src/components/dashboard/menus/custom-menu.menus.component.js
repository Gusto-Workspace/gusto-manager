import { useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

function normalizeRelations(
  dishes = [],
  relations = [],
  fallbackRelation = "or",
) {
  const totalRelations = Math.max(dishes.length - 1, 0);

  if (totalRelations === 0) {
    return [];
  }

  const normalizedRelations = Array.isArray(relations)
    ? relations
        .slice(0, totalRelations)
        .map((relation) => (relation === "and" ? "and" : "or"))
    : [];

  return Array.from({ length: totalRelations }, (_, index) => {
    return normalizedRelations[index] || fallbackRelation;
  });
}

function createDishId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function normalizeCategoryName(name) {
  return String(name || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export default function CustomMenuComponent(props) {
  const { t } = useTranslation("menus");
  const router = useRouter();
  const { locale } = router;
  const { restaurantContext } = useContext(GlobalContext);

  const currencySymbol = locale === "fr" ? "€" : "$";

  const categories = restaurantContext?.restaurantData?.dish_categories || [];

  const [isLoading, setIsLoading] = useState(false);
  const [selectedDishes, setSelectedDishes] = useState({});
  const [menuDishes, setMenuDishes] = useState(props.menu?.menuDishes || []);
  const [isDishModalOpen, setIsDishModalOpen] = useState(false);
  const [dishCategory, setDishCategory] = useState("");
  const [dishName, setDishName] = useState("");
  const [dishDescription, setDishDescription] = useState("");
  const [showCategorySuggestions, setShowCategorySuggestions] = useState(false);
  const categoryPickerRef = useRef(null);
  const selectedDishGroups = Object.values(selectedDishes);

  const categoryOptions = [...selectedDishGroups.map((group) => group.categoryName), ...categories.map((category) => category.name)]
    .filter((name) => String(name || "").trim())
    .filter((name, index, names) =>
      names.findIndex((candidate) => normalizeCategoryName(candidate) === normalizeCategoryName(name)) === index,
    );
  const filteredCategoryOptions = categoryOptions.filter((name) =>
    normalizeCategoryName(name).includes(normalizeCategoryName(dishCategory)),
  );

  useEffect(() => {
    if (!showCategorySuggestions) return;

    function handleOutsideClick(event) {
      if (!categoryPickerRef.current?.contains(event.target)) {
        setShowCategorySuggestions(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [showCategorySuggestions]);

  useEffect(() => {
    if (!isDishModalOpen) return;

    const scrollX = window.scrollX;
    const scrollY = window.scrollY || document.body.scrollTop;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyPosition = document.body.style.position;
    const previousBodyTop = document.body.style.top;
    const previousBodyWidth = document.body.style.width;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.position = previousBodyPosition;
      document.body.style.top = previousBodyTop;
      document.body.style.width = previousBodyWidth;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.scrollTo(scrollX, scrollY);
    };
  }, [isDishModalOpen]);

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
    setMenuDishes(props.menu?.menuDishes || []);
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
      props.selectedDishes.forEach((group) => {
        const groupKey = String(group.categoryId || group.category || "");

        if (!groupKey) return;

        const dishes = group.dishes || [];
        const relations = normalizeRelations(
          dishes,
          group.relations,
          group.relation || "or",
        );

        initialSelectedDishes[groupKey] = {
          categoryId: String(group.categoryId || groupKey),
          categoryName: group.category,
          relation: relations[0] || group.relation || "or",
          relations,
          dishes,
        };
      });
      setSelectedDishes(initialSelectedDishes);
    } else {
      setSelectedDishes({});
    }
  }, [
    restaurantContext?.restaurantData?.dish_categories,
    props.menu,
    props.selectedDishes,
    reset,
  ]);

  function handleDishClick(category, dish) {
    setSelectedDishes((prev) => {
      const groupKey = String(category._id);
      const existingGroup = prev[groupKey] || {
        categoryId: String(category._id),
        categoryName: category.name,
        relation: "or",
        relations: [],
        dishes: [],
      };
      const exists = existingGroup.dishes.some((d) => d._id === dish._id);

      if (!exists) {
        const nextDishes = [...existingGroup.dishes, dish];
        const nextRelations = normalizeRelations(
          nextDishes,
          existingGroup.relations,
          existingGroup.relation || "or",
        );

        return {
          ...prev,
          [groupKey]: {
            ...existingGroup,
            categoryName: category.name,
            relation: nextRelations[0] || existingGroup.relation || "or",
            relations: nextRelations,
            dishes: nextDishes,
          },
        };
      }

      return prev;
    });
  }

  function handleRemoveDish(groupKey, dishId) {
    const usedInAnotherGroup = selectedDishGroups.some(
      (group) => group.categoryId !== groupKey &&
        group.dishes.some((dish) => String(dish._id) === String(dishId)),
    );
    if (!usedInAnotherGroup) {
      setMenuDishes((prev) => prev.filter((dish) => String(dish._id) !== String(dishId)));
    }

    setSelectedDishes((prev) => {
      const updated = { ...prev };

      if (!updated[groupKey]) return prev;

      const dishIndex = updated[groupKey].dishes.findIndex(
        (dish) => dish._id === dishId,
      );

      if (dishIndex === -1) return prev;

      const nextDishes = updated[groupKey].dishes.filter(
        (dish) => dish._id !== dishId,
      );
      const currentRelations = updated[groupKey].relations || [];
      let nextRelations = [];

      if (nextDishes.length > 1) {
        if (dishIndex === 0) {
          nextRelations = currentRelations.slice(1);
        } else if (dishIndex === updated[groupKey].dishes.length - 1) {
          nextRelations = currentRelations.slice(0, -1);
        } else {
          nextRelations = currentRelations.filter(
            (_, relationIndex) => relationIndex !== dishIndex,
          );
        }

        nextRelations = normalizeRelations(
          nextDishes,
          nextRelations,
          updated[groupKey].relation || "or",
        );
      }

      updated[groupKey] = {
        ...updated[groupKey],
        relation: nextRelations[0] || updated[groupKey].relation || "or",
        relations: nextRelations,
        dishes: nextDishes,
      };

      if (!updated[groupKey].dishes.length) {
        delete updated[groupKey];
      }

      return updated;
    });
  }

  function closeDishModal() {
    setIsDishModalOpen(false);
    setShowCategorySuggestions(false);
    setDishCategory("");
    setDishName("");
    setDishDescription("");
  }

  function handleAddMenuDish() {
    const categoryName = dishCategory.trim().replace(/\s+/g, " ");
    const name = dishName.trim();
    if (!categoryName || !name) return;

    const matchingGroup = selectedDishGroups.find(
      (group) => normalizeCategoryName(group.categoryName) === normalizeCategoryName(categoryName),
    );
    const matchingCategory = categories.find(
      (category) => normalizeCategoryName(category.name) === normalizeCategoryName(categoryName),
    );
    const groupKey = matchingGroup?.categoryId || String(matchingCategory?._id || `menu-${createDishId()}`);
    const dish = {
      _id: createDishId(),
      name,
      description: dishDescription.trim(),
    };

    setSelectedDishes((prev) => {
      const existingGroup = prev[groupKey] || {
        categoryId: groupKey,
        categoryName: matchingCategory?.name || categoryName,
        relation: "or",
        relations: [],
        dishes: [],
      };
      const dishes = [...existingGroup.dishes, dish];
      const relations = normalizeRelations(dishes, existingGroup.relations, existingGroup.relation);

      return {
        ...prev,
        [groupKey]: {
          ...existingGroup,
          relation: relations[0] || existingGroup.relation,
          relations,
          dishes,
        },
      };
    });
    setMenuDishes((prev) => [...prev, dish]);
    closeDishModal();
  }

  function handleRelationChange(groupKey, relationIndex, relation) {
    setSelectedDishes((prev) => {
      if (!prev[groupKey]) return prev;

      const currentGroup = prev[groupKey];
      const nextRelations = [...(currentGroup.relations || [])];
      nextRelations[relationIndex] = relation === "and" ? "and" : "or";
      const normalizedRelations = normalizeRelations(
        currentGroup.dishes,
        nextRelations,
        currentGroup.relation || "or",
      );

      return {
        ...prev,
        [groupKey]: {
          ...currentGroup,
          relation: normalizedRelations[0] || currentGroup.relation || "or",
          relations: normalizedRelations,
        },
      };
    });
  }

  function onSubmit(data) {
    setIsLoading(true);

    const priceValue =
      data.price === "" || data.price === null
        ? null
        : parseFloat(String(data.price).replace(",", "."));

    const customGroups = selectedDishGroups
      .map((group) => ({
        categoryId: group.categoryId,
        categoryName: group.categoryName,
        relation: group.relation || "or",
        relations: normalizeRelations(
          group.dishes,
          group.relations,
          group.relation || "or",
        ),
        dishes: group.dishes.map((dish) => dish._id),
      }))
      .filter((group) => group.dishes.length > 0);
    const usedDishIds = new Set(customGroups.flatMap((group) => group.dishes.map(String)));
    const usedMenuDishes = menuDishes.filter((dish) => usedDishIds.has(String(dish._id)));

    const formattedData = {
      type: props.menuType,
      name: data.name,
      description: data.description || "",
      price: priceValue,
      dishes: customGroups.flatMap((group) => group.dishes),
      customGroups,
      ...(usedMenuDishes.length > 0 || props.menu?.menuDishes?.length > 0
        ? { menuDishes: usedMenuDishes }
        : {}),
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

  const hasSelectedDishes = selectedDishGroups.length > 0;

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
                className={`h-11 w-full rounded-xl border bg-white/80 px-3 text-base outline-none transition ${
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
                className="w-full rounded-xl border border-darkBlue/10 bg-white/80 px-3 py-2 text-base resize-none outline-none transition"
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
                  className="h-11 w-full border-l border-darkBlue/10 px-3 text-base outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  disabled={!props.isEditing}
                  onWheel={(e) => e.target.blur()}
                />
              </div>
            </div>
          </div>

          {/* Carte : plats sélectionnés */}
          <div className="relative rounded-2xl border border-darkBlue/10 bg-white/50 px-4 py-4 shadow-[0_18px_45px_rgba(19,30,54,0.06)]">
            <div className="relative flex min-h-7 items-center justify-center">
              <h2 className="text-center text-base font-semibold text-darkBlue">
                {t("form.custom.labels.selectedDishes")}
              </h2>
              {props.isEditing && (
                <button
                  type="button"
                  onClick={() => setIsDishModalOpen(true)}
                  aria-label={locale === "fr" ? "Créer un plat pour ce menu" : "Create a dish for this menu"}
                  title={locale === "fr" ? "Créer un plat pour ce menu" : "Create a dish for this menu"}
                  className="absolute right-0 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-blue text-lg leading-none text-white hover:bg-blue/90"
                >
                  +
                </button>
              )}
            </div>

            {!hasSelectedDishes ? (
              <p className="mt-4 text-xs tablet:text-sm text-darkBlue/40 italic text-center text-pretty">
                {t("form.custom.labels.selectPlaceholder")}
              </p>
            ) : (
              <div className="mt-4 flex flex-col gap-4">
                {selectedDishGroups.map((group) => {
                  const dishes = group.dishes || [];
                  const relations = normalizeRelations(
                    dishes,
                    group.relations,
                    group.relation || "or",
                  );

                  return (
                    <div key={group.categoryId} className="flex flex-col gap-2">
                      {/* Titre de catégorie */}
                      <div className="relative py-1">
                        <h3 className="relative mx-auto w-fit rounded-full border border-darkBlue/10 bg-white px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-darkBlue z-10">
                          {group.categoryName}
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
                                    handleRemoveDish(group.categoryId, dish._id)
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

                                {props.isEditing ? (
                                  <div className="inline-flex rounded-full border border-darkBlue/10 bg-white p-1 shadow-sm">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleRelationChange(
                                          group.categoryId,
                                          i,
                                          "or",
                                        )
                                      }
                                      className={`min-w-[46px] rounded-full px-1 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] transition ${
                                        relations[i] !== "and"
                                          ? "bg-blue text-white"
                                          : "text-darkBlue/60 hover:bg-darkBlue/5"
                                      }`}
                                    >
                                      {t("form.custom.labels.or")}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleRelationChange(
                                          group.categoryId,
                                          i,
                                          "and",
                                        )
                                      }
                                      className={`min-w-[46px] rounded-full px-1 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] transition ${
                                        relations[i] === "and"
                                          ? "bg-blue text-white"
                                          : "text-darkBlue/60 hover:bg-darkBlue/5"
                                      }`}
                                    >
                                      {t("form.custom.labels.and")}
                                    </button>
                                  </div>
                                ) : (
                                  <span>
                                    {relations[i] === "and"
                                      ? t("form.custom.labels.and")
                                      : t("form.custom.labels.or")}
                                  </span>
                                )}

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
          <div className="w-full flex-1 tablet:sticky tablet:top-6 tablet:self-start tablet:max-h-[calc(100vh-3rem)] tablet:overflow-y-auto tablet:pr-1">
            <GlobalDishesComponent
              createMenu={true}
              categories={categories}
              onDishClick={handleDishClick}
            />
          </div>
        )}
      </div>

      {isDishModalOpen && createPortal(
        <div
          className="fixed inset-0 z-[260] flex items-center justify-center overflow-y-auto overscroll-contain p-4"
        >
          <div className="absolute inset-0 bg-darkBlue/30" onMouseDown={closeDishModal} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="menu-dish-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") closeDishModal();
              if (event.key === "Enter" && event.target.tagName === "INPUT") {
                event.preventDefault();
                handleAddMenuDish();
              }
            }}
            className="relative z-[1] w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <h2 id="menu-dish-title" className="mb-5 text-center text-lg font-semibold text-darkBlue">
              {locale === "fr" ? "Ajouter un plat au menu" : "Add a dish to the menu"}
            </h2>
            <div className="flex flex-col gap-4">
              <div ref={categoryPickerRef} className="relative flex flex-col gap-1">
                <label htmlFor="menu-dish-category" className="text-xs font-semibold uppercase tracking-[0.08em] text-darkBlue/70">
                  {locale === "fr" ? "Catégorie" : "Category"}
                </label>
                <input
                  id="menu-dish-category"
                  type="text"
                  value={dishCategory}
                  onFocus={() => setShowCategorySuggestions(true)}
                  onChange={(event) => {
                    setDishCategory(event.target.value);
                    setShowCategorySuggestions(true);
                  }}
                  autoComplete="off"
                  className="h-11 w-full rounded-xl border border-darkBlue/10 px-3 outline-none focus:border-darkBlue/40"
                />
                {showCategorySuggestions && filteredCategoryOptions.length > 0 && (
                  <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-44 overflow-y-auto rounded-xl border border-darkBlue/10 bg-white py-1 shadow-lg">
                    {filteredCategoryOptions.map((name) => (
                      <li key={normalizeCategoryName(name)}>
                        <button
                          type="button"
                          onClick={() => {
                            setDishCategory(name);
                            setShowCategorySuggestions(false);
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-darkBlue hover:bg-lightGrey"
                        >
                          {name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="menu-dish-name" className="text-xs font-semibold uppercase tracking-[0.08em] text-darkBlue/70">
                  {locale === "fr" ? "Nom du plat" : "Dish name"}
                </label>
                <input id="menu-dish-name" type="text" value={dishName} onChange={(event) => setDishName(event.target.value)} className="h-11 w-full rounded-xl border border-darkBlue/10 px-3 outline-none focus:border-darkBlue/40" />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="menu-dish-description" className="text-xs font-semibold uppercase tracking-[0.08em] text-darkBlue/70">
                  {locale === "fr" ? "Description (facultative)" : "Description (optional)"}
                </label>
                <textarea id="menu-dish-description" rows={3} value={dishDescription} onChange={(event) => setDishDescription(event.target.value)} className="w-full resize-none rounded-xl border border-darkBlue/10 px-3 py-2 outline-none focus:border-darkBlue/40" />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={closeDishModal} className="rounded-xl border border-darkBlue/10 px-4 py-2 text-sm text-darkBlue">
                {locale === "fr" ? "Annuler" : "Cancel"}
              </button>
              <button type="button" onClick={handleAddMenuDish} disabled={!dishCategory.trim() || !dishName.trim()} className="rounded-xl bg-blue px-4 py-2 text-sm text-white disabled:opacity-50">
                {locale === "fr" ? "Ajouter" : "Add"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

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
