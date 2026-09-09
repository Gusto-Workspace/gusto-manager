import { useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Check, ChevronDown, PackagePlus, Plus, Trash2 } from "lucide-react";

import { GlobalContext } from "@/contexts/global.context";
import TakeAwayHeaderComponent from "./header.take-away.component";
import { EmptyState, FormField } from "./form.take-away.component";
import {
  fieldClass,
  getCatalogCategoryName,
  normalizeForMatch,
  toMoney,
} from "./take-away.utils";

function getOptionsPriceLabel(options = []) {
  const prices = options
    .map((option) => Number(option?.price || 0))
    .filter((price) => price > 0);
  if (!prices.length) return "";
  return `À partir de ${toMoney(Math.min(...prices))}`;
}

function getItemPriceLabel(item) {
  const optionsPriceLabel = getOptionsPriceLabel(item?.options);
  if (optionsPriceLabel) return optionsPriceLabel;
  return toMoney(item?.price);
}

function getImportSourceKey(item = {}) {
  return [
    item.sourceType || "",
    item.sourceItemId || "",
    item.sourceSubCategoryId || "",
  ].join(":");
}

export default function TakeAwayCatalogComponent({ webapp = false }) {
  const { restaurantContext } = useContext(GlobalContext);
  const restaurant = restaurantContext.restaurantData;
  const restaurantId = restaurant?._id;
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [importableItems, setImportableItems] = useState([]);
  const [pendingImportKey, setPendingImportKey] = useState("");
  const [expandedOptionIds, setExpandedOptionIds] = useState(() => new Set());
  const [customCategoryMode, setCustomCategoryMode] = useState("À emporter");
  const [customCategoryText, setCustomCategoryText] = useState("");
  const [customItem, setCustomItem] = useState({
    name: "",
    description: "",
    price: "",
  });
  const [errors, setErrors] = useState({});

  const catalog = useMemo(
    () =>
      Array.isArray(restaurant?.takeAwayCatalog)
        ? [...restaurant.takeAwayCatalog].sort(
            (a, b) =>
              Number(a.sortOrder || 0) - Number(b.sortOrder || 0) ||
              String(a.name || "").localeCompare(String(b.name || ""), "fr"),
          )
        : [],
    [restaurant?.takeAwayCatalog],
  );

  const catalogGroups = useMemo(() => {
    const groups = new Map();
    catalog.forEach((item) => {
      const name = getCatalogCategoryName(item);
      const key = normalizeForMatch(name);
      if (!groups.has(key)) groups.set(key, { name, items: [] });
      groups.get(key).items.push(item);
    });
    return Array.from(groups.values()).sort((a, b) => {
      if (a.name === "Menus") return -1;
      if (b.name === "Menus") return 1;
      return a.name.localeCompare(b.name, "fr");
    });
  }, [catalog]);

  const categoryOptions = useMemo(() => {
    const map = new Map();
    ["À emporter", "Menus"].forEach((name) =>
      map.set(normalizeForMatch(name), name),
    );
    catalog.forEach((item) => {
      const name = getCatalogCategoryName(item);
      map.set(normalizeForMatch(name), name);
    });
    importableItems.forEach((item) => {
      const name =
        item.sourceType === "menu"
          ? "Menus"
          : String(item.categoryName || "À emporter").trim();
      map.set(normalizeForMatch(name), name || "À emporter");
    });
    return Array.from(map.values()).sort((a, b) => {
      if (a === "Menus") return -1;
      if (b === "Menus") return 1;
      return a.localeCompare(b, "fr");
    });
  }, [catalog, importableItems]);

  const importableGroups = useMemo(() => {
    const groups = new Map();
    importableItems.slice(0, 120).forEach((item) => {
      const name =
        item.sourceType === "menu"
          ? "Menus"
          : String(item.categoryName || "À emporter").trim();
      const key = normalizeForMatch(name);
      if (!groups.has(key)) groups.set(key, { name, items: [] });
      groups.get(key).items.push(item);
    });
    return Array.from(groups.values()).sort((a, b) => {
      if (a.name === "Menus") return -1;
      if (b.name === "Menus") return 1;
      return a.name.localeCompare(b.name, "fr");
    });
  }, [importableItems]);

  async function request(config) {
    return axios({
      ...config,
      headers: {
        ...(config.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });
  }

  useEffect(() => {
    async function run() {
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
    run();
  }, [restaurantId]);

  function resolveCategoryName(value) {
    const raw = String(value || "").trim() || "À emporter";
    const existing = categoryOptions.find(
      (category) => normalizeForMatch(category) === normalizeForMatch(raw),
    );
    return existing || raw;
  }

  function toggleOptions(itemId) {
    const key = String(itemId || "");
    setExpandedOptionIds((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function importItem(item) {
    setLoading(true);
    setMessage("");
    try {
      const { data } = await request({
        method: "post",
        url: `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/take-away/catalog/import`,
        data: {
          sourceType: item.sourceType,
          sourceItemId: item.sourceItemId,
          sourceCategoryId: item.sourceCategoryId,
          sourceSubCategoryId: item.sourceSubCategoryId,
        },
      });
      restaurantContext.setRestaurantData(data.restaurant);
      setImportableItems((current) =>
        current.map((candidate) =>
          getImportSourceKey(candidate) === getImportSourceKey(item)
            ? { ...candidate, alreadyEnabled: true }
            : candidate,
        ),
      );
      setPendingImportKey("");
      setMessage(`${item.name} a été ajouté au catalogue Take-away.`);
    } catch (error) {
      console.error(error);
      setMessage("Import impossible.");
    } finally {
      setLoading(false);
    }
  }

  async function createCustomItem() {
    const nextErrors = {};
    if (!customItem.name.trim()) nextErrors.name = "Nom obligatoire.";
    if (!customItem.price || Number(customItem.price) < 0)
      nextErrors.price = "Prix obligatoire.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const selectedCategory =
      customCategoryMode === "__other__"
        ? customCategoryText
        : customCategoryMode;

    setLoading(true);
    setMessage("");
    try {
      const { data } = await request({
        method: "post",
        url: `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/take-away/catalog`,
        data: {
          ...customItem,
          categoryName: resolveCategoryName(selectedCategory),
          price: Number(customItem.price || 0),
        },
      });
      restaurantContext.setRestaurantData(data.restaurant);
      setCustomItem({ name: "", description: "", price: "" });
      setCustomCategoryMode("À emporter");
      setCustomCategoryText("");
      setErrors({});
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
      if (item.sourceType && item.sourceItemId) {
        setImportableItems((current) =>
          current.map((candidate) =>
            candidate.sourceType === item.sourceType &&
            String(candidate.sourceItemId) === String(item.sourceItemId)
              ? { ...candidate, alreadyEnabled: false }
              : candidate,
          ),
        );
      }
    } catch (error) {
      console.error(error);
      setMessage("Suppression impossible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex min-w-0 flex-col gap-6">
      {!webapp ? (
        <TakeAwayHeaderComponent subtitle="Catalogue" showBack />
      ) : null}

      {message && (
        <div className="rounded-2xl border border-darkBlue/10 bg-white/70 px-4 py-3 text-sm text-darkBlue">
          {message}
        </div>
      )}

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-w-0 flex-col gap-4">
          <h2 className="text-lg font-semibold">Catalogue à emporter</h2>
          {!catalog.length ? (
            <EmptyState text="Aucun article emporter. Importe un élément de la carte ou crée un article dédié." />
          ) : (
            catalogGroups.map((group) => (
              <section key={group.name} className="flex min-w-0 flex-col gap-2">
                <h3 className="text-sm font-bold uppercase tracking-wide text-darkBlue/55">
                  {group.name}
                </h3>
                {group.items.map((item) => (
                  <article
                    key={item._id}
                    className="grid min-w-0 grid-cols-[minmax(0,1fr)_76px_auto_40px] items-center gap-2 rounded-xl border border-darkBlue/10 bg-white/70 p-2.5 mobile:p-3 midTablet:grid-cols-[minmax(0,1fr)_96px_auto_40px]"
                  >
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-semibold leading-5 text-darkBlue">
                        {item.name}
                      </p>
                      {item.sourceDeleted ? (
                        <p className="mt-0.5 truncate text-[11px] font-semibold text-orange">
                          Source supprimée. Réactive cet article pour le
                          conserver comme article indépendant.
                        </p>
                      ) : null}
                      {item.description ? (
                        <p
                          className="mt-0.5 truncate text-[11px] leading-4 text-darkBlue/45"
                          title={item.description}
                        >
                          {item.description}
                        </p>
                      ) : null}
                      {item.options?.length ? (
                        <button
                          type="button"
                          onClick={() => toggleOptions(item._id)}
                          className="mt-0.5 flex max-w-full items-center gap-1 text-left text-[11px] leading-4 text-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/25"
                          aria-expanded={expandedOptionIds.has(
                            String(item._id),
                          )}
                          aria-label={`${item.options.length} option${item.options.length > 1 ? "s" : ""} pour ${item.name}. Afficher le détail.`}
                        >
                          <span className="truncate">
                            {item.options.length} option
                            {item.options.length > 1 ? "s" : ""} ·{" "}
                            {item.options[0]?.name}
                            {item.options.length > 1
                              ? ` +${item.options.length - 1}`
                              : ""}
                          </span>
                          <ChevronDown
                            className={`size-3.5 shrink-0 transition-transform ${
                              expandedOptionIds.has(String(item._id))
                                ? "rotate-180"
                                : ""
                            }`}
                          />
                        </button>
                      ) : null}
                    </div>
                    <div className="flex h-10 min-w-0 items-center rounded-lg border border-darkBlue/10 bg-white pl-1.5 pr-1 focus-within:border-blue/60 focus-within:ring-2 focus-within:ring-blue/20 midTablet:px-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="h-full min-w-0 flex-1 bg-transparent text-right text-sm outline-none"
                        defaultValue={item.price}
                        aria-label={`Prix de ${item.name}`}
                        onBlur={(e) =>
                          patchCatalogItem(item, {
                            price: Number(e.target.value || 0),
                          })
                        }
                      />
                      <span className="ml-1 text-xs font-semibold text-darkBlue/55">
                        €
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() =>
                        patchCatalogItem(item, {
                          active: item.active === false,
                          visible: item.active === false,
                        })
                      }
                      className={`inline-flex h-10 items-center justify-center rounded-lg border px-2 text-[11px] font-semibold transition active:scale-[0.98] disabled:opacity-50 midTablet:px-3 midTablet:text-xs ${
                        item.active === false
                          ? "border-red/20 bg-red/10 text-red"
                          : "border-green/20 bg-green/10 text-green"
                      }`}
                    >
                      {item.active === false ? "Inactif" : "Actif"}
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => removeCatalogItem(item)}
                      className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-red/20 bg-white text-red transition canHover:hover:bg-red/10 active:scale-[0.98] disabled:opacity-50"
                      aria-label={`Retirer ${item.name} du catalogue`}
                      title="Retirer du catalogue"
                    >
                      <Trash2 className="size-4" />
                    </button>
                    {item.options?.length &&
                    expandedOptionIds.has(String(item._id)) ? (
                      <div className="col-span-full grid gap-1 border-t border-darkBlue/10 pt-2 midTablet:grid-cols-2">
                        {item.options.map((option) => (
                          <div
                            key={`${item._id}-${option._id || option.name}`}
                            className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-lightGrey px-2.5 py-1.5 text-[11px]"
                          >
                            <span className="min-w-0 break-words font-semibold text-darkBlue/75">
                              {option.name}
                            </span>
                            <span className="shrink-0 text-blue">
                              {toMoney(option.price)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </section>
            ))
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <div className="min-w-0 rounded-2xl border border-darkBlue/10 bg-white/70 p-4 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <PackagePlus className="size-5" />
              Importer depuis la carte
            </h2>
            <div className="min-w-0 max-w-full overflow-y-auto overflow-x-hidden pr-1 max-h-[360px]">
              {importableGroups.map((group) => (
                <div key={group.name} className="mb-4 min-w-0 last:mb-0">
                  <p className="mb-2 break-words text-[11px] font-bold uppercase tracking-wide text-darkBlue/45">
                    {group.name}
                  </p>
                  {group.items.map((item) => {
                    const sourceKey = getImportSourceKey(item);
                    const isSelected = pendingImportKey === sourceKey;
                    const isImported = item.alreadyEnabled === true;

                    return (
                      <div
                        key={sourceKey}
                        className={`mb-2 min-w-0 rounded-xl border bg-white transition ${
                          isSelected
                            ? "border-blue/40 ring-2 ring-blue/10"
                            : "border-darkBlue/10"
                        }`}
                      >
                        <button
                          type="button"
                          disabled={loading || isImported}
                          onClick={() => {
                            setMessage("");
                            setPendingImportKey((current) =>
                              current === sourceKey ? "" : sourceKey,
                            );
                          }}
                          className="flex w-full min-w-0 items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition canHover:hover:bg-darkBlue/5 disabled:cursor-default"
                          aria-expanded={isSelected}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block break-words font-semibold text-darkBlue">
                              {item.name}
                            </span>
                            {item.description ? (
                              <span className="mt-0.5 block truncate text-xs text-darkBlue/45">
                                {item.description}
                              </span>
                            ) : null}
                            <span className="mt-1 block text-xs text-darkBlue/50">
                              {getItemPriceLabel(item)}
                            </span>
                            {item.options?.length ? (
                              <span className="mt-2 flex flex-wrap gap-1">
                                {item.options.map((option) => (
                                  <span
                                    key={`${item.sourceItemId}-${option.name}`}
                                    className="min-w-0 max-w-full break-words rounded-full bg-blue/10 px-2 py-0.5 text-[11px] font-semibold text-blue"
                                  >
                                    {option.name} · {toMoney(option.price)}
                                  </span>
                                ))}
                              </span>
                            ) : null}
                          </span>
                          {isImported ? (
                            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-green">
                              <Check className="size-4" /> Importé
                            </span>
                          ) : (
                            <Plus className="size-4 shrink-0" />
                          )}
                        </button>

                        {isSelected && !isImported ? (
                          <div className="flex items-center justify-end gap-2 border-t border-darkBlue/10 px-3 py-2">
                            <button
                              type="button"
                              disabled={loading}
                              onClick={() => setPendingImportKey("")}
                              className="inline-flex h-9 items-center justify-center rounded-lg border border-darkBlue/10 bg-white px-3 text-xs font-semibold text-darkBlue transition canHover:hover:bg-darkBlue/5 active:scale-[0.98]"
                            >
                              Annuler
                            </button>
                            <button
                              type="button"
                              disabled={loading}
                              onClick={() => importItem(item)}
                              className="inline-flex h-9 items-center justify-center rounded-lg bg-darkBlue px-3 text-xs font-semibold text-white transition canHover:hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
                            >
                              Confirmer l’import
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="min-w-0 rounded-2xl border border-darkBlue/10 bg-white/70 p-4 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Article dédié</h2>
            <div className="flex flex-col gap-3">
              <FormField label="Nom de l’article" error={errors.name}>
                <input
                  className={fieldClass(errors.name)}
                  value={customItem.name}
                  onChange={(e) =>
                    setCustomItem((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
              </FormField>
              <FormField label="Description">
                <input
                  className={fieldClass(false)}
                  value={customItem.description}
                  onChange={(e) =>
                    setCustomItem((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                />
              </FormField>
              <FormField label="Catégorie">
                {customCategoryMode === "__other__" ? (
                  <input
                    className={fieldClass(false)}
                    value={customCategoryText}
                    autoFocus
                    onChange={(e) => setCustomCategoryText(e.target.value)}
                    onBlur={() => {
                      if (!customCategoryText.trim())
                        setCustomCategoryMode("À emporter");
                    }}
                  />
                ) : (
                  <select
                    className={`${fieldClass(false)} min-w-0 max-w-full`}
                    value={customCategoryMode}
                    onChange={(e) => setCustomCategoryMode(e.target.value)}
                  >
                    {categoryOptions.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                    <option value="__other__">Autre</option>
                  </select>
                )}
              </FormField>
              <FormField label="Prix" error={errors.price}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={fieldClass(errors.price)}
                  value={customItem.price}
                  onChange={(e) =>
                    setCustomItem((prev) => ({
                      ...prev,
                      price: e.target.value,
                    }))
                  }
                />
              </FormField>
              <button
                type="button"
                disabled={loading}
                onClick={createCustomItem}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                <Plus className="size-4" />
                Ajouter
              </button>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
