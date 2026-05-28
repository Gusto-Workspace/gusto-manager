import { useContext, useEffect, useState } from "react";
import axios from "axios";
import { Plus, Save, Trash2 } from "lucide-react";

import { GlobalContext } from "@/contexts/global.context";
import TakeAwayHeaderComponent from "./header.take-away.component";
import { EmptyState, FormField, ToggleField } from "./form.take-away.component";
import {
  buildDeliveryZonesPayload,
  fieldClass,
  getDeliveryZoneForm,
} from "./take-away.utils";

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
      paymentPolicy: settings.paymentPolicy || "on_site",
      same_hours_as_restaurant: settings.same_hours_as_restaurant !== false,
      defaultSlotIntervalMinutes: settings.defaultSlotIntervalMinutes || 15,
      defaultSlotMaxOrders: settings.defaultSlotMaxOrders || 6,
      minimumPickupOrder: settings.minimumPickupOrder || 0,
      completedOrderAutoDeleteDays: settings.completedOrderAutoDeleteDays ?? 0,
    });
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
            deliveryZones: buildDeliveryZonesPayload(deliveryZones),
          },
        },
      });
      restaurantContext.setRestaurantData(data.restaurant);
      setMessage("Paramètres enregistrés.");
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

  if (!settingsForm) return null;

  return (
    <section className="flex flex-col gap-6">
      <TakeAwayHeaderComponent subtitle="Paramètres" />

      {message && (
        <div className="rounded-2xl border border-darkBlue/10 bg-white/70 px-4 py-3 text-sm text-darkBlue">
          {message}
        </div>
      )}

      <div className="flex max-w-[980px] flex-col gap-5 rounded-2xl border border-darkBlue/10 bg-white/70 p-5 shadow-sm">
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
              setSettingsForm((prev) => ({ ...prev, deliveryEnabled: checked }))
            }
            title="Autoriser la livraison"
            description="Les clients peuvent choisir une adresse dans une zone couverte."
          />
          <ToggleField
            checked={settingsForm.same_hours_as_restaurant}
            onChange={(checked) =>
              setSettingsForm((prev) => ({
                ...prev,
                same_hours_as_restaurant: checked,
              }))
            }
            title="Utiliser les horaires du restaurant"
            description="Les créneaux emporter suivent les horaires déjà configurés."
          />
        </div>

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
            <input
              type="number"
              min="5"
              className={fieldClass(false)}
              value={settingsForm.defaultSlotIntervalMinutes}
              onChange={(e) =>
                setSettingsForm((prev) => ({
                  ...prev,
                  defaultSlotIntervalMinutes: e.target.value,
                }))
              }
            />
          </FormField>
          <FormField
            label="Nombre maximum de commandes par créneau"
            hint="Permet d’éviter de surcharger la production."
          >
            <input
              type="number"
              min="1"
              className={fieldClass(false)}
              value={settingsForm.defaultSlotMaxOrders}
              onChange={(e) =>
                setSettingsForm((prev) => ({
                  ...prev,
                  defaultSlotMaxOrders: e.target.value,
                }))
              }
            />
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
            <input
              type="number"
              min="0"
              className={fieldClass(false)}
              value={settingsForm.completedOrderAutoDeleteDays}
              onChange={(e) =>
                setSettingsForm((prev) => ({
                  ...prev,
                  completedOrderAutoDeleteDays: e.target.value,
                }))
              }
            />
          </FormField>
        </div>

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-darkBlue">
              Zones de livraison
            </h2>
            <p className="text-sm text-darkBlue/55">
              Ajoute une zone, indique les codes postaux couverts, puis les
              frais et le minimum de commande. Les codes postaux se séparent par
              une virgule.
            </p>
          </div>

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
        </section>

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
