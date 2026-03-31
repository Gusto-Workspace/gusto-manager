import { useState } from "react";
import { useRouter } from "next/router";
import { Pencil } from "lucide-react";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import { MenuSvg } from "../../_shared/_svgs/_index";

// COMPONENTS
import FixedMenuComponent from "./fixed-menu.menus.component";
import CustomMenuComponent from "./custom-menu.menus.component";
import CatalogHeaderDashboardComponent, {
  CatalogActionButton,
} from "../_shared/catalog-header.dashboard.component";

export default function AddMenusComponent(props) {
  const { t } = useTranslation("menus");
  const router = useRouter();
  const [menuType, setMenuType] = useState(props?.menu?.type || "");
  const [isEditing, setIsEditing] = useState(props?.menu ? false : true);

  return (
    <div className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <CatalogHeaderDashboardComponent
        icon={<MenuSvg width={30} height={30} fillColor="#131E3690" />}
        title={t("titles.main")}
        onTitleClick={() => router.push("/dashboard/menus")}
        onBack={() => router.push("/dashboard/menus")}
        backLabel={t("buttons.return", "Retour")}
        subtitleItems={[
          {
            label: props.menu ? t("buttons.edit") : t("buttons.add"),
          },
        ]}
        actions={
          props?.menu && !isEditing ? (
            <CatalogActionButton
              onClick={() => setIsEditing((prev) => !prev)}
              label={t("buttons.editMenu")}
              title={t("buttons.editMenu")}
              icon={<Pencil className="size-4" />}
            />
          ) : null
        }
      />

      <div className="flex flex-col gap-1 max-w-[350px]">
        <label className="text-lg font-semibold">{t("labels.menuType")}</label>

        <select
          value={menuType}
          onChange={(e) => setMenuType(e.target.value)}
          className="rounded-lg border bg-white p-2 text-base disabled:bg-white/30"
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
          setIsEditing={setIsEditing}
        />
      ) : menuType === "custom" ? (
        <CustomMenuComponent
          menuType={menuType}
          menu={props?.menu}
          isEditing={isEditing}
          setIsEditing={setIsEditing}
          selectedDishes={props?.selectedDishes}
        />
      ) : null}
    </div>
  );
}
