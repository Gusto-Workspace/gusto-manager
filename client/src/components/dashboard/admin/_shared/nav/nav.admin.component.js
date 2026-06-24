import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Image from "next/image";
import { useTranslation } from "next-i18next";
import { ChevronRight, LogOut } from "lucide-react";

import {
  AnalyticsSvg,
  RestaurantSvg,
  EmployeesSvg,
  InvoiceSvg,
  NewsSvg,
} from "@/components/_shared/_svgs/_index";

const ADMIN_NAV_ITEMS = [
  { href: "/dashboard/admin", label: "nav.dashboard", Icon: AnalyticsSvg },
  {
    href: "/dashboard/admin/restaurants",
    label: "nav.restaurants",
    Icon: RestaurantSvg,
  },
  { href: "/dashboard/admin/owners", label: "nav.owners", Icon: EmployeesSvg },
  {
    href: "/dashboard/admin/subscriptions",
    label: "nav.subscriptions",
    Icon: InvoiceSvg,
  },
  {
    href: "/dashboard/admin/documents",
    label: "nav.documents",
    Icon: NewsSvg,
  },
];

export default function NavAdminComponent() {
  const { t } = useTranslation("admin");
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

  const logoutBtnCls =
    "group grid h-11 grid-cols-[64px_minmax(0,1fr)] items-center overflow-hidden rounded-xl bg-red text-sm font-semibold text-white shadow transition hover:bg-red/90";

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
    if (typeof window === "undefined") return;

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
    if (itemHref === "/dashboard/admin") {
      return router.pathname === "/dashboard/admin";
    }
    return router.pathname.startsWith(itemHref);
  }

  function handleLogout() {
    localStorage.removeItem("admin-token");
    setMenuOpen(false);
    setNavExpanded(false);
    setNavHovered(false);
    router.push("/dashboard/admin/login");
  }

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

      {/* Bouton hamburger */}
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
            className={`absolute left-0 top-0 h-[2px] w-full bg-darkBlue transition-all ${
              menuOpen ? "rotate-45 top-1/2 -translate-y-1/2" : ""
            }`}
          />
          <span
            className={`absolute left-0 top-1/2 -translate-y-1/2 h-[2px] w-full bg-darkBlue transition-opacity ${
              menuOpen ? "opacity-0" : "opacity-100"
            }`}
          />
          <span
            className={`absolute left-0 bottom-0 h-[2px] w-full bg-darkBlue transition-all ${
              menuOpen ? "-rotate-45 bottom-1/2 translate-y-1/2" : ""
            }`}
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
            {ADMIN_NAV_ITEMS.map(({ href, label, Icon }) => {
              const active = isActive(href);

              const itemCls = [
                navItemBaseCls,
                navItemEnabledCls,
                active ? navItemActiveCls : "",
              ]
                .join(" ")
                .trim();

              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={(e) => handleLinkClick(e, href)}
                    className={itemCls}
                  >
                    <div className={iconSlotCls}>
                      <div
                        className={`${iconChipBase} ${
                          active ? iconChipActive : iconChipInactive
                        }`}
                      >
                        <Icon
                          width={20}
                          height={20}
                          fillColor={active ? "white" : "#131E3699"}
                          strokeColor={active ? "white" : "#131E3699"}
                        />
                      </div>
                    </div>

                    <span className={navLabelCls}>{t(label)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Logout */}
          <button className={logoutBtnCls} onClick={handleLogout}>
            <div className={iconSlotCls}>
              <span className="inline-flex items-center justify-center rounded-full border border-white/30 bg-white/10 p-2 text-white">
                <LogOut className="size-5" />
              </span>
            </div>
            <span className={navLabelCls}>{t("buttons.logout")}</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
