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
  "/dashboard/my-space": "my-space",
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
  "/dashboard/health-control-plan": "health_control_plan",
};

export default function NavComponent() {
  const { t } = useTranslation("common");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();

  const [menuOpen, setMenuOpen] = useState(false);
  const [translateX, setTranslateX] = useState(0);
  const [isTabletUp, setIsTabletUp] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(min-width: 1024px)").matches;
  });
  const [hasHover, setHasHover] = useState(false);

  const navRef = useRef(null);
  const timeoutRef = useRef(null);

  // ----- Styles communs -----
  const sidebarCls = `
    fixed top-0
    w-[270px] h-[100dvh]
    flex flex-col
    bg-white
    border-r border-darkBlue/10
    shadow-[3px_0_20px_rgba(19,30,54,0.06)]
    px-2 py-4 tablet:px-4 tablet:py-6
    gap-4
    overflow-y-auto custom-scrollbar
    z-[90] tablet:z-10
  `;
  const logoWrapCls = "h-[72px] flex items-center justify-center  mb-1";
  const logoImgCls = "max-w-[50px] opacity-70";
  const navListCls = "flex-1 flex flex-col gap-3 mt-1.5";
  const navItemBaseCls =
    "group h-11 flex items-center rounded-xl px-2 pr-3 text-base font-medium transition";
  const navItemEnabledCls =
    "cursor-pointer text-darkBlue/80" + (hasHover ? " hover:bg-blue/10" : "");
  const navItemDisabledCls = "cursor-not-allowed text-darkBlue/40 opacity-60";
  const navItemActiveCls = "bg-blue/10 text-blue";
  const iconChipBase =
    "inline-flex items-center justify-center rounded-full p-2 transition-colors";
  const iconChipActive = "bg-blue border border-blue text-white";
  const iconChipInactive =
    "bg-white border border-darkBlue/10 group-hover:border-darkBlue/25";
  const logoutBtnCls =
    "w-full inline-flex items-center justify-center rounded-xl bg-red text-white text-sm font-semibold py-2.5 mt-2 shadow hover:bg-red/90 transition";

  const calculateTranslateX = useCallback(() => {
    const windowWidth = window.innerWidth;
    const margin = 24;
    const buttonWidth = 49;
    setTranslateX(windowWidth - 2 * margin - buttonWidth);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(min-width: 1024px)");

    const handleChange = (event) => {
      setIsTabletUp(event.matches);
    };

    // valeur initiale (utile si resize / rotation)
    setIsTabletUp(mediaQuery.matches);

    // API moderne uniquement (évite les méthodes dépréciées)
    mediaQuery.addEventListener?.("change", handleChange);

    return () => {
      mediaQuery.removeEventListener?.("change", handleChange);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");

    const handleChange = (event) => {
      setHasHover(event.matches);
    };

    // valeur initiale
    setHasHover(mq.matches);

    mq.addEventListener?.("change", handleChange);

    return () => {
      mq.removeEventListener?.("change", handleChange);
    };
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
    timeoutRef.current = setTimeout(() => router.push(href), 180);
  }

  function isActive(itemHref) {
    if (itemHref === "/dashboard") {
      return router.pathname === "/dashboard";
    }
    return (
      router.pathname.startsWith(itemHref) && router.pathname !== "/dashboard"
    );
  }

  // ----- Options dynamiques pour l'employé selon le resto courant -----
  const currentEmployeeOptions = useMemo(() => {
    const role = restaurantContext.userConnected?.role;
    if (role !== "employee") return null;

    const restaurantId = restaurantContext.restaurantData?._id;
    const employeeId = restaurantContext.userConnected?.id;
    if (!restaurantId || !employeeId) {
      return restaurantContext.userConnected?.options || null;
    }

    const employees = restaurantContext.restaurantData?.employees || [];
    const me = employees.find(
      (e) =>
        String(e._id) === String(employeeId) ||
        String(e.id) === String(employeeId)
    );

    const profiles = me?.restaurantProfiles || [];
    const profile = profiles.find(
      (p) => String(p.restaurant) === String(restaurantId)
    );

    return profile?.options || restaurantContext.userConnected?.options || null;
  }, [restaurantContext.userConnected, restaurantContext.restaurantData]);

  // Détermine si une route est activée selon rôle + options
  const isOptionEnabled = useCallback(
    (itemHref) => {
      if (restaurantContext.dataLoading) return false;
      const role = restaurantContext.userConnected?.role;

      // my-space : uniquement pour les employés
      if (itemHref === "/dashboard/my-space") {
        return role === "employee";
      }

      const optionKey = HREF_TO_OPTION_KEY[itemHref];

      if (role === "owner") {
        if (itemHref === "/dashboard" || itemHref === "/dashboard/restaurant") {
          return true;
        }
        const opts = restaurantContext.restaurantData?.options || {};
        return optionKey ? !!opts[optionKey] : true;
      } else {
        // Employé : options par restaurant via restaurantProfiles
        const opts = currentEmployeeOptions || {};
        return optionKey ? !!opts[optionKey] : true;
      }
    },
    [
      restaurantContext.dataLoading,
      restaurantContext.userConnected?.role,
      restaurantContext.restaurantData,
      currentEmployeeOptions,
    ]
  );

  const sortedNavItems = useMemo(() => {
    const role = restaurantContext.userConnected?.role;
    let items = navItemsData.map((item) => ({
      ...item,
      enabled: isOptionEnabled(item.href),
    }));

    if (role === "owner") {
      items = items.filter((item) => item.href !== "/dashboard/my-space");
    } else {
      items = items.filter((item) => item.enabled);
    }

    // enabled d'abord
    return items.sort((a, b) => (b.enabled === true) - (a.enabled === true));
  }, [isOptionEnabled, restaurantContext.userConnected?.role]);

  return (
    <div>
      {/* Overlay mobile */}
      <div
        className={`
          fixed inset-0 z-[60] tablet:hidden
          transition-opacity duration-200 ease-out
          ${menuOpen ? "bg-black/40 opacity-100" : "opacity-0 pointer-events-none"}
        `}
        onClick={() => setMenuOpen(false)}
      />

      {/* Bouton hamburger mobile */}
      <button
        className="
          fixed left-2 top-5 z-[91]
          tablet:hidden desktop:hidden
          flex items-center justify-center
          w-[49px] h-[49px]
          rounded-full border border-darkBlue/10
          bg-white shadow-[0_18px_45px_rgba(19,30,54,0.16)]
          transition-transform duration-200 ease-out
        "
        style={{
          transform: menuOpen ? `translateX(${translateX}px)` : "translateX(0)",
        }}
        onClick={() => setMenuOpen((o) => !o)}
        aria-label="Toggle navigation"
      >
        <div className="relative w-6 h-4 flex flex-col justify-between">
          <span
            className={`
              absolute left-0 top-0 h-[2px] w-full bg-darkBlue
              transition-all duration-200 ease-out
              ${menuOpen ? "rotate-45 top-1/2 -translate-y-1/2" : ""}
            `}
          />
          <span
            className={`
              absolute left-0 top-1/2 -translate-y-1/2 h-[2px] w-full bg-darkBlue
              transition-opacity duration-200 ease-out
              ${menuOpen ? "opacity-0" : "opacity-100"}
            `}
          />
          <span
            className={`
              absolute left-0 bottom-0 h-[2px] w-full bg-darkBlue
              transition-all duration-200 ease-out
              ${menuOpen ? "-rotate-45 bottom-1/2 translate-y-1/2" : ""}
            `}
          />
        </div>
      </button>

      {/* Sidebar */}
      <nav
        ref={navRef}
        className={sidebarCls}
        style={{
          left: isTabletUp ? 0 : menuOpen ? 0 : -270,
          transition: isTabletUp ? "none" : "left 200ms ease-out",
        }}
      >
        {/* Logo */}
        <div className={logoWrapCls}>
          <img
            src="/img/logo-3.png"
            draggable={false}
            alt="logo"
            className={logoImgCls}
          />
        </div>

        {/* Items */}
        <ul className={navListCls}>
          {sortedNavItems.map((item) => {
            const Icon = icons[item.icon];
            const active = isActive(item.href);
            const canClick = item.enabled;

            const itemCls = [
              navItemBaseCls,
              canClick ? navItemEnabledCls : navItemDisabledCls,
              active ? navItemActiveCls : "",
            ]
              .join(" ")
              .trim();

            return (
              <li key={item.href}>
                {canClick ? (
                  <Link
                    href={item.href}
                    onClick={(e) => handleLinkClick(e, item.href)}
                    className={itemCls}
                  >
                    {Icon && (
                      <div
                        className={`${
                          active ? iconChipActive : iconChipInactive
                        } ${iconChipBase}`}
                      >
                        <Icon
                          width={20}
                          height={20}
                          fillColor={active ? "white" : "#131E3699"}
                          strokeColor={active ? "white" : "#131E3699"}
                        />
                      </div>
                    )}
                    <span className="ml-2 truncate">{t(item.label)}</span>
                  </Link>
                ) : (
                  <div className={itemCls}>
                    {Icon && (
                      <div
                        className={`${iconChipBase} bg-white border border-darkBlue/5`}
                      >
                        <Icon
                          width={20}
                          height={20}
                          fillColor="#9ca3af"
                          strokeColor="#9ca3af"
                        />
                      </div>
                    )}
                    <span className="ml-2 truncate">{t(item.label)}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {/* Logout */}
        <button className={logoutBtnCls} onClick={restaurantContext.logout}>
          {t("buttons.logout")}
        </button>
      </nav>
    </div>
  );
}
