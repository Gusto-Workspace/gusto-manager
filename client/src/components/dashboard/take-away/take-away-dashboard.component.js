import { useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Check,
  ClipboardList,
  PackagePlus,
  Plus,
  RefreshCcw,
  Save,
  Settings,
  ShoppingBag,
  Trash2,
} from "lucide-react";

import { GlobalContext } from "@/contexts/global.context";

const STATUS_LABELS = {
  pending: "En attente",
  confirmed: "Confirmée",
  preparing: "En préparation",
  ready: "Prête",
  out_for_delivery: "En livraison",
  completed: "Terminée",
  canceled: "Annulée",
  rejected: "Refusée",
};

const NEXT_STATUS = {
  pending: ["confirmed", "rejected"],
  confirmed: ["preparing", "canceled"],
  preparing: ["ready", "canceled"],
  ready: ["completed", "out_for_delivery"],
  out_for_delivery: ["completed"],
};

function toMoney(value) {
  return `${Number(value || 0).toFixed(2)} €`;
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function settingsToZonesText(settings) {
  return (settings?.deliveryZones || [])
    .map((zone) =>
      [
        zone.name || "Zone",
        (zone.zipCodes || []).join(","),
        zone.fee || 0,
        zone.minimumOrder || 0,
        zone.estimatedMinutes || 30,
      ].join("|"),
    )
    .join("\n");
}

function parseZonesText(value) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, zipCodes, fee, minimumOrder, estimatedMinutes] = line
        .split("|")
        .map((part) => part.trim());
      return {
        name: name || "Zone",
        zipCodes: String(zipCodes || "")
          .split(",")
          .map((zip) => zip.trim())
          .filter(Boolean),
        fee: Number(fee || 0),
        minimumOrder: Number(minimumOrder || 0),
        estimatedMinutes: Number(estimatedMinutes || 30),
        active: true,
      };
    });
}

function EmptyState({ text }) {
  return (
    <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-6 text-sm text-darkBlue/55">
      {text}
    </div>
  );
}

