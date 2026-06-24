import { useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { CalendarDays, Check, Loader2, Save } from "lucide-react";
import { GlobalContext } from "@/contexts/global.context";
import GiftCardVisualsFormComponent from "./visuals-form.gift-cards.component";

export const MONTH_OPTIONS = [
  { value: 1, label: "Janvier" },
  { value: 2, label: "Février" },
  { value: 3, label: "Mars" },
  { value: 4, label: "Avril" },
  { value: 5, label: "Mai" },
  { value: 6, label: "Juin" },
  { value: 7, label: "Juillet" },
  { value: 8, label: "Août" },
  { value: 9, label: "Septembre" },
  { value: 10, label: "Octobre" },
  { value: 11, label: "Novembre" },
  { value: 12, label: "Décembre" },
];

export const DEFAULT_GIFT_CARD_SETTINGS = {
  validity_mode: "fixed_duration",
  validity_fixed_months: 6,
  validity_until_day: 25,
  validity_until_month: 6,
  archive_used_after_months: 2,
};

function sanitizeIntegerDraft(value, fallback, { min = 0, max = 999 } = {}) {
  if (value === "") return fallback;

  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) return fallback;

  return Math.min(max, Math.max(min, Math.trunc(numericValue)));
}

function hasGiftCardValidityConfig(settings) {
  return Boolean(
    settings &&
      (settings.validity_mode ||
        settings.validity_fixed_months != null ||
        settings.validity_until_day != null ||
        settings.validity_until_month != null),
  );
}

export function normalizeGiftCardSettings(
  settings,
  fallbackSettings = DEFAULT_GIFT_CARD_SETTINGS,
) {
  const validitySource = hasGiftCardValidityConfig(settings)
    ? settings
    : fallbackSettings;

  return {
    validity_mode:
      validitySource?.validity_mode === "until_date"
        ? "until_date"
        : "fixed_duration",
    validity_fixed_months: Number(
      validitySource?.validity_fixed_months ||
        DEFAULT_GIFT_CARD_SETTINGS.validity_fixed_months,
    ),
    validity_until_day: Number(
      validitySource?.validity_until_day ||
        DEFAULT_GIFT_CARD_SETTINGS.validity_until_day,
    ),
    validity_until_month: Number(
      validitySource?.validity_until_month ||
        DEFAULT_GIFT_CARD_SETTINGS.validity_until_month,
    ),
    archive_used_after_months: Number(settings?.archive_used_after_months ?? 2),
  };
}

export function buildGiftCardValidityLabel(settings, fallbackSettings) {
  const normalizedSettings = normalizeGiftCardSettings(
    settings,
    fallbackSettings,
  );

  if (normalizedSettings.validity_mode === "until_date") {
    const monthLabel =
      MONTH_OPTIONS.find(
        (month) => month.value === normalizedSettings.validity_until_month,
      )?.label?.toLowerCase() || "juin";

    return `Valable jusqu'au ${normalizedSettings.validity_until_day} ${monthLabel}`;
  }

  return `Valable ${normalizedSettings.validity_fixed_months} mois après l'achat`;
}

function buildGiftCardSettingsFormState(settings) {
  const normalizedSettings = normalizeGiftCardSettings(settings);

  return {
    validity_mode: normalizedSettings.validity_mode,
    validity_fixed_months: String(normalizedSettings.validity_fixed_months),
    validity_until_day: String(normalizedSettings.validity_until_day),
    validity_until_month: normalizedSettings.validity_until_month,
    archive_used_after_months: String(
      normalizedSettings.archive_used_after_months,
    ),
  };
}

