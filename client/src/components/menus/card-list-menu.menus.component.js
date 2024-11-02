import { useRouter } from "next/router";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import {
  DeleteSvg,
  DragMultiSvg,
  NoVisibleSvg,
  RightArrowSvg,
} from "../_shared/_svgs/_index";

export default function CardListMenuComponent(props) {
  const { t } = useTranslation("menus");
  const router = useRouter();
  const { locale } = router;
  const currencySymbol = locale === "fr" ? "€" : "$";

  return (
    <div className="relative bg-white p-6 pb-2 rounded-lg drop-shadow-sm flex flex-col gap-2 justify-between items-center">
      <button className="absolute left-0 top-0 opacity-30 cursor-grab flex flex-col items-center gap-1 p-2">
        <DragMultiSvg width={20} height={20} />
      </button>

      <h2 className="text-xl font-semibold">
        {props.menu.name ? props.menu.name : t("labels.fixed")}
      </h2>

      {props?.menu?.combinations?.length > 0 && (
        <ul className="text-sm">
          {props.menu.combinations.map((comb, i) => (
            <li key={i} className="flex justify-center gap-2">
              <p>
                {comb.categories.map((category, j) => (
                  <span key={j}>
                    {category}
                    {j < comb.categories.length - 1 && " - "}
                  </span>
                ))}
              </p>
              :
              <p>
                {comb.price} {currencySymbol}
              </p>
            </li>
          ))}
        </ul>
      )}

      {props.menu.price && (
        <p className="text-xl">
          {props.menu.price} {currencySymbol}
        </p>
      )}

      <hr className="bg-darkBlue h-[1px] w-[90%] opacity-20" />

      <div className="flex w-full justify-center">
        <div className="w-1/3 flex justify-center">
          <button
            onClick={(e) => {
              props.handleVisibilityToggle(props.menu);
            }}
            className="flex flex-col items-center gap-1 p-2"
          >
            <div
              className={`bg-green ${
                props.menu.visible ? "bg-opacity-20" : ""
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
              {props.menu.visible ? "Visible" : "Non Visible"}
            </p>
          </button>
        </div>

        <div className="w-1/3 flex justify-center">
          <button
            onClick={(e) => {
              props.handleDeleteClick(props.menu);
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
            onClick={() => props.handleCategoryClick(props.menu)}
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
