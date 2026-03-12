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

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: props.dish._id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  function DishTooltip({ active, label, children, position = "center" }) {
    let tooltipClass = "left-1/2 -translate-x-1/2 bottom-full mb-2";

    if (position === "right") {
      tooltipClass = "right-0 bottom-full mb-2";
    }

    return (
      <div className="relative flex items-center">
        {children}

        {active && (
          <div
            className={`absolute ${tooltipClass} z-50 whitespace-nowrap rounded-xl bg-darkBlue px-2.5 py-1.5 text-[11px] text-white shadow-lg`}
          >
            {label}
          </div>
        )}
      </div>
    );
  }

  const price =
    typeof props?.dish?.price === "number"
      ? `${props.dish.price.toFixed(2)} ${props?.currencySymbol || ""}`
      : "";

  const name = props?.dish?.name
    ? props.dish.name.charAt(0).toUpperCase() + props.dish.name.slice(1)
    : "";

  const description = props?.dish?.description
    ? props.dish.description.length > 35
      ? props.dish.description.charAt(0).toUpperCase() +
        props.dish.description.slice(1, 35) +
        "..."
      : props.dish.description.charAt(0).toUpperCase() +
        props.dish.description.slice(1)
    : "";

  const hasMeta =
    props.dish.vegan ||
    props.dish.vegetarian ||
    props.dish.bio ||
    props.dish.glutenFree;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "group flex flex-col gap-3 rounded-2xl border border-white/40 bg-white/50 px-3 py-3 midTablet:flex-row midTablet:items-center midTablet:justify-between midTablet:px-4",
        isDragging ? "opacity-70 shadow-lg scale-[1.01] z-50" : "",
      ].join(" ")}
    >
      <div className="flex min-w-0 items-start gap-3 midTablet:items-center">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="inline-flex items-center justify-center h-8 w-6 rounded-lg border border-darkBlue/10 bg-white/70 cursor-grab active:cursor-grabbing shrink-0 mt-0.5 midTablet:mt-0"
          aria-label={t("drag", "Déplacer")}
          title={t("drag", "Déplacer")}
        >
          <DragSvg width={14} height={14} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex justify-between midTablet:justify-normal min-w-0 items-center gap-2">
            <h3 className="truncate text-[15px] font-medium text-darkBlue midTablet:text-[16px]">
              {name}
            </h3>

            {!props.dish.showOnWebsite && (
              <span className="shrink-0 rounded-full bg-darkBlue/10 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-darkBlue/60">
                Off
              </span>
            )}
          </div>

          <p className="mt-1 truncate text-sm text-darkBlue/45">
            {description}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 midTablet:min-w-fit midTablet:flex-row midTablet:items-center midTablet:gap-4">
        <div className="flex items-center justify-between gap-3 border-t border-darkBlue/5 pt-2 midTablet:border-t-0 midTablet:border-l midTablet:pl-4 midTablet:pt-0">
          {price && (
            <p className="whitespace-nowrap text-[15px] font-semibold text-darkBlue midTablet:text-[16px]">
              {price}
            </p>
          )}

          <div className="flex items-center gap-4 ml-auto">
            {hasMeta && (
              <div className="flex flex-wrap items-center gap-2">
                {props.dish.vegan && (
                  <VeganSvg
                    fillColor="#ffffff"
                    className="h-5 w-5 rounded-full bg-red p-[4px]"
                  />
                )}

                {props.dish.vegetarian && (
                  <VegetarianSvg
                    fillColor="#ffffff"
                    className="h-5 w-5 rounded-full bg-violet p-[4px]"
                  />
                )}

                {props.dish.bio && (
                  <BioSvg
                    fillColor="#ffffff"
                    className="h-5 w-5 rounded-full bg-darkBlue p-[4px]"
                  />
                )}

                {props.dish.glutenFree && (
                  <GlutenFreeSvg
                    fillColor="#ffffff"
                    className="h-5 w-5 rounded-full bg-blue p-[4px]"
                  />
                )}
              </div>
            )}

            <div className="flex gap-1">
              <button
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#4583FF]/12 text-[#4583FF] transition-all duration-200 hover:bg-[#4583FF] hover:text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  props.handleEditClick(props.dish);
                }}
                aria-label={t("edit", "Modifier")}
                type="button"
              >
                <EditSvg
                  width={16}
                  height={16}
                  strokeColor="currentColor"
                  fillColor="currentColor"
                  className="h-4 w-4"
                />
              </button>

              <button
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FF7664]/12 text-[#FF7664] transition-all duration-200 desktop:hover:bg-[#FF7664] desktop:hover:text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  props.handleDeleteClick(props.dish);
                }}
                aria-label={t("delete", "Supprimer")}
                type="button"
              >
                <DeleteSvg
                  strokeColor="currentColor"
                  fillColor="currentColor"
                  className="h-4 w-4"
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