export default function TakeAwayDashboardComponent() {
  const { restaurantContext } = useContext(GlobalContext);
  const restaurant = restaurantContext.restaurantData;
  const restaurantId = restaurant?._id;
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const [activeTab, setActiveTab] = useState("orders");
  const [orders, setOrders] = useState([]);
  const [importableItems, setImportableItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [settingsForm, setSettingsForm] = useState(null);
  const [zonesText, setZonesText] = useState("");
  const [customItem, setCustomItem] = useState({
    name: "",
    description: "",
    categoryName: "À emporter",
    price: "",
  });
  const [manualOrder, setManualOrder] = useState({
    customerFirstName: "",
    customerLastName: "",
    customerEmail: "",
    customerPhone: "",
    fulfillmentMode: "pickup",
    date: todayKey(),
    time: "12:00",
    catalogItemId: "",
    quantity: 1,
  });

  const catalog = useMemo(
    () =>
      Array.isArray(restaurant?.takeAwayCatalog)
        ? [...restaurant.takeAwayCatalog].sort(
            (a, b) =>
              Number(a.sortOrder || 0) - Number(b.sortOrder || 0) ||
              String(a.name || "").localeCompare(String(b.name || "")),
          )
        : [],
    [restaurant?.takeAwayCatalog],
  );

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
    });
    setZonesText(settingsToZonesText(settings));
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

  async function fetchOrders() {
    if (!restaurantId || !token) return;
    setLoading(true);
    try {
      const { data } = await request({
        method: "get",
        url: `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/take-away/orders`,
      });
      setOrders(Array.isArray(data.orders) ? data.orders : []);
    } catch (error) {
      console.error(error);
      setMessage("Impossible de charger les commandes.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchImportableItems() {
    if (!restaurantId || !token) return;
    try {
      const { data } = await request({
        method: "get",
        url: `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/take-away/catalog/importable`,
      });
      setImportableItems(Array.isArray(data.items) ? data.items : []);
    } catch (error) {
      console.error(error);
    }
  }

  useEffect(() => {
    fetchOrders();
    fetchImportableItems();
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return undefined;
    const url = `${process.env.NEXT_PUBLIC_API_URL}/events/${restaurantId}`;
    const es = new EventSource(url);
    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (
          (payload.type === "takeaway_order_created" ||
            payload.type === "takeaway_order_updated") &&
          payload.order
        ) {
          setOrders((prev) => {
            const list = Array.isArray(prev) ? prev : [];
            const id = String(payload.order._id);
            const exists = list.some((order) => String(order._id) === id);
            if (!exists) return [payload.order, ...list];
            return list.map((order) =>
              String(order._id) === id ? payload.order : order,
            );
          });
        }
      } catch {}
    };
    return () => es.close();
  }, [restaurantId]);

  async function saveSettings() {
    if (!settingsForm) return;
    setLoading(true);
    setMessage("");
    try {
      const { data } = await request({
        method: "put",
        url: `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/take-away/settings`,
        data: {
          settings: {
            ...settingsForm,
            deliveryZones: parseZonesText(zonesText),
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

  async function importItem(item) {
    setLoading(true);
    setMessage("");
    try {
      const { data } = await request({
        method: "post",
        url: `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/take-away/catalog/import`,
        data: item,
      });
      restaurantContext.setRestaurantData(data.restaurant);
      setMessage("Article importé dans le catalogue emporter.");
    } catch (error) {
      console.error(error);
      setMessage("Import impossible.");
    } finally {
      setLoading(false);
    }
  }

  async function createCustomItem() {
    if (!customItem.name.trim()) return;
    setLoading(true);
    setMessage("");
    try {
      const { data } = await request({
        method: "post",
        url: `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/take-away/catalog`,
        data: {
          ...customItem,
          price: Number(customItem.price || 0),
        },
      });
      restaurantContext.setRestaurantData(data.restaurant);
      setCustomItem({
        name: "",
        description: "",
        categoryName: "À emporter",
        price: "",
      });
      setMessage("Article créé.");
    } catch (error) {
      console.error(error);
      setMessage("Création impossible.");
    } finally {
      setLoading(false);
    }
  }

  async function patchCatalogItem(item, patch) {
    setLoading(true);
    try {
      const { data } = await request({
        method: "patch",
        url: `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/take-away/catalog/${item._id}`,
        data: patch,
      });
      restaurantContext.setRestaurantData(data.restaurant);
    } catch (error) {
      console.error(error);
      setMessage("Mise à jour impossible.");
    } finally {
      setLoading(false);
    }
  }

  async function removeCatalogItem(item) {
    setLoading(true);
    setMessage("");
    try {
      const { data } = await request({
        method: "delete",
        url: `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/take-away/catalog/${item._id}`,
      });
      restaurantContext.setRestaurantData(data.restaurant);
      setMessage("Produit retiré du catalogue emporter.");
    } catch (error) {
      console.error(error);
      setMessage("Suppression impossible.");
    } finally {
      setLoading(false);
    }
  }

  async function updateOrderStatus(order, status) {
    setLoading(true);
    try {
      const { data } = await request({
        method: "patch",
        url: `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/take-away/orders/${order._id}/status`,
        data: { status },
      });
      setOrders((prev) =>
        prev.map((current) =>
          String(current._id) === String(order._id) ? data.order : current,
        ),
      );
    } catch (error) {
      console.error(error);
      setMessage("Changement de statut impossible.");
    } finally {
      setLoading(false);
    }
  }

  async function createManualOrder() {
    if (!manualOrder.catalogItemId) {
      setMessage("Sélectionne au moins un article.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const scheduledFor = new Date(
        `${manualOrder.date}T${manualOrder.time}:00`,
      ).toISOString();
      const { data } = await request({
        method: "post",
        url: `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/take-away/orders`,
        data: {
          ...manualOrder,
          scheduledFor,
          slotId: `${manualOrder.date}-${manualOrder.time}`,
          paymentMethod: "on_site",
          items: [
            {
              catalogItemId: manualOrder.catalogItemId,
              quantity: Number(manualOrder.quantity || 1),
            },
          ],
        },
      });
      setOrders((prev) => [data.order, ...prev]);
      setMessage("Commande manuelle créée.");
    } catch (error) {
      console.error(error);
      setMessage(error?.response?.data?.message || "Création impossible.");
    } finally {
      setLoading(false);
    }
  }

  const tabButton = (key, label, Icon) => (
    <button
      type="button"
      onClick={() => setActiveTab(key)}
      className={`inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition ${
        activeTab === key
          ? "border-blue bg-blue text-white"
          : "border-darkBlue/10 bg-white/70 text-darkBlue hover:bg-darkBlue/5"
      }`}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 border-b border-darkBlue/10 pb-5 midTablet:flex-row midTablet:items-center midTablet:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-darkBlue">
            Vente à emporter
          </h1>
          <p className="text-sm text-darkBlue/55">
            Commandes, catalogue, retrait et livraison.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tabButton("orders", "Commandes", ClipboardList)}
          {tabButton("catalog", "Catalogue", ShoppingBag)}
          {tabButton("settings", "Paramètres", Settings)}
        </div>
      </div>

      {message && (
        <div className="rounded-2xl border border-darkBlue/10 bg-white/70 px-4 py-3 text-sm text-darkBlue">
          {message}
        </div>
      )}

      {activeTab === "orders" && (
        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Commandes récentes</h2>
              <button
                type="button"
                onClick={fetchOrders}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-darkBlue/10 bg-white px-3 text-sm font-semibold"
              >
                <RefreshCcw className="size-4" />
                Actualiser
              </button>
            </div>

            {!orders.length ? (
              <EmptyState text="Aucune commande pour le moment." />
            ) : (
              orders.map((order) => (
                <article
                  key={order._id}
                  className="rounded-2xl border border-darkBlue/10 bg-white/70 p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-3 midTablet:flex-row midTablet:items-start midTablet:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-darkBlue">
                          {order.orderNumber}
                        </span>
                        <span className="rounded-full bg-darkBlue/8 px-2 py-1 text-xs font-semibold text-darkBlue/70">
                          {STATUS_LABELS[order.status] || order.status}
                        </span>
                        <span className="rounded-full bg-blue/10 px-2 py-1 text-xs font-semibold text-blue">
                          {order.fulfillmentMode === "delivery"
                            ? "Livraison"
                            : "Retrait"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-darkBlue/70">
                        {[order.customerFirstName, order.customerLastName]
                          .filter(Boolean)
                          .join(" ")}{" "}
                        •{" "}
                        {new Date(order.scheduledFor).toLocaleString("fr-FR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </p>
                      <p className="mt-1 text-sm text-darkBlue/50">
                        {(order.items || [])
                          .map((item) => `${item.quantity}x ${item.name}`)
                          .join(", ")}
                      </p>
                    </div>

                    <div className="flex flex-col items-start gap-2 midTablet:items-end">
                      <span className="text-lg font-bold text-darkBlue">
                        {toMoney(order.total)}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {(NEXT_STATUS[order.status] || []).map((status) => (
                          <button
                            key={status}
                            type="button"
                            disabled={loading}
                            onClick={() => updateOrderStatus(order, status)}
                            className="inline-flex h-9 items-center rounded-xl border border-darkBlue/10 bg-white px-3 text-xs font-semibold text-darkBlue hover:bg-darkBlue/5"
                          >
                            {STATUS_LABELS[status]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>

          <aside className="rounded-2xl border border-darkBlue/10 bg-white/70 p-4 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <Plus className="size-5" />
              Commande manuelle
            </h2>
            <div className="flex flex-col gap-3">
              <input
                className="h-11 rounded-xl border border-darkBlue/10 px-3 outline-none"
                placeholder="Prénom"
                value={manualOrder.customerFirstName}
                onChange={(e) =>
                  setManualOrder((prev) => ({
                    ...prev,
                    customerFirstName: e.target.value,
                  }))
                }
              />
              <input
                className="h-11 rounded-xl border border-darkBlue/10 px-3 outline-none"
                placeholder="Nom"
                value={manualOrder.customerLastName}
                onChange={(e) =>
                  setManualOrder((prev) => ({
                    ...prev,
                    customerLastName: e.target.value,
                  }))
                }
              />
              <input
                className="h-11 rounded-xl border border-darkBlue/10 px-3 outline-none"
                placeholder="Téléphone"
                value={manualOrder.customerPhone}
                onChange={(e) =>
                  setManualOrder((prev) => ({
                    ...prev,
                    customerPhone: e.target.value,
                  }))
                }
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  className="h-11 rounded-xl border border-darkBlue/10 px-3 outline-none"
                  value={manualOrder.date}
                  onChange={(e) =>
                    setManualOrder((prev) => ({ ...prev, date: e.target.value }))
                  }
                />
                <input
                  type="time"
                  className="h-11 rounded-xl border border-darkBlue/10 px-3 outline-none"
                  value={manualOrder.time}
                  onChange={(e) =>
                    setManualOrder((prev) => ({ ...prev, time: e.target.value }))
                  }
                />
              </div>
              <select
                className="h-11 rounded-xl border border-darkBlue/10 px-3 outline-none"
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
              <select
                className="h-11 rounded-xl border border-darkBlue/10 px-3 outline-none"
                value={manualOrder.catalogItemId}
                onChange={(e) =>
                  setManualOrder((prev) => ({
                    ...prev,
                    catalogItemId: e.target.value,
                  }))
                }
              >
                <option value="">Article</option>
                {catalog
                  .filter((item) => item.active !== false)
                  .map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.name} • {toMoney(item.price)}
                    </option>
                  ))}
              </select>
              <input
                type="number"
                min="1"
                className="h-11 rounded-xl border border-darkBlue/10 px-3 outline-none"
                value={manualOrder.quantity}
                onChange={(e) =>
                  setManualOrder((prev) => ({
                    ...prev,
                    quantity: e.target.value,
                  }))
                }
              />
              <button
                type="button"
                onClick={createManualOrder}
                disabled={loading}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                <Check className="size-4" />
                Créer
              </button>
            </div>
          </aside>
        </div>
      )}

      {activeTab === "catalog" && (
        <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Catalogue emporter</h2>
            {!catalog.length ? (
              <EmptyState text="Aucun article emporter. Importe un élément de la carte ou crée un article dédié." />
            ) : (
              catalog.map((item) => (
                <article
                  key={item._id}
                  className="grid gap-3 rounded-2xl border border-darkBlue/10 bg-white/70 p-4 midTablet:grid-cols-[1fr_120px_240px]"
                >
                  <div>
                    <p className="font-semibold text-darkBlue">{item.name}</p>
                    <p className="text-sm text-darkBlue/50">
                      {item.categoryName} • {item.sourceType}
                    </p>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="h-10 rounded-xl border border-darkBlue/10 px-3 outline-none"
                    defaultValue={item.price}
                    onBlur={(e) =>
                      patchCatalogItem(item, { price: Number(e.target.value || 0) })
                    }
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        patchCatalogItem(item, {
                          active: item.active === false,
                          visible: item.active === false,
                        })
                      }
                      className={`inline-flex h-10 flex-1 items-center justify-center rounded-xl border px-3 text-sm font-semibold ${
                        item.active === false
                          ? "border-red/20 bg-red/10 text-red"
                          : "border-green/20 bg-green/10 text-green"
                      }`}
                    >
                      {item.active === false ? "Inactif" : "Actif"}
                    </button>

                    <button
                      type="button"
                      onClick={() => removeCatalogItem(item)}
                      className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-red/20 bg-white px-3 text-sm font-semibold text-red hover:bg-red/10"
                    >
                      <Trash2 className="size-4" />
                      Retirer
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>

          <aside className="flex flex-col gap-4">
            <div className="rounded-2xl border border-darkBlue/10 bg-white/70 p-4 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <PackagePlus className="size-5" />
                Importer depuis la carte
              </h2>
              <div className="max-h-[360px] overflow-auto pr-1">
                {importableItems.slice(0, 80).map((item) => (
                  <button
                    key={`${item.sourceType}-${item.sourceItemId}-${item.sourceSubCategoryId || ""}`}
                    type="button"
                    onClick={() => importItem(item)}
                    className="mb-2 flex w-full items-center justify-between gap-3 rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-left text-sm hover:bg-darkBlue/5"
                  >
                    <span>
                      <span className="block font-semibold text-darkBlue">
                        {item.name}
                      </span>
                      <span className="text-xs text-darkBlue/50">
                        {item.categoryName} • {toMoney(item.price)}
                      </span>
                    </span>
                    <Plus className="size-4 shrink-0" />
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-darkBlue/10 bg-white/70 p-4 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold">Article dédié</h2>
              <div className="flex flex-col gap-3">
                {["name", "description", "categoryName", "price"].map((key) => (
                  <input
                    key={key}
                    className="h-11 rounded-xl border border-darkBlue/10 px-3 outline-none"
                    placeholder={
                      key === "name"
                        ? "Nom"
                        : key === "description"
                          ? "Description"
                          : key === "categoryName"
                            ? "Catégorie"
                            : "Prix"
                    }
                    type={key === "price" ? "number" : "text"}
                    value={customItem[key]}
                    onChange={(e) =>
                      setCustomItem((prev) => ({
                        ...prev,
                        [key]: e.target.value,
                      }))
                    }
                  />
                ))}
                <button
                  type="button"
                  onClick={createCustomItem}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue px-4 text-sm font-semibold text-white"
                >
                  <Plus className="size-4" />
                  Ajouter
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {activeTab === "settings" && settingsForm && (
        <div className="max-w-[920px] rounded-2xl border border-darkBlue/10 bg-white/70 p-5 shadow-sm">
          <div className="grid gap-4 midTablet:grid-cols-2">
            <label className="flex items-center gap-3 rounded-xl border border-darkBlue/10 bg-white/70 p-3 text-sm font-semibold">
              <input
                type="checkbox"
                checked={settingsForm.enabled}
                onChange={(e) =>
                  setSettingsForm((prev) => ({
                    ...prev,
                    enabled: e.target.checked,
                  }))
                }
              />
              Module actif
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-darkBlue/10 bg-white/70 p-3 text-sm font-semibold">
              <input
                type="checkbox"
                checked={settingsForm.pickupEnabled}
                onChange={(e) =>
                  setSettingsForm((prev) => ({
                    ...prev,
                    pickupEnabled: e.target.checked,
                  }))
                }
              />
              Retrait
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-darkBlue/10 bg-white/70 p-3 text-sm font-semibold">
              <input
                type="checkbox"
                checked={settingsForm.deliveryEnabled}
                onChange={(e) =>
                  setSettingsForm((prev) => ({
                    ...prev,
                    deliveryEnabled: e.target.checked,
                  }))
                }
              />
              Livraison
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-darkBlue/10 bg-white/70 p-3 text-sm font-semibold">
              <input
                type="checkbox"
                checked={settingsForm.same_hours_as_restaurant}
                onChange={(e) =>
                  setSettingsForm((prev) => ({
                    ...prev,
                    same_hours_as_restaurant: e.target.checked,
                  }))
                }
              />
              Horaires restaurant
            </label>
            <select
              className="h-11 rounded-xl border border-darkBlue/10 px-3 outline-none"
              value={settingsForm.paymentPolicy}
              onChange={(e) =>
                setSettingsForm((prev) => ({
                  ...prev,
                  paymentPolicy: e.target.value,
                }))
              }
            >
              <option value="on_site">Paiement au retrait/livraison</option>
              <option value="online_required">Paiement en ligne obligatoire</option>
              <option value="customer_choice">Choix client</option>
            </select>
            <input
              type="number"
              min="5"
              className="h-11 rounded-xl border border-darkBlue/10 px-3 outline-none"
              value={settingsForm.defaultSlotIntervalMinutes}
              onChange={(e) =>
                setSettingsForm((prev) => ({
                  ...prev,
                  defaultSlotIntervalMinutes: e.target.value,
                }))
              }
              placeholder="Intervalle créneaux"
            />
            <input
              type="number"
              min="1"
              className="h-11 rounded-xl border border-darkBlue/10 px-3 outline-none"
              value={settingsForm.defaultSlotMaxOrders}
              onChange={(e) =>
                setSettingsForm((prev) => ({
                  ...prev,
                  defaultSlotMaxOrders: e.target.value,
                }))
              }
              placeholder="Quota par créneau"
            />
            <input
              type="number"
              min="0"
              className="h-11 rounded-xl border border-darkBlue/10 px-3 outline-none"
              value={settingsForm.minimumPickupOrder}
              onChange={(e) =>
                setSettingsForm((prev) => ({
                  ...prev,
                  minimumPickupOrder: e.target.value,
                }))
              }
              placeholder="Minimum retrait"
            />
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <label className="text-sm font-semibold text-darkBlue">
              Zones de livraison
            </label>
            <textarea
              className="min-h-[130px] rounded-xl border border-darkBlue/10 p-3 text-sm outline-none"
              value={zonesText}
              onChange={(e) => setZonesText(e.target.value)}
              placeholder="Centre|19100,19270|3.50|15|35"
            />
            <p className="text-xs text-darkBlue/45">
              Format: Nom|codes postaux séparés par virgule|frais|min commande|délai minutes
            </p>
          </div>

          <button
            type="button"
            onClick={saveSettings}
            disabled={loading}
            className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-blue px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Save className="size-4" />
            Enregistrer
          </button>
        </div>
      )}
    </section>
  );
}
