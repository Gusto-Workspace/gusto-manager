// DND
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// SVG
import {
  BioSvg,
  DeleteSvg,
  DragSvg,
  EditSvg,
  GlutenFreeSvg,
  NoVisibleSvg,
  VeganSvg,
  VegetarianSvg,
} from "../../_shared/_svgs/_index";

// I18N
import { useTranslation } from "next-i18next";

export default function DetailsDishComponent(props) {
  const { t } = useTranslation("dishes");

  const { listeners, setNodeRef, transform, transition } = useSortable({
    id: props.dish._id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white p-4 midTablet:p-6 midTablet:pl-4 rounded-lg drop-shadow-sm flex flex-col midTablet:flex-row gap-1 midTablet:justify-between midTablet:items-center min-h-[100px]"
    >
      <div className="flex items-start midTablet:items-center gap-4">
        <button {...listeners} className="opacity-50 cursor-grab">
          <DragSvg width={25} height={25} />
        </button>

        <div>
          <h3 className="text-lg">
            {props.dish.name.charAt(0).toUpperCase() + props.dish.name.slice(1)}
          </h3>

          <p className="text-sm opacity-50">
            {props.dish.description.length > 35
              ? props.dish.description.charAt(0).toUpperCase() +
                props.dish.description.slice(1, 35) +
                "..."
              : props.dish.description.charAt(0).toUpperCase() +
                props.dish.description.slice(1)}
          </p>
        </div>
      </div>

      <div className="flex justify-between midTablet:justify-end flex-wrap gap-4 midTablet:gap-6 items-center">
        <div className="flex flex-row-reverse midTablet:flex-row items-center gap-6 justify-between w-full midTablet:w-auto">
          <div className="relative flex flex-wrap gap-2">
            {props.dish.vegan && (
              <div
                onMouseEnter={() =>
                  props.setHoveredTooltip(`${props.dish._id}-vegan`)
                }
                onMouseLeave={() => props.setHoveredTooltip(null)}
                className="relative"
              >
                <VeganSvg
                  fillColor="white"
                  className="bg-red p-2 w-7 h-7 midTablet:w-8 midTablet:h-8 rounded-full opacity-70"
                />
                {props.hoveredTooltip === `${props.dish._id}-vegan` && (
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 bg-darkBlue text-white text-xs p-2 rounded-lg whitespace-nowrap z-50">
                    {t("form.labels.vegan")}
                  </div>
                )}
              </div>
            )}

            {props.dish.vegetarian && (
              <div
                onMouseEnter={() =>
                  props.setHoveredTooltip(`${props.dish._id}-vegetarian`)
                }
                onMouseLeave={() => props.setHoveredTooltip(null)}
                className="relative"
              >
                <VegetarianSvg
                  fillColor="white"
                  className="bg-violet p-2 w-7 h-7 midTablet:w-8 midTablet:h-8 rounded-full opacity-70"
                />
                {props.hoveredTooltip === `${props.dish._id}-vegetarian` && (
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 bg-darkBlue text-white text-xs p-2 rounded-lg whitespace-nowrap z-50">
                    {t("form.labels.vegetarian")}
                  </div>
                )}
              </div>
            )}
            {props.dish.bio && (
              <div
                onMouseEnter={() =>
                  props.setHoveredTooltip(`${props.dish._id}-bio`)
                }
                onMouseLeave={() => props.setHoveredTooltip(null)}
                className="relative"
              >
                <BioSvg
                  fillColor="white"
                  className="bg-darkBlue p-2 w-7 h-7 midTablet:w-8 midTablet:h-8 rounded-full opacity-70"
                />
                {props.hoveredTooltip === `${props.dish._id}-bio` && (
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 bg-darkBlue text-white text-xs p-2 rounded-lg whitespace-nowrap z-50">
                    {t("form.labels.bio")}
                  </div>
                )}
              </div>
            )}
            {props.dish.glutenFree && (
              <div
                onMouseEnter={() =>
                  props.setHoveredTooltip(`${props.dish._id}-glutenFree`)
                }
                onMouseLeave={() => props.setHoveredTooltip(null)}
                className="relative"
              >
                <GlutenFreeSvg
                  fillColor="white"
                  className="bg-blue p-2 w-7 h-7 midTablet:w-8 midTablet:h-8 rounded-full opacity-70"
                />
                {props.hoveredTooltip === `${props.dish._id}-glutenFree` && (
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 bg-darkBlue text-white text-xs p-2 rounded-lg whitespace-nowrap z-50">
                    {t("form.labels.glutenFree")}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-6 justify-between ml-10 midTablet:ml-0">
            <p className="text-lg whitespace-nowrap">
              {props?.dish?.price?.toFixed(2)}{" "}
              {props?.dish?.price && props?.currencySymbol}
            </p>

            <div
              onMouseEnter={() =>
                props.setHoveredTooltip(`${props.dish._id}-visibility`)
              }
              onMouseLeave={() => props.setHoveredTooltip(null)}
              className="relative flex items-center"
            >
              <NoVisibleSvg
                width={22}
                height={22}
                className={`${props.dish.showOnWebsite ? "opacity-10" : ""}`}
              />
              {props.hoveredTooltip === `${props.dish._id}-visibility` && (
                <div className="absolute right-0 midTablet:right-auto midTablet:left-1/2 midTablet:-translate-x-1/2 bottom-full mb-2 bg-darkBlue text-white text-xs p-2 rounded-lg whitespace-nowrap z-50">
                  {props.dish.showOnWebsite
                    ? t("form.labels.visible")
                    : t("form.labels.notVisible")}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="w-full midTablet:w-auto flex justify-end gap-2">
          <button
            className="hover:bg-[#4583FF] bg-[#4583FF99] p-[6px] rounded-full transition-colors duration-300"
            onClick={(e) => {
              e.stopPropagation();
              props.handleEditClick(props.dish);
            }}
          >
            <EditSvg
              width={20}
              height={20}
              strokeColor="white"
              fillColor="white"
              className="w-4 h-4 midTablet:w-[20px] midTablet:h-[20px]"
            />
          </button>

          <button
            className="hover:bg-[#FF7664] bg-[#FF766499] p-[6px] rounded-full transition-colors duration-300"
            onClick={(e) => {
              e.stopPropagation();
              props.handleDeleteClick(props.dish);
            }}
          >
            <DeleteSvg
              strokeColor="white"
              fillColor="white"
              className="w-4 h-4 midTablet:w-[20px] midTablet:h-[20px]"
            />
          </button>
        </div>
      </div>
    </div>
  );
}
