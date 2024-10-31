import { useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";

// REACT HOOK FORM
import { useForm } from "react-hook-form";

// AXIOS
import axios from "axios";

// I18N
import { useTranslation } from "next-i18next";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// SVG
import { MenuSvg, RemoveSvg, UploadSvg } from "../_shared/_svgs/_index";

export default function AddMenusComponent(props) {
  const { t } = useTranslation("menus");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex pl-2 gap-2 py-1 items-center">
        <MenuSvg width={30} height={30} fillColor="#131E3690" />

        <h1 className="pl-2 text-2xl flex items-center">
          {t("titles.main")} /{" "}
          {props.menu ? t("buttons.edit") : t("buttons.add")}
        </h1>
      </div>
    </section>
  );
}
