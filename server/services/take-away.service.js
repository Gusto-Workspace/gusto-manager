const crypto = require("crypto");
const Stripe = require("stripe");

const RestaurantModel = require("../models/restaurant.model");
const TakeAwayOrderModel = require("../models/take-away-order.model");
const TakeAwaySlotLockModel = require("../models/take-away-slot-lock.model");
const { decryptApiKey } = require("./encryption.service");
const {
  upsertCustomer,
  onTakeAwayOrderCreated,
  onTakeAwayOrderStatusChanged,
} = require("./customers.service");
const { broadcastToRestaurant } = require("./sse-bus.service");
const { createAndBroadcastNotification } = require("./notifications.service");
const { sendTakeAwayOrderEmail } = require("./take-away-mailer.service");

const ACTIVE_ORDER_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
];
const TAKE_AWAY_PAYMENT_PENDING_TTL_MINUTES = Math.max(
  5,
  Number(process.env.TAKE_AWAY_PAYMENT_PENDING_TTL_MINUTES || 15),
);
const TAKE_AWAY_PAYMENT_PENDING_TTL_MS =
  TAKE_AWAY_PAYMENT_PENDING_TTL_MINUTES * 60 * 1000;
const SLOT_LOCK_HOLD_MS = 30 * 1000;
const SLOT_LOCK_WAIT_MS = 5 * 1000;
const SLOT_LOCK_RETRY_MS = 25;
const MAX_ORDER_ITEMS = 50;
const MAX_ITEM_QUANTITY = 99;

const STATUS_TRANSITIONS = Object.freeze({
  pending: ["confirmed", "canceled", "rejected"],
  confirmed: ["preparing", "canceled"],
  preparing: ["ready", "canceled"],
  ready: ["completed", "out_for_delivery", "canceled"],
  out_for_delivery: ["completed", "canceled"],
  completed: [],
  canceled: [],
  rejected: [],
});

function serviceError(message, status = 400, code = "") {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanString(value) {
  return String(value || "").trim();
}

function assertMaxLength(value, label, maxLength, { required = false } = {}) {
  const normalized = cleanString(value);
  if (required && !normalized) {
    throw serviceError(`${label} requis`);
  }
  if (normalized.length > maxLength) {
    throw serviceError(`${label} trop long (${maxLength} caractères maximum)`);
  }
  return normalized;
}

function validateCustomerInput(payload = {}) {
  const customerFirstName = assertMaxLength(
    payload.customerFirstName,
    "Prénom",
    80,
    { required: true },
  );
  const customerLastName = assertMaxLength(
    payload.customerLastName,
    "Nom",
    80,
    { required: true },
  );
  const customerEmail = assertMaxLength(payload.customerEmail, "Email", 254);
  const customerPhone = assertMaxLength(
    payload.customerPhone,
    "Téléphone",
    32,
    { required: true },
  );

  if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    throw serviceError("Email invalide");
  }
  const phoneDigits = customerPhone.replace(/\D/g, "");
  if (phoneDigits.length < 6 || phoneDigits.length > 20) {
    throw serviceError("Téléphone invalide");
  }

  return {
    customerFirstName,
    customerLastName,
    customerEmail,
    customerPhone,
  };
}

