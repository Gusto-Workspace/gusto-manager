import {
  useContext,
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { useRouter } from "next/router";
import Link from "next/link";

// I18N
import { useTranslation } from "next-i18next";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// NAV ITEMS DATA
import { navItemsData } from "@/_assets/data/_index.data";

// ICONS
import * as icons from "@/components/_shared/_svgs/_index";

const HREF_TO_OPTION_KEY = {
  "/dashboard/documents": "documents",
  "/dashboard": "dashboard",
  "/dashboard/restaurant": "restaurant",
  "/dashboard/dishes": "dishes",
  "/dashboard/menus": "menus",
  "/dashboard/drinks": "drinks",
  "/dashboard/wines": "wines",
  "/dashboard/news": "news",
  "/dashboard/employees": "employees",
  "/dashboard/gifts": "gift_card",
  "/dashboard/reservations": "reservations",
  "/dashboard/take-away": "take_away",
};

export default function NavComponent() {
  const { t } = useTranslation("common");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();

  const [menuOpen, setMenuOpen] = useState(false);
  const [translateX, setTranslateX] = useState(0);

  const navRef = useRef(null);
  const timeoutRef = useRef(null);

  const calculateTranslateX = useCallback(() => {
    const windowWidth = window.innerWidth;
    const margin = 24;
    const buttonWidth = 49;
    setTranslateX(windowWidth - 2 * margin - buttonWidth);
  }, []);

  useEffect(() => {
    if (menuOpen) {
      calculateTranslateX();
      window.addEventListener("resize", calculateTranslateX);
      document.body.classList.add("overflow-hidden");
      navRef.current?.scrollTo(0, 0);
    } else {
      setTranslateX(0);
      document.body.classList.remove("overflow-hidden");
    }
    return () => {
      window.removeEventListener("resize", calculateTranslateX);
      document.body.classList.remove("overflow-hidden");
    };
  }, [menuOpen, calculateTranslateX]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function handleLinkClick(e, href) {
    e.preventDefault();
    setMenuOpen(false);
    timeoutRef.current = setTimeout(() => router.push(href), 200);
  }

  function isActive(itemHref) {
    if (itemHref === "/dashboard") {
      return router.pathname === "/dashboard";
    }
    return (
      router.pathname.startsWith(itemHref) && router.pathname !== "/dashboard"
    );
  }

  // Détermine si une route est activée selon rôle + options
  const isOptionEnabled = useCallback(
    (itemHref) => {
      if (restaurantContext.dataLoading) return false;
      const role = restaurantContext.userConnected?.role;

      // Documents : uniquement pour les employés
      if (itemHref === "/dashboard/documents") {
        return role === "employee";
      }

      const optionKey = HREF_TO_OPTION_KEY[itemHref];
      if (role === "owner") {
        // Dashboard et Restaurant toujours visibles
        if (itemHref === "/dashboard" || itemHref === "/dashboard/restaurant") {
          return true;
        }
        // sinon selon les options du restaurant
        const opts = restaurantContext.restaurantData?.options || {};
        return optionKey ? !!opts[optionKey] : true;
      } else {
        // pour les employés, selon leurs propres options
        const opts = restaurantContext.userConnected?.options || {};
        return optionKey ? !!opts[optionKey] : true;
      }
    },
    [
      restaurantContext.dataLoading,
      restaurantContext.userConnected,
      restaurantContext.restaurantData,
    ]
  );

  const sortedNavItems = useMemo(() => {
    const role = restaurantContext.userConnected?.role;
    // on mappe chaque item avec son flag enabled
    let items = navItemsData.map((item) => ({
      ...item,
      enabled: isOptionEnabled(item.href),
    }));

    if (role === "owner") {
      // pour les owners : on retire _uniquement_ "documents"
      items = items.filter((item) => item.href !== "/dashboard/documents");
    } else {
      // pour les employés : on ne garde que les routes activées
      items = items.filter((item) => item.enabled);
    }

    // toujours afficher en premier les enabled
    return items.sort((a, b) => (b.enabled === true) - (a.enabled === true));
  }, [navItemsData, isOptionEnabled, restaurantContext.userConnected?.role]);

  return (
    <div>
      <div
        className={`fixed inset-0 z-[60] tablet:hidden ${
          menuOpen ? "bg-black bg-opacity-35" : "pointer-events-none"
        } transition-bg duration-200 ease-in-out`}
        onClick={() => setMenuOpen(false)}
      />

      <button
        className="fixed left-6 top-6 z-[91] tablet:hidden desktop:hidden bg-white w-[49px] h-[49px] flex items-center justify-center drop-shadow-sm rounded-lg transition-transform duration-200 ease-in-out"
        style={{
          transform: menuOpen ? `translateX(${translateX}px)` : "translateX(0)",
        }}
        onClick={() => setMenuOpen((o) => !o)}
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
        style={{ boxShadow: "3px 0 5px rgba(0,0,0,0.05)" }}
        className={`${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        } transition duration-200 ease-in-out custom-scrollbar tablet:translate-x-0 w-[270px] fixed bg-white h-[100dvh] overflow-y-auto flex flex-col py-6 px-4 gap-8 z-[90] tablet:z-10 text-darkBlue overscroll-contain`}
      >
        <div className="z-10 h-[86px] flex items-center justify-center">
          <img
            src="/img/logo-2.png"
            draggable={false}
            alt="logo"
            className="max-w-[100px] opacity-50"
          />
        </div>

        <ul className="flex-1 flex flex-col gap-6">
          {sortedNavItems.map((item) => {
            const Icon = icons[item.icon];
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
                    {Icon && (
                      <div
                        className={`${active ? "bg-blue" : ""} p-[8px] rounded-full`}
                      >
                        <Icon
                          width={23}
                          height={23}
                          fillColor={active ? "white" : "#131E3699"}
                          strokeColor={active ? "white" : "#131E3699"}
                        />
                      </div>
                    )}
                    {t(item.label)}
                  </Link>
                ) : (
                  <div className="h-12 flex gap-2 items-center w-full">
                    {Icon && (
                      <div className="p-[8px] rounded-full opacity-50">
                        <Icon
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
