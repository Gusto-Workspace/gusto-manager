import { useMemo, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";

import { FormField } from "./form.take-away.component";
import {
  fieldClass,
  getCatalogCategoryName,
  normalizeForMatch,
  toMoney,
  todayKey,
} from "./take-away.utils";

const initialManualOrder = {
  customerFirstName: "",
  customerLastName: "",
  customerEmail: "",
  customerPhone: "",
  fulfillmentMode: "pickup",
  date: todayKey(),
  time: "12:00",
  deliveryZoneId: "",
  items: [{ localId: "line-1", catalogItemId: "", quantity: 1 }],
  deliveryAddress: {
    line1: "",
    line2: "",
    zipCode: "",
    city: "",
    instructions: "",
  },
};

export default function ManualTakeAwayOrderComponent({
  catalog,
  deliveryZones,
  loading,
  onCreate,
  title = "Nouvelle commande",
  variant = "panel",
}) {
  const [manualOrder, setManualOrder] = useState(initialManualOrder);
  const [errors, setErrors] = useState({});

  const activeCatalogGroups = useMemo(() => {
    const groups = new Map();
    (catalog || [])
      .filter((item) => item.active !== false)
      .forEach((item) => {
        const name = getCatalogCategoryName(item);
        const key = normalizeForMatch(name);
        if (!groups.has(key)) groups.set(key, { name, items: [] });
        groups.get(key).items.push(item);
      });
    return Array.from(groups.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "fr"),
    );
  }, [catalog]);

  const catalogById = useMemo(() => {
    const map = new Map();
    (catalog || []).forEach((item) => map.set(String(item._id), item));
    return map;
  }, [catalog]);

  const activeZones = useMemo(
    () => (deliveryZones || []).filter((zone) => zone.active !== false),
    [deliveryZones],
  );

  const selectedZone = activeZones.find(
    (zone) => String(zone._id) === String(manualOrder.deliveryZoneId),
  );

  const manualSubtotal = (manualOrder.items || []).reduce((sum, line) => {
    const item = catalogById.get(String(line.catalogItemId));
    if (!item) return sum;
    return sum + Number(item.price || 0) * Number(line.quantity || 1);
  }, 0);
  const manualDeliveryFee =
    manualOrder.fulfillmentMode === "delivery" && selectedZone
      ? Number(selectedZone.fee || 0)
      : 0;
  const manualTotal = manualSubtotal + manualDeliveryFee;

  function updateManualLine(index, patch) {
    setManualOrder((prev) => ({
      ...prev,
      items: prev.items.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      ),
    }));
  }

  function addManualLine() {
    setManualOrder((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        { localId: `line-${Date.now()}`, catalogItemId: "", quantity: 1 },
      ],
    }));
  }

  function removeManualLine(index) {
    setManualOrder((prev) => ({
      ...prev,
      items:
        prev.items.length <= 1
          ? prev.items
          : prev.items.filter((_, lineIndex) => lineIndex !== index),
    }));
  }

  function updateDeliveryAddress(patch) {
    setManualOrder((prev) => ({
      ...prev,
      deliveryAddress: { ...prev.deliveryAddress, ...patch },
    }));
  }

  function handleZoneChange(zoneId) {
    const zone = activeZones.find(
      (entry) => String(entry._id) === String(zoneId),
    );
    const firstZip = zone?.zipCodes?.[0] || "";
    setManualOrder((prev) => ({
      ...prev,
      deliveryZoneId: zoneId,
      deliveryAddress: {
        ...prev.deliveryAddress,
        zipCode: prev.deliveryAddress.zipCode || firstZip,
      },
    }));
  }

  async function submit() {
    const nextErrors = {};
    if (!manualOrder.customerFirstName.trim())
      nextErrors.customerFirstName = "Prénom obligatoire.";
    if (!manualOrder.customerLastName.trim())
      nextErrors.customerLastName = "Nom obligatoire.";
    if (!manualOrder.customerPhone.trim())
      nextErrors.customerPhone = "Téléphone obligatoire.";
    if (!manualOrder.date) nextErrors.date = "Date obligatoire.";
    if (!manualOrder.time) nextErrors.time = "Heure obligatoire.";

    const items = (manualOrder.items || []).filter(
      (line) => line.catalogItemId,
    );
    if (!items.length) nextErrors.items = "Sélectionne au moins un article.";

    if (manualOrder.fulfillmentMode === "delivery") {
      if (!manualOrder.deliveryZoneId)
        nextErrors.deliveryZoneId = "Zone obligatoire.";
      if (!manualOrder.deliveryAddress.line1.trim())
        nextErrors.line1 = "Adresse obligatoire.";
      if (!manualOrder.deliveryAddress.city.trim())
        nextErrors.city = "Ville obligatoire.";
      if (!manualOrder.deliveryAddress.zipCode.trim()) {
        nextErrors.zipCode = "Code postal obligatoire.";
      } else if (
        selectedZone &&
        !(selectedZone.zipCodes || [])
          .map((zip) => normalizeForMatch(zip))
          .includes(normalizeForMatch(manualOrder.deliveryAddress.zipCode))
      ) {
        nextErrors.zipCode =
          "Le code postal doit appartenir à la zone sélectionnée.";
      }
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const success = await onCreate({
      ...manualOrder,
      items: items.map((line) => ({
        catalogItemId: line.catalogItemId,
        quantity: Number(line.quantity || 1),
      })),
    });

    if (success) {
      setManualOrder(initialManualOrder);
      setErrors({});
    }
  }

  const itemTitle = manualOrder.items.length > 1 ? "Articles" : "Article";
  const Wrapper = variant === "page" ? "div" : "aside";
  const wrapperClass =
    variant === "page"
      ? "w-full rounded-3xl border border-darkBlue/10 bg-white/70 p-4 shadow-sm midTablet:p-6"
      : "rounded-2xl border border-darkBlue/10 bg-white/70 p-4 shadow-sm";

  return (
    <Wrapper className={wrapperClass}>
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Plus className="size-5" />
        {title}
      </h2>
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 midTablet:grid-cols-2">
          <FormField label="Prénom client" error={errors.customerFirstName}>
            <input
              className={fieldClass(errors.customerFirstName)}
              value={manualOrder.customerFirstName}
              onChange={(e) =>
                setManualOrder((prev) => ({
                  ...prev,
                  customerFirstName: e.target.value,
                }))
              }
            />
          </FormField>
          <FormField label="Nom client" error={errors.customerLastName}>
            <input
              className={fieldClass(errors.customerLastName)}
              value={manualOrder.customerLastName}
              onChange={(e) =>
                setManualOrder((prev) => ({
                  ...prev,
                  customerLastName: e.target.value,
                }))
              }
            />
          </FormField>
          <FormField label="Email">
            <input
              type="email"
              className={fieldClass(false)}
              value={manualOrder.customerEmail}
              onChange={(e) =>
                setManualOrder((prev) => ({
                  ...prev,
                  customerEmail: e.target.value,
                }))
              }
            />
          </FormField>
          <FormField label="Téléphone" error={errors.customerPhone}>
            <input
              className={fieldClass(errors.customerPhone)}
              value={manualOrder.customerPhone}
              onChange={(e) =>
                setManualOrder((prev) => ({
                  ...prev,
                  customerPhone: e.target.value,
                }))
              }
            />
          </FormField>
        </div>

        <div className="grid gap-3 midTablet:grid-cols-3">
          <FormField label="Date" error={errors.date}>
            <input
              type="date"
              className={fieldClass(errors.date)}
              value={manualOrder.date}
              onChange={(e) =>
                setManualOrder((prev) => ({ ...prev, date: e.target.value }))
              }
            />
          </FormField>
          <FormField label="Heure" error={errors.time}>
            <input
              type="time"
              className={fieldClass(errors.time)}
              value={manualOrder.time}
              onChange={(e) =>
                setManualOrder((prev) => ({ ...prev, time: e.target.value }))
              }
            />
          </FormField>
          <FormField label="Mode">
            <select
              className={fieldClass(false)}
              value={manualOrder.fulfillmentMode}
              onChange={(e) =>
                setManualOrder((prev) => ({
                  ...prev,
                  fulfillmentMode: e.target.value,
                }))
              }
            >
              <option value="pickup">Retrait</option>
              <option value="delivery">Livraison</option>
            </select>
          </FormField>
        </div>

        {manualOrder.fulfillmentMode === "delivery" ? (
          <div className="rounded-xl border border-darkBlue/10 bg-white/70 p-3">
            <h3 className="mb-3 text-sm font-semibold text-darkBlue">
              Détails de livraison
            </h3>
            <div className="grid gap-3 midTablet:grid-cols-2">
              <FormField
                label="Zone de livraison"
                error={errors.deliveryZoneId}
              >
                <select
                  className={fieldClass(errors.deliveryZoneId)}
                  value={manualOrder.deliveryZoneId}
                  onChange={(e) => handleZoneChange(e.target.value)}
                >
                  <option value="">Sélectionner une zone</option>
                  {activeZones.map((zone) => (
                    <option key={zone._id} value={zone._id}>
                      {zone.name || "Zone"} • {toMoney(zone.fee)}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Adresse" error={errors.line1}>
                <input
                  className={fieldClass(errors.line1)}
                  value={manualOrder.deliveryAddress.line1}
                  onChange={(e) =>
                    updateDeliveryAddress({ line1: e.target.value })
                  }
                />
              </FormField>
              <FormField label="Complément">
                <input
                  className={fieldClass(false)}
                  value={manualOrder.deliveryAddress.line2}
                  onChange={(e) =>
                    updateDeliveryAddress({ line2: e.target.value })
                  }
                />
              </FormField>
              <FormField label="Code postal" error={errors.zipCode}>
                <input
                  className={fieldClass(errors.zipCode)}
                  value={manualOrder.deliveryAddress.zipCode}
                  onChange={(e) =>
                    updateDeliveryAddress({ zipCode: e.target.value })
                  }
                />
              </FormField>
              <FormField label="Ville" error={errors.city}>
                <input
                  className={fieldClass(errors.city)}
                  value={manualOrder.deliveryAddress.city}
                  onChange={(e) =>
                    updateDeliveryAddress({ city: e.target.value })
                  }
                />
              </FormField>
              <div className="midTablet:col-span-2">
                <FormField label="Instructions livreur">
                  <input
                    className={fieldClass(false)}
                    value={manualOrder.deliveryAddress.instructions}
                    onChange={(e) =>
                      updateDeliveryAddress({ instructions: e.target.value })
                    }
                  />
                </FormField>
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-semibold text-darkBlue">{itemTitle}</h3>
            {errors.items ? (
              <p className="mt-1 text-xs font-semibold text-red">
                {errors.items}
              </p>
            ) : null}
          </div>
          {manualOrder.items.map((line, index) => (
            <div
              key={line.localId}
              className="grid grid-cols-[1fr_92px_40px] items-center gap-2"
            >
              <select
                aria-label="Article"
                className={fieldClass(errors.items && !line.catalogItemId)}
                value={line.catalogItemId}
                onChange={(e) =>
                  updateManualLine(index, { catalogItemId: e.target.value })
                }
              >
                <option value="">Sélectionner un article</option>
                {activeCatalogGroups.map((group) => (
                  <optgroup key={group.name} label={group.name}>
                    {group.items.map((item) => (
                      <option key={item._id} value={item._id}>
                        {item.name} • {toMoney(item.price)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <select
                aria-label="Quantité"
                className={fieldClass(false)}
                value={line.quantity}
                onChange={(e) =>
                  updateManualLine(index, {
                    quantity: Number(e.target.value || 1),
                  })
                }
              >
                {Array.from({ length: 20 }, (_, qty) => qty + 1).map((qty) => (
                  <option key={qty} value={qty}>
                    {qty}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={manualOrder.items.length <= 1}
                onClick={() => removeManualLine(index)}
                className="inline-flex h-11 w-10 items-center justify-center rounded-xl border border-darkBlue/10 bg-white text-darkBlue/55 transition hover:bg-red/10 hover:text-red disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Retirer la ligne"
                title="Retirer la ligne"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addManualLine}
            className="inline-flex h-10 w-fit items-center gap-2 rounded-xl border border-darkBlue/10 bg-white px-3 text-sm font-semibold text-darkBlue hover:bg-darkBlue/5"
          >
            <Plus className="size-4" />
            Ajouter une ligne
          </button>
        </div>

        <div className="rounded-xl border border-darkBlue/10 bg-white p-3 text-sm">
          <div className="flex items-center justify-between text-darkBlue/65">
            <span>Sous-total</span>
            <span>{toMoney(manualSubtotal)}</span>
          </div>
          {manualOrder.fulfillmentMode === "delivery" ? (
            <div className="mt-2 flex items-center justify-between text-darkBlue/65">
              <span>Frais de livraison</span>
              <span>{toMoney(manualDeliveryFee)}</span>
            </div>
          ) : null}
          <div className="mt-3 flex items-center justify-between border-t border-darkBlue/10 pt-3 text-base font-bold text-darkBlue">
            <span>Total</span>
            <span>{toMoney(manualTotal)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={loading}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          <Check className="size-4" />
          Créer
        </button>
      </div>
    </Wrapper>
  );
}
