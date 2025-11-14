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
import {
  BioSvg,
  DishSvg,
  GlutenFreeSvg,
  VeganSvg,
  VegetarianSvg,
} from "../../_shared/_svgs/_index";

export default function AddDishesComponent(props) {
  const { t } = useTranslation("dishes");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();
  const { locale } = router;
  const currencySymbol = locale === "fr" ? "€" : "$";

  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
      name: "",
      description: "",
      price: "",
      showOnSite: "yes",
      vegan: false,
      vegetarian: false,
      bio: false,
      glutenFree: false,
    },
  });

  const showOnSite = watch("showOnSite");

  useEffect(() => {
    if (props.dish) {
      reset({
        name: props.dish.name || "",
        description: props.dish.description || "",
        price:
          props.dish.price !== undefined && props.dish.price !== null
            ? props.dish.price
            : "",
        vegan: !!props.dish.vegan,
        vegetarian: !!props.dish.vegetarian,
        bio: !!props.dish.bio,
        glutenFree: !!props.dish.glutenFree,
        showOnSite: props.dish.showOnWebsite ? "yes" : "no",
      });
    } else {
      reset({
        name: "",
        description: "",
        price: "",
        showOnSite: "yes",
        vegan: false,
        vegetarian: false,
        bio: false,
        glutenFree: false,
      });
    }
  }, [props.dish, reset]);

  async function onSubmit(data) {
    setIsLoading(true);

    const formattedData = {
      name: data.name?.trim(),
      description: data.description?.trim() || "",
      vegan: !!data.vegan,
      vegetarian: !!data.vegetarian,
      bio: !!data.bio,
      glutenFree: !!data.glutenFree,
      showOnWebsite: data.showOnSite === "yes",
      price:
        data.price !== "" && data.price != null
          ? parseFloat(String(data.price).replace(",", "."))
          : null,
      categoryId: props.category._id,
    };

    try {
      const apiUrl = props.dish
        ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/dishes/${props.dish._id}`
        : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/dishes`;

      const method = props.dish ? "put" : "post";

      const response = await axios[method](apiUrl, formattedData);

      restaurantContext.setRestaurantData(response.data.restaurant);

      router.push(`/dashboard/dishes/${props.category._id}`);
    } catch (error) {
      console.error("Error adding or editing dish:", error);
      setIsLoading(false);
    }
  }

  // ---- Styles communs (alignés sur InventoryLotForm) ----
  const cardCls =
    "rounded-2xl border border-darkBlue/10 bg-white/50 px-4 py-4 tablet:px-6 tablet:py-5 shadow-[0_18px_45px_rgba(19,30,54,0.06)] flex flex-col gap-4";
  const fieldWrap = "flex flex-col gap-1 tablet:gap-1.5";
  const labelCls =
    "text-xs font-semibold uppercase tracking-[0.08em] text-darkBlue/70 flex items-center gap-2";
  const inputCls =
    "h-11 w-full rounded-xl border border-darkBlue/10 bg-white/80 px-3 text-sm outline-none transition placeholder:text-darkBlue/40";
  const btnPrimary =
    "inline-flex min-w-[120px] items-center justify-center rounded-xl bg-blue text-white text-sm font-medium px-4 py-2.5 shadow-sm hover:bg-blue/90 transition disabled:opacity-60 disabled:cursor-not-allowed";
  const btnSecondary =
    "inline-flex min-w-[120px] items-center justify-center rounded-xl border border-red bg-red text-white text-sm font-medium px-4 py-2.5 shadow-sm hover:bg-red/90 transition disabled:opacity-60 disabled:cursor-not-allowed";
  const badgeToggleBase =
    "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition cursor-pointer select-none";
  const errorTextCls = "text-[11px] text-red mt-0.5";

  const veganChecked = watch("vegan");
  const vegetarianChecked = watch("vegetarian");
  const bioChecked = watch("bio");
  const glutenFreeChecked = watch("glutenFree");

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />
      <div className="flex gap-2 min-h-[40px] items-center">
        <DishSvg width={30} height={30} fillColor="#131E3690" />
        <h1 className="pl-2 text-xl tablet:text-2xl flex items-center gap-2 flex-wrap">
          <span>{t("titles.main")}</span>
          {props.category && (
            <>
              <span>/</span> <span>{props.category.name}</span>
            </>
          )}
          <span>/</span>
          <span>{props.dish ? t("buttons.edit") : t("buttons.add")}</span>
        </h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        {/* Carte infos générales (nom, description, prix) */}
        <div className={cardCls}>
          <div className="flex items-center gap-2 text-darkBlue">
            <span className="inline-flex h-7 px-3 items-center justify-center rounded-full bg-darkBlue/5 text-[11px] font-semibold uppercase tracking-[0.12em] text-darkBlue">
              {t("Informations générales du plat")}
            </span>
          </div>

          <div className="grid gap-4 tablet:grid-cols-2">
            {/* Nom */}
            <div className={fieldWrap}>
              <label className={labelCls}>
                {t("form.labels.name")}
                <span className="text-red ml-1">*</span>
              </label>

              <input
                type="text"
                placeholder="-"
                {...register("name", { required: true })}
                className={`${inputCls} ${
                  errors.name ? "border-red ring-1 ring-red/30" : ""
                }`}
              />
              {errors.name && (
                <p className={errorTextCls}>{t("form.errors.required")}</p>
              )}
            </div>

            {/* Description */}
            <div className={fieldWrap}>
              <label className={labelCls}>
                <span>{t("form.labels.description")}</span>
                <span className="text-[11px] text-darkBlue/40 ml-2 italic">
                  {t("form.labels.optional")}
                </span>
              </label>

              <input
                type="text"
                placeholder="-"
                {...register("description")}
                className={inputCls}
              />
            </div>

            {/* Prix */}
            <div className={fieldWrap}>
              <label className={labelCls}>
                {t("form.labels.price")}
                <span className="text-red ml-1">*</span>
              </label>

              <div className="flex items-stretch rounded-xl border border-darkBlue/10 bg-white/80 overflow-hidden text-sm">
                <span
                  className={`px-3 inline-flex items-center text-darkBlue/70 select-none ${
                    errors.price ? "text-red" : ""
                  }`}
                >
                  {currencySymbol}
                </span>

                <input
                  type="number"
                  placeholder="-"
                  step="0.01"
                  onWheel={(e) => e.currentTarget.blur()}
                  {...register("price", {
                    validate: (v) => v !== "" && v != null,
                  })}
                  className={`h-11 w-full border-l px-3 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                    errors.price
                      ? "border-red text-red"
                      : "border-darkBlue/10 text-darkBlue"
                  }`}
                />
              </div>

              {errors.price && (
                <p className={errorTextCls}>{t("form.errors.required")}</p>
              )}
            </div>
          </div>
        </div>

        {/* Carte caractéristiques & statut */}
        <div className={cardCls}>
          {/* Etiquettes (vegan, végétarien, etc.) */}
          <div className="flex flex-col gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-darkBlue/70">
              {t("Régimes & particularités")}
            </span>

            <div className="flex flex-wrap gap-3">
              {/* Vegan */}
              <label
                className={`${badgeToggleBase} ${
                  veganChecked
                    ? "border-[#4ead7a80] bg-[#4ead7a1a] text-darkBlue"
                    : "border-darkBlue/10 bg-white/80 text-darkBlue/70"
                }`}
              >
                <input
                  type="checkbox"
                  {...register("vegan")}
                  className="sr-only"
                />
                <span className="text-xs">{t("form.labels.vegan")}</span>
                <span
                  className="
                    inline-flex items-center justify-center
                    h-7 w-7 rounded-full
                    border border-[#4ead7a80] bg-[#4ead7a1a]
                  "
                >
                  <VeganSvg fillColor="#167a47" className="w-3.5 h-3.5" />
                </span>
              </label>

              {/* Vegetarian */}
              <label
                className={`${badgeToggleBase} ${
                  vegetarianChecked
                    ? "border-[#a855f780] bg-[#a855f71a] text-darkBlue"
                    : "border-darkBlue/10 bg-white/80 text-darkBlue/70"
                }`}
              >
                <input
                  type="checkbox"
                  {...register("vegetarian")}
                  className="sr-only"
                />
                <span className="text-xs">{t("form.labels.vegetarian")}</span>
                <span
                  className="
                    inline-flex items-center justify-center
                    h-7 w-7 rounded-full
                    border border-[#a855f780] bg-[#a855f71a]
                  "
                >
                  <VegetarianSvg fillColor="#7c3aed" className="w-3.5 h-3.5" />
                </span>
              </label>

              {/* Bio */}
              <label
                className={`${badgeToggleBase} ${
                  bioChecked
                    ? "border-darkBlue/40 bg-darkBlue/5 text-darkBlue"
                    : "border-darkBlue/10 bg-white/80 text-darkBlue/70"
                }`}
              >
                <input
                  type="checkbox"
                  {...register("bio")}
                  className="sr-only"
                />
                <span className="text-xs">{t("form.labels.bio")}</span>
                <span
                  className="
                    inline-flex items-center justify-center
                    h-7 w-7 rounded-full
                    border border-darkBlue/40 bg-darkBlue/5
                  "
                >
                  <BioSvg fillColor="#131E36" className="w-3.5 h-3.5" />
                </span>
              </label>

              {/* Gluten free */}
              <label
                className={`${badgeToggleBase} ${
                  glutenFreeChecked
                    ? "border-[#3b82f680] bg-[#3b82f61a] text-darkBlue"
                    : "border-darkBlue/10 bg-white/80 text-darkBlue/70"
                }`}
              >
                <input
                  type="checkbox"
                  {...register("glutenFree")}
                  className="sr-only"
                />
                <span className="text-xs">{t("form.labels.glutenFree")}</span>
                <span
                  className="
                    inline-flex items-center justify-center
                    h-7 w-7 rounded-full
                    border border-[#3b82f680] bg-[#3b82f61a]
                  "
                >
                  <GlutenFreeSvg fillColor="#1d4ed8" className="w-3.5 h-3.5" />
                </span>
              </label>
            </div>
          </div>

          {/* Statut affichage sur le site */}
          <div className="flex flex-col gap-2 mt-2">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-darkBlue/70">
              {t("form.labels.status")}
            </span>

            <div className="flex flex-wrap gap-3">
              {/* Visible */}
              <label
                className={`${badgeToggleBase} ${
                  showOnSite === "yes"
                    ? "border-[#4ead7a80] bg-[#4ead7a1a] text-darkBlue"
                    : "border-darkBlue/10 bg-white/80 text-darkBlue/70"
                }`}
              >
                <input
                  type="radio"
                  value="yes"
                  {...register("showOnSite")}
                  className="sr-only"
                />
                <span className="text-xs">{t("buttons.yes")}</span>
              </label>

              {/* Non visible */}
              <label
                className={`${badgeToggleBase} ${
                  showOnSite === "no"
                    ? "border-darkBlue/40 bg-darkBlue/5 text-darkBlue"
                    : "border-darkBlue/10 bg-white/80 text-darkBlue/70"
                }`}
              >
                <input
                  type="radio"
                  value="no"
                  {...register("showOnSite")}
                  className="sr-only"
                />
                <span className="text-xs">{t("buttons.no")}</span>
              </label>
            </div>
          </div>
        </div>

        {/* Boutons bas de page */}
        <div className="flex flex-col gap-3 tablet:flex-row tablet:justify-start pt-1">
          <button type="submit" className={btnPrimary} disabled={isLoading}>
            {isLoading ? t("buttons.loading") : t("buttons.save")}
          </button>

          <button
            type="button"
            className={btnSecondary}
            onClick={() => router.back()}
            disabled={isLoading}
          >
            {t("buttons.cancel")}
          </button>
        </div>
      </form>
    </section>
  );
}
