import { useEffect } from "react";
import { useRouter } from "next/router";
import {
  CalendarDays,
  LayoutGrid,
  Users,
  X,
  SlidersHorizontal,
  ChevronRight,
  CreditCard,
  List,
} from "lucide-react";

export default function SidebarReservationsWebapp({
  open,
  onClose,
  title ,
  module ,
  navItems,
}) {
  const router = useRouter();

  const handleClose = () => {
    if (typeof document !== "undefined") {
      const active = document.activeElement;
      if (active && typeof active.blur === "function") {
        active.blur();
      }
    }

    onClose?.();
  };

  // lock scroll
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev || "";
    };
  }, [open]);

  const defaultNavItemsByModule = {
    reservations: [
      {
        label: "Réservations",
        icon: CalendarDays,
        href: "/dashboard/webapp/reservations",
        match: (pathname) =>
          pathname === "/dashboard/webapp/reservations" ||
          pathname.startsWith("/dashboard/webapp/reservations/add"),
      },
      {
        label: "Plan de salle",
        icon: LayoutGrid,
        href: "/dashboard/webapp/reservations/floor-plan",
      },
      {
        label: "Fichier clients",
        icon: Users,
        href: "/dashboard/webapp/reservations/customers",
      },
      {
        label: "Paramètres",
        icon: SlidersHorizontal,
        href: "/dashboard/webapp/reservations/parameters",
      },
    ],
    gift_cards: [
      {
        label: "Cartes achetées",
        icon: CreditCard,
        href: "/dashboard/webapp/gift-cards",
        match: (pathname) => pathname === "/dashboard/webapp/gift-cards",
      },
      {
        label: "Listes des cartes",
        icon: List,
        href: "/dashboard/webapp/gift-cards/list",
      },
      {
        label: "Fichier clients",
        icon: Users,
        href: "/dashboard/webapp/gift-cards/customers",
      },
      {
        label: "Paramètres",
        icon: SlidersHorizontal,
        href: "/dashboard/webapp/gift-cards/parameters",
      },
    ],
  };

  const items =
    Array.isArray(navItems) && navItems.length
      ? navItems
      : defaultNavItemsByModule[module] || defaultNavItemsByModule.reservations;

  const isActiveItem = (item) => {
    const p = router.pathname || "";

    if (typeof item?.match === "function") {
      return Boolean(item.match(p, router));
    }

    return p === item?.href || p.startsWith(`${item?.href || ""}/`);
  };

  const go = (href) => {
    handleClose();

    setTimeout(() => {
      router.push(href);
    }, 300);
  };

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-[60] transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <button
          type="button"
          onClick={handleClose}
          className="absolute inset-0 bg-black/30"
          aria-label="Fermer le menu"
        />
      </div>

      {/* Drawer */}
      <aside
        className={`fixed top-0 left-0 z-[70] h-full w-[18rem] max-w-[85vw]
        border-r border-darkBlue/10 bg-lightGrey shadow-2xl
        transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-darkBlue/10">
            <div className="min-w-0">
              <p className="text-xs text-darkBlue/50">Gusto Manager</p>
              <p className="text-lg font-semibold text-darkBlue truncate">
                {title}
              </p>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="inline-flex items-center justify-center rounded-full border border-darkBlue/10 bg-white/50 hover:bg-darkBlue/5 active:scale-[0.98] transition p-2"
              aria-label="Fermer"
              title="Fermer"
            >
              <X className="size-5 text-darkBlue/70" />
            </button>
          </div>

          {/* Nav */}
          <nav className="p-3 flex flex-col gap-1">
            {items.map((it) => {
              const Icon = it.icon;
              const active = isActiveItem(it);

              return (
                <button
                  key={it.href}
                  type="button"
                  onClick={() => go(it.href)}
                  className={[
                    "group relative w-full overflow-hidden",
                    "flex items-center gap-3 rounded-2xl px-3 py-3 text-left",
                    "border transition-all",
                    "active:scale-[0.99]",
                    active
                      ? "bg-white/70 border-blue/20 shadow-sm"
                      : "bg-white/35 border-darkBlue/10 hover:bg-white/55 hover:border-darkBlue/15",
                  ].join(" ")}
                  aria-current={active ? "page" : undefined}
                >
                  {/* Rail gauche (actif) */}
                  <span
                    className={[
                      "absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 rounded-full transition",
                      active ? "bg-blue" : "bg-transparent",
                    ].join(" ")}
                    aria-hidden="true"
                  />

                  {/* Icon chip */}
                  <span
                    className={[
                      "inline-flex items-center justify-center size-10 rounded-2xl border transition",
                      active
                        ? "bg-blue/10 border-blue/20"
                        : "bg-white/50 border-darkBlue/10 group-hover:bg-white/70",
                    ].join(" ")}
                  >
                    <Icon
                      className={[
                        "size-5 transition",
                        active ? "text-blue" : "text-darkBlue/70",
                      ].join(" ")}
                    />
                  </span>

                  {/* Label */}
                  <span className="flex-1 min-w-0">
                    <span
                      className={[
                        "block truncate text-base font-semibold transition",
                        active ? "text-darkBlue" : "text-darkBlue/80",
                      ].join(" ")}
                    >
                      {it.label}
                    </span>
                  </span>

                  {/* Chevron subtil */}
                  <ChevronRight
                    className={[
                      "size-4 shrink-0 transition",
                      active
                        ? "text-blue"
                        : "text-darkBlue/35 group-hover:text-darkBlue/55 group-hover:translate-x-0.5",
                    ].join(" ")}
                  />
                </button>
              );
            })}
          </nav>
        </div>
      </aside>
    </>
  );
}
