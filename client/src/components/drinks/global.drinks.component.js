// I18N
import { useTranslation } from "next-i18next";

// SVG
import { BioSvg, DrinkSvg } from "../_shared/_svgs/_index";

export default function GlobalDrinksComponent(props) {
  const { t } = useTranslation("drinks");

  return (
    <div className="flex flex-col gap-6">
      <div className="pl-2 flex gap-2 items-center">
        <DrinkSvg width={30} height={30} fillColor="#131E3690" />

        <h1 className="pl-2 text-2xl">{t("titles.second")}</h1>
      </div>

      <div className="bg-white rounded-lg drop-shadow-sm p-12 max-w-[800px] mx-auto w-full flex flex-col gap-6">
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
            <div key={i} className="flex flex-col gap-4">
              <div className="relative">
                <h2 className="relative text-xl font-semibold uppercase text-center bg-white px-6 w-fit mx-auto z-20">
                  {category.name}
                </h2>

                <hr className="bg-darkBlue absolute h-[1px] w-full top-1/2 -translate-y-1/2 z-10 opacity-50" />
              </div>

              {/* Affichage des boissons dans la catégorie principale */}
              <div className="flex flex-col gap-2">
                {category.drinks
                  .filter((drink) => drink.showOnWebsite)
                  .map((drink, j) => (
                    <div key={j} className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <h3 className="text-md font-semibold">{drink.name}</h3>
                        <p className="text-sm opacity-50">
                          {drink.description}
                        </p>
                      </div>

                      <div className="flex gap-4 items-center">
                        {drink.bio && (
                          <BioSvg
                            fillColor="white"
                            width={9}
                            height={9}
                            className="bg-darkBlue p-1 w-4 h-4 rounded-full opacity-70"
                          />
                        )}
                        <p className="text-md font-semibold">
                          {drink.price.toFixed(2)} €
                        </p>
                      </div>
                    </div>
                  ))}
              </div>

              {/* Affichage des sous-catégories visibles avec boissons */}
              {category.subCategories
                .filter(
                  (subCategory) =>
                    subCategory.visible &&
                    subCategory.drinks.some((drink) => drink.showOnWebsite)
                )
                .map((subCategory, k) => (
                  <div key={k} className="flex flex-col gap-4 mt-4">
                    <div className="relative">
                      <h3 className="relative font-semibold bg-white px-4 w-fit mx-auto z-20">
                        {subCategory.name}
                      </h3>

                      <hr className="bg-darkBlue absolute h-[1px] w-[350px] left-1/2 -translate-x-1/2 top-0 z-10 opacity-30" />

                      <hr className="bg-darkBlue absolute h-[1px] w-[350px] left-1/2 -translate-x-1/2 bottom-0 z-10 opacity-30" />
                    </div>

                    {/* Affichage des boissons dans la sous-catégorie */}
                    <div className="flex flex-col gap-2">
                      {subCategory.drinks
                        .filter((drink) => drink.showOnWebsite)
                        .map((drink, l) => (
                          <div
                            key={l}
                            className="flex items-center justify-between"
                          >
                            <div className="flex flex-col">
                              <h4 className="text-md font-semibold">
                                {drink.name}
                              </h4>

                              <p className="text-sm opacity-50">
                                {drink.description}
                              </p>
                            </div>

                            <div className="flex gap-4 items-center">
                              {drink.bio && (
                                <BioSvg
                                  fillColor="white"
                                  width={9}
                                  height={9}
                                  className="bg-darkBlue p-1 w-4 h-4 rounded-full opacity-70"
                                />
                              )}
                              <p className="text-md font-semibold">
                                {drink.price.toFixed(2)} €
                              </p>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
            </div>
          ))}
      </div>
    </div>
  );
}