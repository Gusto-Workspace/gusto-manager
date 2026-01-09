// DND
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// SVG
import {
  BioSvg,
  DeleteSvg,
  DragSvg,
  EditSvg,
  NoVisibleSvg,
} from "../../_shared/_svgs/_index";

// I18N
import { useTranslation } from "next-i18next";

export default function DetailsDrinkComponent(props) {
  const { t } = useTranslation("drinks");

  const { listeners, setNodeRef, transform, transition } = useSortable({
    id: props.drink._id,
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
      <div className="flex gap-4">
        <button {...listeners} className="opacity-50 cursor-grab p-3">
          <DragSvg width={25} height={25} />
        </button>

        <div>
          <h3 className="text-lg">
            {props.drink.name.charAt(0).toUpperCase() +
              props.drink.name.slice(1)}
          </h3>

          <p className="text-sm opacity-50">
            {props.drink.description.length > 35
              ? props.drink.description.charAt(0).toUpperCase() +
                props.drink.description.slice(1, 35) +
                "..."
              : props.drink.description.charAt(0).toUpperCase() +
                props.drink.description.slice(1)}
          </p>
        </div>
      </div>

      <div className="flex justify-between midTablet:justify-end flex-wrap gap-4 midTablet:gap-6 items-center">
        <div className="flex flex-row-reverse midTablet:flex-row items-center gap-6 justify-between w-full midTablet:w-auto">
          <div className="relative flex flex-wrap gap-2">
            {props.drink.bio && (
              <div
                onMouseEnter={() =>
                  props.setHoveredTooltip(`${props.drink._id}-bio`)
                }
                onMouseLeave={() => props.setHoveredTooltip(null)}
                className="relative"
              >
                <BioSvg
                  fillColor="white"
                  className="bg-darkBlue p-2 w-7 h-7 midTablet:w-8 midTablet:h-8 rounded-full opacity-70"
                />
                {props.hoveredTooltip === `${props.drink._id}-bio` && (
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 bg-darkBlue text-white text-xs p-2 rounded-lg whitespace-nowrap z-50">
                    {t("form.labels.bio")}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-6 justify-between ml-10 midTablet:ml-0">
            <p className="text-lg whitespace-nowrap">
              {props?.drink?.price?.toFixed(2)}{" "}
              {props?.drink?.price && props?.currencySymbol}
            </p>

            <div
              onMouseEnter={() =>
                props.setHoveredTooltip(`${props.drink._id}-visibility`)
              }
              onMouseLeave={() => props.setHoveredTooltip(null)}
              className="relative flex items-center"
            >
              <NoVisibleSvg
                width={22}
                height={22}
                className={`${props.drink.showOnWebsite ? "opacity-10" : ""}`}
              />
              {props.hoveredTooltip === `${props.drink._id}-visibility` && (
                <div className="absolute right-0 midTablet:right-auto midTablet:left-1/2 midTablet:-translate-x-1/2 bottom-full mb-2 bg-darkBlue text-white text-xs p-2 rounded-lg whitespace-nowrap z-50">
                  {props.drink.showOnWebsite
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
              props.handleEditClick(props.drink);
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
              props.handleDeleteClick(props.drink);
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
