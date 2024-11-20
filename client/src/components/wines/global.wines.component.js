// I18N
import { useTranslation } from "next-i18next";

// SVG
import { BioSvg, GlassSvg } from "../_shared/_svgs/_index";

export default function GlobalWinesComponent(props) {
  const { t } = useTranslation("wines");

  function groupByAppellation(wines) {
    return wines.reduce((acc, wine) => {
      const appellationKey = wine.appellation || "Sans Appellation";
      if (!acc[appellationKey]) acc[appellationKey] = [];
      acc[appellationKey].push(wine);
      return acc;
    }, {});
  }

  function getAllVolumes(categories) {
    const allVolumes = new Set();
    categories.forEach((category) => {
      category.wines.forEach((wine) =>
        wine.volumes.forEach((v) => allVolumes.add(v.volume))
      );
      category.subCategories.forEach((subCategory) => {
        subCategory.wines.forEach((wine) =>
          wine.volumes.forEach((v) => allVolumes.add(v.volume))
        );
      });
    });

    return Array.from(allVolumes)
      .map((volume) => {
        const [value, unit] = volume.split(" ");
        const volumeInLiters =
          unit === "CL" ? parseFloat(value) / 100 : parseFloat(value);
        return { originalVolume: volume, volumeInLiters };
      })
      .sort((a, b) => a.volumeInLiters - b.volumeInLiters)
      .map((v) => v.originalVolume);
  }

  const volumes = getAllVolumes(props.categories);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2 items-center">
        <GlassSvg width={30} height={30} fillColor="#131E3690" />
        <h1 className="pl-2 text-2xl">{t("titles.second")}</h1>
      </div>

      <div className="bg-white rounded-lg drop-shadow-sm p-12 max-w-[1200px] mx-auto w-full flex flex-col gap-6">
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
              {/* Titre de la catégorie */}
              <div className="relative">
                <h2 className="relative text-xl font-semibold uppercase text-center bg-white px-6 w-fit mx-auto z-20">
                  {category.name}
                </h2>

                <hr className="bg-darkBlue absolute h-[1px] w-full top-1/2 -translate-y-1/2 z-10 opacity-50" />
              </div>

              {/* Volumes affichés en haut à droite */}
              <div className="text-right font-semibold">
                {volumes.map((v, idx) => (
                  <span key={idx} className="inline-block w-24 text-center">
                    {v}
                  </span>
                ))}
              </div>

              {/* Affichage des vins groupés par appellation */}
              {category.wines.some((wine) => wine.showOnWebsite) && (
                <div className="flex flex-col gap-4">
                  {Object.entries(
                    groupByAppellation(
                      category.wines.filter((wine) => wine.showOnWebsite)
                    )
                  ).map(([appellation, wines], j) => (
                    <div key={j} className="flex flex-col gap-4">
                      {appellation !== "Sans Appellation" && (
                        <h3 className="text-lg font-semibold">{appellation}</h3>
                      )}

                      {wines.map((wine, k) => (
                        <div
                          key={k}
                          className="flex items-center justify-between gap-4 pb-2"
                        >
                          {/* Nom du vin + année */}
                          <div className="flex-1 flex items-center justify-between">
                            <p className="font-medium">
                              {wine.name}
                              {wine.bio && (
                                <BioSvg
                                  fillColor="white"
                                  width={9}
                                  height={9}
                                  className="bg-darkBlue p-1 w-4 h-4 rounded-full opacity-70 inline-block ml-2"
                                />
                              )}
                            </p>
                            <p className="text-sm">{wine.year || "-"}</p>
                          </div>

                          {/* Prix alignés sous les volumes */}
                          <div className="flex">
                            {volumes.map((volume, idx) => {
                              const matchingVolume = wine.volumes.find(
                                (v) => v.volume === volume
                              );
                              return (
                                <p
                                  key={idx}
                                  className="w-24 text-center text-sm"
                                >
                                  {matchingVolume
                                    ? `${matchingVolume.price.toFixed(2)} €`
                                    : "-"}
                                </p>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {/* Sous-catégories visibles */}
              {category.subCategories
                .filter(
                  (subCategory) =>
                    subCategory.visible &&
                    subCategory.wines.some((wine) => wine.showOnWebsite)
                )
                .map((subCategory, k) => (
                  <div key={k} className="flex flex-col gap-4 my-2">
                    {/* Nom de la sous-catégorie */}
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
                      <div key={l} className="flex flex-col">
                        {appellation !== "Sans Appellation" && (
                          <h4 className="text-lg font-semibold uppercase pb-2">
                            {appellation}
                          </h4>
                        )}

                        {wines.map((wine, m) => (
                          <div
                            key={m}
                            className="flex items-center justify-between gap-4 pb-2"
                          >
                            {/* Nom du vin + année */}
                            <div className="flex-1 flex items-center justify-between">
                              <p className="font-medium">
                                {wine.name}
                                {wine.bio && (
                                  <BioSvg
                                    fillColor="white"
                                    width={9}
                                    height={9}
                                    className="bg-darkBlue p-1 w-4 h-4 rounded-full opacity-70 inline-block ml-2"
                                  />
                                )}
                              </p>
                              <p className="text-sm">{wine.year || "-"}</p>
                            </div>

                            {/* Prix alignés sous les volumes */}
                            <div className="flex">
                              {volumes.map((volume, idx) => {
                                const matchingVolume = wine.volumes.find(
                                  (v) => v.volume === volume
                                );
                                return (
                                  <p
                                    key={idx}
                                    className="w-24 text-center text-sm"
                                  >
                                    {matchingVolume
                                      ? `${matchingVolume.price.toFixed(2)} €`
                                      : "-"}
                                  </p>
                                );
                              })}
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
