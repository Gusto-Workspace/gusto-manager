import { useRouter } from "next/router";
import { useTranslation } from "next-i18next";

// SVG
import {
  BioSvg,
  DeleteSvg,
  DishSvg,
  EditSvg,
  GlutenFreeSvg,
  NoVisibleSvg,
  VeganSvg,
  VegetarianSvg,
} from "../_shared/_svgs/_index";

export default function ListDishesComponent(props) {
  const { t } = useTranslation("dishes");
  const router = useRouter();
  const { locale } = router;

  const currencySymbol = locale === "fr" ? "€" : "$";

  function handleAddClick() {
    router.push(`/dishes/${props.category._id}/add`);
  }

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex justify-between">
        <div className="pl-2 flex gap-2 items-center">
          <DishSvg width={30} height={30} fillColor="#131E3690" />

          <h1 className="pl-2 text-2xl">
            {t("titles.main")} / {props.category.name}
          </h1>
        </div>

        <button
          onClick={handleAddClick}
          className="bg-blue px-6 py-2 rounded-lg text-white cursor-pointer"
        >
          {t("buttons.add")}
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {props.category.dishes.map((dish, i) => {
          return (
            <div
              key={i}
              className="bg-white p-6 rounded-lg drop-shadow-sm flex justify-between items-center"
            >
              <div>
                <h3 className="text-lg">
                  {dish.name.charAt(0).toUpperCase() + dish.name.slice(1)}
                </h3>

                <p className="text-sm opacity-50">
                  {dish.description.charAt(0).toUpperCase() +
                    dish.description.slice(1)}
                </p>
              </div>

              <div className="flex gap-6 items-center">
                <div className="flex gap-2">
                  {dish.vegan && (
                    <VeganSvg
                      fillColor="white"
                      width={18}
                      height={18}
                      className="bg-red p-2 w-8 h-8 rounded-full opacity-70"
                    />
                  )}
                  {dish.vegetarian && (
                    <VegetarianSvg
                      fillColor="white"
                      width={18}
                      height={18}
                      className="bg-violet p-2 w-8 h-8 rounded-full opacity-70"
                    />
                  )}
                  {dish.bio && (
                    <BioSvg
                      fillColor="white"
                      width={18}
                      height={18}
                      className="bg-darkBlue p-2 w-8 h-8 rounded-full opacity-70"
                    />
                  )}
                  {dish.glutenFree && (
                    <GlutenFreeSvg
                      fillColor="white"
                      width={18}
                      height={18}
                      className="bg-blue p-2 w-8 h-8 rounded-full opacity-70"
                    />
                  )}
                </div>
                <p className="text-lg">
                  {dish.price.toFixed(2)} {currencySymbol}
                </p>

                <NoVisibleSvg
                  width={22}
                  height={22}
                  className={`${dish.showOnWebsite ? "opacity-10" : ""}`}
                />

                <div className="flex gap-2">
                  <button
                    className="hover:bg-[#4583FF] bg-[#4583FF99] p-[6px] rounded-full drop-shadow-xl transition-colors duration-300"
                    onClick={(e) => {
                      console.log("edit");
                    }}
                  >
                    <EditSvg
                      width={20}
                      height={20}
                      strokeColor="white"
                      fillColor="white"
                    />
                  </button>

                  <button
                    className="hover:bg-[#FF7664] bg-[#FF766499] p-[6px] rounded-full drop-shadow-xl transition-colors duration-300"
                    onClick={(e) => {
                      console.log("delete");
                    }}
                  >
                    <DeleteSvg
                      width={20}
                      height={20}
                      strokeColor="white"
                      fillColor="white"
                    />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
