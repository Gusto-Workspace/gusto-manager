// I18N
import { useTranslation } from "next-i18next";

// SVG
import {
  DeleteSvg,
  DragMultiSvg,
  EditSvg,
  NoVisibleSvg,
  RightArrowSvg,
} from "../../_shared/_svgs/_index";

// DND
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export default function CardCategoryListComponent(props) {
  const { t } = useTranslation("drinks");

  const { listeners, setNodeRef, transform, transition } = useSortable({
    id: props.category._id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const totalDrinksCount =
    (props.category.drinks ? props.category.drinks.length : 0) +
    (props.category.subCategories
      ? props.category.subCategories.reduce(
          (count, subCategory) =>
            count + (subCategory.drinks ? subCategory.drinks.length : 0),
          0
        )
      : 0);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative bg-white p-6 pb-2 rounded-lg drop-shadow-sm flex flex-col gap-2 justify-between items-center"
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
          props.handleEditClick(props.category);
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

      <h2 className="text-xl font-semibold text-pretty text-center min-h-[58px] mt-4">{props.category.name}</h2>

      <p className="text-sm opacity-50 mb-2">
        {t("labels.numberOfDishes")} : {totalDrinksCount}
      </p>

      <hr className="bg-darkBlue h-[1px] w-[90%] opacity-20" />

      <div className="flex w-full justify-center">
        <div className="w-1/3 flex justify-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              props.handleVisibilityToggle(props.category);
            }}
            className="flex flex-col items-center gap-1 p-2"
          >
            <div
              className={`bg-green ${
                props.category.visible ? "bg-opacity-20" : ""
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
              {props.category.visible ? "Visible" : "Non Visible"}
            </p>
          </button>
        </div>

        <div className="w-1/3 flex justify-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              props.handleDeleteClick(props.category);
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

        <div className="w-1/3 flex justify-center">
          <button
            onClick={() => props.handleCategoryClick(props.category)}
            className="flex flex-col items-center gap-1 p-2"
          >
            <div className="hover:bg-[#634FD2] bg-[#634FD299] p-[6px] rounded-full transition-colors duration-300">
              <RightArrowSvg
                width={15}
                height={15}
                strokeColor="white"
                fillColor="white"
              />
            </div>
            <p className="text-xs text-center">{t("buttons.access")}</p>
          </button>
        </div>
      </div>
    </div>
  );
}
