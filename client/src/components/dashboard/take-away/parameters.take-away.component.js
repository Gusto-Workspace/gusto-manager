import { useContext, useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  Loader2,
  Plus,
  Save,
  Settings2,
  Trash2,
} from "lucide-react";

import { GlobalContext } from "@/contexts/global.context";
import HoursRestaurantComponent from "@/components/dashboard/restaurant/hours.restaurant.component";
import TakeAwayHeaderComponent from "./header.take-away.component";
import { EmptyState, FormField, ToggleField } from "./form.take-away.component";
import {
  buildDeliveryZonesPayload,
  fieldClass,
  getDeliveryZoneForm,
} from "./take-away.utils";

const SLOT_INTERVAL_OPTIONS = [5, 10, 15, 20, 30, 45, 60];
const SLOT_QUOTA_OPTIONS = Array.from({ length: 20 }, (_, index) => index + 1);
const DEFAULT_AUTO_DELETE_MINUTES = 6 * 30 * 24 * 60;
const AUTO_DELETE_OPTIONS = [
  { value: 1440, label: "24 h" },
  { value: 7 * 24 * 60, label: "1 semaine" },
  { value: 30 * 24 * 60, label: "1 mois" },
  { value: DEFAULT_AUTO_DELETE_MINUTES, label: "6 mois (défaut)" },
  { value: 365 * 24 * 60, label: "1 an" },
];
const DAYS = [
  { key: "hours.days.monday", label: "Lundi" },
  { key: "hours.days.tuesday", label: "Mardi" },
  { key: "hours.days.wednesday", label: "Mercredi" },
  { key: "hours.days.thursday", label: "Jeudi" },
  { key: "hours.days.friday", label: "Vendredi" },
  { key: "hours.days.saturday", label: "Samedi" },
  { key: "hours.days.sunday", label: "Dimanche" },
];

function getPreparationTimeValidation(value) {
  if (value === undefined || value === null || value === "") {
    return { valid: true, value: undefined };
  }

  const minutes = Number(value);
  return {
    valid: Number.isInteger(minutes) && minutes > 0,
    value: minutes,
  };
}

