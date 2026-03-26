import { useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { CalendarDays, Check, Loader2, Save } from "lucide-react";
import { GlobalContext } from "@/contexts/global.context";

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

export function normalizeGiftCardSettings(settings) {
  return {
    validity_mode:
      settings?.validity_mode === "until_date"
        ? "until_date"
        : "fixed_duration",
    validity_fixed_months: Number(settings?.validity_fixed_months || 6),
    validity_until_day: Number(settings?.validity_until_day || 25),
    validity_until_month: Number(settings?.validity_until_month || 6),
    archive_used_after_months: Number(settings?.archive_used_after_months ?? 2),
  };
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
    const validityDirty =
      String(currentSettingsForm.validity_mode) !==
        String(settings.validity_mode) ||
      String(currentSettingsForm.validity_fixed_months) !==
        String(settings.validity_fixed_months) ||
      String(currentSettingsForm.validity_until_day) !==
        String(settings.validity_until_day) ||
      String(currentSettingsForm.validity_until_month) !==
        String(settings.validity_until_month);

    const archiveDirty =
      String(currentSettingsForm.archive_used_after_months) !==
      String(settings.archive_used_after_months);

    return {
      validity: {
        dirty: validityDirty,
        saving: savingSection === "validity",
        saved: savedSection === "validity" && !validityDirty,
      },
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

    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;

    try {
      setSavingSection(sectionKey || "validity");
      setErrorMessage("");

      const payload = {
        settings: {
          validity_mode: settings.validity_mode,
          validity_fixed_months: sanitizeIntegerDraft(
            settings.validity_fixed_months,
            DEFAULT_GIFT_CARD_SETTINGS.validity_fixed_months,
            { min: 1, max: 60 },
          ),
          validity_until_day: sanitizeIntegerDraft(
            settings.validity_until_day,
            DEFAULT_GIFT_CARD_SETTINGS.validity_until_day,
            { min: 1, max: 31 },
          ),
          validity_until_month: sanitizeIntegerDraft(
            settings.validity_until_month,
            DEFAULT_GIFT_CARD_SETTINGS.validity_until_month,
            { min: 1, max: 12 },
          ),
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
        token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
      );

      restaurantContext?.setRestaurantData?.(response.data.restaurant);
      setSavedSection(sectionKey || "validity");
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
  const validityFixedMonths = sanitizeIntegerDraft(
    settings.validity_fixed_months,
    DEFAULT_GIFT_CARD_SETTINGS.validity_fixed_months,
    { min: 1, max: 60 },
  );
  const validityUntilDay = sanitizeIntegerDraft(
    settings.validity_until_day,
    DEFAULT_GIFT_CARD_SETTINGS.validity_until_day,
    { min: 1, max: 31 },
  );
  const validityUntilMonth = sanitizeIntegerDraft(
    settings.validity_until_month,
    DEFAULT_GIFT_CARD_SETTINGS.validity_until_month,
    { min: 1, max: 12 },
  );
  const validitySummary =
    settings.validity_mode === "until_date"
      ? `Les cartes achetées seront valables jusqu'au ${validityUntilDay} ${
          MONTH_OPTIONS.find(
            (month) => month.value === validityUntilMonth,
          )?.label?.toLowerCase() || ""
        }.`
      : `Les cartes achetées seront valables ${validityFixedMonths} mois à partir de l'achat.`;

  const card = "rounded-3xl border border-darkBlue/10 bg-white/70 shadow-sm";
  const cardInner = "px-2 py-4 mobile:p-4 midTablet:p-6";
  const sectionTitle =
    "text-base font-semibold text-darkBlue flex items-center gap-2";
  const hint = "text-sm text-darkBlue/60";
  const divider = "h-px bg-darkBlue/10 my-4";
  const saveBtnBase =
    "inline-flex items-center gap-2 rounded-xl px-3 h-10 text-sm font-semibold transition";
  const saveBtnPrimary =
    "bg-darkBlue text-white hover:opacity-90 active:scale-[0.98]";
  const saveBtnDone =
    "bg-white text-darkBlue border border-darkBlue opacity-60";
  const inputBase =
    "h-11 w-full rounded-2xl border border-darkBlue/10 bg-white/80 px-4 text-base outline-none transition placeholder:text-darkBlue/35 focus:border-blue/60 focus:ring-2 focus:ring-blue/20";
  const optionCardBase =
    "rounded-2xl border px-4 py-4 text-left transition focus:outline-none";
  const optionCardSelected =
    "border-darkBlue bg-blue/10 ";
  const optionCardIdle =
    "border-darkBlue/10 bg-white/60 hover:border-darkBlue/20 hover:bg-white/80";
  const optionBadgeBase =
    "inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-semibold uppercase tracking-[0.14em]";

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
    <div className="flex flex-col gap-4">
      {errorMessage ? (
        <div className="rounded-2xl border border-red/20 bg-red/10 px-4 py-3 text-sm text-red">
          {errorMessage}
        </div>
      ) : null}

      <div className={card}>
        <div className={cardInner}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className={sectionTitle}>
                <CalendarDays className="size-4 shrink-0 opacity-60" />
                Validité des cartes cadeaux
              </p>
              <p className={hint}>{validitySummary}</p>
            </div>

            {renderSaveButton("validity")}
          </div>

          <div className={divider} />

          <div className="grid grid-cols-1 gap-3">
            {(() => {
              const isSelected = settings.validity_mode === "fixed_duration";

              return (
                <button
                  type="button"
                  onClick={() => onChange("validity_mode", "fixed_duration")}
                  className={[
                    optionCardBase,
                    isSelected ? optionCardSelected : optionCardIdle,
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-darkBlue">
                        Durée fixe
                      </p>
                      <p className="mt-1 text-xs text-darkBlue/60">
                        Exemple : 6 mois à partir de la date d’achat
                      </p>
                    </div>

                    <span
                      className={[
                        optionBadgeBase,
                        isSelected
                          ? "border-blue/20 bg-darkBlue text-white"
                          : "border-darkBlue/10 bg-white/80 text-darkBlue/45",
                      ].join(" ")}
                    >
                      {isSelected ? "Actif" : "Choisir"}
                    </span>
                  </div>

                  {isSelected ? (
                    <div className="mt-3 flex items-center gap-3">
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={settings.validity_fixed_months}
                        onChange={(event) =>
                          onChange("validity_fixed_months", event.target.value)
                        }
                        onBlur={() =>
                          onChange(
                            "validity_fixed_months",
                            String(
                              sanitizeIntegerDraft(
                                settings.validity_fixed_months,
                                DEFAULT_GIFT_CARD_SETTINGS.validity_fixed_months,
                                { min: 1, max: 60 },
                              ),
                            ),
                          )
                        }
                        className={`${inputBase} w-24 px-3`}
                      />
                      <span className="text-sm text-darkBlue/70">mois</span>
                    </div>
                  ) : null}
                </button>
              );
            })()}

            {(() => {
              const isSelected = settings.validity_mode === "until_date";

              return (
                <button
                  type="button"
                  onClick={() => onChange("validity_mode", "until_date")}
                  className={[
                    optionCardBase,
                    isSelected ? optionCardSelected : optionCardIdle,
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-darkBlue">
                        Jusqu’à une date donnée
                      </p>
                      <p className="mt-1 text-xs text-darkBlue/60">
                        Exemple : jusqu’au 25 juin, puis jusqu’au 25 juin
                        suivant
                      </p>
                    </div>

                    <span
                      className={[
                        optionBadgeBase,
                        isSelected
                          ? "border-blue/20 bg-darkBlue text-white"
                          : "border-darkBlue/10 bg-white/80 text-darkBlue/45",
                      ].join(" ")}
                    >
                      {isSelected ? "Actif" : "Choisir"}
                    </span>
                  </div>

                  {isSelected ? (
                    <div className="mt-3 flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type="number"
                          min="1"
                          max="31"
                          value={settings.validity_until_day}
                          onChange={(event) =>
                            onChange("validity_until_day", event.target.value)
                          }
                          onBlur={() =>
                            onChange(
                              "validity_until_day",
                              String(
                                sanitizeIntegerDraft(
                                  settings.validity_until_day,
                                  DEFAULT_GIFT_CARD_SETTINGS.validity_until_day,
                                  { min: 1, max: 31 },
                                ),
                              ),
                            )
                          }
                          className={inputBase}
                        />
                      </div>

                      <div className="relative flex-[1.4]">
                        <select
                          value={settings.validity_until_month}
                          onChange={(event) =>
                            onChange(
                              "validity_until_month",
                              Number(event.target.value),
                            )
                          }
                          className={inputBase}
                        >
                          {MONTH_OPTIONS.map((month) => (
                            <option key={month.value} value={month.value}>
                              {month.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ) : null}
                </button>
              );
            })()}
          </div>
        </div>
      </div>

      <div className={card}>
        <div className={cardInner}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className={sectionTitle}>
                <CalendarDays className="size-4 shrink-0 opacity-60" />
                Archivage automatique
              </p>
              <p className={hint}>
                Les cartes utilisées passeront en archivées après ce délai.
              </p>
            </div>

            {renderSaveButton("archive")}
          </div>

          <div className={divider} />

          <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3">
            <div className="flex items-center gap-3">
              <CalendarDays className="size-5 text-darkBlue/50" />
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
                className={`${inputBase} w-24 px-3`}
              />
              <span className="text-sm text-darkBlue/70">
                mois après utilisation
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
