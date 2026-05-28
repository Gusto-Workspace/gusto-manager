import { useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { PackagePlus, Plus, Trash2 } from "lucide-react";

import { GlobalContext } from "@/contexts/global.context";
import TakeAwayHeaderComponent from "./header.take-away.component";
import { EmptyState, FormField } from "./form.take-away.component";
import {
  SOURCE_LABELS,
  fieldClass,
  getCatalogCategoryName,
  normalizeForMatch,
  toMoney,
} from "./take-away.utils";

export default function TakeAwayCatalogComponent() {
  const { restaurantContext } = useContext(GlobalContext);
  const restaurant = restaurantContext.restaurantData;
  const restaurantId = restaurant?._id;
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [importableItems, setImportableItems] = useState([]);
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

  return (
    <section className="flex flex-col gap-6">
      <TakeAwayHeaderComponent subtitle="Catalogue" />

      {message && (
        <div className="rounded-2xl border border-darkBlue/10 bg-white/70 px-4 py-3 text-sm text-darkBlue">
          {message}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <div className="flex flex-col gap-5">
          <h2 className="text-lg font-semibold">Catalogue à emporter</h2>
          {!catalog.length ? (
            <EmptyState text="Aucun article emporter. Importe un élément de la carte ou crée un article dédié." />
          ) : (
            catalogGroups.map((group) => (
              <section key={group.name} className="flex flex-col gap-3">
                <h3 className="text-sm font-bold uppercase tracking-wide text-darkBlue/55">
                  {group.name}
                </h3>
                {group.items.map((item) => (
                  <article
                    key={item._id}
                    className="grid gap-3 rounded-2xl border border-darkBlue/10 bg-white/70 p-4 midTablet:grid-cols-[1fr_120px_220px]"
                  >
                    <div>
                      <p className="font-semibold text-darkBlue">{item.name}</p>
                      <p className="text-sm text-darkBlue/50">
                        {SOURCE_LABELS[item.sourceType] || item.sourceType}
                      </p>
                    </div>
                    <FormField label="Prix">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={fieldClass(false)}
                        defaultValue={item.price}
                        onBlur={(e) =>
                          patchCatalogItem(item, {
                            price: Number(e.target.value || 0),
                          })
                        }
                      />
                    </FormField>
                    <div className="flex items-end gap-2">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() =>
                          patchCatalogItem(item, {
                            active: item.active === false,
                            visible: item.active === false,
                          })
                        }
                        className={`inline-flex h-11 flex-1 items-center justify-center rounded-xl border px-3 text-sm font-semibold ${
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
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red/20 bg-white text-red hover:bg-red/10"
                        aria-label={`Retirer ${item.name} du catalogue`}
                        title="Retirer du catalogue"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </article>
                ))}
              </section>
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
                  disabled={loading}
                  onClick={() => importItem(item)}
                  className="mb-2 flex w-full items-center justify-between gap-3 rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-left text-sm hover:bg-darkBlue/5"
                >
                  <span>
                    <span className="block font-semibold text-darkBlue">
                      {item.name}
                    </span>
                    <span className="text-xs text-darkBlue/50">
                      {item.sourceType === "menu" ? "Menus" : item.categoryName}{" "}
                      • {toMoney(item.price)}
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
                    className={fieldClass(false)}
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
