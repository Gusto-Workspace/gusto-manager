import { useState } from "react";
import { Menu } from "lucide-react";

import SidebarReservationsWebapp from "../_shared/sidebar.webapp";
import PushNotificationsSettingsWebapp from "../_shared/push-notifications-settings.webapp";
import TakeAwayParametersComponent from "../../take-away/parameters.take-away.component";

export default function ParametersTakeAwayWebapp() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
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
        >
          <Menu className="size-5 text-darkBlue/70" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold text-darkBlue">
          Paramètres
        </h1>
      </div>

      <TakeAwayParametersComponent webapp />

      <PushNotificationsSettingsWebapp module="take_away" />
    </div>
  );
}
