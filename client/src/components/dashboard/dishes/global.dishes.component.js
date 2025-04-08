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

  return (
    <div className="flex flex-col gap-6">
      {!props.createMenu && (
        <div className="flex gap-2 items-center">
          <GlassSvg width={30} height={30} fillColor="#131E3690" />

          <h1 className="pl-2 text-2xl">{t("titles.second")}</h1>
        </div>
      )}

      <div className="bg-white rounded-lg drop-shadow-sm p-4 tablet:p-12 max-w-[800px] mx-auto w-full flex flex-col gap-6">
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
            <div key={i} className="flex flex-col gap-6">
              <div className="relative">
                <h2 className="relative text-xl font-semibold uppercase text-center bg-white px-6 w-fit mx-auto z-20">
                  {category.name}
                </h2>
                <hr className="bg-darkBlue absolute h-[1px] w-full top-1/2 -translate-y-1/2 z-10 opacity-50" />
              </div>

              <div className="flex flex-col gap-4">
                {category?.dishes
                  .filter((dish) => props.createMenu || dish.showOnWebsite)
                  .map((dish, j) => (
                    <div
                      onClick={() => {
                        props.createMenu
                          ? props.onDishClick(category, dish)
                          : null;
                      }}
                      key={j}
                      className={`flex items-center gap-4 justify-between ${
                        props.createMenu && "cursor-pointer"
                      }`}
                    >
                      <div className="flex flex-col">
                        <h3>{dish.name}</h3>
                        <p className="text-sm opacity-50">
                          {dish.description.length > 50
                            ? dish.description.slice(0, 50) + "..."
                            : dish.description}
                        </p>
                      </div>

                      <div className="flex gap-4 items-center">
                        <div className="flex gap-1">
                          {dish.vegan && (
                            <VeganSvg
                              fillColor="white"
                              width={9}
                              height={9}
                              className="bg-red p-1 w-4 h-4 rounded-full opacity-70"
                            />
                          )}

                          {dish.vegetarian && (
                            <VegetarianSvg
                              fillColor="white"
                              width={9}
                              height={9}
                              className="bg-violet p-1 w-4 h-4 rounded-full opacity-70"
                            />
                          )}

                          {dish.bio && (
                            <BioSvg
                              fillColor="white"
                              width={9}
                              height={9}
                              className="bg-darkBlue p-1 w-4 h-4 rounded-full opacity-70"
                            />
                          )}

                          {dish.glutenFree && (
                            <GlutenFreeSvg
                              fillColor="white"
                              width={9}
                              height={9}
                              className="bg-blue p-1 w-4 h-4 rounded-full opacity-70"
                            />
                          )}
                        </div>

                        <p className="text-md font-semibold whitespace-nowrap">
                          {dish?.price?.toFixed(2)} {dish?.price && "€"}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
