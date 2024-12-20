import { useContext } from "react";
import { useRouter } from "next/router";
import Link from "next/link";

// I18N
import { useTranslation } from "next-i18next";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// DATA
import { navItemsData } from "@/_assets/data/_index.data";

// ICONS
import * as icons from "@/components/_shared/_svgs/_index";

export default function NavComponent() {
  const { t } = useTranslation("common");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();

  function isActive(itemHref) {
    if (itemHref === "/") {
      return router.pathname === "/";
    }
    return router.pathname.startsWith(itemHref) && router.pathname !== "/";
  }

  return (
    <nav
      style={{
        boxShadow: "3px 0 5px rgba(0, 0, 0, 0.05)",
      }}
      className="w-[250px] fixed bg-white h-screen overflow-y-auto flex flex-col py-6 px-4 gap-8 z-10 text-darkBlue"
    >
      <div className=" z-10 opacity-40 h-[86px]">
        <h1 className="flex flex-col items-center gap-2 text-lg font-semibold">
          <img
            src="/img/logo.webp"
            draggable={false}
            alt="logo"
            className="max-w-[50px]"
          />
          <div className="flex gap-1">
            <span>Gusto</span>
            <span>Manager</span>
          </div>
        </h1>
      </div>

      <ul className="flex-1 flex flex-col gap-7">
        {navItemsData.map((item) => {
          const IconComponent = icons[item.icon];
          const active = isActive(item.href);

          return (
            <li
              key={item.href}
              className={`h-12 flex items-center pl-1 pr-6 ${
                active ? "text-blue bg-blue bg-opacity-30 rounded-full" : ""
              }`}
            >
              <Link
                className="h-12 flex gap-2 items-center w-full"
                href={item.href}
              >
                {IconComponent && (
                  <div
                    className={`${active ? "bg-blue" : ""} p-[8px] rounded-full`}
                  >
                    <IconComponent
                      width={23}
                      height={23}
                      fillColor={`${active ? "white" : "#131E3699"}`}
                      strokeColor={`${active ? "white" : "#131E3699"}`}
                    />
                  </div>
                )}
                {t(item.label)}
              </Link>
            </li>
          );
        })}
      </ul>

      <button
        className="text-white bg-red py-2 rounded-lg"
        onClick={restaurantContext.logout}
      >
        {t("buttons.logout")}
      </button>
    </nav>
  );
}
