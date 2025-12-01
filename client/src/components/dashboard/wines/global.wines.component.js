// I18N
import { useTranslation } from "next-i18next";

// SVG
import { BioSvg, GlassSvg } from "../../_shared/_svgs/_index";

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

  const outerSectionCls = "flex flex-col gap-6";
  const cardWrapperCls =
    "overflow-x-auto max-w-[calc(100vw-48px)] tablet:max-w-[calc(100vw-318px)]";
  const cardCls =
    "w-[1024px] tablet:max-w-[1024px] desktop:max-w-[1024px] desktop:mx-auto " +
    "rounded-2xl border border-darkBlue/10 bg-white/50 " +
    "px-4 py-4 tablet:px-8 tablet:py-6 flex flex-col gap-8 shadow-[0_18px_45px_rgba(19,30,54,0.06)]";

  const pillCategoryTitle = (label) => (
    <div className="relative py-2">
      <h2 className="relative mx-auto w-fit rounded-full border border-darkBlue/10 bg-white px-5 py-1 text-xs tablet:text-sm font-semibold uppercase tracking-[0.08em] text-darkBlue z-10">
        {label}
      </h2>
      <hr className="pointer-events-none absolute left-0 top-1/2 h-px w-full -translate-y-1/2 border-0 bg-darkBlue/10" />
    </div>
  );

  const pillSubCategoryTitle = (label) => (
    <div className="relative py-1 mt-2">
      <h3 className="relative mx-auto w-fit rounded-full bg-white px-4 py-0.5 text-[11px] tablet:text-xs font-semibold tracking-[0.08em] text-darkBlue z-10">
        {label}
      </h3>
      <div className="pointer-events-none absolute inset-x-[15%] top-1/2 h-px -translate-y-1/2 bg-darkBlue/10" />
    </div>
  );

  const VolumesHeaderRow = () => (
    <div className="mt-2 flex items-center justify-between text-[11px] tablet:text-xs font-medium text-darkBlue/60">
      <span className="uppercase tracking-[0.12em] text-darkBlue/40">
        {t("volumes", "Volumes")}
      </span>
      <div className="flex">
        {volumes.map((v, idx) => (
          <span
            key={idx}
            className="w-24 text-center uppercase tracking-[0.08em]"
          >
            {v}
          </span>
        ))}
      </div>
    </div>
  );

  const WineRow = ({ wine }) => (
    <div className="flex items-center justify-between gap-4 py-2">
      {/* Nom + année */}
      <div className="flex-1 flex items-center justify-between flex-nowrap gap-4 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <p className="font-medium text-sm tablet:text-base text-darkBlue truncate">
            {wine.name}
          </p>
          {wine.bio && (
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-darkBlue/85">
              <BioSvg fillColor="white" width={9} height={9} />
            </span>
          )}
        </div>
        <p className="text-xs tablet:text-sm text-darkBlue/60 whitespace-nowrap">
          {wine.year || "-"}
        </p>
      </div>

      {/* Prix alignés sous volumes */}
      <div className="flex">
        {volumes.map((volume, idx) => {
          const matchingVolume = wine.volumes.find((v) => v.volume === volume);
          return (
            <p
              key={idx}
              className="w-24 text-center text-xs tablet:text-sm text-darkBlue"
            >
              {matchingVolume ? `${matchingVolume.price.toFixed(2)} €` : "-"}
            </p>
          );
        })}
      </div>
    </div>
  );

  return (
    <section className={outerSectionCls}>
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

      {/* Carte scrollable */}
      <div className={cardWrapperCls}>
        <section className={cardCls}>
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
                {/* Titre catégorie */}
                {pillCategoryTitle(category.name)}

                {/* Volumes header */}
                <VolumesHeaderRow />

                {/* Vins de la catégorie principale */}
                {category.wines.some((wine) => wine.showOnWebsite) && (
                  <div className="mt-2 flex flex-col gap-3">
                    {Object.entries(
                      groupByAppellation(
                        category.wines.filter((wine) => wine.showOnWebsite)
                      )
                    ).map(([appellation, wines], j) => (
                      <div key={j} className="flex flex-col gap-1">
                        {appellation !== "Sans Appellation" && (
                          <h3 className="text-xs tablet:text-sm font-semibold uppercase tracking-[0.08em] text-darkBlue/70 mt-3">
                            {appellation}
                          </h3>
                        )}

                        <div className="flex flex-col gap-1">
                          {wines.map((wine, k) => (
                            <WineRow key={k} wine={wine} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Sous-catégories */}
                {category.subCategories
                  .filter(
                    (subCategory) =>
                      subCategory.visible &&
                      subCategory.wines.some((wine) => wine.showOnWebsite)
                  )
                  .map((subCategory, k) => (
                    <div key={k} className="flex flex-col gap-3 mt-4">
                      {pillSubCategoryTitle(subCategory.name)}

                      {Object.entries(
                        groupByAppellation(
                          subCategory.wines.filter((wine) => wine.showOnWebsite)
                        )
                      ).map(([appellation, wines], l) => (
                        <div key={l} className="flex flex-col gap-1">
                          {appellation !== "Sans Appellation" && (
                            <h4 className="text-xs tablet:text-sm font-semibold uppercase tracking-[0.08em] text-darkBlue/70 mt-2">
                              {appellation}
                            </h4>
                          )}

                          <div className="flex flex-col gap-1">
                            {wines.map((wine, m) => (
                              <WineRow key={m} wine={wine} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
              </div>
            ))}
        </section>
      </div>
    </section>
  );
}
