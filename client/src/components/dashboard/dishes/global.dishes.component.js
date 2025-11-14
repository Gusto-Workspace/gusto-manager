// I18N
import { useTranslation } from "next-i18next";

// SVG
import {
  BioSvg,
  GlassSvg,
  GlutenFreeSvg,
  VeganSvg,
  VegetarianSvg,
} from "../../_shared/_svgs/_index";

export default function GlobalDishesComponent(props) {
  const { t } = useTranslation("dishes");

  const sectionCls = "flex flex-col gap-6";
  const cardCls =
    "rounded-2xl border border-darkBlue/10 bg-white/50 px-4 py-4 tablet:px-8 tablet:py-6 max-w-[900px] mx-auto w-full flex flex-col gap-6 shadow-[0_18px_45px_rgba(19,30,54,0.06)]";

  return (
    <section className={sectionCls}>
      {/* Titre / header */}
      {!props.createMenu && (
        <div className="flex items-center gap-3">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-darkBlue/5">
            <GlassSvg width={22} height={22} fillColor="#131E3690" />
          </div>
          <h1 className="pl-1 text-xl tablet:text-2xl font-semibold text-darkBlue">
            {t("titles.second")}
          </h1>
        </div>
      )}

      {/* Carte principale */}
      <section className={cardCls}>
        {props?.categories
          ?.filter((category) => {
            const hasDishes = category.dishes && category.dishes.length > 0;

            if (props.createMenu) {
              return hasDishes;
            }

            return (
              hasDishes &&
              category.visible &&
              category.dishes.some((dish) => dish.showOnWebsite)
            );
          })
          .map((category, i) => (
            <div key={i} className="flex flex-col gap-4">
              {/* Titre de catégorie */}
              <div className="relative py-2">
                <h2 className="relative mx-auto w-fit rounded-full border border-darkBlue/10 bg-white px-5 py-1 text-xs tablet:text-sm font-semibold uppercase tracking-[0.08em] text-darkBlue z-10">
                  {category.name}
                </h2>
                <hr className="pointer-events-none absolute left-0 top-1/2 h-px w-full -translate-y-1/2 border-0 bg-darkBlue/10" />
              </div>

              {/* Liste des plats */}
              <div className="flex flex-col gap-2">
                {category?.dishes
                  .filter((dish) => props.createMenu || dish.showOnWebsite)
                  .map((dish, j) => {
                    const price =
                      typeof dish.price === "number"
                        ? dish.price.toFixed(2)
                        : null;

                    const isClickable = !!props.createMenu;

                    return (
                      <div
                        key={j}
                        onClick={() => {
                          if (props.createMenu) {
                            props.onDishClick(category, dish);
                          }
                        }}
                        className={`
                          flex items-center gap-4 justify-between
                          rounded-xl midTablet:px-3 py-2
                          transition-colors
                          ${
                            isClickable
                              ? "cursor-pointer hover:bg-darkBlue/3"
                              : "cursor-default"
                          }
                        `}
                      >
                        {/* Nom + description */}
                        <div className="flex flex-col">
                          <h3 className="text-sm tablet:text-base font-medium text-darkBlue">
                            {dish.name}
                          </h3>

                          {dish.description && (
                            <p className="text-xs tablet:text-sm text-darkBlue/60">
                              {dish.description.length > 80
                                ? dish.description.slice(0, 80) + "…"
                                : dish.description}
                            </p>
                          )}
                        </div>

                        {/* Icônes + prix */}
                        <div className="flex gap-4 items-center">
                          {/* Pictos régimes */}
                          <div className="flex items-center gap-1">
                            {dish.vegan && (
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#16a34a]/80 text-white text-[10px]">
                                <VeganSvg
                                  fillColor="white"
                                  width={10}
                                  height={10}
                                />
                              </span>
                            )}

                            {dish.vegetarian && (
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#a855f7]/80 text-white text-[10px]">
                                <VegetarianSvg
                                  fillColor="white"
                                  width={10}
                                  height={10}
                                />
                              </span>
                            )}

                            {dish.bio && (
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-darkBlue/80 text-white text-[10px]">
                                <BioSvg
                                  fillColor="white"
                                  width={10}
                                  height={10}
                                />
                              </span>
                            )}

                            {dish.glutenFree && (
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#3b82f6]/80 text-white text-[10px]">
                                <GlutenFreeSvg
                                  fillColor="white"
                                  width={10}
                                  height={10}
                                />
                              </span>
                            )}
                          </div>

                          {/* Prix */}
                          <p className="text-sm tablet:text-base font-semibold text-darkBlue whitespace-nowrap">
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
                  })}
              </div>
            </div>
          ))}
      </section>
    </section>
  );
}