function validateDeliveryAddress(address = {}) {
  return {
    line1: assertMaxLength(address.line1, "Adresse", 200, { required: true }),
    line2: assertMaxLength(address.line2, "Complément d'adresse", 200),
    zipCode: assertMaxLength(address.zipCode, "Code postal", 20, {
      required: true,
    }),
    city: assertMaxLength(address.city, "Ville", 100, { required: true }),
    country: assertMaxLength(address.country, "Pays", 100) || "France",
    instructions: assertMaxLength(
      address.instructions,
      "Instructions de livraison",
      500,
    ),
  };
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

function parseDateKey(dateKey) {
  const normalizedDateKey = normalizeTakeAwayDateKey(dateKey);
  if (!normalizedDateKey) return null;
  const [year, month, day] = normalizedDateKey.split("-").map(Number);
  const d = new Date(year, month - 1, day, 0, 0, 0, 0);
  return d;
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

function normalizeTakeAwayDateKey(value) {
  const match = String(value || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return "";
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function getBlockedTakeAwayDates(settings = {}) {
  return Array.from(
    new Set(
      (Array.isArray(settings?.blockedDates) ? settings.blockedDates : [])
        .map(normalizeTakeAwayDateKey)
        .filter(Boolean),
    ),
  ).sort();
}

function isTakeAwayDateBlocked(restaurantOrSettings, dateKey) {
  const settings = restaurantOrSettings?.takeAwaySettings
    ? restaurantOrSettings.takeAwaySettings
    : restaurantOrSettings || {};
  const normalizedDate = normalizeTakeAwayDateKey(dateKey);
  return Boolean(
    normalizedDate &&
      getBlockedTakeAwayDates(settings).includes(normalizedDate),
  );
}

const DEFAULT_COMPLETED_ORDER_AUTO_DELETE_MINUTES = 6 * 30 * 24 * 60;

function getPreparationTimeMinutes(settings = {}) {
  const minutes = Number(settings.preparationTimeMinutes);
  return Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0;
}

function normalizePreparationTimeMinutes(value) {
  if (typeof value === "string" && value.trim() === "") {
    throw serviceError(
      "Le temps de préparation doit être un entier supérieur à 0",
    );
  }

  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes <= 0) {
    throw serviceError(
      "Le temps de préparation doit être un entier supérieur à 0",
    );
  }

  return minutes;
}

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
    ...(Object.prototype.hasOwnProperty.call(input, "preparationTimeMinutes")
      ? {
          preparationTimeMinutes: normalizePreparationTimeMinutes(
            input.preparationTimeMinutes,
          ),
        }
      : {}),
    defaultSlotIntervalMinutes: Math.max(
      5,
      Number(input.defaultSlotIntervalMinutes || 15),
    ),
    defaultSlotMaxOrders: Math.max(1, Number(input.defaultSlotMaxOrders || 6)),
    minimumPickupOrder: normalizeMoney(input.minimumPickupOrder, 0),
    blockedDates: getBlockedTakeAwayDates(input),
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

function mergeTakeAwaySettingsInput(currentSettings = {}, patch = {}) {
  const current = currentSettings?.toObject
    ? currentSettings.toObject()
    : { ...(currentSettings || {}) };
  const nextPatch = patch && typeof patch === "object" ? patch : {};

  return sanitizeTakeAwaySettingsInput({
    ...current,
    ...nextPatch,
    email_templates: Object.prototype.hasOwnProperty.call(
      nextPatch,
      "email_templates",
    )
      ? {
          ...(current.email_templates || {}),
          ...(nextPatch.email_templates || {}),
        }
      : current.email_templates,
  });
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
    syncedWithSource: false,
  };
}

function getDisplayPriceForWine(wine) {
  const volumes = Array.isArray(wine?.volumes) ? wine.volumes : [];
  const prices = volumes
    .map((volume) => normalizeMoney(volume?.price, 0))
    .filter((price) => price > 0);
  return prices.length ? Math.min(...prices) : 0;
}

function getWineTakeAwayOptions(wine = {}) {
  return (Array.isArray(wine.volumes) ? wine.volumes : [])
    .map((volume) => ({
      name: cleanString(volume?.volume),
      price: normalizeMoney(volume?.price, 0),
    }))
    .filter((option) => option.name);
}

function getMenuCombinationLabel(combination = {}, index = 0) {
  const categories = Array.isArray(combination.categories)
    ? combination.categories.map(cleanString).filter(Boolean)
    : [];
  return (
    categories.join(" + ") ||
    cleanString(combination.description) ||
    `Option ${index + 1}`
  );
}

function getMenuTakeAwayOptions(menu = {}) {
  return (Array.isArray(menu.combinations) ? menu.combinations : [])
    .map((combination, index) => ({
      name: getMenuCombinationLabel(combination, index),
      price: normalizeMoney(combination.price, 0),
    }))
    .filter((option) => option.name);
}

function getDisplayPriceForMenu(menu = {}) {
  const optionPrices = getMenuTakeAwayOptions(menu)
    .map((option) => option.price)
    .filter((price) => price > 0);
  if (optionPrices.length) return Math.min(...optionPrices);
  return normalizeMoney(menu.price, 0);
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
      const dishes = [];
      (category.dishes || []).forEach((dish) =>
        dishes.push({ dish, subCategory: null }),
      );
      (category.subCategories || []).forEach((subCategory) => {
        if (
          sourceSubCategoryId &&
          String(subCategory._id) !== String(sourceSubCategoryId)
        )
          return;
        (subCategory.dishes || []).forEach((dish) =>
          dishes.push({ dish, subCategory }),
        );
      });
      const entry = dishes.find(({ dish }) => String(dish._id) === targetId);
      if (entry) {
        return {
          item: entry.dish,
          category,
          subCategory: entry.subCategory,
          sourceSnapshot: {
            name: entry.dish.name,
            description: entry.dish.description || "",
            price: normalizeMoney(entry.dish.price, 0),
            categoryName: category.name || "",
            subCategoryName: entry.subCategory?.name || "",
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
          const options = getWineTakeAwayOptions(entry.wine);
          return {
            item: entry.wine,
            category,
            subCategory: entry.subCategory,
            takeAwayOptions: options,
            takeAwayPrice: options.length
              ? 0
              : getDisplayPriceForWine(entry.wine),
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
      const options = getMenuTakeAwayOptions(menu);
      return {
        item: menu,
        category: null,
        takeAwayOptions: options,
        sourceSnapshot: {
          name: menu.name,
          description: menu.description || "",
          price: options.length ? 0 : normalizeMoney(menu.price, 0),
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
    for (const subCategory of category.subCategories || []) {
      for (const dish of subCategory.dishes || []) {
        items.push({
          sourceType: "dish",
          sourceCategoryId: String(category._id),
          sourceSubCategoryId: String(subCategory._id),
          sourceItemId: String(dish._id),
          name: dish.name,
          description: dish.description || "",
          price: normalizeMoney(dish.price, 0),
          categoryName: category.name || "Plats",
          subCategoryName: subCategory.name || "",
          alreadyEnabled: importedSourceKeys.has(`dish:${String(dish._id)}`),
        });
      }
    }
  }

  for (const menu of restaurant.menus || []) {
    const options = getMenuTakeAwayOptions(menu);
    items.push({
      sourceType: "menu",
      sourceItemId: String(menu._id),
      name: menu.name,
      description: menu.description || "",
      price: options.length
        ? getDisplayPriceForMenu(menu)
        : normalizeMoney(menu.price, 0),
      categoryName: "Menus",
      options,
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
      const options = getWineTakeAwayOptions(wine);
      items.push({
        sourceType: "wine",
        sourceCategoryId: String(category._id),
        sourceItemId: String(wine._id),
        name: wine.name,
        description: wine.appellation || "",
        price: options.length ? 0 : getDisplayPriceForWine(wine),
        categoryName: category.name || "Vins",
        options,
        alreadyEnabled: importedSourceKeys.has(`wine:${String(wine._id)}`),
      });
    }
    for (const subCategory of category.subCategories || []) {
      for (const wine of subCategory.wines || []) {
        const options = getWineTakeAwayOptions(wine);
        items.push({
          sourceType: "wine",
          sourceCategoryId: String(category._id),
          sourceSubCategoryId: String(subCategory._id),
          sourceItemId: String(wine._id),
          name: wine.name,
          description: wine.appellation || "",
          price: options.length ? 0 : getDisplayPriceForWine(wine),
          categoryName: category.name || "Vins",
          subCategoryName: subCategory.name || "",
          options,
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
        : (sourceMatch.takeAwayPrice ?? snapshot.price),
    active: overrides.active !== undefined ? Boolean(overrides.active) : true,
    visible:
      overrides.visible !== undefined ? Boolean(overrides.visible) : true,
    sortOrder: Number(overrides.sortOrder || catalogItem?.sortOrder || 0),
    options: Array.isArray(overrides.options)
      ? normalizeCatalogItemInput(overrides).options
      : sourceMatch.takeAwayOptions?.length
        ? sourceMatch.takeAwayOptions
        : catalogItem?.options || [],
    syncedWithSource: false,
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

function markCatalogSourcesDeleted(restaurant, sourceType, sourceItemIds) {
  const deletedIds = new Set(
    (Array.isArray(sourceItemIds) ? sourceItemIds : [sourceItemIds])
      .map((id) => cleanString(id))
      .filter(Boolean),
  );
  if (!deletedIds.size) return 0;

  let changed = 0;
  for (const item of restaurant?.takeAwayCatalog || []) {
    if (
      item.sourceType === sourceType &&
      deletedIds.has(String(item.sourceItemId || ""))
    ) {
      item.active = false;
      item.visible = false;
      item.sourceDeleted = true;
      item.syncedWithSource = false;
      item.updatedAt = new Date();
      changed += 1;
    }
  }
  return changed;
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

async function getAvailableSlots({
  restaurant,
  dateKey,
  respectPublicBlock = true,
  respectPreparationTime = true,
  now = new Date(),
}) {
  if (respectPublicBlock && isTakeAwayDateBlocked(restaurant, dateKey)) {
    return [];
  }
  const minimumScheduledTime =
    now.getTime() +
    getPreparationTimeMinutes(getSettings(restaurant)) * 60 * 1000;
  const slots = generateSlotsForDate(restaurant, dateKey).filter(
    (slot) =>
      !respectPreparationTime ||
      slot.scheduledFor.getTime() >= minimumScheduledTime,
  );
  if (!slots.length) return [];

  const start = parseDateKey(dateKey);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const counts = await TakeAwayOrderModel.aggregate([
    {
      $match: {
        restaurant_id: restaurant._id,
        scheduledFor: { $gte: start, $lt: end },
        $or: [
          {
            status: {
              $in: ACTIVE_ORDER_STATUSES.filter((s) => s !== "pending"),
            },
          },
          {
            status: "pending",
            $or: [
              { paymentMethod: { $ne: "online" } },
              { paymentStatus: "paid" },
              {
                paymentStatus: "pending",
                paymentExpiresAt: { $gt: now },
              },
            ],
          },
        ],
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
  if (
    !Array.isArray(rawItems) ||
    !rawItems.length ||
    rawItems.length > MAX_ORDER_ITEMS
  ) {
    const err = new Error("items are required");
    err.status = 400;
    throw err;
  }

  return rawItems.map((rawItem) => {
    const catalogItem = getCatalogItem(restaurant, rawItem.catalogItemId);
    if (
      !catalogItem ||
      catalogItem.active === false ||
      catalogItem.visible === false ||
      catalogItem.sourceDeleted === true
    ) {
      const err = new Error("Catalog item unavailable");
      err.status = 400;
      throw err;
    }

    const quantity = Number(rawItem.quantity);
    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_ITEM_QUANTITY
    ) {
      throw serviceError(
        `La quantité doit être un entier entre 1 et ${MAX_ITEM_QUANTITY}`,
      );
    }
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
    if (optionIds.size + optionNames.size > 1) {
      throw serviceError("Une seule option peut être sélectionnée par article");
    }
    const selectedOptions = (catalogItem.options || []).filter(
      (option) =>
        optionIds.has(String(option._id)) ||
        optionNames.has(cleanString(option.name)),
    );
    const requestedOptionCount = optionIds.size + optionNames.size;
    if (requestedOptionCount && selectedOptions.length !== 1) {
      throw serviceError("Option d'article invalide");
    }
    if ((catalogItem.options || []).length && selectedOptions.length !== 1) {
      throw serviceError("Une option est requise pour cet article");
    }
    const optionsTotal = selectedOptions.reduce(
      (sum, option) => sum + normalizeMoney(option.price, 0),
      0,
    );
    const unitPrice = normalizeMoney(catalogItem.price, 0);
    const effectiveUnitPrice =
      Math.round((unitPrice + optionsTotal) * 100) / 100;
    if (effectiveUnitPrice <= 0) {
      throw serviceError("Le prix de l'article doit être supérieur à 0");
    }
    const lineTotal = Math.round(effectiveUnitPrice * quantity * 100) / 100;

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
      note: assertMaxLength(rawItem.note, "Note article", 300),
    };
  });
}

function getPaymentMethod(settings, requestedPaymentMethod) {
  if (settings.paymentPolicy === "online_required") return "online";
  if (settings.paymentPolicy === "on_site") return "on_site";
  return requestedPaymentMethod === "online" ? "online" : "on_site";
}

function getOrderPaymentMethod(settings, requestedPaymentMethod, source) {
  return source === "dashboard"
    ? "on_site"
    : getPaymentMethod(settings, requestedPaymentMethod);
}

async function validateSlotCapacity({
  restaurant,
  dateKey,
  slotId,
  respectPublicBlock = true,
  respectPreparationTime = true,
}) {
  const availableSlots = await getAvailableSlots({
    restaurant,
    dateKey,
    respectPublicBlock,
    respectPreparationTime,
  });
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

function broadcastOrder(restaurantId, order, type = "takeaway_order_updated") {
  broadcastToRestaurant(String(restaurantId), {
    type,
    restaurantId: String(restaurantId),
    order: order?.toObject ? order.toObject() : order,
  });
}

async function cleanupCompletedTakeAwayOrders(
  restaurant,
  { now = new Date() } = {},
) {
  const settings = getSettings(restaurant);
  const explicitlyEnabled = settings?.completedOrderAutoDeleteEnabled === true;
  const legacyDays = Number(settings?.completedOrderAutoDeleteDays || 0);
  const enabled = explicitlyEnabled || legacyDays > 0;
  if (!enabled) return { enabled: false, deleted: 0 };

  const minutes = explicitlyEnabled
    ? Number(
        settings?.completedOrderAutoDeleteMinutes ||
          DEFAULT_COMPLETED_ORDER_AUTO_DELETE_MINUTES,
      )
    : legacyDays * 24 * 60;
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return { enabled: false, deleted: 0 };
  }

  const before = new Date(now.getTime() - minutes * 60 * 1000);
  const result = await TakeAwayOrderModel.deleteMany({
    restaurant_id: restaurant._id,
    status: "completed",
    $or: [
      { completedAt: { $lte: before } },
      { completedAt: null, updatedAt: { $lte: before } },
    ],
  });
  return { enabled: true, deleted: Number(result?.deletedCount || 0) };
}

async function cleanupConfiguredCompletedTakeAwayOrders({
  now = new Date(),
} = {}) {
  const restaurants = await RestaurantModel.find({
    $or: [
      { "takeAwaySettings.completedOrderAutoDeleteEnabled": true },
      { "takeAwaySettings.completedOrderAutoDeleteDays": { $gt: 0 } },
    ],
  }).select("_id takeAwaySettings");

  let deleted = 0;
  for (const restaurant of restaurants) {
    const result = await cleanupCompletedTakeAwayOrders(restaurant, { now });
    deleted += result.deleted;
  }
  return { checked: restaurants.length, deleted };
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function getIdempotencyPayloadHash(payload = {}) {
  const relevantPayload = { ...payload };
  delete relevantPayload.idempotencyKey;
  return crypto
    .createHash("sha256")
    .update(stableStringify(relevantPayload))
    .digest("hex");
}

function validatePublicAccessToken(value, { required = false } = {}) {
  const token = cleanString(value);
  if (!token && !required) return "";
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) {
    throw serviceError(
      "Jeton public de commande invalide",
      400,
      "INVALID_PUBLIC_ORDER_TOKEN",
    );
  }
  return token;
}

function hashPublicAccessToken(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function publicAccessTokenMatchesHash(token, expectedHash) {
  let tokenHash;
  try {
    tokenHash = Buffer.from(
      hashPublicAccessToken(validatePublicAccessToken(token)),
      "hex",
    );
  } catch {
    return false;
  }
  const expected = Buffer.from(cleanString(expectedHash), "hex");
  return (
    tokenHash.length === expected.length &&
    tokenHash.length > 0 &&
    crypto.timingSafeEqual(tokenHash, expected)
  );
}

async function findPublicOrderByAccessToken({ restaurantId, orderId, token }) {
  if (!restaurantId || !orderId || !token) return null;
  let order;
  try {
    order = await TakeAwayOrderModel.findOne({
      _id: orderId,
      restaurant_id: restaurantId,
      source: "public",
    }).select(
      "+publicAccessTokenHash +pendingCustomerEmailEvents +customerEmailEventsSent",
    );
  } catch {
    return null;
  }
  if (
    !order ||
    !publicAccessTokenMatchesHash(token, order.publicAccessTokenHash)
  ) {
    return null;
  }
  return order;
}

async function findPublicOrderByAttempt({
  restaurantId,
  idempotencyKey,
  token,
}) {
  if (!restaurantId || !idempotencyKey || !token) return null;

  let order;
  try {
    order = await TakeAwayOrderModel.findOne({
      restaurant_id: restaurantId,
      source: "public",
      idempotencyKey: validateIdempotencyKey(idempotencyKey, {
        required: true,
      }),
    }).select(
      "+publicAccessTokenHash +pendingCustomerEmailEvents +customerEmailEventsSent",
    );
  } catch {
    return null;
  }
  if (
    !order ||
    !publicAccessTokenMatchesHash(token, order.publicAccessTokenHash)
  ) {
    return null;
  }
  return order;
}

function validateIdempotencyKey(value, { required = false } = {}) {
  const key = cleanString(value);
  if (!key && !required) return "";
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(key)) {
    throw serviceError(
      "Clé d'idempotence invalide (16 à 128 caractères)",
      400,
      "INVALID_IDEMPOTENCY_KEY",
    );
  }
  return key;
}

function assertIdempotentReplay(existing, payloadHash) {
  if (
    existing?.idempotencyPayloadHash &&
    existing.idempotencyPayloadHash !== payloadHash
  ) {
    throw serviceError(
      "Cette clé d'idempotence est déjà liée à une autre commande",
      409,
      "IDEMPOTENCY_CONFLICT",
    );
  }
  existing.$locals = existing.$locals || {};
  existing.$locals.idempotentReplay = true;
  return existing;
}

function resolveAuthoritativeSlot({
  restaurant,
  payload,
  now = new Date(),
  respectPreparationTime = true,
}) {
  const slotId = cleanString(payload.slotId);
  const match = /^(\d{4}-\d{2}-\d{2})-(\d{2}:\d{2})$/.exec(slotId);
  if (!match) throw serviceError("slotId invalide");

  const [configuredSlot] = generateSlotsForDate(restaurant, match[1]).filter(
    (slot) => slot.slotId === slotId,
  );
  if (!configuredSlot?.scheduledFor) {
    throw serviceError("Créneau indisponible");
  }

  const scheduledFor = new Date(configuredSlot.scheduledFor);
  if (scheduledFor.getTime() <= now.getTime()) {
    throw serviceError("Un créneau passé ne peut pas être commandé");
  }
  const minimumScheduledTime =
    now.getTime() +
    getPreparationTimeMinutes(getSettings(restaurant)) * 60 * 1000;
  if (respectPreparationTime && scheduledFor.getTime() < minimumScheduledTime) {
    throw serviceError(
      "Ce créneau ne laisse pas assez de temps de préparation",
    );
  }

  if (payload.scheduledFor !== undefined && payload.scheduledFor !== null) {
    const clientScheduledFor = new Date(payload.scheduledFor);
    if (
      Number.isNaN(clientScheduledFor.getTime()) ||
      clientScheduledFor.getTime() !== scheduledFor.getTime()
    ) {
      throw serviceError(
        "scheduledFor ne correspond pas au créneau sélectionné",
        400,
        "SLOT_SCHEDULE_MISMATCH",
      );
    }
  }

  return { ...configuredSlot, dateKey: match[1], scheduledFor };
}

async function acquireTakeAwaySlotLock({ restaurantId, slotId }) {
  const owner = crypto.randomUUID();
  const deadline = Date.now() + SLOT_LOCK_WAIT_MS;

  do {
    const now = new Date();
    try {
      const lock = await TakeAwaySlotLockModel.findOneAndUpdate(
        {
          restaurant_id: restaurantId,
          slotId,
          $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
        },
        {
          $set: {
            owner,
            lockedUntil: new Date(now.getTime() + SLOT_LOCK_HOLD_MS),
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
      if (lock && String(lock.owner) === owner) {
        return { restaurantId, slotId, owner };
      }
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }

    if (Date.now() >= deadline) break;
    await sleep(SLOT_LOCK_RETRY_MS);
  } while (Date.now() < deadline);

  throw serviceError(
    "Créneau momentanément occupé, veuillez réessayer",
    409,
    "TAKE_AWAY_SLOT_LOCK_TIMEOUT",
  );
}

async function releaseTakeAwaySlotLock(lock) {
  if (!lock) return;
  await TakeAwaySlotLockModel.deleteOne({
    restaurant_id: lock.restaurantId,
    slotId: lock.slotId,
    owner: lock.owner,
  });
}

async function attachCustomerToOrder(order) {
  if (!order || order.customer || order.securityVersion !== 1) return order;

  try {
    const customer = await upsertCustomer({
      restaurantId: order.restaurant_id,
      firstName: order.customerFirstName,
      lastName: order.customerLastName,
      email: order.customerEmail,
      phone: order.customerPhone,
    });
    if (!customer?._id) return order;

    const idempotentReplay = order?.$locals?.idempotentReplay === true;
    const attached = await TakeAwayOrderModel.findOneAndUpdate(
      {
        _id: order._id,
        restaurant_id: order.restaurant_id,
        customer: null,
      },
      { $set: { customer: customer._id } },
      { new: true },
    );
    const resolvedOrder = attached || order;
    if (idempotentReplay) {
      resolvedOrder.$locals = resolvedOrder.$locals || {};
      resolvedOrder.$locals.idempotentReplay = true;
    }
    return resolvedOrder;
  } catch (error) {
    console.error("[take-away] customer attachment effect failed", {
      orderId: String(order._id),
      error: error?.message || error,
    });
    return order;
  }
}

function getCustomerEmailEventForOrder(order) {
  if (!order || order.source !== "public") return "";
  if (order.status === "confirmed") return "confirmed";
  if (order.status === "rejected") return "rejected";
  if (order.status === "canceled") return "canceled";
  if (order.status === "ready" && order.fulfillmentMode === "pickup") {
    return "ready";
  }
  if (
    order.status === "out_for_delivery" &&
    order.fulfillmentMode === "delivery"
  ) {
    return "out_for_delivery";
  }
  if (
    order.status === "pending" &&
    (order.paymentMethod !== "online" ||
      ["paid", "refunded"].includes(order.paymentStatus))
  ) {
    return "received";
  }
  return "";
}

function getObsoleteCustomerEmailEvents(nextEvent) {
  if (nextEvent === "confirmed") return ["received"];
  if (["rejected", "canceled"].includes(nextEvent)) {
    return ["received", "confirmed", "ready", "out_for_delivery"];
  }
  return [];
}

function addCustomerEmailQueueUpdate(update, eventType) {
  if (!eventType) return update;
  update.$addToSet = {
    ...(update.$addToSet || {}),
    pendingCustomerEmailEvents: eventType,
  };
  return update;
}

async function runOrderEmailEffects(order, restaurant, explicitEvents = null) {
  const events = Array.from(
    new Set(
      (Array.isArray(explicitEvents)
        ? explicitEvents
        : order?.pendingCustomerEmailEvents || []
      ).filter(Boolean),
    ),
  );

  for (const eventType of [...events]) {
    for (const obsoleteEvent of getObsoleteCustomerEmailEvents(eventType)) {
      const obsoleteIndex = events.indexOf(obsoleteEvent);
      if (obsoleteIndex !== -1) events.splice(obsoleteIndex, 1);
    }
  }

  for (const eventType of events) {
    let claimed;
    try {
      const obsoleteEvents = getObsoleteCustomerEmailEvents(eventType);
      if (obsoleteEvents.length) {
        await TakeAwayOrderModel.updateOne(
          { _id: order._id },
          { $pull: { pendingCustomerEmailEvents: { $in: obsoleteEvents } } },
        );
      }
      claimed = await TakeAwayOrderModel.findOneAndUpdate(
        {
          _id: order._id,
          source: "public",
          pendingCustomerEmailEvents: eventType,
          customerEmailEventsSent: { $ne: eventType },
        },
        {
          $pull: { pendingCustomerEmailEvents: eventType },
          $addToSet: { customerEmailEventsSent: eventType },
        },
        { new: true },
      );
      if (!claimed) {
        await TakeAwayOrderModel.updateOne(
          { _id: order._id, customerEmailEventsSent: eventType },
          { $pull: { pendingCustomerEmailEvents: eventType } },
        );
        continue;
      }

      const result = await sendTakeAwayOrderEmail({
        eventType,
        order: claimed,
        restaurant,
      });
      if (result?.skipped && result.reason === "missing_brevo_key") {
        throw serviceError("Configuration Brevo absente", 503);
      }
    } catch (error) {
      if (claimed) {
        await TakeAwayOrderModel.updateOne(
          { _id: order._id, customerEmailEventsSent: eventType },
          {
            $pull: { customerEmailEventsSent: eventType },
            $addToSet: { pendingCustomerEmailEvents: eventType },
          },
        ).catch(() => {});
      }
      console.error("[take-away] customer email effect failed", {
        orderId: String(order._id),
        eventType,
        error: error?.message || error,
      });
    }
  }
}

async function runOrderActivationEffects(
  order,
  restaurant,
  explicitEmailEvents = null,
) {
  if (!order || !restaurant) return;

  order = await attachCustomerToOrder(order);

  if (order.customer && !order.crmRecordedAt) {
    try {
      await onTakeAwayOrderCreated(order.customer, order);
      order.crmRecordedAt = new Date();
      await order.save();
    } catch (error) {
      console.error("[take-away] CRM creation effect failed", {
        orderId: String(order._id),
        error: error?.message || error,
      });
    }
  }

  if (order.source === "public" && !order.restaurantNotifiedAt) {
    try {
      await createAndBroadcastNotification({
        restaurantId: restaurant._id,
        module: "take_away",
        type: "takeaway_order_created",
        data: order.toObject ? order.toObject() : order,
        dedupeKey: `takeaway_order:${String(order._id)}:created`,
      });
      order.restaurantNotifiedAt = new Date();
      await order.save();
    } catch (error) {
      console.error("[take-away] notification effect failed", {
        orderId: String(order._id),
        error: error?.message || error,
      });
    }
  }

  try {
    broadcastOrder(restaurant._id, order, "takeaway_order_created");
  } catch (error) {
    console.error("[take-away] SSE creation effect failed", {
      orderId: String(order._id),
      error: error?.message || error,
    });
  }

  await runOrderEmailEffects(order, restaurant, explicitEmailEvents);
}

async function createTakeAwayOrder({ restaurant, payload, source = "public" }) {
  const settings = getSettings(restaurant);
  const publicAccessToken = validatePublicAccessToken(
    payload.publicAccessToken,
    { required: source === "public" },
  );
  const idempotencyKey = validateIdempotencyKey(payload.idempotencyKey, {
    required: source === "public",
  });
  const idempotencyPayloadHash = getIdempotencyPayloadHash(payload);
  if (idempotencyKey) {
    const existing = await TakeAwayOrderModel.findOne({
      restaurant_id: restaurant._id,
      idempotencyKey,
    });
    if (existing) {
      return attachCustomerToOrder(
        assertIdempotentReplay(existing, idempotencyPayloadHash),
      );
    }
  }

  if (!restaurant?.options?.take_away) {
    throw serviceError("Module vente à emporter indisponible", 403);
  }
  if (source === "public" && !settings.enabled) {
    throw serviceError("Commande en ligne indisponible", 403);
  }

  const contact = validateCustomerInput(payload);
  const fulfillmentMode =
    payload.fulfillmentMode === "delivery" ? "delivery" : "pickup";
  if (fulfillmentMode === "pickup" && settings.pickupEnabled === false) {
    throw serviceError("Retrait indisponible");
  }
  if (fulfillmentMode === "delivery" && settings.deliveryEnabled !== true) {
    throw serviceError("Livraison indisponible");
  }

  const authoritativeSlot = resolveAuthoritativeSlot({
    restaurant,
    payload,
    respectPreparationTime: source === "public",
  });
  if (
    source === "public" &&
    isTakeAwayDateBlocked(restaurant, authoritativeSlot.dateKey)
  ) {
    throw serviceError(
      "Les commandes en ligne sont bloquées pour cette date",
      403,
      "TAKE_AWAY_DATE_BLOCKED",
    );
  }
  const items = buildOrderItems(restaurant, payload.items);
  const subtotal =
    Math.round(items.reduce((sum, item) => sum + item.lineTotal, 0) * 100) /
    100;

  let deliveryFee = 0;
  let deliveryZone = null;
  let deliveryAddress = {};
  if (fulfillmentMode === "delivery") {
    deliveryAddress = validateDeliveryAddress(payload.deliveryAddress || {});
    deliveryZone = findDeliveryZone(settings, deliveryAddress.zipCode);
    if (!deliveryZone) throw serviceError("Zone de livraison non couverte");
    if (
      payload.deliveryZoneId &&
      String(payload.deliveryZoneId) !== String(deliveryZone._id)
    ) {
      throw serviceError("Zone de livraison contradictoire");
    }
    if (subtotal < normalizeMoney(deliveryZone.minimumOrder, 0)) {
      throw serviceError("Minimum de commande livraison non atteint");
    }
    deliveryFee = normalizeMoney(deliveryZone.fee, 0);
  } else if (subtotal < normalizeMoney(settings.minimumPickupOrder, 0)) {
    throw serviceError("Minimum de commande retrait non atteint");
  }

  const paymentMethod = getOrderPaymentMethod(
    settings,
    payload.paymentMethod,
    source,
  );
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
  const total = Math.round((subtotal + deliveryFee) * 100) / 100;
  const initialEmailEvent = getCustomerEmailEventForOrder({
    source,
    status,
    paymentStatus,
    paymentMethod,
    fulfillmentMode,
  });

  const lock = await acquireTakeAwaySlotLock({
    restaurantId: restaurant._id,
    slotId: authoritativeSlot.slotId,
  });
  let order;
  let created = false;
  try {
    if (idempotencyKey) {
      const racedExisting = await TakeAwayOrderModel.findOne({
        restaurant_id: restaurant._id,
        idempotencyKey,
      });
      if (racedExisting) {
        order = assertIdempotentReplay(racedExisting, idempotencyPayloadHash);
      }
    }

    if (!order) {
      const currentSlot = await validateSlotCapacity({
        restaurant,
        dateKey: authoritativeSlot.dateKey,
        slotId: authoritativeSlot.slotId,
        respectPublicBlock: source === "public",
        respectPreparationTime: source === "public",
      });
      if (new Date(currentSlot.scheduledFor).getTime() <= Date.now()) {
        throw serviceError("Un créneau passé ne peut pas être commandé");
      }

      try {
        order = await TakeAwayOrderModel.create({
          restaurant_id: restaurant._id,
          orderNumber: generateOrderNumber(),
          customer: null,
          ...contact,
          fulfillmentMode,
          status,
          ...getStatusTimestampUpdate(status),
          paymentStatus,
          paymentMethod,
          paymentExpiresAt:
            paymentStatus === "pending"
              ? new Date(Date.now() + TAKE_AWAY_PAYMENT_PENDING_TTL_MS)
              : null,
          scheduledFor: authoritativeSlot.scheduledFor,
          slotId: authoritativeSlot.slotId,
          items,
          subtotal,
          deliveryFee,
          total,
          deliveryAddress,
          deliveryZoneId: deliveryZone?._id ? String(deliveryZone._id) : "",
          customerNote: assertMaxLength(
            payload.customerNote,
            "Note client",
            500,
          ),
          restaurantNote: assertMaxLength(
            payload.restaurantNote,
            "Note restaurant",
            500,
          ),
          source,
          publicAccessTokenHash: publicAccessToken
            ? hashPublicAccessToken(publicAccessToken)
            : "",
          pendingCustomerEmailEvents: initialEmailEvent
            ? [initialEmailEvent]
            : [],
          securityVersion: 1,
          idempotencyKey,
          idempotencyPayloadHash,
        });
        created = true;
      } catch (error) {
        if (error?.code !== 11000 || !idempotencyKey) throw error;
        const duplicate = await TakeAwayOrderModel.findOne({
          restaurant_id: restaurant._id,
          idempotencyKey,
        });
        if (!duplicate) throw error;
        order = assertIdempotentReplay(duplicate, idempotencyPayloadHash);
      }
    }
  } finally {
    await releaseTakeAwaySlotLock(lock).catch((error) =>
      console.error(
        "[take-away] slot lock release failed",
        error?.message || error,
      ),
    );
  }

  order = await attachCustomerToOrder(order);
  if (created && paymentStatus !== "pending") {
    await runOrderActivationEffects(
      order,
      restaurant,
      initialEmailEvent ? [initialEmailEvent] : [],
    );
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

function getStripeForRestaurant(restaurant, stripeInstance = null) {
  if (stripeInstance) return stripeInstance;
  const stripeSecretKey = getRestaurantStripeSecretKey(restaurant);
  if (!stripeSecretKey) {
    throw serviceError("Clé Stripe restaurant introuvable", 400);
  }
  return new Stripe(stripeSecretKey);
}

function getExpectedPaymentAmount(order) {
  return Math.round(normalizeMoney(order?.total, 0) * 100);
}

function assertPaymentIntentMatchesOrder(
  paymentIntent,
  order,
  { requireSucceeded = true } = {},
) {
  if (!paymentIntent || !order?.stripePaymentIntentId) {
    throw serviceError("PaymentIntent de la commande introuvable", 409);
  }
  if (String(paymentIntent.id) !== String(order.stripePaymentIntentId)) {
    throw serviceError("PaymentIntent non correspondant", 400);
  }
  if (requireSucceeded && paymentIntent.status !== "succeeded") {
    throw serviceError("Paiement non confirmé", 409);
  }

  const expectedAmount = getExpectedPaymentAmount(order);
  if (Number(paymentIntent.amount) !== expectedAmount) {
    throw serviceError("Montant du paiement non correspondant", 400);
  }
  if (
    requireSucceeded &&
    Number(paymentIntent.amount_received) !== expectedAmount
  ) {
    throw serviceError("Montant encaissé non correspondant", 400);
  }
  if (
    cleanString(paymentIntent.currency).toLowerCase() !==
    cleanString(order.currency || "eur").toLowerCase()
  ) {
    throw serviceError("Devise du paiement non correspondante", 400);
  }

  const metadata = paymentIntent.metadata || {};
  if (
    metadata.type !== "takeaway_order" ||
    String(metadata.restaurantId || "") !== String(order.restaurant_id) ||
    String(metadata.orderId || "") !== String(order._id)
  ) {
    throw serviceError("Métadonnées du paiement non correspondantes", 400);
  }
  return true;
}

function isPaymentIntentReusable(paymentIntent) {
  return [
    "requires_payment_method",
    "requires_confirmation",
    "requires_action",
    "processing",
    "requires_capture",
    "succeeded",
  ].includes(paymentIntent?.status);
}

async function createOrderPaymentIntent({
  restaurant,
  order,
  stripeInstance = null,
}) {
  if (!order || order.paymentMethod !== "online") {
    throw serviceError("Paiement en ligne non requis");
  }
  if (["paid", "refunded"].includes(order.paymentStatus)) {
    if (!order.stripePaymentIntentId) {
      throw serviceError("État de paiement incohérent", 409);
    }
  } else if (
    order.status !== "pending" ||
    !order.paymentExpiresAt ||
    new Date(order.paymentExpiresAt).getTime() <= Date.now()
  ) {
    throw serviceError("Délai de paiement expiré", 409, "PAYMENT_EXPIRED");
  }

  const stripe = getStripeForRestaurant(restaurant, stripeInstance);
  let previousPaymentIntent = null;
  if (order.stripePaymentIntentId) {
    try {
      previousPaymentIntent = await stripe.paymentIntents.retrieve(
        order.stripePaymentIntentId,
      );
      assertPaymentIntentMatchesOrder(previousPaymentIntent, order, {
        requireSucceeded: false,
      });
      if (isPaymentIntentReusable(previousPaymentIntent)) {
        if (previousPaymentIntent.status === "succeeded") {
          await finalizePaidOrder({
            restaurant,
            order,
            paymentIntent: previousPaymentIntent,
          });
        } else if (order.paymentStatus === "failed") {
          order.paymentStatus = "pending";
          order.paymentFailedAt = null;
          await order.save();
        }
        return previousPaymentIntent;
      }
    } catch (error) {
      const missing =
        String(error?.code || error?.raw?.code || "") === "resource_missing";
      if (!missing) throw error;
    }
  }

  const replacementSuffix = previousPaymentIntent?.id
    ? `-after-${previousPaymentIntent.id}`
    : "";
  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: getExpectedPaymentAmount(order),
      currency: order.currency || "eur",
      automatic_payment_methods: { enabled: true },
      metadata: {
        type: "takeaway_order",
        orderId: String(order._id),
        orderNumber: order.orderNumber,
        restaurantId: String(order.restaurant_id),
      },
    },
    {
      idempotencyKey: `takeaway-order-${String(order._id)}-payment${replacementSuffix}`,
    },
  );

  order.stripePaymentIntentId = paymentIntent.id;
  order.paymentStatus = "pending";
  order.paymentFailedAt = null;
  await order.save();

  return paymentIntent;
}

async function finalizePaidOrder({
  restaurant,
  order,
  paymentIntent,
  activate = true,
}) {
  assertPaymentIntentMatchesOrder(paymentIntent, order);
  if (order.paymentStatus === "refunded") {
    return order;
  }

  const nextStatus =
    order.status === "pending" && getSettings(restaurant)?.auto_accept !== false
      ? "confirmed"
      : order.status;
  const now = new Date();
  const set = {
    paymentStatus: "paid",
    paidAt: order.paidAt || now,
    paymentFailedAt: null,
    paymentExpiresAt: null,
    status: nextStatus,
  };
  if (nextStatus === "confirmed" && !order.confirmedAt) set.confirmedAt = now;
  const emailEvent = getCustomerEmailEventForOrder({
    ...(order.toObject ? order.toObject() : order),
    paymentStatus: "paid",
    status: nextStatus,
  });

  const finalized = await TakeAwayOrderModel.findOneAndUpdate(
    {
      _id: order._id,
      restaurant_id: order.restaurant_id,
      stripePaymentIntentId: paymentIntent.id,
      paymentStatus: { $nin: ["paid", "refunded"] },
    },
    addCustomerEmailQueueUpdate({ $set: set }, emailEvent),
    { new: true },
  );
  const resolved =
    finalized ||
    (await TakeAwayOrderModel.findOne({
      _id: order._id,
      restaurant_id: order.restaurant_id,
    }));

  if (!resolved || !["paid", "refunded"].includes(resolved.paymentStatus)) {
    throw serviceError("Le paiement n'a pas pu être enregistré", 409);
  }
  if (!finalized && emailEvent) {
    await TakeAwayOrderModel.updateOne(
      { _id: resolved._id, customerEmailEventsSent: { $ne: emailEvent } },
      { $addToSet: { pendingCustomerEmailEvents: emailEvent } },
    );
  }
  if (
    resolved.paymentStatus === "paid" &&
    ["canceled", "rejected"].includes(resolved.status)
  ) {
    return refundPaidOrder({
      restaurant,
      order: resolved,
      targetStatus: resolved.status,
    });
  }
  if (resolved.paymentStatus === "paid" && activate) {
    await runOrderActivationEffects(resolved, restaurant, [emailEvent]);
  }
  return resolved;
}

async function confirmOrderPayment({
  restaurant,
  restaurantId,
  orderId,
  paymentIntentId,
  stripeInstance = null,
}) {
  if (!restaurant) {
    throw serviceError("Restaurant requis pour vérifier le paiement", 500);
  }
  const resolvedRestaurantId = restaurant._id || restaurantId;
  const order = await TakeAwayOrderModel.findOne({
    _id: orderId,
    restaurant_id: resolvedRestaurantId,
    source: "public",
  });

  if (!order) {
    const err = new Error("Commande introuvable");
    err.status = 404;
    throw err;
  }

  if (order.paymentMethod !== "online") {
    throw serviceError("Paiement en ligne non requis");
  }
  if (!order.stripePaymentIntentId) {
    throw serviceError("PaymentIntent de la commande introuvable", 409);
  }
  if (
    paymentIntentId &&
    String(paymentIntentId) !== String(order.stripePaymentIntentId)
  ) {
    throw serviceError("PaymentIntent non correspondant");
  }

  const stripe = getStripeForRestaurant(restaurant, stripeInstance);
  const paymentIntent = await stripe.paymentIntents.retrieve(
    order.stripePaymentIntentId,
  );
  return finalizePaidOrder({ restaurant, order, paymentIntent });
}

function assertStatusTransition(order, nextStatus) {
  const allowed = STATUS_TRANSITIONS[order?.status];
  if (!allowed || !allowed.includes(nextStatus)) {
    throw serviceError(
      `Transition de statut interdite (${order?.status || "inconnu"} → ${nextStatus})`,
      409,
      "INVALID_STATUS_TRANSITION",
    );
  }
  if (
    nextStatus === "out_for_delivery" &&
    order.fulfillmentMode !== "delivery"
  ) {
    throw serviceError(
      "Un retrait ne peut pas passer en livraison",
      409,
      "INVALID_FULFILLMENT_TRANSITION",
    );
  }
  if (
    order.paymentMethod === "online" &&
    !["paid", "refunded"].includes(order.paymentStatus) &&
    !["canceled", "rejected"].includes(nextStatus)
  ) {
    throw serviceError("La commande doit être payée avant traitement", 409);
  }
  return true;
}

function getStatusTimestampUpdate(status, now = new Date()) {
  const fields = {
    confirmed: "confirmedAt",
    preparing: "preparingAt",
    ready: "readyAt",
    out_for_delivery: "outForDeliveryAt",
    completed: "completedAt",
    canceled: "canceledAt",
    rejected: "rejectedAt",
  };
  return fields[status] ? { [fields[status]]: now } : {};
}

async function runOrderStatusEffects(
  order,
  restaurantOrId,
  explicitEmailEvents = null,
) {
  const restaurantId = restaurantOrId?._id || restaurantOrId;
  const prevStatus = cleanString(order?.pendingCrmPrevStatus);
  const nextStatus = cleanString(order?.pendingCrmNextStatus);
  const crmOrderWasRecorded =
    order?.securityVersion !== 1 || Boolean(order?.crmRecordedAt);
  if (crmOrderWasRecorded && prevStatus && nextStatus) {
    try {
      await onTakeAwayOrderStatusChanged(
        order.customer,
        order,
        prevStatus,
        nextStatus,
      );
      await TakeAwayOrderModel.updateOne(
        {
          _id: order._id,
          pendingCrmPrevStatus: prevStatus,
          pendingCrmNextStatus: nextStatus,
        },
        {
          $set: { pendingCrmPrevStatus: "", pendingCrmNextStatus: "" },
        },
      );
      order.pendingCrmPrevStatus = "";
      order.pendingCrmNextStatus = "";
    } catch (error) {
      console.error("[take-away] CRM status effect failed", {
        orderId: String(order._id),
        error: error?.message || error,
      });
    }
  }

  try {
    broadcastOrder(restaurantId, order);
  } catch (error) {
    console.error(
      "[take-away] SSE status effect failed",
      error?.message || error,
    );
  }

  if (restaurantOrId?._id) {
    await runOrderEmailEffects(order, restaurantOrId, explicitEmailEvents);
  }
}

function assertRefundMatchesOrder(refund, order) {
  const refundPaymentIntentId =
    typeof refund?.payment_intent === "object"
      ? refund.payment_intent?.id
      : refund?.payment_intent;
  if (
    !refund ||
    String(refundPaymentIntentId || "") !== String(order.stripePaymentIntentId)
  ) {
    throw serviceError("Remboursement non correspondant", 400);
  }
  if (Number(refund.amount) !== getExpectedPaymentAmount(order)) {
    throw serviceError("Montant du remboursement non correspondant", 400);
  }
  if (
    refund.currency &&
    cleanString(refund.currency).toLowerCase() !==
      cleanString(order.currency || "eur").toLowerCase()
  ) {
    throw serviceError("Devise du remboursement non correspondante", 400);
  }
  const metadata = refund.metadata || {};
  if (
    metadata.type !== "takeaway_order_refund" ||
    String(metadata.restaurantId || "") !== String(order.restaurant_id) ||
    String(metadata.orderId || "") !== String(order._id)
  ) {
    throw serviceError("Métadonnées du remboursement non correspondantes", 400);
  }
}

async function applyRefundBusinessDecision({ order, targetStatus }) {
  if (!["canceled", "rejected"].includes(targetStatus)) {
    throw serviceError("Statut de remboursement invalide", 400);
  }
  if (order.refundTargetStatus && order.refundTargetStatus !== targetStatus) {
    throw serviceError("Un autre remboursement est déjà en cours", 409);
  }

  const previousStatus = order.status;
  const statusChanged = previousStatus !== targetStatus;
  const emailEvent = getCustomerEmailEventForOrder({
    ...(order.toObject ? order.toObject() : order),
    status: targetStatus,
    paymentStatus: "paid",
    stripeRefundStatus: "pending",
    refundTargetStatus: targetStatus,
  });
  const updated = await TakeAwayOrderModel.findOneAndUpdate(
    {
      _id: order._id,
      restaurant_id: order.restaurant_id,
      paymentStatus: "paid",
      status: previousStatus,
    },
    addCustomerEmailQueueUpdate(
      {
        $set: {
          status: targetStatus,
          refundTargetStatus: targetStatus,
          stripeRefundStatus: statusChanged
            ? "pending"
            : order.stripeRefundStatus || "pending",
          ...(statusChanged && order.customer
            ? {
                pendingCrmPrevStatus: previousStatus,
                pendingCrmNextStatus: targetStatus,
              }
            : {}),
          ...(statusChanged ? getStatusTimestampUpdate(targetStatus) : {}),
        },
      },
      emailEvent,
    ),
    { new: true },
  );
  const resolved =
    updated ||
    (await TakeAwayOrderModel.findOne({
      _id: order._id,
      restaurant_id: order.restaurant_id,
    }));
  if (
    !resolved ||
    resolved.status !== targetStatus ||
    !["paid", "refunded"].includes(resolved.paymentStatus)
  ) {
    throw serviceError("La décision métier n'a pas pu être enregistrée", 409);
  }

  return { order: resolved, emailEvent };
}

async function finalizeRefund({ restaurant, order, refund, targetStatus }) {
  assertRefundMatchesOrder(refund, order);
  if (refund.status !== "succeeded") {
    throw serviceError(
      `Remboursement Stripe non finalisé (${refund.status || "inconnu"})`,
      409,
      "REFUND_NOT_SUCCEEDED",
    );
  }

  const now = new Date();
  const resolvedTarget = ["canceled", "rejected"].includes(targetStatus)
    ? targetStatus
    : "canceled";
  const statusChanged = order.status !== resolvedTarget;
  const emailEvent = getCustomerEmailEventForOrder({
    ...(order.toObject ? order.toObject() : order),
    paymentStatus: "refunded",
    status: resolvedTarget,
  });
  const updated = await TakeAwayOrderModel.findOneAndUpdate(
    {
      _id: order._id,
      restaurant_id: order.restaurant_id,
      stripePaymentIntentId: order.stripePaymentIntentId,
      paymentStatus: { $ne: "refunded" },
    },
    addCustomerEmailQueueUpdate(
      {
        $set: {
          paymentStatus: "refunded",
          refundedAt: now,
          stripeRefundId: refund.id,
          stripeRefundStatus: refund.status,
          refundTargetStatus: resolvedTarget,
          status: resolvedTarget,
          ...(statusChanged && order.customer
            ? {
                pendingCrmPrevStatus: order.status,
                pendingCrmNextStatus: resolvedTarget,
              }
            : {}),
          ...(statusChanged
            ? getStatusTimestampUpdate(resolvedTarget, now)
            : {}),
        },
      },
      emailEvent,
    ),
    { new: true },
  );
  const resolved =
    updated ||
    (await TakeAwayOrderModel.findOne({
      _id: order._id,
      restaurant_id: order.restaurant_id,
    }));
  if (!resolved || resolved.paymentStatus !== "refunded") {
    throw serviceError("Remboursement Stripe reçu mais non enregistré", 500);
  }

  if (updated) {
    await runOrderStatusEffects(resolved, restaurant, [emailEvent]);
  }
  return resolved;
}

async function refundPaidOrder({
  restaurant,
  order,
  targetStatus,
  stripeInstance = null,
}) {
  if (order.paymentStatus === "refunded") return order;
  if (order.paymentStatus !== "paid" || !order.stripePaymentIntentId) {
    throw serviceError("Aucun paiement encaissé à rembourser", 409);
  }

  const decision = await applyRefundBusinessDecision({ order, targetStatus });
  order = decision.order;
  if (order.paymentStatus === "refunded") return order;
  if (
    order.stripeRefundId &&
    !["failed", "canceled"].includes(order.stripeRefundStatus)
  ) {
    await runOrderStatusEffects(
      order,
      restaurant,
      decision.emailEvent ? [decision.emailEvent] : [],
    );
    return order;
  }

  const previousFailedRefundId = cleanString(order.stripeRefundId);
  const refundIdempotencyKey = `takeaway-order-${String(order._id)}-refund${
    previousFailedRefundId ? `-after-${previousFailedRefundId}` : ""
  }`;

  let refund;
  try {
    const stripe = getStripeForRestaurant(restaurant, stripeInstance);
    refund = await stripe.refunds.create(
      {
        payment_intent: order.stripePaymentIntentId,
        metadata: {
          type: "takeaway_order_refund",
          restaurantId: String(order.restaurant_id),
          orderId: String(order._id),
          targetStatus,
        },
      },
      { idempotencyKey: refundIdempotencyKey },
    );
    assertRefundMatchesOrder(refund, order);
  } catch (error) {
    console.error("[take-away] Stripe refund attempt failed", {
      orderId: String(order._id),
      error: error?.raw?.message || error?.message || error,
    });
    const failed =
      (await TakeAwayOrderModel.findOneAndUpdate(
        {
          _id: order._id,
          restaurant_id: order.restaurant_id,
          paymentStatus: "paid",
          stripeRefundId: { $in: ["", null] },
        },
        { $set: { stripeRefundStatus: "failed" } },
        { new: true },
      )) ||
      (await TakeAwayOrderModel.findOne({
        _id: order._id,
        restaurant_id: order.restaurant_id,
      }));
    await runOrderStatusEffects(
      failed || order,
      restaurant,
      decision.emailEvent ? [decision.emailEvent] : [],
    );
    return failed || order;
  }

  if (refund.status === "succeeded") {
    return finalizeRefund({ restaurant, order, refund, targetStatus });
  }

  const pending =
    (await TakeAwayOrderModel.findOneAndUpdate(
      {
        _id: order._id,
        restaurant_id: order.restaurant_id,
        paymentStatus: "paid",
      },
      {
        $set: {
          stripeRefundId: refund.id || "",
          stripeRefundStatus: refund.status || "pending",
        },
      },
      { new: true },
    )) ||
    (await TakeAwayOrderModel.findOne({
      _id: order._id,
      restaurant_id: order.restaurant_id,
    }));
  await runOrderStatusEffects(
    pending || order,
    restaurant,
    decision.emailEvent ? [decision.emailEvent] : [],
  );
  return pending || order;
}

async function prepareUnpaidOnlineOrderForTerminalStatus({
  restaurant,
  order,
  targetStatus,
}) {
  if (!order.stripePaymentIntentId) {
    return {
      terminalOrder: null,
      paymentUpdate: {
        paymentStatus: "failed",
        paymentFailedAt: new Date(),
        paymentExpiresAt: new Date(),
      },
    };
  }

  const stripe = getStripeForRestaurant(restaurant);
  let paymentIntent = await stripe.paymentIntents.retrieve(
    order.stripePaymentIntentId,
  );
  assertPaymentIntentMatchesOrder(paymentIntent, order, {
    requireSucceeded: false,
  });

  if (paymentIntent.status === "succeeded") {
    const paidOrder = await finalizePaidOrder({
      restaurant,
      order,
      paymentIntent,
      activate: false,
    });
    return {
      terminalOrder: await refundPaidOrder({
        restaurant,
        order: paidOrder,
        targetStatus,
      }),
      paymentUpdate: null,
    };
  }

  if (paymentIntent.status !== "canceled") {
    try {
      await stripe.paymentIntents.cancel(
        paymentIntent.id,
        {},
        {
          idempotencyKey: `takeaway-order-${String(order._id)}-${targetStatus}-payment`,
        },
      );
    } catch (error) {
      paymentIntent = await stripe.paymentIntents.retrieve(
        order.stripePaymentIntentId,
      );
      if (paymentIntent.status === "succeeded") {
        const paidOrder = await finalizePaidOrder({
          restaurant,
          order,
          paymentIntent,
          activate: false,
        });
        return {
          terminalOrder: await refundPaidOrder({
            restaurant,
            order: paidOrder,
            targetStatus,
          }),
          paymentUpdate: null,
        };
      }
      if (paymentIntent.status !== "canceled") {
        throw serviceError(
          `Impossible d'annuler le paiement Stripe: ${error?.raw?.message || error?.message || "erreur inconnue"}`,
          502,
          "PAYMENT_CANCELLATION_FAILED",
        );
      }
    }
  }

  const now = new Date();
  return {
    terminalOrder: null,
    paymentUpdate: {
      paymentStatus: "failed",
      paymentFailedAt: now,
      paymentExpiresAt: now,
    },
  };
}

async function updateOrderStatus({
  restaurant,
  restaurantId,
  orderId,
  status,
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

  if (order.status === status) {
    if (
      ["canceled", "rejected"].includes(status) &&
      order.paymentMethod === "online" &&
      order.paymentStatus === "paid"
    ) {
      if (!restaurant)
        throw serviceError("Restaurant requis pour rembourser", 500);
      return refundPaidOrder({ restaurant, order, targetStatus: status });
    }
    const emailEvent = getCustomerEmailEventForOrder(order);
    if (emailEvent) {
      await TakeAwayOrderModel.updateOne(
        { _id: order._id, customerEmailEventsSent: { $ne: emailEvent } },
        { $addToSet: { pendingCustomerEmailEvents: emailEvent } },
      );
    }
    await runOrderStatusEffects(
      order,
      restaurant || resolvedRestaurantId,
      emailEvent ? [emailEvent] : [],
    );
    return order;
  }
  assertStatusTransition(order, status);

  if (
    ["canceled", "rejected"].includes(status) &&
    order.paymentMethod === "online" &&
    order.paymentStatus === "paid"
  ) {
    if (!restaurant)
      throw serviceError("Restaurant requis pour rembourser", 500);
    return refundPaidOrder({ restaurant, order, targetStatus: status });
  }

  let paymentUpdate = {};
  if (
    ["canceled", "rejected"].includes(status) &&
    order.paymentMethod === "online" &&
    !["paid", "refunded"].includes(order.paymentStatus)
  ) {
    if (!restaurant)
      throw serviceError("Restaurant requis pour annuler le paiement", 500);
    const prepared = await prepareUnpaidOnlineOrderForTerminalStatus({
      restaurant,
      order,
      targetStatus: status,
    });
    if (prepared.terminalOrder) return prepared.terminalOrder;
    paymentUpdate = prepared.paymentUpdate;
  }

  const prevStatus = order.status;
  const emailEvent = getCustomerEmailEventForOrder({
    ...(order.toObject ? order.toObject() : order),
    ...paymentUpdate,
    status,
  });
  const updated = await TakeAwayOrderModel.findOneAndUpdate(
    { _id: order._id, restaurant_id: resolvedRestaurantId, status: prevStatus },
    addCustomerEmailQueueUpdate(
      {
        $set: {
          status,
          ...paymentUpdate,
          ...(order.customer
            ? {
                pendingCrmPrevStatus: prevStatus,
                pendingCrmNextStatus: status,
              }
            : {}),
          ...getStatusTimestampUpdate(status),
        },
      },
      emailEvent,
    ),
    { new: true },
  );
  if (!updated) {
    const racedOrder = await TakeAwayOrderModel.findOne({
      _id: order._id,
      restaurant_id: resolvedRestaurantId,
    });
    if (racedOrder?.status === status) {
      if (emailEvent) {
        await TakeAwayOrderModel.updateOne(
          { _id: racedOrder._id, customerEmailEventsSent: { $ne: emailEvent } },
          { $addToSet: { pendingCustomerEmailEvents: emailEvent } },
        );
      }
      await runOrderStatusEffects(
        racedOrder,
        restaurant || resolvedRestaurantId,
        emailEvent ? [emailEvent] : [],
      );
      return racedOrder;
    }
    throw serviceError("La commande a été modifiée, veuillez réessayer", 409);
  }

  await runOrderStatusEffects(
    updated,
    restaurant || resolvedRestaurantId,
    emailEvent ? [emailEvent] : [],
  );
  return updated;
}

function getTakeAwayWebhookSecret(restaurantId, env = process.env) {
  const fallback = cleanString(env.STRIPE_TAKE_AWAY_WEBHOOK_SECRET);
  const rawMap = cleanString(env.STRIPE_TAKE_AWAY_WEBHOOK_SECRETS_JSON);
  if (!rawMap) return fallback;

  let secrets;
  try {
    secrets = JSON.parse(rawMap);
  } catch {
    throw serviceError(
      "Configuration des secrets webhook take-away invalide",
      500,
    );
  }
  return cleanString(secrets?.[String(restaurantId)]) || fallback;
}

function getStripeObjectMetadata(object) {
  return object?.metadata || {};
}

function verifyTakeAwayWebhookSignature({
  stripe,
  rawBody,
  signature,
  webhookSecret,
}) {
  try {
    return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    throw serviceError("Signature webhook Stripe invalide", 400);
  }
}

async function constructTakeAwayWebhookEvent({
  rawBody,
  signature,
  env = process.env,
}) {
  if (!Buffer.isBuffer(rawBody) || !signature) {
    throw serviceError("Signature webhook Stripe manquante", 400);
  }

  let unsignedEvent;
  try {
    unsignedEvent = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw serviceError("Payload webhook Stripe invalide", 400);
  }
  const unsignedObject = unsignedEvent?.data?.object;
  const restaurantId = cleanString(
    getStripeObjectMetadata(unsignedObject).restaurantId,
  );
  if (!restaurantId) {
    throw serviceError("Restaurant webhook Stripe introuvable", 400);
  }

  const webhookSecret = getTakeAwayWebhookSecret(restaurantId, env);
  if (!webhookSecret) {
    throw serviceError("Secret webhook take-away non configuré", 503);
  }

  const stripe = new Stripe("sk_test_take_away_webhook_verification");
  const event = verifyTakeAwayWebhookSignature({
    stripe,
    rawBody,
    signature,
    webhookSecret,
  });

  const verifiedRestaurantId = cleanString(
    getStripeObjectMetadata(event?.data?.object).restaurantId,
  );
  if (verifiedRestaurantId !== restaurantId) {
    throw serviceError("Restaurant webhook Stripe non correspondant", 400);
  }
  const restaurant = await loadRestaurantForTakeAway(verifiedRestaurantId);
  if (!restaurant) throw serviceError("Restaurant introuvable", 404);
  return { event, restaurant };
}

async function loadWebhookOrder(restaurant, stripeObject) {
  const metadata = getStripeObjectMetadata(stripeObject);
  const order = await TakeAwayOrderModel.findOne({
    _id: cleanString(metadata.orderId),
    restaurant_id: restaurant._id,
  });
  if (!order) throw serviceError("Commande webhook introuvable", 404);
  return order;
}

async function markPaymentAttemptFailed({
  restaurant,
  paymentIntent,
  canceled = false,
}) {
  const order = await loadWebhookOrder(restaurant, paymentIntent);
  assertPaymentIntentMatchesOrder(paymentIntent, order, {
    requireSucceeded: false,
  });
  if (["paid", "refunded"].includes(order.paymentStatus)) return order;

  const now = new Date();
  const set = {
    paymentStatus: "failed",
    paymentFailedAt: now,
    paymentExpiresAt: now,
  };
  if (canceled) {
    set.status = "canceled";
    set.canceledAt = now;
  }
  return (
    (await TakeAwayOrderModel.findOneAndUpdate(
      {
        _id: order._id,
        restaurant_id: restaurant._id,
        stripePaymentIntentId: paymentIntent.id,
        paymentStatus: { $nin: ["paid", "refunded"] },
      },
      { $set: set },
      { new: true },
    )) || order
  );
}

async function handleTakeAwayStripeWebhookEvent({ event, restaurant }) {
  const object = event?.data?.object;
  switch (event?.type) {
    case "payment_intent.succeeded": {
      if (getStripeObjectMetadata(object).type !== "takeaway_order") {
        return { handled: false };
      }
      const order = await loadWebhookOrder(restaurant, object);
      const finalized = await finalizePaidOrder({
        restaurant,
        order,
        paymentIntent: object,
      });
      return { handled: true, order: finalized };
    }
    case "payment_intent.payment_failed":
    case "payment_intent.canceled": {
      if (getStripeObjectMetadata(object).type !== "takeaway_order") {
        return { handled: false };
      }
      const failed = await markPaymentAttemptFailed({
        restaurant,
        paymentIntent: object,
        canceled: event.type === "payment_intent.canceled",
      });
      return { handled: true, order: failed };
    }
    case "refund.created":
    case "refund.updated": {
      if (getStripeObjectMetadata(object).type !== "takeaway_order_refund") {
        return { handled: false };
      }
      const order = await loadWebhookOrder(restaurant, object);
      if (object.status === "succeeded") {
        const refunded = await finalizeRefund({
          restaurant,
          order,
          refund: object,
          targetStatus:
            getStripeObjectMetadata(object).targetStatus ||
            order.refundTargetStatus,
        });
        return { handled: true, order: refunded };
      }
      const targetStatus =
        getStripeObjectMetadata(object).targetStatus ||
        order.refundTargetStatus;
      const decision = ["canceled", "rejected"].includes(targetStatus)
        ? await applyRefundBusinessDecision({ order, targetStatus })
        : { order, emailEvent: "" };
      const reconciled = await TakeAwayOrderModel.findOneAndUpdate(
        { _id: order._id, paymentStatus: { $ne: "refunded" } },
        {
          $set: {
            stripeRefundId: object.id || order.stripeRefundId,
            stripeRefundStatus: object.status || "",
          },
        },
        { new: true },
      );
      const resolved = reconciled || decision.order;
      if (reconciled) {
        await runOrderStatusEffects(
          resolved,
          restaurant,
          decision.emailEvent ? [decision.emailEvent] : [],
        );
      }
      return { handled: true, order: resolved };
    }
    default:
      return { handled: false };
  }
}

async function expirePendingTakeAwayOrders({ now = new Date() } = {}) {
  const dueOrders = await TakeAwayOrderModel.find({
    source: "public",
    paymentMethod: "online",
    status: "pending",
    paymentStatus: { $in: ["pending", "failed"] },
    paymentExpiresAt: { $lte: now },
  }).limit(200);
  const restaurantCache = new Map();
  let expired = 0;
  let recoveredPaid = 0;

  for (const order of dueOrders) {
    const restaurantId = String(order.restaurant_id);
    let restaurant = restaurantCache.get(restaurantId);
    if (restaurant === undefined) {
      restaurant = await loadRestaurantForTakeAway(restaurantId);
      restaurantCache.set(restaurantId, restaurant || null);
    }
    if (!restaurant) continue;

    if (order.stripePaymentIntentId) {
      let paymentIntent;
      try {
        const stripe = getStripeForRestaurant(restaurant);
        paymentIntent = await stripe.paymentIntents.retrieve(
          order.stripePaymentIntentId,
        );
        assertPaymentIntentMatchesOrder(paymentIntent, order, {
          requireSucceeded: false,
        });
        if (paymentIntent.status === "succeeded") {
          await finalizePaidOrder({ restaurant, order, paymentIntent });
          recoveredPaid += 1;
          continue;
        }
        if (paymentIntent.status !== "canceled") {
          await stripe.paymentIntents.cancel(
            paymentIntent.id,
            {},
            {
              idempotencyKey: `takeaway-order-${String(order._id)}-expire`,
            },
          );
        }
      } catch (error) {
        console.error("[take-away] pending payment expiration deferred", {
          orderId: String(order._id),
          error: error?.raw?.message || error?.message || error,
        });
        continue;
      }
    }

    const updated = await TakeAwayOrderModel.findOneAndUpdate(
      {
        _id: order._id,
        status: "pending",
        paymentStatus: { $in: ["pending", "failed"] },
        paymentExpiresAt: { $lte: now },
      },
      {
        $set: {
          status: "canceled",
          paymentStatus: "failed",
          paymentFailedAt: order.paymentFailedAt || now,
          canceledAt: now,
        },
      },
      { new: true },
    );
    if (updated) expired += 1;
  }

  return { checked: dueOrders.length, expired, recoveredPaid };
}

async function replayPendingTakeAwayEffects() {
  const orders = await TakeAwayOrderModel.find({
    securityVersion: 1,
    $or: [
      {
        $and: [
          {
            $or: [
              { source: "dashboard" },
              { paymentMethod: { $ne: "online" } },
              { paymentStatus: "paid" },
            ],
          },
          {
            $or: [
              { crmRecordedAt: null },
              { source: "public", restaurantNotifiedAt: null },
            ],
          },
        ],
      },
      { pendingCrmNextStatus: { $nin: ["", null] } },
      { pendingCustomerEmailEvents: { $exists: true, $ne: [] } },
    ],
  })
    .select("+pendingCustomerEmailEvents +customerEmailEventsSent")
    .limit(200);
  const restaurantCache = new Map();
  let replayed = 0;

  for (const order of orders) {
    const restaurantId = String(order.restaurant_id);
    let restaurant = restaurantCache.get(restaurantId);
    if (restaurant === undefined) {
      restaurant = await loadRestaurantForTakeAway(restaurantId);
      restaurantCache.set(restaurantId, restaurant || null);
    }
    if (!restaurant) continue;

    const needsActivation =
      !order.crmRecordedAt ||
      (order.source === "public" && !order.restaurantNotifiedAt);
    if (needsActivation) await runOrderActivationEffects(order, restaurant);
    if (order.pendingCrmNextStatus) {
      await runOrderStatusEffects(order, restaurant);
    } else if (!needsActivation && order.pendingCustomerEmailEvents?.length) {
      await runOrderEmailEffects(order, restaurant);
    }
    replayed += 1;
  }

  return { checked: orders.length, replayed };
}

async function loadRestaurantForTakeAway(restaurantId) {
  return RestaurantModel.findById(restaurantId)
    .populate("owner_id", "firstname")
    .populate("employees")
    .populate("menus");
}

module.exports = {
  ACTIVE_ORDER_STATUSES,
  STATUS_TRANSITIONS,
  TAKE_AWAY_PAYMENT_PENDING_TTL_MINUTES,
  sanitizeTakeAwaySettingsInput,
  mergeTakeAwaySettingsInput,
  normalizeCatalogItemInput,
  listImportableSourceItems,
  upsertCatalogItemFromSource,
  markCatalogSourcesDeleted,
  createCustomCatalogItem,
  getAvailableSlots,
  createTakeAwayOrder,
  createOrderPaymentIntent,
  confirmOrderPayment,
  finalizePaidOrder,
  assertPaymentIntentMatchesOrder,
  assertStatusTransition,
  refundPaidOrder,
  constructTakeAwayWebhookEvent,
  handleTakeAwayStripeWebhookEvent,
  expirePendingTakeAwayOrders,
  replayPendingTakeAwayEffects,
  getTakeAwayWebhookSecret,
  verifyTakeAwayWebhookSignature,
  validatePublicAccessToken,
  hashPublicAccessToken,
  publicAccessTokenMatchesHash,
  findPublicOrderByAccessToken,
  findPublicOrderByAttempt,
  runOrderEmailEffects,
  resolveAuthoritativeSlot,
  buildOrderItems,
  validateCustomerInput,
  validateDeliveryAddress,
  normalizeTakeAwayDateKey,
  getBlockedTakeAwayDates,
  isTakeAwayDateBlocked,
  getOrderPaymentMethod,
  updateOrderStatus,
  loadRestaurantForTakeAway,
  cleanupCompletedTakeAwayOrders,
  cleanupConfiguredCompletedTakeAwayOrders,
};
