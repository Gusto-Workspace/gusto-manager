const Stripe = require("stripe");

const RestaurantModel = require("../models/restaurant.model");
const TakeAwayOrderModel = require("../models/take-away-order.model");
const { decryptApiKey } = require("./encryption.service");
const {
  upsertCustomer,
  onTakeAwayOrderCreated,
  onTakeAwayOrderStatusChanged,
} = require("./customers.service");
const { broadcastToRestaurant } = require("./sse-bus.service");
const { createAndBroadcastNotification } = require("./notifications.service");

const ACTIVE_ORDER_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
];

function cleanString(value) {
  return String(value || "").trim();
}

function normalizeMoney(value, fallback = 0) {
  const n = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n * 100) / 100;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function minutesFromHHmm(value) {
  const [h, m] = cleanString(value).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function hhmmFromMinutes(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function toDateKey(dateInput) {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = cleanString(dateKey).split("-").map(Number);
  if (!year || !month || !day) return null;
  const d = new Date(year, month - 1, day, 0, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildScheduledDate(dateKey, hhmm) {
  const date = parseDateKey(dateKey);
  const minutes = minutesFromHHmm(hhmm);
  if (!date || minutes === null) return null;
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
}

function getDayIndex(date) {
  const jsDay = date.getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

function getSettings(restaurant) {
  return restaurant?.takeAwaySettings || {};
}

const DEFAULT_COMPLETED_ORDER_AUTO_DELETE_MINUTES = 6 * 30 * 24 * 60;

function sanitizeTakeAwaySettingsInput(input = {}) {
  const paymentPolicy = [
    "online_required",
    "on_site",
    "customer_choice",
  ].includes(input.paymentPolicy)
    ? input.paymentPolicy
    : "on_site";

  return {
    enabled: Boolean(input.enabled),
    pickupEnabled: input.pickupEnabled !== false,
    deliveryEnabled: Boolean(input.deliveryEnabled),
    auto_accept: input.auto_accept !== false,
    paymentPolicy,
    same_hours_as_restaurant: input.same_hours_as_restaurant !== false,
    defaultSlotIntervalMinutes: Math.max(
      5,
      Number(input.defaultSlotIntervalMinutes || 15),
    ),
    defaultSlotMaxOrders: Math.max(1, Number(input.defaultSlotMaxOrders || 6)),
    minimumPickupOrder: normalizeMoney(input.minimumPickupOrder, 0),
    completedOrderAutoDeleteEnabled: Boolean(
      input.completedOrderAutoDeleteEnabled,
    ),
    completedOrderAutoDeleteMinutes: Math.max(
      1,
      Number(
        input.completedOrderAutoDeleteMinutes ||
          DEFAULT_COMPLETED_ORDER_AUTO_DELETE_MINUTES,
      ),
    ),
    completedOrderAutoDeleteDays: Math.max(
      0,
      Number(input.completedOrderAutoDeleteDays || 0),
    ),
    slots: Array.isArray(input.slots)
      ? input.slots.map((day) => ({
          day: cleanString(day.day),
          isClosed: Boolean(day.isClosed),
          slots: Array.isArray(day.slots)
            ? day.slots
                .map((slot) => ({
                  start: cleanString(slot.start),
                  end: cleanString(slot.end),
                  intervalMinutes: Math.max(
                    5,
                    Number(
                      slot.intervalMinutes ||
                        input.defaultSlotIntervalMinutes ||
                        15,
                    ),
                  ),
                  maxOrders: Math.max(
                    1,
                    Number(slot.maxOrders || input.defaultSlotMaxOrders || 6),
                  ),
                }))
                .filter(
                  (slot) =>
                    minutesFromHHmm(slot.start) !== null &&
                    minutesFromHHmm(slot.end) !== null &&
                    minutesFromHHmm(slot.start) < minutesFromHHmm(slot.end),
                )
            : [],
        }))
      : [],
    deliveryZones: Array.isArray(input.deliveryZones)
      ? input.deliveryZones.map((zone) => ({
          _id: zone._id,
          name: cleanString(zone.name),
          zipCodes: Array.isArray(zone.zipCodes)
            ? zone.zipCodes.map(cleanString).filter(Boolean)
            : [],
          fee: normalizeMoney(zone.fee, 0),
          minimumOrder: normalizeMoney(zone.minimumOrder, 0),
          estimatedMinutes: Math.max(0, Number(zone.estimatedMinutes || 30)),
          active: zone.active !== false,
        }))
      : [],
    email_templates: {
      confirmationSubject: cleanString(
        input?.email_templates?.confirmationSubject,
      ),
      confirmationBody: cleanString(input?.email_templates?.confirmationBody),
    },
  };
}

function normalizeCatalogItemInput(input = {}) {
  return {
    name: cleanString(input.name),
    description: cleanString(input.description),
    categoryName: cleanString(input.categoryName) || "À emporter",
    price: normalizeMoney(input.price, 0),
    active: input.active !== false,
    visible: input.visible !== false,
    image: cleanString(input.image),
    imagePublicId: cleanString(input.imagePublicId),
    sortOrder: Number(input.sortOrder || 0),
    options: Array.isArray(input.options)
      ? input.options
          .map((option) => ({
            name: cleanString(option.name),
            price: normalizeMoney(option.price, 0),
          }))
          .filter((option) => option.name)
      : [],
    syncedWithSource: input.syncedWithSource !== false,
  };
}

function getPlainSubdoc(value) {
  return value?.toObject ? value.toObject() : value || {};
}

function getDisplayPriceForWine(wine) {
  const volumes = Array.isArray(wine?.volumes) ? wine.volumes : [];
  const prices = volumes
    .map((volume) => normalizeMoney(volume?.price, 0))
    .filter((price) => price > 0);
  return prices.length ? Math.min(...prices) : 0;
}

function findSourceItem(
  restaurant,
  sourceType,
  sourceItemId,
  sourceCategoryId,
  sourceSubCategoryId,
) {
  const targetId = cleanString(sourceItemId);
  if (!targetId) return null;

  if (sourceType === "dish") {
    for (const category of restaurant.dish_categories || []) {
      if (sourceCategoryId && String(category._id) !== String(sourceCategoryId))
        continue;
      const dish = (category.dishes || []).find(
        (item) => String(item._id) === targetId,
      );
      if (dish) {
        return {
          item: dish,
          category,
          sourceSnapshot: {
            name: dish.name,
            description: dish.description || "",
            price: normalizeMoney(dish.price, 0),
            categoryName: category.name || "",
          },
        };
      }
    }
  }

  if (sourceType === "drink") {
    for (const category of restaurant.drink_categories || []) {
      const drinks = [];
      (category.drinks || []).forEach((drink) =>
        drinks.push({ drink, subCategory: null }),
      );
      (category.subCategories || []).forEach((subCategory) => {
        if (
          sourceSubCategoryId &&
          String(subCategory._id) !== String(sourceSubCategoryId)
        )
          return;
        (subCategory.drinks || []).forEach((drink) =>
          drinks.push({ drink, subCategory }),
        );
      });
      for (const entry of drinks) {
        if (String(entry.drink._id) === targetId) {
          return {
            item: entry.drink,
            category,
            subCategory: entry.subCategory,
            sourceSnapshot: {
              name: entry.drink.name,
              description: entry.drink.description || "",
              price: normalizeMoney(entry.drink.price, 0),
              categoryName: category.name || "",
              subCategoryName: entry.subCategory?.name || "",
            },
          };
        }
      }
    }
  }

  if (sourceType === "wine") {
    for (const category of restaurant.wine_categories || []) {
      const wines = [];
      (category.wines || []).forEach((wine) =>
        wines.push({ wine, subCategory: null }),
      );
      (category.subCategories || []).forEach((subCategory) => {
        if (
          sourceSubCategoryId &&
          String(subCategory._id) !== String(sourceSubCategoryId)
        )
          return;
        (subCategory.wines || []).forEach((wine) =>
          wines.push({ wine, subCategory }),
        );
      });
      for (const entry of wines) {
        if (String(entry.wine._id) === targetId) {
          return {
            item: entry.wine,
            category,
            subCategory: entry.subCategory,
            sourceSnapshot: {
              name: entry.wine.name,
              description: entry.wine.appellation || "",
              price: getDisplayPriceForWine(entry.wine),
              categoryName: category.name || "",
              subCategoryName: entry.subCategory?.name || "",
            },
          };
        }
      }
    }
  }

  if (sourceType === "menu") {
    const menu = (restaurant.menus || []).find(
      (candidate) => String(candidate._id) === targetId,
    );
    if (menu) {
      return {
        item: menu,
        category: null,
        sourceSnapshot: {
          name: menu.name,
          description: menu.description || "",
          price: normalizeMoney(menu.price, 0),
          categoryName: "Menus",
        },
      };
    }
  }

  return null;
}

function listImportableSourceItems(restaurant) {
  const items = [];
  const importedSourceKeys = new Set(
    (restaurant.takeAwayCatalog || [])
      .filter((item) => item.sourceType && item.sourceItemId)
      .map((item) => `${item.sourceType}:${String(item.sourceItemId)}`),
  );

  for (const category of restaurant.dish_categories || []) {
    for (const dish of category.dishes || []) {
      items.push({
        sourceType: "dish",
        sourceCategoryId: String(category._id),
        sourceItemId: String(dish._id),
        name: dish.name,
        description: dish.description || "",
        price: normalizeMoney(dish.price, 0),
        categoryName: category.name || "Plats",
        alreadyEnabled: importedSourceKeys.has(`dish:${String(dish._id)}`),
      });
    }
  }

  for (const menu of restaurant.menus || []) {
    items.push({
      sourceType: "menu",
      sourceItemId: String(menu._id),
      name: menu.name,
      description: menu.description || "",
      price: normalizeMoney(menu.price, 0),
      categoryName: "Menus",
      alreadyEnabled: importedSourceKeys.has(`menu:${String(menu._id)}`),
    });
  }

  for (const category of restaurant.drink_categories || []) {
    for (const drink of category.drinks || []) {
      items.push({
        sourceType: "drink",
        sourceCategoryId: String(category._id),
        sourceItemId: String(drink._id),
        name: drink.name,
        description: drink.description || "",
        price: normalizeMoney(drink.price, 0),
        categoryName: category.name || "Boissons",
        alreadyEnabled: importedSourceKeys.has(`drink:${String(drink._id)}`),
      });
    }
    for (const subCategory of category.subCategories || []) {
      for (const drink of subCategory.drinks || []) {
        items.push({
          sourceType: "drink",
          sourceCategoryId: String(category._id),
          sourceSubCategoryId: String(subCategory._id),
          sourceItemId: String(drink._id),
          name: drink.name,
          description: drink.description || "",
          price: normalizeMoney(drink.price, 0),
          categoryName: category.name || "Boissons",
          subCategoryName: subCategory.name || "",
          alreadyEnabled: importedSourceKeys.has(`drink:${String(drink._id)}`),
        });
      }
    }
  }

  for (const category of restaurant.wine_categories || []) {
    for (const wine of category.wines || []) {
      items.push({
        sourceType: "wine",
        sourceCategoryId: String(category._id),
        sourceItemId: String(wine._id),
        name: wine.name,
        description: wine.appellation || "",
        price: getDisplayPriceForWine(wine),
        categoryName: category.name || "Vins",
        alreadyEnabled: importedSourceKeys.has(`wine:${String(wine._id)}`),
      });
    }
    for (const subCategory of category.subCategories || []) {
      for (const wine of subCategory.wines || []) {
        items.push({
          sourceType: "wine",
          sourceCategoryId: String(category._id),
          sourceSubCategoryId: String(subCategory._id),
          sourceItemId: String(wine._id),
          name: wine.name,
          description: wine.appellation || "",
          price: getDisplayPriceForWine(wine),
          categoryName: category.name || "Vins",
          subCategoryName: subCategory.name || "",
          alreadyEnabled: importedSourceKeys.has(`wine:${String(wine._id)}`),
        });
      }
    }
  }

  return items.sort((a, b) =>
    `${a.categoryName} ${a.name}`.localeCompare(`${b.categoryName} ${b.name}`),
  );
}

function findCatalogItemForSource(restaurant, sourceType, sourceItemId) {
  return (restaurant.takeAwayCatalog || []).find(
    (item) =>
      item.sourceType === sourceType &&
      String(item.sourceItemId || "") === String(sourceItemId || ""),
  );
}

function upsertCatalogItemFromSource({
  restaurant,
  sourceType,
  sourceItemId,
  sourceCategoryId = null,
  sourceSubCategoryId = null,
  overrides = {},
}) {
  const sourceMatch = findSourceItem(
    restaurant,
    sourceType,
    sourceItemId,
    sourceCategoryId,
    sourceSubCategoryId,
  );

  if (!sourceMatch) {
    const err = new Error("Source item not found");
    err.status = 404;
    throw err;
  }

  const snapshot = sourceMatch.sourceSnapshot;

  let catalogItem = findCatalogItemForSource(
    restaurant,
    sourceType,
    sourceItemId,
  );
  const payload = {
    sourceType,
    sourceCategoryId: sourceCategoryId || sourceMatch.category?._id || null,
    sourceSubCategoryId:
      sourceSubCategoryId || sourceMatch.subCategory?._id || null,
    sourceItemId,
    sourceSnapshot: snapshot,
    name: cleanString(overrides.name) || snapshot.name,
    description:
      overrides.description !== undefined
        ? cleanString(overrides.description)
        : snapshot.description || "",
    categoryName:
      cleanString(overrides.categoryName) ||
      snapshot.subCategoryName ||
      snapshot.categoryName ||
      "À emporter",
    price:
      overrides.price !== undefined
        ? normalizeMoney(overrides.price, snapshot.price)
        : snapshot.price,
    active: overrides.active !== undefined ? Boolean(overrides.active) : true,
    visible:
      overrides.visible !== undefined ? Boolean(overrides.visible) : true,
    sortOrder: Number(overrides.sortOrder || catalogItem?.sortOrder || 0),
    options: Array.isArray(overrides.options)
      ? normalizeCatalogItemInput(overrides).options
      : catalogItem?.options || [],
    syncedWithSource:
      overrides.syncedWithSource !== undefined
        ? Boolean(overrides.syncedWithSource)
        : true,
    sourceDeleted: false,
    updatedAt: new Date(),
  };

  if (catalogItem) {
    Object.assign(catalogItem, payload);
  } else {
    restaurant.takeAwayCatalog.push(payload);
    catalogItem =
      restaurant.takeAwayCatalog[restaurant.takeAwayCatalog.length - 1];
  }

  return catalogItem;
}

function createCustomCatalogItem(restaurant, input) {
  const payload = normalizeCatalogItemInput(input);
  if (!payload.name) {
    const err = new Error("name is required");
    err.status = 400;
    throw err;
  }

  restaurant.takeAwayCatalog.push({
    ...payload,
    sourceType: "custom",
    sourceSnapshot: {
      name: payload.name,
      description: payload.description,
      price: payload.price,
      categoryName: payload.categoryName,
    },
    syncedWithSource: false,
  });

  return restaurant.takeAwayCatalog[restaurant.takeAwayCatalog.length - 1];
}

function getDaySchedule(restaurant, date) {
  const settings = getSettings(restaurant);
  const dayIndex = getDayIndex(date);

  if (settings.same_hours_as_restaurant) {
    const dayHours = Array.isArray(restaurant.opening_hours)
      ? restaurant.opening_hours[dayIndex]
      : null;

    if (!dayHours || dayHours.isClosed) return null;

    return {
      ranges: (dayHours.hours || []).map((range) => ({
        start: range.open,
        end: range.close,
        intervalMinutes: Number(settings.defaultSlotIntervalMinutes || 15),
        maxOrders: Number(settings.defaultSlotMaxOrders || 6),
      })),
    };
  }

  const customDay = Array.isArray(settings.slots)
    ? settings.slots[dayIndex]
    : null;
  if (!customDay || customDay.isClosed) return null;
  return { ranges: customDay.slots || [] };
}

function generateSlotsForDate(restaurant, dateKey) {
  const date = parseDateKey(dateKey);
  if (!date) return [];
  const schedule = getDaySchedule(restaurant, date);
  if (!schedule) return [];

  const slots = [];
  for (const range of schedule.ranges || []) {
    const start = minutesFromHHmm(range.start);
    const end = minutesFromHHmm(range.end);
    const interval = Math.max(5, Number(range.intervalMinutes || 15));
    const maxOrders = Math.max(1, Number(range.maxOrders || 6));
    if (start === null || end === null || start >= end) continue;

    for (let minutes = start; minutes <= end; minutes += interval) {
      const time = hhmmFromMinutes(minutes);
      slots.push({
        slotId: `${dateKey}-${time}`,
        time,
        scheduledFor: buildScheduledDate(dateKey, time),
        maxOrders,
      });
    }
  }

  return slots;
}

async function getAvailableSlots({ restaurant, dateKey }) {
  const slots = generateSlotsForDate(restaurant, dateKey);
  if (!slots.length) return [];

  const start = parseDateKey(dateKey);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const counts = await TakeAwayOrderModel.aggregate([
    {
      $match: {
        restaurant_id: restaurant._id,
        scheduledFor: { $gte: start, $lt: end },
        status: { $in: ACTIVE_ORDER_STATUSES },
      },
    },
    { $group: { _id: "$slotId", count: { $sum: 1 } } },
  ]);

  const countBySlot = new Map(
    counts.map((row) => [String(row._id), row.count]),
  );

  return slots.map((slot) => {
    const booked = countBySlot.get(slot.slotId) || 0;
    return {
      ...slot,
      scheduledFor: slot.scheduledFor?.toISOString?.() || null,
      booked,
      remaining: Math.max(0, slot.maxOrders - booked),
      available: booked < slot.maxOrders,
    };
  });
}

function findDeliveryZone(settings, zipCode) {
  const normalizedZip = cleanString(zipCode);
  if (!normalizedZip) return null;
  return (settings.deliveryZones || []).find(
    (zone) =>
      zone.active !== false &&
      (zone.zipCodes || []).map(cleanString).includes(normalizedZip),
  );
}

function getCatalogItem(restaurant, catalogItemId) {
  return (restaurant.takeAwayCatalog || []).find(
    (item) => String(item._id) === String(catalogItemId),
  );
}

function buildOrderItems(restaurant, rawItems = []) {
  if (!Array.isArray(rawItems) || !rawItems.length) {
    const err = new Error("items are required");
    err.status = 400;
    throw err;
  }

  return rawItems.map((rawItem) => {
    const catalogItem = getCatalogItem(restaurant, rawItem.catalogItemId);
    if (
      !catalogItem ||
      catalogItem.active === false ||
      catalogItem.visible === false
    ) {
      const err = new Error("Catalog item unavailable");
      err.status = 400;
      throw err;
    }

    const quantity = Math.max(1, Number(rawItem.quantity || 1));
    const optionIds = new Set(
      (Array.isArray(rawItem.optionIds) ? rawItem.optionIds : [])
        .map((id) => String(id))
        .filter(Boolean),
    );
    const optionNames = new Set(
      (Array.isArray(rawItem.optionNames) ? rawItem.optionNames : [])
        .map(cleanString)
        .filter(Boolean),
    );
    const selectedOptions = (catalogItem.options || []).filter(
      (option) =>
        optionIds.has(String(option._id)) ||
        optionNames.has(cleanString(option.name)),
    );
    const optionsTotal = selectedOptions.reduce(
      (sum, option) => sum + normalizeMoney(option.price, 0),
      0,
    );
    const unitPrice = normalizeMoney(catalogItem.price, 0);
    const lineTotal =
      Math.round((unitPrice + optionsTotal) * quantity * 100) / 100;

    return {
      catalogItemId: catalogItem._id,
      sourceType: catalogItem.sourceType,
      sourceItemId: catalogItem.sourceItemId || null,
      name: catalogItem.name,
      description: catalogItem.description || "",
      categoryName: catalogItem.categoryName || "",
      unitPrice,
      quantity,
      options: selectedOptions.map((option) => ({
        name: option.name,
        price: normalizeMoney(option.price, 0),
      })),
      optionsTotal,
      lineTotal,
      note: cleanString(rawItem.note),
    };
  });
}

function getPaymentMethod(settings, requestedPaymentMethod) {
  if (settings.paymentPolicy === "online_required") return "online";
  if (settings.paymentPolicy === "on_site") return "on_site";
  return requestedPaymentMethod === "online" ? "online" : "on_site";
}

async function validateSlotCapacity({ restaurant, dateKey, slotId }) {
  const availableSlots = await getAvailableSlots({ restaurant, dateKey });
  const slot = availableSlots.find((candidate) => candidate.slotId === slotId);
  if (!slot) {
    const err = new Error("Créneau indisponible");
    err.status = 400;
    throw err;
  }
  if (!slot.available) {
    const err = new Error("Ce créneau est complet");
    err.status = 409;
    throw err;
  }
  return slot;
}

function generateOrderNumber() {
  const date = new Date();
  const stamp = `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(
    date.getDate(),
  )}`;
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TA-${stamp}-${suffix}`;
}

function applyStatusTimestamp(order, status) {
  const now = new Date();
  if (status === "confirmed" && !order.confirmedAt) order.confirmedAt = now;
  if (status === "preparing" && !order.preparingAt) order.preparingAt = now;
  if (status === "ready" && !order.readyAt) order.readyAt = now;
  if (status === "out_for_delivery" && !order.outForDeliveryAt) {
    order.outForDeliveryAt = now;
  }
  if (status === "completed" && !order.completedAt) order.completedAt = now;
  if (status === "canceled" && !order.canceledAt) order.canceledAt = now;
  if (status === "rejected" && !order.rejectedAt) order.rejectedAt = now;
}

function broadcastOrder(restaurantId, order, type = "takeaway_order_updated") {
  broadcastToRestaurant(String(restaurantId), {
    type,
    restaurantId: String(restaurantId),
    order: order?.toObject ? order.toObject() : order,
  });
}

async function cleanupCompletedTakeAwayOrders(restaurant) {
  const settings = getSettings(restaurant);
  const enabled =
    settings?.completedOrderAutoDeleteEnabled === true ||
    Number(settings?.completedOrderAutoDeleteDays || 0) > 0;
  if (!enabled) return;

  const minutes = Number(
    settings?.completedOrderAutoDeleteMinutes ||
      Number(settings?.completedOrderAutoDeleteDays || 0) * 24 * 60 ||
      DEFAULT_COMPLETED_ORDER_AUTO_DELETE_MINUTES,
  );
  if (!Number.isFinite(minutes) || minutes <= 0) return;

  const before = new Date(Date.now() - minutes * 60 * 1000);
  await TakeAwayOrderModel.deleteMany({
    restaurant_id: restaurant._id,
    status: "completed",
    $or: [
      { completedAt: { $lte: before } },
      { completedAt: null, updatedAt: { $lte: before } },
    ],
  });
}

async function createTakeAwayOrder({ restaurant, payload, source = "public" }) {
  const settings = getSettings(restaurant);
  if (!restaurant?.options?.take_away) {
    const err = new Error("Module vente à emporter indisponible");
    err.status = 403;
    throw err;
  }
  if (source === "public" && !settings.enabled) {
    const err = new Error("Commande en ligne indisponible");
    err.status = 403;
    throw err;
  }

  const fulfillmentMode =
    payload.fulfillmentMode === "delivery" ? "delivery" : "pickup";
  if (fulfillmentMode === "pickup" && settings.pickupEnabled === false) {
    const err = new Error("Retrait indisponible");
    err.status = 400;
    throw err;
  }
  if (fulfillmentMode === "delivery" && settings.deliveryEnabled === false) {
    const err = new Error("Livraison indisponible");
    err.status = 400;
    throw err;
  }

  const scheduledFor = new Date(payload.scheduledFor);
  if (Number.isNaN(scheduledFor.getTime())) {
    const err = new Error("scheduledFor invalide");
    err.status = 400;
    throw err;
  }
  const dateKey = toDateKey(scheduledFor);
  const slotId =
    cleanString(payload.slotId) ||
    `${dateKey}-${pad2(scheduledFor.getHours())}:${pad2(scheduledFor.getMinutes())}`;
  await validateSlotCapacity({ restaurant, dateKey, slotId });

  const items = buildOrderItems(restaurant, payload.items);
  const subtotal =
    Math.round(items.reduce((sum, item) => sum + item.lineTotal, 0) * 100) /
    100;

  let deliveryFee = 0;
  let deliveryZone = null;
  const deliveryAddress = payload.deliveryAddress || {};

  if (fulfillmentMode === "delivery") {
    deliveryZone = findDeliveryZone(settings, deliveryAddress.zipCode);
    if (!deliveryZone) {
      const err = new Error("Zone de livraison non couverte");
      err.status = 400;
      throw err;
    }
    if (subtotal < normalizeMoney(deliveryZone.minimumOrder, 0)) {
      const err = new Error("Minimum de commande livraison non atteint");
      err.status = 400;
      throw err;
    }
    deliveryFee = normalizeMoney(deliveryZone.fee, 0);
  } else if (subtotal < normalizeMoney(settings.minimumPickupOrder, 0)) {
    const err = new Error("Minimum de commande retrait non atteint");
    err.status = 400;
    throw err;
  }

  const paymentMethod = getPaymentMethod(settings, payload.paymentMethod);
  const status =
    source === "dashboard"
      ? "confirmed"
      : paymentMethod === "online"
        ? "pending"
        : settings.auto_accept === false
          ? "pending"
          : "confirmed";
  const paymentStatus =
    paymentMethod === "online" && source === "public"
      ? "pending"
      : "not_required";

  const customer = await upsertCustomer({
    restaurantId: restaurant._id,
    firstName: payload.customerFirstName,
    lastName: payload.customerLastName,
    email: payload.customerEmail,
    phone: payload.customerPhone,
  });

  const total = Math.round((subtotal + deliveryFee) * 100) / 100;
  const order = await TakeAwayOrderModel.create({
    restaurant_id: restaurant._id,
    orderNumber: generateOrderNumber(),
    customer: customer?._id || null,
    customerFirstName: cleanString(payload.customerFirstName),
    customerLastName: cleanString(payload.customerLastName),
    customerEmail: cleanString(payload.customerEmail),
    customerPhone: cleanString(payload.customerPhone),
    fulfillmentMode,
    status,
    paymentStatus,
    paymentMethod,
    scheduledFor,
    slotId,
    items,
    subtotal,
    deliveryFee,
    total,
    deliveryAddress:
      fulfillmentMode === "delivery"
        ? {
            line1: cleanString(deliveryAddress.line1),
            line2: cleanString(deliveryAddress.line2),
            zipCode: cleanString(deliveryAddress.zipCode),
            city: cleanString(deliveryAddress.city),
            country: cleanString(deliveryAddress.country) || "France",
            instructions: cleanString(deliveryAddress.instructions),
          }
        : {},
    deliveryZoneId: deliveryZone?._id ? String(deliveryZone._id) : "",
    customerNote: cleanString(payload.customerNote),
    restaurantNote: cleanString(payload.restaurantNote),
    source,
    idempotencyKey: cleanString(payload.idempotencyKey),
  });

  applyStatusTimestamp(order, status);
  await order.save();
  await onTakeAwayOrderCreated(order.customer, order);

  broadcastOrder(restaurant._id, order, "takeaway_order_created");

  if (source === "public") {
    try {
      await createAndBroadcastNotification({
        restaurantId: restaurant._id,
        module: "take_away",
        type: "takeaway_order_created",
        data: order.toObject(),
      });
    } catch (error) {
      console.error("take away notification error:", error?.message || error);
    }
  }

  return order;
}

function getRestaurantStripeSecretKey(restaurant) {
  const encrypted = cleanString(restaurant?.stripeSecretKey);
  if (!encrypted) return "";
  try {
    return decryptApiKey(encrypted);
  } catch (error) {
    console.error(
      "[take-away] stripe secret decrypt failed",
      error?.message || error,
    );
    return "";
  }
}

async function createOrderPaymentIntent({ restaurant, order }) {
  if (!order || order.paymentMethod !== "online") {
    const err = new Error("Paiement en ligne non requis");
    err.status = 400;
    throw err;
  }

  const stripeSecretKey = getRestaurantStripeSecretKey(restaurant);
  if (!stripeSecretKey) {
    const err = new Error("Clé Stripe restaurant introuvable");
    err.status = 400;
    throw err;
  }

  const stripe = new Stripe(stripeSecretKey);
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(normalizeMoney(order.total, 0) * 100),
    currency: order.currency || "eur",
    automatic_payment_methods: { enabled: true },
    metadata: {
      type: "takeaway_order",
      orderId: String(order._id),
      orderNumber: order.orderNumber,
      restaurantId: String(order.restaurant_id),
    },
  });

  order.stripePaymentIntentId = paymentIntent.id;
  order.paymentStatus = "pending";
  await order.save();
  broadcastOrder(restaurant._id, order);

  return paymentIntent;
}

async function confirmOrderPayment({
  restaurant,
  restaurantId,
  orderId,
  paymentIntentId,
}) {
  const resolvedRestaurantId = restaurant?._id || restaurantId;
  const order = await TakeAwayOrderModel.findOne({
    _id: orderId,
    restaurant_id: resolvedRestaurantId,
  });

  if (!order) {
    const err = new Error("Commande introuvable");
    err.status = 404;
    throw err;
  }

  if (
    paymentIntentId &&
    order.stripePaymentIntentId &&
    String(order.stripePaymentIntentId) !== String(paymentIntentId)
  ) {
    const err = new Error("PaymentIntent non correspondant");
    err.status = 400;
    throw err;
  }

  if (paymentIntentId && restaurant) {
    const stripeSecretKey = getRestaurantStripeSecretKey(restaurant);
    if (!stripeSecretKey) {
      const err = new Error("Clé Stripe restaurant introuvable");
      err.status = 400;
      throw err;
    }
    const stripe = new Stripe(stripeSecretKey);
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (paymentIntent.status !== "succeeded") {
      const err = new Error("Paiement non confirmé");
      err.status = 400;
      throw err;
    }
  }

  order.paymentStatus = "paid";
  if (
    order.status === "pending" &&
    getSettings(restaurant)?.auto_accept !== false
  ) {
    const prevStatus = order.status;
    order.status = "confirmed";
    applyStatusTimestamp(order, "confirmed");
    await onTakeAwayOrderStatusChanged(
      order.customer,
      order,
      prevStatus,
      order.status,
    );
  }
  await order.save();
  broadcastOrder(resolvedRestaurantId, order);
  return order;
}

async function updateOrderStatus({ restaurantId, orderId, status }) {
  const allowed = [
    "pending",
    "confirmed",
    "preparing",
    "ready",
    "out_for_delivery",
    "completed",
    "canceled",
    "rejected",
  ];
  if (!allowed.includes(status)) {
    const err = new Error("Statut invalide");
    err.status = 400;
    throw err;
  }

  const order = await TakeAwayOrderModel.findOne({
    _id: orderId,
    restaurant_id: restaurantId,
  });

  if (!order) {
    const err = new Error("Commande introuvable");
    err.status = 404;
    throw err;
  }

  const prevStatus = order.status;
  order.status = status;
  applyStatusTimestamp(order, status);
  await order.save();
  await onTakeAwayOrderStatusChanged(order.customer, order, prevStatus, status);
  broadcastOrder(restaurantId, order);
  return order;
}

async function loadRestaurantForTakeAway(restaurantId) {
  return RestaurantModel.findById(restaurantId)
    .populate("owner_id", "firstname")
    .populate("employees")
    .populate("menus");
}

module.exports = {
  ACTIVE_ORDER_STATUSES,
  sanitizeTakeAwaySettingsInput,
  normalizeCatalogItemInput,
  listImportableSourceItems,
  upsertCatalogItemFromSource,
  createCustomCatalogItem,
  getAvailableSlots,
  createTakeAwayOrder,
  createOrderPaymentIntent,
  confirmOrderPayment,
  updateOrderStatus,
  loadRestaurantForTakeAway,
  cleanupCompletedTakeAwayOrders,
};
