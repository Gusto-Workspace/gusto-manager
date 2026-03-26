import { useState } from "react";
import { useTranslation } from "next-i18next";
import { Menu } from "lucide-react";
import SidebarReservationsWebapp from "../_shared/sidebar.webapp";
import GiftCardSettingsFormComponent, {
  useGiftCardSettingsController,
} from "../../../_shared/gift-cards/settings-form.gift-cards.component";

export default function ParametersGiftCardsWebapp() {
  const { t } = useTranslation("gifts");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { settings, sectionState, errorMessage, handleChange, saveSettings } =
    useGiftCardSettingsController();

  return (
    <div className="flex flex-col gap-4">
      <SidebarReservationsWebapp
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        title="Cartes cadeaux"
        module="gift_cards"
      />

      <div className="h-[50px] flex items-center gap-3">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="shrink-0 inline-flex items-center justify-center rounded-full border border-darkBlue/10 bg-white/50 active:scale-[0.98] transition p-3"
          aria-label="Menu"
          title="Menu"
        >
          <Menu className="size-5 text-darkBlue/70" />
        </button>

        <h1 className="flex-1 min-w-0 text-xl font-semibold text-darkBlue truncate">
          Paramètres
        </h1>
      </div>

      <GiftCardSettingsFormComponent
        settings={settings}
        sectionState={sectionState}
        errorMessage={errorMessage}
        onChange={handleChange}
        onSave={saveSettings}
        savePresentation="icon"
      />
    </div>
  );
}
