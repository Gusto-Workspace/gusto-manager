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
} from "../_shared/_svgs/_index";

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
      className="bg-white p-6 pl-4 rounded-lg drop-shadow-sm flex gap-4 justify-between items-center min-h-[100px]"
    >
      <div className="flex gap-4">
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

      <div className="flex gap-6 items-center">
        <div className="relative flex gap-2">
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
                width={18}
                height={18}
                className="bg-red p-2 w-8 h-8 rounded-full opacity-70"
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
                width={18}
                height={18}
                className="bg-violet p-2 w-8 h-8 rounded-full opacity-70"
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
                width={18}
                height={18}
                className="bg-darkBlue p-2 w-8 h-8 rounded-full opacity-70"
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
                width={18}
                height={18}
                className="bg-blue p-2 w-8 h-8 rounded-full opacity-70"
              />
              {props.hoveredTooltip === `${props.dish._id}-glutenFree` && (
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 bg-darkBlue text-white text-xs p-2 rounded-lg whitespace-nowrap z-50">
                  {t("form.labels.glutenFree")}
                </div>
              )}
            </div>
          )}
        </div>

        <p className="text-lg whitespace-nowrap">
          {props?.dish?.price?.toFixed(2)} {props?.dish?.price && props?.currencySymbol}
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
            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 bg-darkBlue text-white text-xs p-2 rounded-lg whitespace-nowrap z-50">
              {props.dish.showOnWebsite
                ? t("form.labels.visible")
                : t("form.labels.notVisible")}
            </div>
          )}
        </div>

        <div className="flex gap-2">
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
}
