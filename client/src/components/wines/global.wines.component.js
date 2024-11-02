// I18N
import { useTranslation } from "next-i18next";

// SVG
import { BioSvg, WineSvg } from "../_shared/_svgs/_index";

export default function GlobalWinesComponent(props) {
  const { t } = useTranslation("wines");

  // Fonction pour grouper les vins par appellation, incluant ceux sans appellation sous la clé "Sans Appellation"
  function groupByAppellation(wines) {
    return wines.reduce((acc, wine) => {
      const appellationKey = wine.appellation || "Sans Appellation";
      if (!acc[appellationKey]) acc[appellationKey] = [];
      acc[appellationKey].push(wine);
      return acc;
    }, {});
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2 items-center">
        <WineSvg width={30} height={30} fillColor="#131E3690" />
        <h1 className="pl-2 text-2xl">{t("titles.second")}</h1>
      </div>

      <div className="bg-white rounded-lg drop-shadow-sm p-12 max-w-[1000px] mx-auto w-full flex flex-col gap-6">
        {props.categories
          .filter(
            (category) =>
              category.visible &&
              (category.wines.some((wine) => wine.showOnWebsite) ||
                category.subCategories.some(
                  (subCategory) =>
                    subCategory.visible &&
                    subCategory.wines.some((wine) => wine.showOnWebsite)
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

              {/* Affichage des vins dans la catégorie principale groupés par appellation */}
              <div className="flex flex-col gap-4">
                {Object.entries(
                  groupByAppellation(
                    category.wines.filter((wine) => wine.showOnWebsite)
                  )
                ).map(([appellation, wines], j) => (
                  <div key={j}>
                    <h3 className="text-lg font-semibold">
                      {appellation !== "Sans Appellation" ? appellation : ""}
                    </h3>

                    {wines.map((wine, k) => (
                      <div
                        key={k}
                        className="flex items-center justify-between"
                      >
                        <div className="flex flex-col">
                          <h4 className="text-md">{wine.name}</h4>
                        </div>

                        <div className="flex gap-4 items-center">
                          {wine.bio && (
                            <BioSvg
                              fillColor="white"
                              width={9}
                              height={9}
                              className="bg-darkBlue p-1 w-4 h-4 rounded-full opacity-70"
                            />
                          )}

                          <p className="text-md">{wine.year}</p>

                          <p className="text-md min-w-[55px] text-right">
                            {wine.volume} {wine.unit}
                          </p>

                          <p className="text-md min-w-[75px] text-right">
                            {wine.price.toFixed(2)} €
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Affichage des sous-catégories visibles avec vins groupés par appellation */}
              {category.subCategories
                .filter(
                  (subCategory) =>
                    subCategory.visible &&
                    subCategory.wines.some((wine) => wine.showOnWebsite)
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

                    {Object.entries(
                      groupByAppellation(
                        subCategory.wines.filter((wine) => wine.showOnWebsite)
                      )
                    ).map(([appellation, wines], l) => (
                      <div key={l}>
                        <h4 className="text-lg font-semibold uppercase pb-2">
                          {appellation !== "Sans Appellation"
                            ? appellation
                            : ""}
                        </h4>

                        {wines.map((wine, m) => (
                          <div
                            key={m}
                            className="flex items-center justify-between"
                          >
                            <div className="flex flex-col">
                              <h4 className="text-md">{wine.name}</h4>
                            </div>

                            <div className="flex gap-4 items-center">
                              {wine.bio && (
                                <BioSvg
                                  fillColor="white"
                                  width={9}
                                  height={9}
                                  className="bg-darkBlue p-1 w-4 h-4 rounded-full opacity-70"
                                />
                              )}
                              <p className="text-md">{wine.year}</p>

                              <p className="text-md min-w-[55px] text-right">
                                {wine.volume} {wine.unit}
                              </p>

                              <p className="text-md min-w-[75px] text-right">
                                {wine.price.toFixed(2)} €
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          ))}
      </div>
    </div>
  );
}
