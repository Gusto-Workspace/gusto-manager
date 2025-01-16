import { useContext, useState, useEffect, useRef } from "react";
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

  const [menuOpen, setMenuOpen] = useState(false);
  const [translateX, setTranslateX] = useState(0);

  const navRef = useRef(null);
  const timeoutRef = useRef(null);

  function calculateTranslateX() {
    if (typeof window !== "undefined") {
      const windowWidth = window.innerWidth;
      const margin = 24;
      const buttonWidth = 49;

      const translation = windowWidth - 2 * margin - buttonWidth;
      setTranslateX(translation);
    }
  }

  useEffect(() => {
    if (menuOpen) {
      calculateTranslateX();
      window.addEventListener("resize", calculateTranslateX);
    } else {
      setTranslateX(0);
    }

    return () => {
      window.removeEventListener("resize", calculateTranslateX);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (menuOpen) {
      document.body.classList.add("overflow-hidden");
    } else {
      document.body.classList.remove("overflow-hidden");
    }

    return () => {
      document.body.classList.remove("overflow-hidden");
    };
  }, [menuOpen]);

  useEffect(() => {
    if (menuOpen && navRef.current) {
      navRef.current.scrollTop = 0;
    }
  }, [menuOpen]);

  function handleLinkClick(e, href) {
    e.preventDefault();
    setMenuOpen(false);

    timeoutRef.current = setTimeout(() => {
      router.push(href);
    }, 200);
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  function isActive(itemHref) {
    if (itemHref === "/") {
      return router.pathname === "/";
    }
    return router.pathname.startsWith(itemHref) && router.pathname !== "/";
  }

  function isOptionEnabled(itemHref) {
    if (restaurantContext.dataLoading) {
      return false;
    }

    const optionsMapping = {
      "/gifts": restaurantContext?.restaurantData?.options?.gift_card,
      "/reservations": restaurantContext?.restaurantData?.options?.reservations,
      "/take-away": restaurantContext?.restaurantData?.options?.take_away,
    };

    return optionsMapping[itemHref] ?? true;
  }

  const sortedNavItems = navItemsData
    .map((item) => ({
      ...item,
      enabled: isOptionEnabled(item.href),
    }))
    .sort((a, b) => b.enabled - a.enabled);

  return (
    <div>
      <div
        className={`fixed inset-0 z-[60] tablet:hidden ${
          menuOpen ? "bg-black bg-opacity-35" : "pointer-events-none"
        } transition-bg duration-200 ease-in-out`}
        onClick={() => setMenuOpen(false)}
      />

      <button
        className={`fixed left-6 top-6 ${
          menuOpen ? "z-[91]" : "z-[91]"
        } tablet:hidden desktop:hidden bg-white w-[49px] h-[49px] flex items-center justify-center drop-shadow-sm rounded-lg transition-transform duration-200 ease-in-out`}
        style={{
          transform: menuOpen ? `translateX(${translateX}px)` : "translateX(0)",
        }}
        onClick={() => setMenuOpen(!menuOpen)}
      >
        <div>
          <div
            className={`h-0.5 w-8 bg-darkBlue transform transition duration-200 ease-in-out ${
              menuOpen ? "rotate-45 translate-y-2.5" : ""
            }`}
          />
          <div className="my-2">
            <div
              className={`h-0.5 w-8 bg-darkBlue transition-all duration-200 ease-in-out ${
                menuOpen ? "opacity-0" : "opacity-100"
              }`}
            />
          </div>
          <div
            className={`h-0.5 w-8 bg-darkBlue transform transition duration-200 ease-in-out ${
              menuOpen ? "-rotate-45 -translate-y-2.5" : ""
            }`}
          />
        </div>
      </button>

      <nav
        ref={navRef}
        style={{
          boxShadow: "3px 0 5px rgba(0, 0, 0, 0.05)",
        }}
        className={`${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        } transition duration-200 ease-in-out custom-scrollbar tablet:translate-x-0 w-[270px] fixed bg-white h-screen overflow-y-auto flex flex-col py-6 px-4 gap-8 z-[90] tablet:z-10 text-darkBlue overscroll-contain`}
      >
        <div className="z-10 opacity-40 h-[86px]">
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

        <ul className="flex-1 flex flex-col gap-6">
          {sortedNavItems.map((item) => {
            const IconComponent = icons[item.icon];
            const active = isActive(item.href);

            return (
              <li
                key={item.href}
                className={`h-12 flex items-center pl-1 pr-6 ${
                  active ? "text-blue bg-blue bg-opacity-30 rounded-full" : ""
                } ${!item.enabled ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {item.enabled ? (
                  <Link
                    href={item.href}
                    onClick={(e) => handleLinkClick(e, item.href)}
                    className="h-12 flex gap-2 items-center w-full"
                  >
                    {IconComponent && (
                      <div
                        className={`${
                          active ? "bg-blue" : ""
                        } p-[8px] rounded-full`}
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
                ) : (
                  <div className="h-12 flex gap-2 items-center w-full">
                    {IconComponent && (
                      <div className={`p-[8px] rounded-full opacity-50`}>
                        <IconComponent
                          width={23}
                          height={23}
                          fillColor="#131E3699"
                          strokeColor="#131E3699"
                        />
                      </div>
                    )}
                    {t(item.label)}
                  </div>
                )}
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
    </div>
  );
}
