import { useContext } from "react";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

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
} from "../_shared/_svgs/_index";

export default function CardGiftsComponent(props) {
  const { t } = useTranslation("gifts");

  const { listeners, setNodeRef, transform, transition } = useSortable({
    id: props.giftCard._id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative bg-white rounded-lg drop-shadow-sm p-6 pb-2 flex flex-col gap-2 h-fit z-[4]"
    >
      <button
        {...listeners}
        className="absolute left-0 top-0 opacity-30 cursor-grab flex flex-col items-center gap-1 p-2"
      >
        <DragMultiSvg width={20} height={20} />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          props.handleEditClick(props.giftCard);
        }}
        className="absolute right-0 top-0 flex flex-col items-center gap-1 p-2"
      >
        <div className="hover:opacity-100 opacity-20 p-[6px] rounded-full transition-opacity duration-300">
          <EditSvg
            width={20}
            height={20}
            strokeColor="#131E36"
            fillColor="#131E36"
          />
        </div>
      </button>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl text-center font-semibold">
          {props.giftCard.value} {props.currencySymbol}
        </h2>

        {props.giftCard.description && (
          <p className="text-sm opacity-50 text-center h-[20px]">
            {props.giftCard.description.length > 22
              ? props.giftCard.description.charAt(0).toUpperCase() +
                props.giftCard.description.slice(1, 22) +
                "..."
              : props.giftCard.description.charAt(0).toUpperCase() +
                props.giftCard.description.slice(1)}
          </p>
        )}
      </div>

      <hr className="bg-darkBlue h-[1px] w-[90%] opacity-20 mx-auto" />

      <div className="flex w-full justify-center">
        <div className="w-1/2 flex justify-center">
          <button
            onClick={() => props.handleVisibilityToggle(props.giftCard)}
            className="flex flex-col items-center gap-1 p-2"
          >
            <div
              className={`bg-green ${
                props.giftCard.visible ? "bg-opacity-20" : ""
              } p-[6px] rounded-full transition-colors duration-300`}
            >
              <NoVisibleSvg
                width={15}
                height={15}
                strokeColor="white"
                fillColor="white"
              />
            </div>
            <p className="text-xs text-center">
              {props.giftCard.visible ? t("buttons.visible") : t("buttons.noVisible")}
            </p>
          </button>
        </div>

        <div className="w-1/2 flex justify-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              props.handleDeleteClick(props.giftCard);
            }}
            className="flex flex-col items-center gap-1 p-2"
          >
            <div className="hover:bg-[#FF7664] bg-[#FF766499] p-[6px] rounded-full transition-colors duration-300">
              <DeleteSvg
                width={15}
                height={15}
                strokeColor="white"
                fillColor="white"
              />
            </div>
            <p className="text-xs text-center">{t("buttons.delete")}</p>
          </button>
        </div>
      </div>
    </div>
  );
}