function SectionCard({
  icon,
  title,
  description,
  children,
  saveUI,
  onSave,
  saveDisabled = false,
  savePresentation = "full",
}) {
  const showSaveButton = saveUI?.dirty || saveUI?.saving || saveUI?.saved;

  return (
    <section className="rounded-3xl border border-darkBlue/10 bg-white/70 p-4 shadow-sm midTablet:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-darkBlue">
            {icon}
            {title}
          </h2>
          {description ? (
            <p className="text-sm text-darkBlue/60">{description}</p>
          ) : null}
        </div>

        {onSave && showSaveButton ? (
          <button
            type="button"
            onClick={onSave}
            disabled={saveDisabled || saveUI?.saving || saveUI?.saved}
            className={[
              savePresentation === "icon"
                ? "inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-xl transition"
                : "inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition",
              saveUI?.saved
                ? "border border-darkBlue bg-white text-darkBlue opacity-60"
                : "bg-darkBlue text-white canHover:hover:opacity-90 active:scale-[0.98]",
              saveUI?.saving || saveDisabled
                ? "cursor-not-allowed opacity-60"
                : "",
            ].join(" ")}
            aria-label="Enregistrer"
            title="Enregistrer"
          >
            {savePresentation === "icon" ? (
              saveUI?.saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : saveUI?.saved ? (
                <Check className="size-4" />
              ) : (
                <Save className="size-4" />
              )
            ) : saveUI?.saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Enregistrement…
              </>
            ) : saveUI?.saved ? (
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
        ) : null}
      </div>
      <div className="my-4 h-px bg-darkBlue/10" />

      {saveUI?.error ? (
        <p className="mb-4 text-sm font-semibold text-red" role="alert">
          {saveUI.error}
        </p>
      ) : null}

      {children}
    </section>
  );
}

const SECTION_KEYS = [
  "availability",
  "operations",
  "payment",
  "cleanup",
  "hours",
  "delivery",
];

function createSectionUI() {
  return Object.fromEntries(
    SECTION_KEYS.map((key) => [
      key,
      { dirty: false, saving: false, saved: false, error: "" },
    ]),
  );
}

function buildDefaultSlots(settings = {}, restaurant = {}) {
  const currentSlots = Array.isArray(settings.slots) ? settings.slots : [];
  if (currentSlots.length) {
    return DAYS.map((day) => {
      const existing = currentSlots.find((slotDay) => slotDay.day === day.key);
      return {
        day: day.key,
        isClosed: existing?.isClosed === true,
        slots:
          existing?.slots?.length > 0
            ? existing.slots.map((slot) => ({
                start: slot.start || "",
                end: slot.end || "",
                intervalMinutes:
                  slot.intervalMinutes ||
                  settings.defaultSlotIntervalMinutes ||
                  15,
                maxOrders: slot.maxOrders || settings.defaultSlotMaxOrders || 6,
              }))
            : [
                {
                  start: "",
                  end: "",
                  intervalMinutes: settings.defaultSlotIntervalMinutes || 15,
                  maxOrders: settings.defaultSlotMaxOrders || 6,
                },
              ],
      };
    });
  }

  return DAYS.map((day) => {
    const openingDay = (restaurant.opening_hours || []).find(
      (entry) => entry.day === day.key,
    );
    const openingRanges = Array.isArray(openingDay?.hours)
      ? openingDay.hours
      : [];

    return {
      day: day.key,
      isClosed: openingDay?.isClosed === true,
      slots:
        openingRanges.length > 0
          ? openingRanges.map((range) => ({
              start: range.open || "",
              end: range.close || "",
              intervalMinutes: settings.defaultSlotIntervalMinutes || 15,
              maxOrders: settings.defaultSlotMaxOrders || 6,
            }))
          : [
              {
                start: "",
                end: "",
                intervalMinutes: settings.defaultSlotIntervalMinutes || 15,
                maxOrders: settings.defaultSlotMaxOrders || 6,
              },
            ],
    };
  });
}

function buildTakeAwayHours(settings = {}, restaurant = {}) {
  const slots = Array.isArray(settings.slots) ? settings.slots : [];
  const sourceDays = slots.length
    ? slots
    : buildDefaultSlots(settings, restaurant);

  return DAYS.map((day) => {
    const existing = sourceDays.find((entry) => entry.day === day.key);
    return {
      day: day.key,
      isClosed: existing?.isClosed === true,
      hours:
        existing?.slots?.length > 0
          ? existing.slots.map((slot) => ({
              open: slot.start || "",
              close: slot.end || "",
            }))
          : [{ open: "", close: "" }],
    };
  });
}

function buildSlotsFromHours(hours = [], settings = {}) {
  return DAYS.map((day) => {
    const existing = hours.find((entry) => entry.day === day.key);
    const ranges = Array.isArray(existing?.hours) ? existing.hours : [];

    return {
      day: day.key,
      isClosed: existing?.isClosed === true,
      slots:
        existing?.isClosed === true
          ? []
          : ranges
              .map((range) => ({
                start: range.open || "",
                end: range.close || "",
                intervalMinutes: Number(
                  settings.defaultSlotIntervalMinutes || 15,
                ),
                maxOrders: Number(settings.defaultSlotMaxOrders || 6),
              }))
              .filter((range) => range.start || range.end),
    };
  });
}

export default function TakeAwayParametersComponent({ webapp = false }) {
  const { restaurantContext } = useContext(GlobalContext);
  const restaurant = restaurantContext.restaurantData;
  const restaurantId = restaurant?._id;
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const [settingsForm, setSettingsForm] = useState(null);
  const [deliveryZones, setDeliveryZones] = useState([]);
  const [takeAwayHours, setTakeAwayHours] = useState([]);
  const [openZoneIndex, setOpenZoneIndex] = useState(null);
  const [sectionUI, setSectionUI] = useState(createSectionUI);
  const skipHydrationForRestaurantRef = useRef(null);

  const stripeReady = Boolean(String(restaurant?.stripeSecretKey || "").trim());
  const paymentRequiresStripe = ["online_required", "customer_choice"].includes(
    settingsForm?.paymentPolicy,
  );
  useEffect(() => {
    if (
      skipHydrationForRestaurantRef.current &&
      skipHydrationForRestaurantRef.current === String(restaurant?._id || "")
    ) {
      skipHydrationForRestaurantRef.current = null;
      return;
    }

    const settings = restaurant?.takeAwaySettings || {};
    const enabled = settings.enabled === true;
    setSettingsForm({
      enabled,
      pickupEnabled: enabled ? settings.pickupEnabled !== false : false,
      deliveryEnabled: enabled ? settings.deliveryEnabled === true : false,
      auto_accept: enabled ? settings.auto_accept !== false : false,
      paymentPolicy: settings.paymentPolicy || "on_site",
      same_hours_as_restaurant: settings.same_hours_as_restaurant !== false,
      preparationTimeMinutes: settings.preparationTimeMinutes ?? "",
      defaultSlotIntervalMinutes: settings.defaultSlotIntervalMinutes || 15,
      defaultSlotMaxOrders: settings.defaultSlotMaxOrders || 6,
      minimumPickupOrder: settings.minimumPickupOrder || 0,
      completedOrderAutoDeleteEnabled:
        settings.completedOrderAutoDeleteEnabled ??
        Number(settings.completedOrderAutoDeleteDays || 0) > 0,
      completedOrderAutoDeleteMinutes:
        settings.completedOrderAutoDeleteMinutes ??
        (settings.completedOrderAutoDeleteDays
          ? Number(settings.completedOrderAutoDeleteDays) * 24 * 60
          : DEFAULT_AUTO_DELETE_MINUTES),
    });
    setTakeAwayHours(buildTakeAwayHours(settings, restaurant));
    setDeliveryZones(
      (settings.deliveryZones || []).map((zone, index) =>
        getDeliveryZoneForm(zone, index),
      ),
    );
    setOpenZoneIndex(null);
    setSectionUI(createSectionUI());
  }, [restaurant]);

  async function request(config) {
    return axios({
      ...config,
      headers: {
        ...(config.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });
  }

  function markSectionDirty(sectionKey) {
    setSectionUI((current) => ({
      ...current,
      [sectionKey]: {
        ...current[sectionKey],
        dirty: true,
        saved: false,
        error: "",
      },
    }));
  }

  function updateSettings(sectionKey, updater) {
    setSettingsForm((current) =>
      typeof updater === "function"
        ? updater(current)
        : { ...current, ...updater },
    );
    markSectionDirty(sectionKey);
  }

  function getSectionPayload(sectionKey, hoursOverride = null) {
    if (sectionKey === "availability") {
      return {
        enabled: settingsForm.enabled,
        pickupEnabled: settingsForm.enabled
          ? settingsForm.pickupEnabled
          : false,
        deliveryEnabled: settingsForm.enabled
          ? settingsForm.deliveryEnabled
          : false,
      };
    }
    if (sectionKey === "operations") {
      const preparationTime = getPreparationTimeValidation(
        settingsForm.preparationTimeMinutes,
      );
      return {
        auto_accept: settingsForm.enabled ? settingsForm.auto_accept : false,
        ...(preparationTime.value === undefined
          ? {}
          : { preparationTimeMinutes: preparationTime.value }),
        defaultSlotIntervalMinutes: settingsForm.defaultSlotIntervalMinutes,
        defaultSlotMaxOrders: settingsForm.defaultSlotMaxOrders,
        minimumPickupOrder: settingsForm.minimumPickupOrder,
      };
    }
    if (sectionKey === "payment") {
      return { paymentPolicy: settingsForm.paymentPolicy };
    }
    if (sectionKey === "cleanup") {
      return {
        completedOrderAutoDeleteEnabled:
          settingsForm.completedOrderAutoDeleteEnabled,
        completedOrderAutoDeleteMinutes:
          settingsForm.completedOrderAutoDeleteMinutes,
        completedOrderAutoDeleteDays:
          settingsForm.completedOrderAutoDeleteEnabled === true
            ? Number(settingsForm.completedOrderAutoDeleteMinutes || 0) /
              (24 * 60)
            : 0,
      };
    }
    if (sectionKey === "hours") {
      const hours = hoursOverride || takeAwayHours;
      return {
        same_hours_as_restaurant: hoursOverride
          ? false
          : settingsForm.same_hours_as_restaurant,
        ...(settingsForm.same_hours_as_restaurant && !hoursOverride
          ? {}
          : { slots: buildSlotsFromHours(hours, settingsForm) }),
      };
    }
    if (sectionKey === "delivery") {
      return { deliveryZones: buildDeliveryZonesPayload(deliveryZones) };
    }
    return {};
  }

  async function saveSection(sectionKey, { hoursOverride = null } = {}) {
    if (!settingsForm || sectionUI[sectionKey]?.saving) return false;
    if (
      sectionKey === "operations" &&
      !getPreparationTimeValidation(settingsForm.preparationTimeMinutes).valid
    ) {
      setSectionUI((current) => ({
        ...current,
        operations: {
          ...current.operations,
          error: "Le temps de préparation doit être un entier supérieur à 0.",
        },
      }));
      return false;
    }
    if (sectionKey === "payment" && paymentRequiresStripe && !stripeReady) {
      setSectionUI((current) => ({
        ...current,
        payment: {
          ...current.payment,
          error:
            "Configure une clé Stripe avant d’activer le paiement en ligne.",
        },
      }));
      return false;
    }

    setSectionUI((current) => ({
      ...current,
      [sectionKey]: {
        ...current[sectionKey],
        saving: true,
        saved: false,
        error: "",
      },
    }));
    try {
      const { data } = await request({
        method: "put",
        url: `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/take-away/settings`,
        data: { settings: getSectionPayload(sectionKey, hoursOverride) },
      });
      if (hoursOverride) setTakeAwayHours(hoursOverride);
      skipHydrationForRestaurantRef.current = String(
        data.restaurant?._id || "",
      );
      restaurantContext.setRestaurantData(data.restaurant);
      setSectionUI((current) => ({
        ...current,
        [sectionKey]: {
          dirty: false,
          saving: false,
          saved: true,
          error: "",
        },
      }));
      return true;
    } catch (error) {
      console.error(error);
      setSectionUI((current) => ({
        ...current,
        [sectionKey]: {
          ...current[sectionKey],
          saving: false,
          saved: false,
          error:
            error?.response?.data?.message ||
            "Erreur lors de l’enregistrement.",
        },
      }));
      return false;
    }
  }

  function updateDeliveryZone(index, patch) {
    markSectionDirty("delivery");
    setDeliveryZones((prev) =>
      prev.map((zone, zoneIndex) =>
        zoneIndex === index ? { ...zone, ...patch } : zone,
      ),
    );
  }

  function updateZoneZipDraft(index, value) {
    updateDeliveryZone(index, {
      zipCodeDraft: String(value || "")
        .replace(/\D/g, "")
        .slice(0, 5),
    });
  }

  function addZipCodeToZone(index) {
    markSectionDirty("delivery");
    setDeliveryZones((prev) =>
      prev.map((zone, zoneIndex) => {
        if (zoneIndex !== index) return zone;

        const zipCode = String(zone.zipCodeDraft || "").trim();
        if (!/^\d{5}$/.test(zipCode)) return zone;

        const zipCodes = Array.isArray(zone.zipCodes) ? zone.zipCodes : [];
        if (zipCodes.includes(zipCode)) {
          return { ...zone, zipCodeDraft: "" };
        }

        return {
          ...zone,
          zipCodes: [...zipCodes, zipCode],
          zipCodeDraft: "",
        };
      }),
    );
  }

  function removeZipCodeFromZone(index, zipCodeToRemove) {
    markSectionDirty("delivery");
    setDeliveryZones((prev) =>
      prev.map((zone, zoneIndex) =>
        zoneIndex === index
          ? {
              ...zone,
              zipCodes: (zone.zipCodes || []).filter(
                (zipCode) => zipCode !== zipCodeToRemove,
              ),
            }
          : zone,
      ),
    );
  }

  function addDeliveryZone() {
    markSectionDirty("delivery");
    setDeliveryZones((prev) => {
      const next = [
        ...prev,
        getDeliveryZoneForm(
          {
            name: "",
            zipCodes: [],
            fee: 0,
            minimumOrder: 0,
            estimatedMinutes: 30,
            active: true,
          },
          Date.now(),
        ),
      ];
      setOpenZoneIndex(next.length - 1);
      return next;
    });
  }

  function removeDeliveryZone(index) {
    markSectionDirty("delivery");
    setDeliveryZones((prev) => {
      const next = prev.filter((_, zoneIndex) => zoneIndex !== index);
      setOpenZoneIndex((current) => {
        if (current === null) return null;
        if (current === index) return null;
        if (current > index) return current - 1;
        return current;
      });
      return next;
    });
  }

  async function saveTakeAwayHoursImmediate(newHours) {
    updateSettings("hours", (current) => ({
      ...current,
      same_hours_as_restaurant: false,
    }));
    const saved = await saveSection("hours", { hoursOverride: newHours });
    if (!saved) throw new Error("TAKE_AWAY_HOURS_SAVE_FAILED");
  }

  if (!settingsForm) return null;

  return (
    <section className={`flex flex-col ${webapp ? "gap-4" : "gap-6"}`}>
      {!webapp ? (
        <TakeAwayHeaderComponent subtitle="Paramètres" showBack />
      ) : null}

      <div className="flex w-full flex-col gap-5">
        <SectionCard
          icon={<Settings2 className="size-4 shrink-0 opacity-60" />}
          title="Disponibilité"
          description="Active le module et choisis les modes proposés aux clients."
          saveUI={sectionUI.availability}
          onSave={() => saveSection("availability")}
          savePresentation={webapp ? "icon" : "full"}
        >
          <div className="grid gap-4 midTablet:grid-cols-2">
            <ToggleField
              checked={settingsForm.enabled}
              onChange={(checked) =>
                updateSettings("availability", (prev) => ({
                  ...prev,
                  enabled: checked,
                  pickupEnabled: checked ? prev.pickupEnabled : false,
                  deliveryEnabled: checked ? prev.deliveryEnabled : false,
                }))
              }
              title="Activer les commandes en ligne"
              description="Rend le parcours public disponible pour les clients."
            />
            <ToggleField
              checked={settingsForm.enabled && settingsForm.pickupEnabled}
              disabled={!settingsForm.enabled}
              onChange={(checked) =>
                updateSettings("availability", {
                  pickupEnabled: checked,
                })
              }
              title="Autoriser le retrait"
              description="Les clients peuvent venir récupérer leur commande au restaurant."
            />
            <ToggleField
              checked={settingsForm.enabled && settingsForm.deliveryEnabled}
              disabled={!settingsForm.enabled}
              onChange={(checked) =>
                updateSettings("availability", {
                  deliveryEnabled: checked,
                })
              }
              title="Autoriser la livraison"
              description="Les clients peuvent choisir une adresse dans une zone couverte."
            />
          </div>
        </SectionCard>

        <SectionCard
          icon={<Clock className="size-4 shrink-0 opacity-60" />}
          title="Commandes et créneaux"
          description="Définis la validation des commandes, le rythme de production et les quotas."
          saveUI={sectionUI.operations}
          onSave={() => saveSection("operations")}
          savePresentation={webapp ? "icon" : "full"}
        >
          <div className="grid gap-4 midTablet:grid-cols-2">
            <ToggleField
              checked={settingsForm.enabled && settingsForm.auto_accept}
              disabled={!settingsForm.enabled}
              onChange={(checked) =>
                updateSettings("operations", { auto_accept: checked })
              }
              title="Accepter automatiquement les commandes"
              description="Si désactivé, les nouvelles commandes restent en attente jusqu’à validation."
            />
            <FormField label="Durée d’un créneau">
              <select
                className={fieldClass(false)}
                value={settingsForm.defaultSlotIntervalMinutes}
                onChange={(e) =>
                  updateSettings("operations", {
                    defaultSlotIntervalMinutes: e.target.value,
                  })
                }
              >
                {SLOT_INTERVAL_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} minutes
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Temps de préparation">
              <div className="flex h-11 items-center rounded-xl border border-darkBlue/10 bg-white px-3 focus-within:border-blue/60 focus-within:ring-2 focus-within:ring-blue/20">
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  className="h-full min-w-0 flex-1 bg-transparent outline-none"
                  value={settingsForm.preparationTimeMinutes}
                  onKeyDown={(event) => {
                    if (["-", ".", ",", "e", "E"].includes(event.key)) {
                      event.preventDefault();
                    }
                  }}
                  onChange={(e) =>
                    updateSettings("operations", {
                      preparationTimeMinutes: e.target.value,
                    })
                  }
                />
                <span className="ml-2 text-sm font-semibold text-darkBlue/55">
                  minutes
                </span>
              </div>
            </FormField>
            <FormField label="Nombre maximum de commandes par créneau">
              <select
                className={fieldClass(false)}
                value={settingsForm.defaultSlotMaxOrders}
                onChange={(e) =>
                  updateSettings("operations", {
                    defaultSlotMaxOrders: e.target.value,
                  })
                }
              >
                {SLOT_QUOTA_OPTIONS.map((quantity) => (
                  <option key={quantity} value={quantity}>
                    {quantity} commande{quantity > 1 ? "s" : ""}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Minimum de commande en retrait">
              <div className="flex h-11 items-center rounded-xl border border-darkBlue/10 bg-white px-3 focus-within:border-blue/60 focus-within:ring-2 focus-within:ring-blue/20">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="h-full min-w-0 flex-1 bg-transparent outline-none"
                  value={settingsForm.minimumPickupOrder}
                  onChange={(e) =>
                    updateSettings("operations", {
                      minimumPickupOrder: e.target.value,
                    })
                  }
                />
                <span className="ml-2 text-sm font-semibold text-darkBlue/55">
                  €
                </span>
              </div>
            </FormField>
          </div>
        </SectionCard>

        <SectionCard
          icon={<Settings2 className="size-4 shrink-0 opacity-60" />}
          title="Paiement"
          description="Choisis le mode de règlement proposé dans le parcours public."
          saveUI={sectionUI.payment}
          onSave={() => saveSection("payment")}
          saveDisabled={paymentRequiresStripe && !stripeReady}
          savePresentation={webapp ? "icon" : "full"}
        >
          <FormField label="Règle de paiement">
            <select
              className={fieldClass(false)}
              value={settingsForm.paymentPolicy}
              onChange={(e) =>
                updateSettings("payment", {
                  paymentPolicy: e.target.value,
                })
              }
            >
              <option value="on_site">Paiement au retrait/livraison</option>
              <option value="online_required">
                Paiement en ligne obligatoire
              </option>
              <option value="customer_choice">Choix client</option>
            </select>
          </FormField>
          {paymentRequiresStripe && !stripeReady ? (
            <p className="mt-3 rounded-xl border border-orange/20 bg-orange/10 px-4 py-3 text-sm font-semibold text-orange">
              Configure une clé Stripe dans le restaurant avant d’enregistrer un
              mode avec paiement en ligne.
            </p>
          ) : null}
        </SectionCard>

        <SectionCard
          icon={<Settings2 className="size-4 shrink-0 opacity-60" />}
          title="Automatisations"
          description="Nettoie automatiquement les commandes terminées après le délai choisi."
          saveUI={sectionUI.cleanup}
          onSave={() => saveSection("cleanup")}
          savePresentation={webapp ? "icon" : "full"}
        >
          <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-darkBlue">
                  Supprimer automatiquement les commandes terminées
                </p>
                <p className="text-xs text-darkBlue/50">
                  Une commande au statut “Terminée” sera supprimée après le
                  délai configuré.
                </p>
              </div>

              <label className="inline-flex items-center gap-2">
                <span
                  className={`relative inline-flex h-8 w-14 items-center rounded-full border transition ${
                    settingsForm.completedOrderAutoDeleteEnabled
                      ? "border-blue/40 bg-blue"
                      : "border-darkBlue/10 bg-darkBlue/10"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={settingsForm.completedOrderAutoDeleteEnabled}
                    onChange={(e) =>
                      updateSettings("cleanup", (prev) => ({
                        ...prev,
                        completedOrderAutoDeleteEnabled: e.target.checked,
                        completedOrderAutoDeleteMinutes: e.target.checked
                          ? prev.completedOrderAutoDeleteMinutes ||
                            DEFAULT_AUTO_DELETE_MINUTES
                          : DEFAULT_AUTO_DELETE_MINUTES,
                      }))
                    }
                  />
                  <span
                    className={`absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-white shadow-sm transition ${
                      settingsForm.completedOrderAutoDeleteEnabled
                        ? "translate-x-7"
                        : "translate-x-1"
                    }`}
                  />
                </span>
              </label>
            </div>

            <div className="mt-3">
              <select
                className={fieldClass(false)}
                disabled={!settingsForm.completedOrderAutoDeleteEnabled}
                value={settingsForm.completedOrderAutoDeleteMinutes}
                onChange={(e) =>
                  updateSettings("cleanup", {
                    completedOrderAutoDeleteMinutes: e.target.value,
                  })
                }
              >
                {AUTO_DELETE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          icon={<CalendarDays className="size-4 shrink-0 opacity-60" />}
          title="Horaires de vente à emporter"
          description={
            settingsForm.same_hours_as_restaurant
              ? "Utilise les horaires du restaurant."
              : "Définis des horaires spécifiques aux commandes à emporter."
          }
          saveUI={sectionUI.hours}
          onSave={() => saveSection("hours")}
          savePresentation={webapp ? "icon" : "full"}
        >
          <ToggleField
            checked={settingsForm.same_hours_as_restaurant}
            onChange={(checked) =>
              updateSettings("hours", {
                same_hours_as_restaurant: checked,
              })
            }
            title="Utiliser les horaires du restaurant"
            description="Désactive cette option pour définir des horaires spécifiques au Take-away."
          />

          {!settingsForm.same_hours_as_restaurant ? (
            <div className="mt-4 border-t border-darkBlue/10 pt-4">
              <HoursRestaurantComponent
                restaurantId={restaurantId}
                dataLoading={restaurantContext.dataLoading}
                closeEditing={restaurantContext.closeEditing}
                reservations
                reservationHours={takeAwayHours}
                onSaveReservationHours={saveTakeAwayHoursImmediate}
                hoursTitle="Horaires personnalisés"
                hoursSubtitle="Éditez puis enregistrez les plages disponibles pour les commandes à emporter."
              />
            </div>
          ) : null}
        </SectionCard>

        <SectionCard
          icon={<Plus className="size-4 shrink-0 opacity-60" />}
          title="Zones de livraison"
          description="Ajoute une zone, indique les codes postaux couverts, puis les frais et le minimum de commande."
          saveUI={sectionUI.delivery}
          onSave={() => saveSection("delivery")}
          savePresentation={webapp ? "icon" : "full"}
        >
          {!deliveryZones.length ? (
            <EmptyState text="Aucune zone configurée. Ajoute une première zone de livraison." />
          ) : (
            <div className="flex flex-col gap-3">
              {deliveryZones.map((zone, index) => (
                <div
                  key={zone.localId}
                  className="rounded-2xl border border-darkBlue/10 bg-white/80 px-2 py-3 transition-shadow tablet:px-5 tablet:py-4"
                >
                  <div className="flex w-full items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenZoneIndex((current) =>
                          current === index ? null : index,
                        )
                      }
                      className="flex min-w-0 flex-1 items-center gap-4 text-left"
                    >
                      <span className="inline-flex h-7 items-center justify-center rounded-full bg-darkBlue/5 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-darkBlue">
                        Zone {index + 1}
                      </span>
                      <p className="truncate text-sm font-semibold text-darkBlue">
                        {zone.name || "Nouvelle zone"}
                      </p>
                    </button>

                    <div className="flex shrink-0 items-center gap-3">
                      <label className="inline-flex items-center gap-2 text-xs font-semibold text-darkBlue/70">
                        <input
                          type="checkbox"
                          checked={zone.active}
                          onChange={(e) =>
                            updateDeliveryZone(index, {
                              active: e.target.checked,
                            })
                          }
                        />
                        Active
                      </label>
                      <button
                        type="button"
                        onClick={() => removeDeliveryZone(index)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-red/20 bg-white text-red canHover:hover:bg-red/10"
                        aria-label="Supprimer la zone"
                        title="Supprimer la zone"
                      >
                        <Trash2 className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setOpenZoneIndex((current) =>
                            current === index ? null : index,
                          )
                        }
                        className="inline-flex size-8 items-center justify-center rounded-xl text-darkBlue/50 transition canHover:hover:bg-darkBlue/5"
                        aria-label={
                          openZoneIndex === index
                            ? "Replier la zone"
                            : "Déplier la zone"
                        }
                      >
                        <ChevronDown
                          className={`size-4 transition-transform ${
                            openZoneIndex === index ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  <div
                    className={`grid transition-[grid-template-rows,opacity,margin] duration-200 ${
                      openZoneIndex === index
                        ? "mt-4 grid-rows-[1fr] opacity-100"
                        : "grid-rows-[0fr] opacity-0 pointer-events-none"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="grid gap-3 midTablet:grid-cols-2">
                        <FormField label="Nom de la zone">
                          <input
                            className={fieldClass(false)}
                            value={zone.name}
                            onChange={(e) =>
                              updateDeliveryZone(index, {
                                name: e.target.value,
                              })
                            }
                          />
                        </FormField>
                        <FormField label="Codes postaux couverts">
                          <div className="flex h-11 items-center rounded-xl border border-darkBlue/10 bg-white pl-3 pr-1 focus-within:border-blue/60 focus-within:ring-2 focus-within:ring-blue/20">
                            <input
                              inputMode="numeric"
                              pattern="[0-9]{5}"
                              maxLength={5}
                              placeholder="Exemple : 19100"
                              className="h-full min-w-0 flex-1 bg-transparent outline-none"
                              value={zone.zipCodeDraft || ""}
                              onChange={(e) =>
                                updateZoneZipDraft(index, e.target.value)
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  addZipCodeToZone(index);
                                }
                              }}
                            />
                            {zone.zipCodeDraft ? (
                              <button
                                type="button"
                                onClick={() => addZipCodeToZone(index)}
                                disabled={!/^\d{5}$/.test(zone.zipCodeDraft)}
                                className="inline-flex size-9 items-center justify-center rounded-lg bg-blue text-white transition canHover:hover:bg-blue/90 disabled:cursor-not-allowed disabled:bg-darkBlue/15 disabled:text-darkBlue/35"
                                aria-label="Ajouter le code postal"
                                title="Ajouter le code postal"
                              >
                                <Plus className="size-4" />
                              </button>
                            ) : null}
                          </div>
                          {zone.zipCodes?.length ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {zone.zipCodes.map((zipCode) => (
                                <span
                                  key={zipCode}
                                  className="inline-flex items-center gap-2 rounded-full bg-darkBlue/5 px-3 py-1 text-xs font-semibold text-darkBlue"
                                >
                                  {zipCode}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeZipCodeFromZone(index, zipCode)
                                    }
                                    className="text-darkBlue/45 transition canHover:hover:text-red"
                                    aria-label={`Supprimer le code postal ${zipCode}`}
                                    title="Supprimer ce code postal"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-2 text-xs text-darkBlue/45">
                              Aucun code postal ajouté.
                            </p>
                          )}
                        </FormField>
                        <FormField label="Frais de livraison">
                          <div className="flex h-11 items-center rounded-xl border border-darkBlue/10 bg-white px-3 focus-within:border-blue/60 focus-within:ring-2 focus-within:ring-blue/20">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="h-full min-w-0 flex-1 bg-transparent outline-none"
                              value={zone.fee}
                              onChange={(e) =>
                                updateDeliveryZone(index, {
                                  fee: e.target.value,
                                })
                              }
                            />
                            <span className="ml-2 text-sm font-semibold text-darkBlue/55">
                              €
                            </span>
                          </div>
                        </FormField>
                        <FormField label="Minimum de commande">
                          <div className="flex h-11 items-center rounded-xl border border-darkBlue/10 bg-white px-3 focus-within:border-blue/60 focus-within:ring-2 focus-within:ring-blue/20">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="h-full min-w-0 flex-1 bg-transparent outline-none"
                              value={zone.minimumOrder}
                              onChange={(e) =>
                                updateDeliveryZone(index, {
                                  minimumOrder: e.target.value,
                                })
                              }
                            />
                            <span className="ml-2 text-sm font-semibold text-darkBlue/55">
                              €
                            </span>
                          </div>
                        </FormField>
                        <FormField label="Délai estimé">
                          <div className="flex h-11 items-center rounded-xl border border-darkBlue/10 bg-white px-3 focus-within:border-blue/60 focus-within:ring-2 focus-within:ring-blue/20">
                            <input
                              type="number"
                              min="0"
                              className="h-full min-w-0 flex-1 bg-transparent outline-none"
                              value={zone.estimatedMinutes}
                              onChange={(e) =>
                                updateDeliveryZone(index, {
                                  estimatedMinutes: e.target.value,
                                })
                              }
                            />
                            <span className="ml-2 text-sm font-semibold text-darkBlue/55">
                              min
                            </span>
                          </div>
                        </FormField>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={addDeliveryZone}
            className="mt-3 inline-flex h-10 w-fit items-center gap-2 rounded-xl border border-darkBlue/10 bg-white px-3 text-sm font-semibold text-darkBlue canHover:hover:bg-darkBlue/5"
          >
            <Plus className="size-4" />
            Ajouter une zone
          </button>
        </SectionCard>
      </div>
    </section>
  );
}
