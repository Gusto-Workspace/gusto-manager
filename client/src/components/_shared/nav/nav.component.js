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
import Image from "next/image";
import { ChevronRight } from "lucide-react";

// I18N
import { useTranslation } from "next-i18next";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// NAV ITEMS DATA
import { navItemsData } from "@/_assets/data/_index.data";
import {
  DASHBOARD_HREF_OPTION_KEYS,
  getEmployeeDashboardOptions,
} from "@/_assets/utils/dashboard-access";

// ICONS
import * as icons from "@/components/_shared/_svgs/_index";

export default function NavComponent() {
  const { t } = useTranslation("common");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();

  const [menuOpen, setMenuOpen] = useState(false);
  const [translateX, setTranslateX] = useState(0);
  const [supportsHover, setSupportsHover] = useState(false);
  const [isTabletUp, setIsTabletUp] = useState(true);
  const [navHovered, setNavHovered] = useState(false);
  const [navExpanded, setNavExpanded] = useState(false);

  const navRef = useRef(null);
  const navScrollRef = useRef(null);

  const navIsExpanded = !isTabletUp || navExpanded || navHovered;

  // ----- Styles communs -----
  const sidebarCls = `
    fixed inset-y-0 left-0
    flex flex-col
    bg-white
    border-r border-darkBlue/10
    shadow-[3px_0_20px_rgba(19,30,54,0.06)]
    px-2 py-4 tablet:px-3 tablet:py-6
    gap-4
    overflow-visible
    z-[120] tablet:z-[140]
    transition-[width,transform] duration-300 ease-out
    will-change-[width,transform]
  `;

  const navInnerCls =
    "flex h-full flex-col gap-4 overflow-x-hidden overflow-y-auto hide-scrollbar";
  const logoWrapCls = "h-[88px] shrink-0 flex items-center justify-center mb-1";
  const logoImgCls = "max-w-[50px] opacity-70";
  const navListCls = "flex-1 flex flex-col gap-3 mt-1.5";
  const navItemBaseCls =
    "group grid h-11 grid-cols-[64px_minmax(0,1fr)] items-center overflow-hidden rounded-xl text-base font-medium transition-colors duration-200";
  const navItemEnabledCls =
    "cursor-pointer text-darkBlue/80" +
    (supportsHover ? " hover:bg-blue/10" : "");
  const navItemDisabledCls = "cursor-not-allowed text-darkBlue/40 opacity-60";
  const navItemActiveCls = "bg-blue/10 text-blue";
  const iconSlotCls =
    "flex h-11 w-16 shrink-0 items-center justify-center self-stretch";
  const iconChipBase =
    "inline-flex items-center justify-center rounded-full p-2 transition-colors";
  const iconChipActive = "bg-blue border border-blue text-white";
  const iconChipInactive =
    "bg-white border border-darkBlue/10 group-hover:border-darkBlue/25";
  const navLabelCls = `min-w-0 truncate whitespace-nowrap transition-[max-width,opacity,transform,margin] duration-300 ease-out ${
    navIsExpanded
      ? "ml-0 max-w-[190px] translate-x-0 opacity-100 delay-75"
      : "ml-0 max-w-0 -translate-x-1 opacity-0 pointer-events-none"
  }`;

  const calculateTranslateX = useCallback(() => {
    const windowWidth = window.innerWidth;
    const margin = 24;
    const buttonWidth = 49;
    setTranslateX(windowWidth - 2 * margin - buttonWidth);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const hoverMq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const tabletMq = window.matchMedia("(min-width: 1024px)");

    const syncMedia = () => {
      setSupportsHover(hoverMq.matches);
      setIsTabletUp(tabletMq.matches);

      if (!tabletMq.matches) {
        setNavHovered(false);
        setNavExpanded(false);
      }
    };

    syncMedia();

    hoverMq.addEventListener?.("change", syncMedia);
    tabletMq.addEventListener?.("change", syncMedia);

    return () => {
      hoverMq.removeEventListener?.("change", syncMedia);
      tabletMq.removeEventListener?.("change", syncMedia);
    };
  }, []);

  useEffect(() => {
    if (menuOpen) {
      calculateTranslateX();
      window.addEventListener("resize", calculateTranslateX);
      document.body.classList.add("overflow-hidden");
      navScrollRef.current?.scrollTo(0, 0);
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
    if (!isTabletUp || supportsHover || !navExpanded) return;
    if (typeof document === "undefined") return;

    const handleOutsidePointer = (event) => {
      if (navRef.current?.contains(event.target)) return;
      setNavExpanded(false);
    };

    document.addEventListener("pointerdown", handleOutsidePointer);

    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointer);
    };
  }, [isTabletUp, supportsHover, navExpanded]);

  useEffect(() => {
    if (!isTabletUp || !supportsHover || navExpanded) return;
    if (typeof document === "undefined") return;

    const handlePointerMove = (event) => {
      const isInsideNav = !!navRef.current?.contains(event.target);
      setNavHovered((current) =>
        current === isInsideNav ? current : isInsideNav,
      );
    };

    document.addEventListener("pointermove", handlePointerMove);

    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
    };
  }, [isTabletUp, supportsHover, navExpanded]);

  useEffect(() => {
    setMenuOpen(false);
    setNavExpanded(false);
    setNavHovered(false);
  }, [router.asPath]);

  function handleLinkClick(e, href) {
    e.preventDefault();
    setMenuOpen(false);
    setNavExpanded(false);
    setNavHovered(false);
    router.push(href);
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

    return getEmployeeDashboardOptions(
      restaurantContext.restaurantData,
      restaurantContext.userConnected,
    );
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

      const optionKey = DASHBOARD_HREF_OPTION_KEYS[itemHref];

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
    ],
  );

  const sortedNavItems = useMemo(() => {
    const role = restaurantContext.userConnected?.role;
    const restaurantOptions = restaurantContext.restaurantData?.options || {};
    const hiddenOptionKeys = new Set(
      ["drinks", "wines"].filter((key) => !restaurantOptions[key]),
    );

    let items = navItemsData.map((item) => ({
      ...item,
      enabled: isOptionEnabled(item.href),
    }));

    items = items.filter((item) => {
      const optionKey = DASHBOARD_HREF_OPTION_KEYS[item.href];
      return !hiddenOptionKeys.has(optionKey);
    });

    if (role === "owner") {
      items = items.filter((item) => item.href !== "/dashboard/my-space");
    } else {
      items = items.filter((item) => item.enabled);
    }

    // enabled d'abord
    return items.sort((a, b) => (b.enabled === true) - (a.enabled === true));
  }, [
    isOptionEnabled,
    restaurantContext.userConnected?.role,
    restaurantContext.restaurantData?.options,
  ]);

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
          fixed left-2 top-5 z-[150]
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
        className={`
          ${sidebarCls}
          transform
          tablet:translate-x-0
          ${menuOpen ? "translate-x-0" : "-translate-x-full"}
        `}
        style={{
          width: isTabletUp ? (navIsExpanded ? 270 : 88) : 270,
        }}
        onMouseEnter={() => {
          if (supportsHover && isTabletUp && !navExpanded) {
            setNavHovered(true);
          }
        }}
        onMouseLeave={() => {
          if (supportsHover) {
            setNavHovered(false);
          }
        }}
        onFocus={() => {
          if (supportsHover && isTabletUp && !navExpanded) {
            setNavHovered(true);
          }
        }}
        onBlur={(event) => {
          if (!supportsHover) return;
          if (event.currentTarget.contains(event.relatedTarget)) return;
          setNavHovered(false);
        }}
      >
        {isTabletUp && !supportsHover ? (
          <button
            type="button"
            onClick={() => {
              setNavExpanded((value) => !value);
              setNavHovered(false);
            }}
            className="absolute -right-4 top-1/2 z-[4] hidden size-8 -translate-y-1/2 items-center justify-center rounded-full border border-darkBlue/10 bg-white text-darkBlue opacity-100 shadow-[0_8px_24px_rgba(19,30,54,0.18)] transition hover:bg-white focus:bg-white active:bg-white tablet:inline-flex"
            style={{ WebkitTapHighlightColor: "transparent" }}
            aria-label={
              navExpanded ? "Réduire la navigation" : "Déployer la navigation"
            }
            title={
              navExpanded ? "Réduire la navigation" : "Déployer la navigation"
            }
          >
            <ChevronRight
              className={`size-4 transition-transform duration-200 ${
                navExpanded ? "rotate-180" : ""
              }`}
            />
          </button>
        ) : null}

        <div ref={navScrollRef} className={navInnerCls}>
          {/* Logo */}
          <div className={logoWrapCls}>
            <Image
              src="/img/logo-3.png"
              width={50}
              height={50}
              draggable={false}
              alt="logo"
              className={logoImgCls}
              priority
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
                        <div className={iconSlotCls}>
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
                        </div>
                      )}
                      <span className={navLabelCls}>{t(item.label)}</span>
                    </Link>
                  ) : (
                    <div className={itemCls}>
                      {Icon && (
                        <div className={iconSlotCls}>
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
                        </div>
                      )}
                      <span className={navLabelCls}>{t(item.label)}</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
    </div>
  );
}
