// I18N
import { useTranslation } from "next-i18next";

// SVG
import {
  BioSvg,
  DishSvg,
  GlutenFreeSvg,
  VeganSvg,
  VegetarianSvg,
} from "../_shared/_svgs/_index";

export default function GlobalDishesComponent(props) {
  const { t } = useTranslation("dishes");

  return (
    <div className="flex flex-col gap-6">
      {!props.createMenu && (
        <div className="pl-2 flex gap-2 items-center">
          <DishSvg width={30} height={30} fillColor="#131E3690" />

          <h1 className="pl-2 text-2xl">{t("titles.second")}</h1>
        </div>
      )}

      <div className="bg-white rounded-lg drop-shadow-sm p-12 max-w-[800px] mx-auto w-full flex flex-col gap-6">
        {props?.categories
          ?.filter(
            (category) =>
              category.visible &&
              category.dishes.some((dish) => dish.showOnWebsite)
          )
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
                  .filter((dish) => dish.showOnWebsite)
                  .map((dish, j) => (
                    <div
                      onClick={() => props.onDishClick(category, dish)}
                      key={j}
                      className={`flex items-center gap-4 justify-between ${props.createMenu && "cursor-pointer"}`}
                    >
                      <div className="flex flex-col">
                        <h3 className="text-lg font-semibold">{dish.name}</h3>

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
                          {dish.price.toFixed(2)} €
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
