// I18N
import { useTranslation } from "next-i18next";

// SVG
import { BioSvg, GlassSvg } from "../../_shared/_svgs/_index";

export default function GlobalDrinksComponent(props) {
  const { t } = useTranslation("drinks");

  const sectionCls = "flex flex-col gap-6";
  const cardCls =
    "rounded-2xl border border-darkBlue/10 bg-white/50   px-4 py-4 tablet:px-8 tablet:py-6 max-w-[1000px] mx-auto w-full flex flex-col gap-8 shadow-[0_18px_45px_rgba(19,30,54,0.06)]";

  const pillCategoryTitle = (label) => (
    <div className="relative py-2">
      <h2 className="relative mx-auto w-fit rounded-full border border-darkBlue/10 bg-white px-5 py-1 text-xs tablet:text-sm font-semibold uppercase tracking-[0.08em] text-darkBlue z-10">
        {label}
      </h2>
      <hr className="pointer-events-none absolute left-0 top-1/2 h-px w-full -translate-y-1/2 border-0 bg-darkBlue/10" />
    </div>
  );

  const pillSubCategoryTitle = (label) => (
    <div className="relative py-1">
      <h3 className="relative mx-auto w-fit rounded-full bg-white px-4 py-0.5 text-[11px] tablet:text-xs font-semibold tracking-[0.08em] text-darkBlue z-10">
        {label}
      </h3>
      <div className="pointer-events-none absolute inset-x-[12%] top-1/2 h-px -translate-y-1/2 bg-darkBlue/10" />
    </div>
  );

  const renderDrinkRow = (drink, key) => {
    const price =
      typeof drink.price === "number" ? drink.price.toFixed(2) : null;

    return (
      <div
        key={key}
        className="
          group flex items-center justify-between gap-4 rounded-xl px-3 py-2
          transition-colors hover:bg-darkBlue/3
        "
      >
        <div className="flex flex-col min-w-0">
          <h3 className="text-sm tablet:text-base font-medium text-darkBlue truncate">
            {drink.name}
          </h3>
          {drink.description && (
            <p className="text-xs tablet:text-sm text-darkBlue/60">
              {drink.description.length > 80
                ? drink.description.slice(0, 80) + "…"
                : drink.description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {drink.bio && (
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-darkBlue/80 text-white text-[10px]">
              <BioSvg fillColor="white" width={10} height={10} />
            </span>
          )}
          <p className="text-sm tablet:text-base font-semibold text-darkBlue min-w-[66px] text-right">
            {price ? (
              <>
                {price} <span className="text-xs">€</span>
              </>
            ) : (
              "-"
            )}
          </p>
        </div>
      </div>
    );
  };

  return (
    <section className={sectionCls}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-darkBlue/5">
          <GlassSvg
            width={22}
            height={22}
            className="min-h-[22px] min-w-[22px]"
            fillColor="#131E3690"
          />
        </div>

        <h1 className="pl-1 text-xl tablet:text-2xl font-semibold text-darkBlue">
          {t("titles.second")}
        </h1>
      </div>

      {/* Carte principale */}
      <section className={cardCls}>
        {props.categories
          .filter(
            (category) =>
              category.visible &&
              (category.drinks.some((drink) => drink.showOnWebsite) ||
                category.subCategories.some(
                  (subCategory) =>
                    subCategory.visible &&
                    subCategory.drinks.some((drink) => drink.showOnWebsite)
                ))
          )
          .map((category, i) => (
            <div key={i} className="flex flex-col gap-6">
              {/* Titre de catégorie */}
              {pillCategoryTitle(category.name)}

              {/* Boissons de la catégorie principale */}
              {category.drinks.some((drink) => drink.showOnWebsite) && (
                <div className="grid grid-cols-1 midTablet:grid-cols-2 gap-y-3 gap-x-6">
                  {category.drinks
                    .filter((drink) => drink.showOnWebsite)
                    .map((drink, j) => renderDrinkRow(drink, j))}
                </div>
              )}

              {/* Sous-catégories visibles avec boissons */}
              {category.subCategories
                .filter(
                  (subCategory) =>
                    subCategory.visible &&
                    subCategory.drinks.some((drink) => drink.showOnWebsite)
                )
                .map((subCategory, k) => (
                  <div key={k} className="flex flex-col gap-4 mt-2">
                    {pillSubCategoryTitle(subCategory.name)}

                    <div className="grid grid-cols-1 midTablet:grid-cols-2 gap-y-3 gap-x-6 desktop:w-[95%] mx-auto midTablet:mx-0">
                      {subCategory.drinks
                        .filter((drink) => drink.showOnWebsite)
                        .map((drink, l) => renderDrinkRow(drink, l))}
                    </div>
                  </div>
                ))}
            </div>
          ))}
      </section>
    </section>
  );
}