export function useGiftCardSettingsController() {
  const { restaurantContext } = useContext(GlobalContext);

  const [settings, setSettings] = useState(() =>
    buildGiftCardSettingsFormState(DEFAULT_GIFT_CARD_SETTINGS),
  );
  const [savingSection, setSavingSection] = useState(null);
  const [savedSection, setSavedSection] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  const restaurantId = restaurantContext?.restaurantData?._id;
  const currentSettings = useMemo(
    () =>
      normalizeGiftCardSettings(
        restaurantContext?.restaurantData?.giftCardSettings,
      ),
    [restaurantContext?.restaurantData?.giftCardSettings],
  );
  const currentSettingsForm = useMemo(
    () => buildGiftCardSettingsFormState(currentSettings),
    [currentSettings],
  );

  useEffect(() => {
    setSettings(currentSettingsForm);
    setSavedSection(null);
    setErrorMessage("");
  }, [currentSettingsForm]);

  const sectionState = useMemo(() => {
    const archiveDirty =
      String(currentSettingsForm.archive_used_after_months) !==
      String(settings.archive_used_after_months);

    return {
      archive: {
        dirty: archiveDirty,
        saving: savingSection === "archive",
        saved: savedSection === "archive" && !archiveDirty,
      },
    };
  }, [currentSettingsForm, savedSection, savingSection, settings]);

  const handleChange = (key, value) => {
    setSavedSection(null);
    setErrorMessage("");
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  async function saveSettings(sectionKey) {
    if (!restaurantId || savingSection) return;

    try {
      setSavingSection(sectionKey || "archive");
      setErrorMessage("");

      const payload = {
        settings: {
          archive_used_after_months: sanitizeIntegerDraft(
            settings.archive_used_after_months,
            DEFAULT_GIFT_CARD_SETTINGS.archive_used_after_months,
            { min: 0, max: 60 },
          ),
        },
      };

      const response = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/gifts/settings`,
        payload,
      );

      restaurantContext?.setRestaurantData?.(response.data.restaurant);
      setSavedSection(sectionKey || "archive");
    } catch (error) {
      console.error("Error updating gift card settings:", error);
      setErrorMessage(
        error?.response?.data?.message ||
          "Impossible d’enregistrer les paramètres pour le moment.",
      );
    } finally {
      setSavingSection(null);
    }
  }

  return {
    settings,
    sectionState,
    errorMessage,
    handleChange,
    saveSettings,
  };
}

export default function GiftCardSettingsFormComponent({
  settings,
  sectionState,
  errorMessage,
  onChange,
  onSave,
  savePresentation = "full",
}) {
  const card =
    "w-full rounded-3xl border border-darkBlue/10 bg-white/70 shadow-sm";
  const cardInner = "px-2 py-4 mobile:p-4 midTablet:p-6";
  const sectionTitle =
    "text-base font-semibold text-darkBlue flex items-center gap-2";
  const hint = "text-sm text-darkBlue/60";
  const saveBtnBase =
    "inline-flex items-center gap-2 rounded-xl px-3 h-10 text-sm font-semibold transition";
  const saveBtnPrimary =
    "bg-darkBlue text-white hover:opacity-90 active:scale-[0.98]";
  const saveBtnDone =
    "bg-white text-darkBlue border border-darkBlue opacity-60";
  const inputBase =
    "h-11 w-full rounded-2xl border border-darkBlue/10 bg-white/80 px-4 text-base outline-none transition placeholder:text-darkBlue/35 focus:border-blue/60 focus:ring-2 focus:ring-blue/20";

  const renderSaveButton = (sectionKey) => {
    const state = sectionState?.[sectionKey] || {
      dirty: false,
      saving: false,
      saved: false,
    };

    if (!state.dirty && !state.saving && !state.saved) return null;

    if (savePresentation === "icon") {
      return (
        <button
          type="button"
          onClick={() => onSave(sectionKey)}
          disabled={state.saving || state.saved}
          className={[
            "inline-flex h-10 min-w-10 items-center justify-center rounded-xl transition",
            state.saved
              ? "bg-white text-darkBlue border border-darkBlue opacity-60"
              : "bg-darkBlue text-white hover:opacity-90 active:scale-[0.98]",
            state.saving ? "opacity-60 cursor-not-allowed" : "",
          ].join(" ")}
          aria-label="Enregistrer"
          title="Enregistrer"
        >
          {state.saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : state.saved ? (
            <Check className="size-4" />
          ) : (
            <Save className="size-4" />
          )}
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={() => onSave(sectionKey)}
        disabled={state.saving || state.saved}
        className={[
          saveBtnBase,
          state.saved ? saveBtnDone : saveBtnPrimary,
          state.saving ? "opacity-60 cursor-not-allowed" : "",
        ].join(" ")}
      >
        {state.saving ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Enregistrement…
          </>
        ) : state.saved ? (
          <>
            <Check className="size-4" />
            Enregistré
          </>
        ) : (
          <>
            <Save className="size-4" />
            Enregistrer
          </>
        )}
      </button>
    );
  };

  return (
    <div className="flex w-full flex-col gap-4">
      {errorMessage ? (
        <div className="rounded-2xl border border-red/20 bg-red/10 px-4 py-3 text-sm text-red">
          {errorMessage}
        </div>
      ) : null}

      <div className={card}>
        <div className={cardInner}>
          <div className="flex flex-col gap-4 midTablet:flex-row midTablet:items-center midTablet:justify-between">
            <div className="min-w-0">
              <p className={sectionTitle}>
                <CalendarDays className="size-4 shrink-0 opacity-60" />
                Archivage automatique
              </p>
              <p className={hint}>
                Les cartes utilisées passeront en archivées après ce délai.
              </p>
            </div>

            <div className="flex w-full flex-wrap items-center gap-3 midTablet:w-[460px] midTablet:shrink-0 midTablet:justify-end">
              <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-darkBlue/10 bg-white/60 p-3">
                <CalendarDays className="size-5 shrink-0 text-darkBlue/50" />
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={settings.archive_used_after_months}
                  onChange={(event) =>
                    onChange("archive_used_after_months", event.target.value)
                  }
                  onBlur={() =>
                    onChange(
                      "archive_used_after_months",
                      String(
                        sanitizeIntegerDraft(
                          settings.archive_used_after_months,
                          DEFAULT_GIFT_CARD_SETTINGS.archive_used_after_months,
                          { min: 0, max: 60 },
                        ),
                      ),
                    )
                  }
                  className={`${inputBase} min-w-0 flex-1 px-3`}
                />
                <span className="shrink-0 text-sm text-darkBlue/70">
                  mois après utilisation
                </span>
              </div>

              {renderSaveButton("archive")}
            </div>
          </div>
        </div>
      </div>

      <GiftCardVisualsFormComponent />
    </div>
  );
}
