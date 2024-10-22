import { useRouter } from "next/router";
import { useTranslation } from "next-i18next";
import {
  BioSvg,
  GlutenFreeSvg,
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

  console.log(props.category);

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex justify-between">
        <h1 className="pl-2 text-2xl">
          {t("titles.main")} - {props.category.name}
        </h1>

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
                <h3>{dish.name}</h3>
                <p>{dish.description}</p>
              </div>

              <div className="flex gap-2 items-center">
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

                <p>
                  {dish.price.toFixed(2)} {currencySymbol}
                </p>
                <p>
                  {dish.showOnWebsite
                    ? t("form.labels.visible")
                    : t("form.labels.masked")}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
