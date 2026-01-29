// I18N
import { useTranslation } from "next-i18next";

// DND
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// SVG
import {
  EditSvg,
  NoVisibleSvg,
  DeleteSvg,
  DragMultiSvg,
} from "../../../_shared/_svgs/_index";

export default function CardGiftsComponent(props) {
  const { t } = useTranslation("gifts");

  const { listeners, setNodeRef, transform, transition } = useSortable({
    id: props.giftCard._id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isVisible = props.giftCard.visible;
  const amountLabel = `${props.giftCard.value} ${props.currencySymbol}`;

  const shortDescription = (() => {
    const desc = props.giftCard.description || "";
    if (!desc.trim()) return "";
    const text =
      desc.charAt(0).toUpperCase() + desc.slice(1, 25); // un peu plus long qu'avant
    return desc.length > 25  ? `${text}…` : text;
  })();

  return (
    <section
      ref={setNodeRef}
      style={style}
      className="
        relative flex flex-col gap-2 items-stretch
        rounded-2xl border border-darkBlue/10 bg-white/80
        px-4 py-4 pb-2
        shadow-[0_18px_45px_rgba(19,30,54,0.06)]
        hover:shadow-[0_22px_55px_rgba(19,30,54,0.10)]
        transition-shadow
      "
    >
      {/* Drag handle + bouton edit */}
      <div className="flex items-start justify-between gap-2">
        <button
          {...listeners}
          className="
            absolute gap-1 p-3 opacity-50 left-3 top-3
            text-darkBlue/30 hover:text-darkBlue/60
            cursor-grab active:cursor-grabbing
          "
        >
          <DragMultiSvg width={18} height={18} />
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            props.handleEditClick(props.giftCard);
          }}
          className="
            absolute right-4 items-center justify-center
            rounded-full border border-darkBlue/10 bg-white
            p-1.5 shadow-sm
            hover:bg-darkBlue/5 hover:border-darkBlue/30
            transition-colors
          "
        >
          <EditSvg
            width={18}
            height={18}
            strokeColor="#131E36"
            fillColor="#131E36"
          />
        </button>
      </div>

      {/* Contenu principal */}
      <div className="flex flex-col items-center text-center px-2 pt-1">
        {/* Montant */}
        <h2 className="text-lg tablet:text-xl font-semibold text-darkBlue">
          {amountLabel}
        </h2>

        

        {/* Description courte */}
        {shortDescription && (
          <p className="mt-2 text-xs text-darkBlue/70 text-balance max-w-[260px]">
            {shortDescription}
          </p>
        )}

        {/* Badge visibilité */}
        <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-darkBlue/10 bg-white px-3 py-0.5 text-[11px]">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              isVisible ? "bg-[#4ead7a]" : "bg-darkBlue/30"
            }`}
          />
          <span className="text-darkBlue/70">
            {isVisible ? t("buttons.visible") : t("buttons.noVisible")}
          </span>
        </div>
      </div>

      <hr className="border-0 h-px bg-darkBlue/10 mt-2" />

      {/* Actions */}
      <div className="flex w-full justify-between gap-1 pt-1">
        {/* Visibilité */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            props.handleVisibilityToggle(props.giftCard);
          }}
          className="
            flex flex-col items-center gap-1 flex-1 px-1 py-1
            text-[11px] text-darkBlue/70
          "
        >
          <div
            className={`
              inline-flex items-center justify-center
              h-8 w-8 rounded-full
              border
              transition-colors
              ${
                isVisible
                  ? "bg-[#4ead7a1a] border-[#4ead7a80]"
                  : "bg-darkBlue/5 border-darkBlue/15"
              }
            `}
          >
            <NoVisibleSvg
              width={14}
              height={14}
              strokeColor={isVisible ? "#167a47" : "#6b7280"}
              fillColor={isVisible ? "#167a47" : "#6b7280"}
            />
          </div>
          <span>
            {isVisible ? t("buttons.visible") : t("buttons.noVisible")}
          </span>
        </button>

        {/* Supprimer */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            props.handleDeleteClick(props.giftCard);
          }}
          className="
            flex flex-col items-center gap-1 flex-1 px-1 py-1
            text-[11px] text-darkBlue/70
          "
        >
          <div
            className="
              inline-flex items-center justify-center
              h-8 w-8 rounded-full
              bg-[#ef44441a] border border-[#ef444480]
              hover:bg-[#ef444433] transition-colors
            "
          >
            <DeleteSvg
              width={14}
              height={14}
              strokeColor="#b91c1c"
              fillColor="#b91c1c"
            />
          </div>
          <span>{t("buttons.delete")}</span>
        </button>
      </div>
    </section>
  );
}
