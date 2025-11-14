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
import { BioSvg, DrinkSvg } from "../../_shared/_svgs/_index";

export default function AddDrinksComponent(props) {
  const { t } = useTranslation("drinks");
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
      bio: false,
      year: "",
    },
  });

  const showOnSite = watch("showOnSite");
  const bioChecked = watch("bio");

  useEffect(() => {
    if (props.drink) {
      reset({
        name: props.drink.name || "",
        description: props.drink.description || "",
        price:
          props.drink.price !== undefined && props.drink.price !== null
            ? props.drink.price
            : "",
        bio: !!props.drink.bio,
        showOnSite: props.drink.showOnWebsite ? "yes" : "no",
        year: props.drink.year || "",
      });
    } else {
      reset({
        name: "",
        description: "",
        price: "",
        showOnSite: "yes",
        bio: false,
        year: "",
      });
    }
  }, [props.drink, reset]);

  async function onSubmit(data) {
    setIsLoading(true);

    const formattedData = {
      name: data.name?.trim(),
      description: data.description?.trim() || "",
      bio: !!data.bio,
      showOnWebsite: data.showOnSite === "yes",
      price:
        data.price !== "" && data.price != null
          ? parseFloat(String(data.price).replace(",", "."))
          : null,
      year: data.year || "",
      categoryId: props.category._id,
    };

    try {
      let apiUrl;
      const method = props.drink ? "put" : "post";

      if (props.subCategory) {
        // Si la boisson est ajoutée dans une sous-catégorie
        apiUrl = props.drink
          ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/drinks/categories/${props.category._id}/subcategories/${props.subCategory._id}/drinks/${props.drink._id}`
          : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/drinks/categories/${props.category._id}/subcategories/${props.subCategory._id}/drinks`;
      } else {
        // Si la boisson est ajoutée dans une catégorie principale
        apiUrl = props.drink
          ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/drinks/${props.drink._id}`
          : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/drinks`;
      }

      const response = await axios[method](apiUrl, formattedData);

      restaurantContext.setRestaurantData(response.data.restaurant);

      // Redirige vers la catégorie ou sous-catégorie appropriée après l'ajout ou la modification
      if (props.subCategory) {
        const formattedCategoryName = props.category.name
          .replace(/\//g, "-")
          .replace(/\s+/g, "&")
          .toLowerCase();

        const formattedSubCategoryName = props.subCategory.name
          .replace(/\//g, "-")
          .replace(/\s+/g, "&")
          .toLowerCase();

        router.push(
          `/dashboard/drinks/${formattedCategoryName}-${props.category._id}/${formattedSubCategoryName}-${props.subCategory._id}`
        );
      } else {
        const formattedName = props.category.name
          .replace(/\//g, "-")
          .replace(/\s+/g, "&")
          .toLowerCase();

        router.push(`/dashboard/drinks/${formattedName}-${props.category._id}`);
      }
    } catch (error) {
      console.error("Error adding or editing drink:", error);
      setIsLoading(false);
    }
  }

  // ---- Styles communs (copiés du composant modèle AddDishesComponent) ----
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

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex gap-2 min-h-[40px] items-center">
        <DrinkSvg
          width={30}
          height={30}
          className="min-h-[30px] min-w-[30px]"
          fillColor="#131E3690"
        />

        <h1 className="pl-2 text-xl tablet:text-2xl flex items-center gap-2 flex-wrap">
          <span>{t("titles.main")}</span>

          {props.category && (
            <>
              <span>/</span>
              <span>{props.category.name}</span>
            </>
          )}

          {props.subCategory && (
            <>
              <span>/</span>
              <span>{props.subCategory.name}</span>
            </>
          )}

          <span>/</span>
          <span>{props.drink ? t("buttons.edit") : t("buttons.add")}</span>
        </h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        {/* Carte infos générales (nom, description, prix) */}
        <div className={cardCls}>
          <div className="flex items-center gap-2 text-darkBlue">
            <span className="inline-flex h-7 px-3 items-center justify-center rounded-full bg-darkBlue/5 text-[11px] font-semibold uppercase tracking-[0.12em] text-darkBlue">
              {t("Informations générales de la boisson")}
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

        {/* Carte options & statut */}
        <div className={cardCls}>
          {/* Option Bio */}
          <div className="flex flex-col gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-darkBlue/70">
              {t("Régimes & particularités")}
            </span>

            <div className="flex flex-wrap gap-3">
              <label
                htmlFor="bio"
                className={`${badgeToggleBase} ${
                  bioChecked
                    ? "border-darkBlue/40 bg-darkBlue/5 text-darkBlue"
                    : "border-darkBlue/10 bg-white/80 text-darkBlue/70"
                }`}
              >
                <input
                  id="bio"
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
