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

export default function DetailsWineComponent(props) {
  const { t } = useTranslation("wines");

  const { listeners, setNodeRef, transform, transition } = useSortable({
    id: props.wine._id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const sortedVolumes = props.wine.volumes
    .map((v) => {
      const [volume, unit] = v.volume.split(" ");
      const volumeInLiters =
        unit === "CL" ? parseFloat(volume) / 100 : parseFloat(volume);
      return {
        originalVolume: volume,
        originalUnit: unit || "CL",
        volumeInLiters,
        price: v.price,
      };
    })
    .sort((a, b) => b.volumeInLiters - a.volumeInLiters);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white p-4 midTablet:p-6 midTablet:pl-4 rounded-lg drop-shadow-sm flex flex-col midTablet:flex-row gap-6 midTablet:justify-between midTablet:items-center min-h-[100px]"
    >
      {/* Section principale : Drag & Informations */}
      <div className="flex gap-4 items-start midTablet:items-center">
        <button {...listeners} className="opacity-50 cursor-grab p-3">
          <DragSvg width={25} height={25} />
        </button>

        <div>
          <h3 className="text-lg">
            {props.wine.name.charAt(0).toUpperCase() + props.wine.name.slice(1)}
          </h3>

          <p className="text-sm opacity-50">{props.wine.appellation}</p>

          <div className="mt-3 flex flex-wrap flex-col gap-2 tablet:flex-row tablet:gap-4">
            {sortedVolumes.map((volume, index) => (
              <div key={index} className="flex gap-1 text-sm opacity-50">
                <p>
                  {volume.originalVolume} {volume.originalUnit} -
                </p>
                <p className="text-sm whitespace-nowrap font-medium">
                  {volume.price.toFixed(2)} {props.currencySymbol}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Section actions et informations supplémentaires */}
      <div className="flex justify-between midTablet:justify-end flex-wrap gap-4 midTablet:gap-6 items-center">
        {/* Informations supplémentaires : Bio et Année */}
        <div className="flex flex-row-reverse midTablet:flex-row items-center gap-6 justify-between w-full midTablet:w-auto">
          {/* Bio */}
          {props.wine.bio && (
            <div
              onMouseEnter={() =>
                props.setHoveredTooltip(`${props.wine._id}-bio`)
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
              {props.hoveredTooltip === `${props.wine._id}-bio` && (
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 bg-darkBlue text-white text-xs p-2 rounded-lg whitespace-nowrap z-50">
                  {t("form.labels.bio")}
                </div>
              )}
            </div>
          )}
          <div className="flex justify-between w-full gap-6">
            {/* Année */}
            <p className="ml-10 midTablet:ml-0 text-lg whitespace-nowrap">{props.wine.year}</p>

            {/* Visibilité */}
            <div
              onMouseEnter={() =>
                props.setHoveredTooltip(`${props.wine._id}-visibility`)
              }
              onMouseLeave={() => props.setHoveredTooltip(null)}
              className="relative flex items-center"
            >
              <NoVisibleSvg
                width={22}
                height={22}
                className={`${props.wine.showOnWebsite ? "opacity-10" : ""}`}
              />
              {props.hoveredTooltip === `${props.wine._id}-visibility` && (
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 bg-darkBlue text-white text-xs p-2 rounded-lg whitespace-nowrap z-50">
                  {props.wine.showOnWebsite
                    ? t("form.labels.visible")
                    : t("form.labels.notVisible")}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Boutons d'édition et de suppression */}
        <div className="w-full midTablet:w-auto flex justify-end gap-2">
          <button
            className="hover:bg-[#4583FF] bg-[#4583FF99] p-[6px] rounded-full transition-colors duration-300"
            onClick={(e) => {
              e.stopPropagation();
              props.handleEditClick(props.wine);
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
              props.handleDeleteClick(props.wine);
            }}
          >
            <DeleteSvg
              width={20}
              height={20}
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
