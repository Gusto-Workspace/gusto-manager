import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useTranslation } from "next-i18next";

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
  const [hasHover, setHasHover] = useState(false);

  const navRef = useRef(null);
  const timeoutRef = useRef(null);

  // ----- Styles (identiques à ta nav principale) -----
  const sidebarCls = `
    fixed inset-y-0 left-0
    w-[270px]
    flex flex-col
    bg-white
    border-r border-darkBlue/10
    shadow-[3px_0_20px_rgba(19,30,54,0.06)]
    px-2 py-4 tablet:px-4 tablet:py-6
    gap-4
    overflow-y-auto custom-scrollbar
    z-[90] tablet:z-10
  `;

  const logoWrapCls = "h-[72px] flex items-center justify-center mb-1";
  const logoImgCls = "max-w-[50px] opacity-70";
  const navListCls = "flex-1 flex flex-col gap-3 mt-1.5";

  const navItemBaseCls =
    "group h-11 flex items-center rounded-xl px-2 pr-3 text-base font-medium transition";
  const navItemEnabledCls =
    "cursor-pointer text-darkBlue/80" + (hasHover ? " hover:bg-blue/10" : "");
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
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const handleChange = (event) => setHasHover(event.matches);

    setHasHover(mq.matches);
    mq.addEventListener?.("change", handleChange);
    return () => mq.removeEventListener?.("change", handleChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

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
    if (itemHref === "/dashboard/admin") {
      return router.pathname === "/dashboard/admin";
    }
    return router.pathname.startsWith(itemHref);
  }

  function handleLogout() {
    localStorage.removeItem("admin-token");
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
        transform transition-transform duration-200 ease-out
        tablet:translate-x-0
        ${menuOpen ? "translate-x-0" : "-translate-x-full"}
        `}
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

                  <span className="ml-2 truncate">{t(label)}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Logout */}
        <button className={logoutBtnCls} onClick={handleLogout}>
          {t("buttons.logout")}
        </button>
      </nav>
    </div>
  );
}
