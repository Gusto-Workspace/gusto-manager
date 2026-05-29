import { useContext, useEffect, useState } from "react";
import axios from "axios";
import {
  CalendarDays,
  Clock,
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
const AUTO_DELETE_OPTIONS = [0, 1, 3, 7, 14, 30, 60, 90];
const DAYS = [
  { key: "hours.days.monday", label: "Lundi" },
  { key: "hours.days.tuesday", label: "Mardi" },
  { key: "hours.days.wednesday", label: "Mercredi" },
  { key: "hours.days.thursday", label: "Jeudi" },
  { key: "hours.days.friday", label: "Vendredi" },
  { key: "hours.days.saturday", label: "Samedi" },
  { key: "hours.days.sunday", label: "Dimanche" },
];

function SectionCard({ icon, title, description, children }) {
  return (
    <section className="rounded-3xl border border-darkBlue/10 bg-white/70 p-4 shadow-sm midTablet:p-6">
      <div className="mb-5 flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-base font-semibold text-darkBlue">
          {icon}
          {title}
        </h2>
        {description ? (
          <p className="text-sm text-darkBlue/60">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
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

export default function TakeAwayParametersComponent() {
  const { restaurantContext } = useContext(GlobalContext);
  const restaurant = restaurantContext.restaurantData;
  const restaurantId = restaurant?._id;
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [settingsForm, setSettingsForm] = useState(null);
  const [deliveryZones, setDeliveryZones] = useState([]);
  const [takeAwayHours, setTakeAwayHours] = useState([]);

  const stripeReady = Boolean(String(restaurant?.stripeSecretKey || "").trim());
  const paymentRequiresStripe = ["online_required", "customer_choice"].includes(
    settingsForm?.paymentPolicy,
  );
  const settingsSaveDisabled =
    loading || (paymentRequiresStripe && !stripeReady);

  useEffect(() => {
    const settings = restaurant?.takeAwaySettings || {};
    setSettingsForm({
      enabled: settings.enabled === true,
      pickupEnabled: settings.pickupEnabled !== false,
      deliveryEnabled: settings.deliveryEnabled === true,
      auto_accept: settings.auto_accept !== false,
      paymentPolicy: settings.paymentPolicy || "on_site",
      same_hours_as_restaurant: settings.same_hours_as_restaurant !== false,
      defaultSlotIntervalMinutes: settings.defaultSlotIntervalMinutes || 15,
      defaultSlotMaxOrders: settings.defaultSlotMaxOrders || 6,
      minimumPickupOrder: settings.minimumPickupOrder || 0,
      completedOrderAutoDeleteDays: settings.completedOrderAutoDeleteDays ?? 0,
    });
    setTakeAwayHours(buildTakeAwayHours(settings, restaurant));
    setDeliveryZones(
      (settings.deliveryZones || []).map((zone, index) =>
        getDeliveryZoneForm(zone, index),
      ),
    );
  }, [restaurant?._id]);

  async function request(config) {
    return axios({
      ...config,
      headers: {
        ...(config.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });
  }

  async function saveSettings() {
    if (!settingsForm || settingsSaveDisabled) return;
    setLoading(true);
    setMessage("");
    try {
      const { data } = await request({
        method: "put",
        url: `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/take-away/settings`,
        data: {
          settings: {
            ...settingsForm,
            slots: buildSlotsFromHours(takeAwayHours, settingsForm),
            deliveryZones: buildDeliveryZonesPayload(deliveryZones),
          },
        },
      });
      restaurantContext.setRestaurantData(data.restaurant);
    } catch (error) {
      console.error(error);
      setMessage("Erreur lors de l’enregistrement.");
    } finally {
      setLoading(false);
    }
  }

  function updateDeliveryZone(index, patch) {
    setDeliveryZones((prev) =>
      prev.map((zone, zoneIndex) =>
        zoneIndex === index ? { ...zone, ...patch } : zone,
      ),
    );
  }

  function addDeliveryZone() {
    setDeliveryZones((prev) => [
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
    ]);
  }

  function removeDeliveryZone(index) {
    setDeliveryZones((prev) =>
      prev.filter((_, zoneIndex) => zoneIndex !== index),
    );
  }

  async function saveTakeAwayHoursImmediate(newHours) {
    setTakeAwayHours(newHours);

    const nextSettings = {
      ...settingsForm,
      same_hours_as_restaurant: false,
      slots: buildSlotsFromHours(newHours, settingsForm),
      deliveryZones: buildDeliveryZonesPayload(deliveryZones),
    };

    try {
      const { data } = await request({
        method: "put",
        url: `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/take-away/settings`,
        data: { settings: nextSettings },
      });
      restaurantContext.setRestaurantData(data.restaurant);
    } catch (error) {
      console.error(error);
      setMessage("Erreur lors de l’enregistrement des horaires.");
    }
  }

  if (!settingsForm) return null;

  return (
    <section className="flex flex-col gap-6">
      <TakeAwayHeaderComponent subtitle="Paramètres" showBack />

      {message && (
        <div className="rounded-2xl border border-darkBlue/10 bg-white/70 px-4 py-3 text-sm text-darkBlue">
          {message}
        </div>
      )}

      <div className="flex w-full flex-col gap-5">
        <SectionCard
          icon={<Settings2 className="size-4 shrink-0 opacity-60" />}
          title="Disponibilité"
          description="Active le module et choisis les modes proposés aux clients."
        >
          <div className="grid gap-4 midTablet:grid-cols-2">
            <ToggleField
              checked={settingsForm.enabled}
              onChange={(checked) =>
                setSettingsForm((prev) => ({ ...prev, enabled: checked }))
              }
              title="Activer les commandes en ligne"
              description="Rend le parcours public disponible pour les clients."
            />
            <ToggleField
              checked={settingsForm.pickupEnabled}
              onChange={(checked) =>
                setSettingsForm((prev) => ({ ...prev, pickupEnabled: checked }))
              }
              title="Autoriser le retrait"
              description="Les clients peuvent venir récupérer leur commande au restaurant."
            />
            <ToggleField
              checked={settingsForm.deliveryEnabled}
              onChange={(checked) =>
                setSettingsForm((prev) => ({
                  ...prev,
                  deliveryEnabled: checked,
                }))
              }
              title="Autoriser la livraison"
              description="Les clients peuvent choisir une adresse dans une zone couverte."
            />
            <ToggleField
              checked={settingsForm.auto_accept}
              onChange={(checked) =>
                setSettingsForm((prev) => ({ ...prev, auto_accept: checked }))
              }
              title="Accepter automatiquement les commandes"
              description="Si désactivé, les nouvelles commandes restent en attente jusqu’à validation."
            />
          </div>
        </SectionCard>

        <SectionCard
          icon={<Clock className="size-4 shrink-0 opacity-60" />}
          title="Créneaux et paiement"
          description="Définis le rythme de production, les quotas par créneau et la règle de paiement."
        >
          <div className="grid gap-4 midTablet:grid-cols-2">
            <FormField
              label="Règle de paiement"
              hint="Le paiement en ligne nécessite une clé Stripe configurée."
            >
              <select
                className={fieldClass(false)}
                value={settingsForm.paymentPolicy}
                onChange={(e) =>
                  setSettingsForm((prev) => ({
                    ...prev,
                    paymentPolicy: e.target.value,
                  }))
                }
              >
                <option value="on_site">Paiement au retrait/livraison</option>
                <option value="online_required">
                  Paiement en ligne obligatoire
                </option>
                <option value="customer_choice">Choix client</option>
              </select>
            </FormField>
            <FormField label="Durée d’un créneau" hint="En minutes.">
              <select
                className={fieldClass(false)}
                value={settingsForm.defaultSlotIntervalMinutes}
                onChange={(e) =>
                  setSettingsForm((prev) => ({
                    ...prev,
                    defaultSlotIntervalMinutes: e.target.value,
                  }))
                }
              >
                {SLOT_INTERVAL_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} minutes
                  </option>
                ))}
              </select>
            </FormField>
            <FormField
              label="Nombre maximum de commandes par créneau"
              hint="Permet d’éviter de surcharger la production."
            >
              <select
                className={fieldClass(false)}
                value={settingsForm.defaultSlotMaxOrders}
                onChange={(e) =>
                  setSettingsForm((prev) => ({
                    ...prev,
                    defaultSlotMaxOrders: e.target.value,
                  }))
                }
              >
                {SLOT_QUOTA_OPTIONS.map((quantity) => (
                  <option key={quantity} value={quantity}>
                    {quantity} commande{quantity > 1 ? "s" : ""}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField
              label="Minimum de commande en retrait"
              hint="0 si aucun minimum."
            >
              <input
                type="number"
                min="0"
                step="0.01"
                className={fieldClass(false)}
                value={settingsForm.minimumPickupOrder}
                onChange={(e) =>
                  setSettingsForm((prev) => ({
                    ...prev,
                    minimumPickupOrder: e.target.value,
                  }))
                }
              />
            </FormField>
            <FormField
              label="Suppression automatique des commandes terminées"
              hint="Indique le délai en jours. 0 désactive la suppression automatique."
            >
              <select
                className={fieldClass(false)}
                value={settingsForm.completedOrderAutoDeleteDays}
                onChange={(e) =>
                  setSettingsForm((prev) => ({
                    ...prev,
                    completedOrderAutoDeleteDays: e.target.value,
                  }))
                }
              >
                {AUTO_DELETE_OPTIONS.map((days) => (
                  <option key={days} value={days}>
                    {days === 0
                      ? "Ne pas supprimer automatiquement"
                      : `${days} jour${days > 1 ? "s" : ""}`}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
        </SectionCard>

        <section className="rounded-3xl border border-darkBlue/10 bg-white/70 shadow-sm">
          <div className="px-2 py-4 mobile:p-4 midTablet:p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-base font-semibold text-darkBlue">
                  <CalendarDays className="size-4 shrink-0 opacity-60" />
                  Horaires de vente à emporter
                </p>
                <p className="text-sm text-darkBlue/60">
                  {settingsForm.same_hours_as_restaurant
                    ? "Utilise les horaires du restaurant."
                    : "Définis des horaires spécifiques aux commandes à emporter."}
                </p>
              </div>

              <label
                className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full border transition ${
                  settingsForm.same_hours_as_restaurant
                    ? "border-blue/40 bg-blue"
                    : "border-darkBlue/10 bg-darkBlue/10"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={settingsForm.same_hours_as_restaurant}
                  onChange={(e) =>
                    setSettingsForm((prev) => ({
                      ...prev,
                      same_hours_as_restaurant: e.target.checked,
                    }))
                  }
                />
                <span
                  className={`absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-white shadow-sm transition ${
                    settingsForm.same_hours_as_restaurant
                      ? "translate-x-7"
                      : "translate-x-1"
                  }`}
                />
              </label>
            </div>

            {!settingsForm.same_hours_as_restaurant ? (
              <>
                <div className="my-4 h-px bg-darkBlue/10" />
                <HoursRestaurantComponent
                  restaurantId={restaurantId}
                  dataLoading={restaurantContext.dataLoading}
                  closeEditing={restaurantContext.closeEditing}
                  reservations
                  reservationHours={takeAwayHours}
                  onChange={(data) => setTakeAwayHours(data.hours)}
                  onSaveReservationHours={saveTakeAwayHoursImmediate}
                  hoursTitle="Horaires de vente à emporter"
                  hoursSubtitle="Définissez les créneaux disponibles pour les commandes à emporter."
                />
              </>
            ) : null}
          </div>
        </section>

        <SectionCard
          icon={<Plus className="size-4 shrink-0 opacity-60" />}
          title="Zones de livraison"
          description="Ajoute une zone, indique les codes postaux couverts, puis les frais et le minimum de commande."
        >
          {!deliveryZones.length ? (
            <EmptyState text="Aucune zone configurée. Ajoute une première zone de livraison." />
          ) : (
            deliveryZones.map((zone, index) => (
              <div
                key={zone.localId}
                className="rounded-xl border border-darkBlue/10 bg-white/70 p-4"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-darkBlue">
                    <input
                      type="checkbox"
                      checked={zone.active}
                      onChange={(e) =>
                        updateDeliveryZone(index, { active: e.target.checked })
                      }
                    />
                    Zone active
                  </label>
                  <button
                    type="button"
                    onClick={() => removeDeliveryZone(index)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-red/20 bg-white text-red hover:bg-red/10"
                    aria-label="Supprimer la zone"
                    title="Supprimer la zone"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                <div className="grid gap-3 midTablet:grid-cols-2">
                  <FormField
                    label="Nom de la zone"
                    hint="Exemple : Centre-ville"
                  >
                    <input
                      className={fieldClass(false)}
                      value={zone.name}
                      onChange={(e) =>
                        updateDeliveryZone(index, { name: e.target.value })
                      }
                    />
                  </FormField>
                  <FormField
                    label="Codes postaux couverts"
                    hint="Exemple : 19100, 19270"
                  >
                    <input
                      className={fieldClass(false)}
                      value={zone.zipCodesText}
                      onChange={(e) =>
                        updateDeliveryZone(index, {
                          zipCodesText: e.target.value,
                        })
                      }
                    />
                  </FormField>
                  <FormField label="Frais de livraison">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={fieldClass(false)}
                      value={zone.fee}
                      onChange={(e) =>
                        updateDeliveryZone(index, { fee: e.target.value })
                      }
                    />
                  </FormField>
                  <FormField label="Minimum de commande">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={fieldClass(false)}
                      value={zone.minimumOrder}
                      onChange={(e) =>
                        updateDeliveryZone(index, {
                          minimumOrder: e.target.value,
                        })
                      }
                    />
                  </FormField>
                  <FormField label="Délai estimé" hint="En minutes.">
                    <input
                      type="number"
                      min="0"
                      className={fieldClass(false)}
                      value={zone.estimatedMinutes}
                      onChange={(e) =>
                        updateDeliveryZone(index, {
                          estimatedMinutes: e.target.value,
                        })
                      }
                    />
                  </FormField>
                </div>
              </div>
            ))
          )}

          <button
            type="button"
            onClick={addDeliveryZone}
            className="inline-flex h-10 w-fit items-center gap-2 rounded-xl border border-darkBlue/10 bg-white px-3 text-sm font-semibold text-darkBlue hover:bg-darkBlue/5"
          >
            <Plus className="size-4" />
            Ajouter une zone
          </button>
        </SectionCard>

        {paymentRequiresStripe && !stripeReady ? (
          <div className="rounded-xl border border-orange/20 bg-orange/10 px-4 py-3 text-sm font-semibold text-orange">
            Configure une clé Stripe dans le restaurant pour enregistrer un mode
            avec paiement en ligne.
          </div>
        ) : null}

        <button
          type="button"
          onClick={saveSettings}
          disabled={settingsSaveDisabled}
          className="inline-flex h-11 w-fit items-center gap-2 rounded-xl bg-blue px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save className="size-4" />
          Enregistrer
        </button>
      </div>
    </section>
  );
}
