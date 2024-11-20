import { useState } from "react";
import { useRouter } from "next/router";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import { MenuSvg } from "../_shared/_svgs/_index";

// COMPONENTS
import FixedMenuComponent from "./fixed-menu.menus.component";
import CustomMenuComponent from "./custom-menu.menus.component";

export default function AddMenusComponent(props) {
  const { t } = useTranslation("menus");
  const router = useRouter();
  const [menuType, setMenuType] = useState(props?.menu?.type || "");
  const [isEditing, setIsEditing] = useState(props?.menu ? false : true);

  return (
    <div   className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex justify-between">
        <div className="flex gap-2 py-1 items-center">
          <MenuSvg width={30} height={30} fillColor="#131E3690" />

          <h1 className="pl-2 text-2xl flex items-center gap-2 flex-wrap">
            <span
              className="cursor-pointer hover:underline"
              onClick={() => router.push("/menus")}
            >
              {t("titles.main")}
            </span>

            <span>/</span>

            <span>{props.menu ? t("buttons.edit") : t("buttons.add")}</span>
          </h1>
        </div>

        {props?.menu && !isEditing && (
          <button
            className="p-2 text-white rounded-lg bg-blue"
            onClick={() => setIsEditing((prev) => !prev)}
          >
            {!isEditing && t("buttons.editMenu")}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1 max-w-[350px]">
        <label className="text-lg font-semibold">{t("labels.menuType")}</label>

        <select
          value={menuType}
          onChange={(e) => setMenuType(e.target.value)}
          className="p-2 rounded-lg border"
          disabled={props?.menu}
        >
          <option value="" disabled>
            {t("labels.select")}
          </option>
          <option value="fixed">{t("labels.fixed")}</option>
          <option value="custom">{t("labels.custom")}</option>
        </select>
      </div>

      {menuType === "fixed" ? (
        <FixedMenuComponent
          menuType={menuType}
          menu={props?.menu}
          isEditing={isEditing}
        />
      ) : menuType === "custom" ? (
        <CustomMenuComponent
          menuType={menuType}
          menu={props?.menu}
          isEditing={isEditing}
          selectedDishes={props?.selectedDishes}
        />
      ) : null}
    </div>
  );
}
