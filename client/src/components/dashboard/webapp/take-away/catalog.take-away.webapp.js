import { useState } from "react";
import { Menu } from "lucide-react";

import TakeAwayCatalogComponent from "../../take-away/catalog.take-away.component";
import SidebarReservationsWebapp from "../_shared/sidebar.webapp";

export default function CatalogTakeAwayWebapp() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <SidebarReservationsWebapp
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        title="Vente à emporter"
        module="take_away"
      />

      <div className="flex h-[50px] items-center gap-3">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="inline-flex shrink-0 items-center justify-center rounded-full border border-darkBlue/10 bg-white/50 p-3 transition canHover:hover:bg-darkBlue/5 active:scale-[0.98]"
          aria-label="Ouvrir le menu"
          title="Menu"
        >
          <Menu className="size-5 text-darkBlue/70" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold text-darkBlue">
          Catalogue
        </h1>
      </div>

      <TakeAwayCatalogComponent webapp />
    </div>
  );
}
