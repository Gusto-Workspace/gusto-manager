import { useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";

// REACT HOOK FORM
import { useForm, useFieldArray, useWatch } from "react-hook-form";

// I18N
import { useTranslation } from "next-i18next";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// AXIOS
import axios from "axios";

// COMPONENTS
import CategoriesInputFixedMenuComponent from "./categories-input-fixed-menu.menus.component";

// ICONS (Lucide)
import {
  Layers,
  Info,
  PlusCircle,
  Trash2,
  AlertCircle,
  ChevronDown,
} from "lucide-react";

export default function FixedMenuComponent(props) {
  const { t } = useTranslation("menus");
  const router = useRouter();
  const { locale } = router;
  const { restaurantContext } = useContext(GlobalContext);

  const currencySymbol = locale === "fr" ? "€" : "$";

  const [categories, setCategories] = useState(
    restaurantContext?.restaurantData?.dish_categories
  );
  const [isLoading, setIsLoading] = useState(false);
  const [errorFields, setErrorFields] = useState([]);

  // index de l'option ouverte (accordion)
  const [openIndex, setOpenIndex] = useState(0);

  const { register, handleSubmit, reset, control } = useForm({
    defaultValues: {
      name: "",
      description: "",
      combinations: [
        { categories: [{ value: "" }], price: "", description: "" },
      ],
    },
  });

  const {
    fields: combinationFields,
    append: addCombination,
    remove: removeCombination,
  } = useFieldArray({
    control,
    name: "combinations",
  });

  // on regarde les valeurs pour afficher catégories + prix dans le header
  const combinationsValues = useWatch({
    control,
    name: "combinations",
  });

  useEffect(() => {
    if (props.menu) {
      const formattedCombinations =
        props.menu.combinations?.map((combo) => ({
          categories: combo.categories.map((category) => ({ value: category })),
          price: combo.price?.toString() || "",
          description: combo.description || "",
        })) || [];

      reset({
        name: props.menu.name || "",
        description: props.menu.description || "",
        combinations:
          formattedCombinations.length > 0
            ? formattedCombinations
            : [{ categories: [{ value: "" }], price: "", description: "" }],
      });

      setOpenIndex(0);
    }
  }, [props.menu, reset]);

  // useEffect(() => {
  //   const modifiedCategories =
  //     restaurantContext?.restaurantData?.dish_categories?.map((category) => ({
  //       ...category,
  //       name: category.name.endsWith("s")
  //         ? category.name.slice(0, -1)
  //         : category.name,
  //     })) || [];
  //   setCategories(modifiedCategories);
  // }, [restaurantContext?.restaurantData]);

  function onSubmit(data) {
    const emptyFields = data.combinations.reduce((acc, combo, comboIndex) => {
      const emptyCategories = combo.categories.reduce(
        (catAcc, cat, catIndex) => {
          if (!cat.value || cat.value === "") {
            catAcc.push(catIndex);
          }
          return catAcc;
        },
        []
      );
      const emptyPrice = combo.price === "";

      if (emptyCategories.length > 0 || emptyPrice) {
        acc.push({
          comboIndex,
          emptyCategories,
          emptyPrice,
        });
      }
      return acc;
    }, []);

    setErrorFields(emptyFields.length > 0 ? emptyFields : []);

    if (emptyFields.length > 0) {
      return;
    }

    setIsLoading(true);

    const formattedData = {
      type: props.menuType,
      name: data.name || "",
      description: data.description || "",
      combinations: data.combinations.map((combo) => ({
        categories: combo.categories.map((cat) => cat.value),
        price: parseFloat(combo.price),
        description: combo.description || "",
      })),
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

  function handleAddCombination() {
    addCombination({ categories: [{ value: "" }], price: "", description: "" });
    // la nouvelle option est à l'index = length avant append
    setOpenIndex(combinationFields.length);
  }

  const hasErrorsForCombo = (index) =>
    errorFields.some((error) => error.comboIndex === index);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Carte infos générales */}
      <div className="rounded-2xl border border-darkBlue/10 bg-white/50 px-4 py-4 tablet:px-6 tablet:py-5 shadow-[0_18px_45px_rgba(19,30,54,0.06)] flex flex-col gap-4">
        <div className="flex items-center gap-2 text-darkBlue">
          <Info className="h-5 w-5 text-darkBlue/70" />
          <span className="text-sm font-semibold uppercase tracking-[0.08em] text-darkBlue/70">
            {t("Informations générales du menu")}
          </span>
        </div>

        {/* Nom du menu */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-darkBlue/70">
            {t("form.fixed.labels.name")}
            <span className="ml-2 text-[11px] text-darkBlue/40 italic">
              {t("form.fixed.labels.optional")}
            </span>
          </label>

          <input
            type="text"
            placeholder="-"
            {...register("name")}
            className="h-11 w-full rounded-xl border border-darkBlue/10 bg-white/80 px-3 text-sm outline-none transition"
            disabled={!props.isEditing}
          />
        </div>

        {/* Description générale */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-darkBlue/70">
            {t("form.fixed.labels.generaleDescription")}
            <span className="ml-2 text-[11px] text-darkBlue/40 italic">
              {t("form.fixed.labels.optional")}
            </span>
          </label>

          <input
            type="text"
            placeholder="-"
            {...register("description")}
            className="h-11 w-full rounded-xl border border-darkBlue/10 bg-white/80 px-3 text-sm outline-none transition"
            disabled={!props.isEditing}
          />
        </div>
      </div>

      {/* Carte options/combinations */}
      <div className="rounded-2xl border border-darkBlue/10 bg-white/50 px-4 py-4 tablet:px-6 tablet:py-6 shadow-[0_18px_45px_rgba(19,30,54,0.06)] flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-darkBlue">
            <Layers className="h-5 w-5 text-darkBlue/70" />
            <span className="text-sm font-semibold uppercase tracking-[0.08em] py-1.5 text-darkBlue/70">
              {t("Choix des options")}
            </span>
          </div>

          {props.isEditing && (
            <button
              type="button"
              onClick={handleAddCombination}
              className="inline-flex items-center gap-2 rounded-xl border border-darkBlue/15 bg-darkBlue/5 px-3 py-1.5 text-xs font-medium text-darkBlue hover:bg-darkBlue/10 transition"
            >
              <PlusCircle className="h-4 w-4" />
              <span>{t("buttons.addOption")}</span>
            </button>
          )}
        </div>

        {combinationFields.map((field, i) => {
          const hasError = hasErrorsForCombo(i);
          const priceHasError = errorFields.some(
            (error) => error.comboIndex === i && error.emptyPrice
          );
          const isOpen = openIndex === i;

          const combo = combinationsValues?.[i] || {};
          const categoryLabels =
            combo?.categories?.map((c) => c?.value).filter(Boolean) || [];
          const categoriesSummary =
            categoryLabels.length > 0
              ? categoryLabels.join(" • ")
              : "Aucune catégorie sélectionnée";

          const priceSummary = combo?.price
            ? `${combo.price} ${currencySymbol}`
            : "—";

          return (
            <div
              key={field.id}
              className={`flex flex-col rounded-2xl border border-darkBlue/10 px-4 py-3 tablet:px-5 tablet:py-4 bg-white/80 transition-shadow ${
                hasError ? "border-red/50" : "border-darkBlue/8"
              }`}
            >
              {/* Header option cliquable */}
              <button
                type="button"
                onClick={() => setOpenIndex(i)}
                className="flex items-center justify-between gap-3 w-full text-left"
              >
                <div className="flex gap-4 items-center min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 px-3 items-center justify-center rounded-full bg-darkBlue/5 text-[11px] font-semibold uppercase tracking-[0.12em] text-darkBlue">
                      {t("form.fixed.labels.option")} {i + 1}
                    </span>

                    {hasError && (
                      <div className="flex items-center gap-1 text-[11px] text-red">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span>{t("form.fixed.labels.missingFields")}</span>
                      </div>
                    )}
                  </div>

                  <p className="text-[11px] text-darkBlue/60 truncate max-w-[260px]">
                    {categoriesSummary}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-medium text-darkBlue">
                    {priceSummary}
                  </span>

                  {props.isEditing && combinationFields.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeCombination(i);
                        setOpenIndex((prev) => {
                          if (prev === i) {
                            return i - 1 >= 0 ? i - 1 : 0;
                          }
                          if (prev > i) return prev - 1;
                          return prev;
                        });
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-red/20 bg-red/5 px-3 py-1 text-[11px] font-medium text-red hover:bg-red/10 transition"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>{t("buttons.deleteOption")}</span>
                    </button>
                  )}

                  <ChevronDown
                    className={`h-4 w-4 text-darkBlue/50 transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </div>
              </button>

              {/* Contenu repliable */}
              <div
                className={`grid transition-[grid-template-rows,opacity,margin] duration-200 ${
                  isOpen
                    ? "grid-rows-[1fr] opacity-100"
                    : "grid-rows-[0fr] opacity-0 pointer-events-none"
                }`}
              >
                <div className="overflow-hidden flex flex-col gap-4">
                  {/* Catégories */}
                  <div className="flex flex-col mobile:flex-row flex-wrap gap-4 mt-3">
                    <CategoriesInputFixedMenuComponent
                      control={control}
                      register={register}
                      combinationIndex={i}
                      categories={categories}
                      errorFields={errorFields}
                      isEditing={props.isEditing}
                      setErrorFields={setErrorFields}
                    />
                  </div>

                  {/* Description de l’option */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold uppercase tracking-[0.08em] text-darkBlue/70">
                      {t("form.fixed.labels.description")}
                      <span className="ml-2 text-[11px] text-darkBlue/40 italic">
                        {t("form.fixed.labels.optional")}
                      </span>
                    </label>

                    <input
                      type="text"
                      placeholder="-"
                      {...register(`combinations.${i}.description`)}
                      className="h-11 w-full rounded-xl border border-darkBlue/10 bg-white px-3 text-sm outline-none transition"
                      disabled={!props.isEditing}
                    />
                  </div>

                  {/* Prix de l’option */}
                  <div className="flex flex-col gap-1 w-[200px]">
                    <label className="text-xs font-semibold uppercase tracking-[0.08em] text-darkBlue/70">
                      {t("form.fixed.labels.price")}
                    </label>

                    <div className="flex items-center rounded-xl border bg-white/80 overflow-hidden text-sm border-darkBlue/10">
                      <span
                        className={`px-3 select-none ${
                          priceHasError ? "text-red" : "text-darkBlue/70"
                        }`}
                      >
                        {currencySymbol}
                      </span>

                      <input
                        type="number"
                        placeholder="-"
                        step="0.01"
                        {...register(`combinations.${i}.price`, {})}
                        className={`h-11 border-l px-3 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
                          ${
                            priceHasError
                              ? "border-red/60 text-red"
                              : "border-darkBlue/10"
                          }`}
                        disabled={!props.isEditing}
                        onWheel={(e) => e.target.blur()}
                      />
                    </div>

                    {priceHasError && (
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-red">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span>{t("form.fixed.labels.priceRequired")}</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {props.isEditing && combinationFields.length > 0 && (
          <button
            type="button"
            onClick={handleAddCombination}
            className="inline-flex items-center gap-2 rounded-xl border border-darkBlue/15 bg-darkBlue/5 px-3 py-2 text-xs font-medium text-darkBlue hover:bg-darkBlue/10 transition w-fit"
          >
            <PlusCircle className="h-4 w-4" />
            <span>{t("buttons.addOption")}</span>
          </button>
        )}
      </div>

      {/* Boutons bas de page */}
      <div className="flex gap-3 justify-center pt-2">
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
