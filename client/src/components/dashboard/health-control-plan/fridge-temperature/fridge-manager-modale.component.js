"use client";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";

export default function FridgeManagerModal({ restaurantId, onClose, onChanged }) {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [onlyActive, setOnlyActive] = useState(true);
  const [loading, setLoading] = useState(false);

  const token = useMemo(() => localStorage.getItem("token"), []);

  const fetchFridges = async () => {
    setLoading(true);
    try {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/fridges`;
      const { data } = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        params: { q, active: onlyActive ? 1 : undefined },
      });
      setItems(data.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (restaurantId) fetchFridges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, q, onlyActive]);

  const [draft, setDraft] = useState({
    name: "", fridgeCode: "", location: "", locationCode: "", sensorIdentifier: "", unit: "°C", isActive: true,
  });
  const [editingId, setEditingId] = useState(null);

  const resetDraft = () => {
    setEditingId(null);
    setDraft({ name: "", fridgeCode: "", location: "", locationCode: "", sensorIdentifier: "", unit: "°C", isActive: true });
  };

  const saveFridge = async () => {
    const url = editingId
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/fridges/${editingId}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/fridges`;
    const method = editingId ? "put" : "post";
    await axios[method](url, draft, { headers: { Authorization: `Bearer ${token}` } });
    resetDraft();
    onChanged?.();
    fetchFridges();
  };

  const deleteFridge = async (id) => {
    if (!confirm("Supprimer cette enceinte ?")) return;
    const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/fridges/${id}`;
    await axios.delete(url, { headers: { Authorization: `Bearer ${token}` } });
    onChanged?.();
    fetchFridges();
  };

  return createPortal(
    <div className="fixed inset-0 z-[1000]">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-xl shadow-lg w-full max-w-[900px] p-6 pointer-events-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Enceintes frigorifiques</h2>
            <button className="px-3 py-1 bg-red text-white rounded" onClick={onClose}>Fermer</button>
          </div>

          <div className="flex gap-2 mb-4">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher…"
              className="border rounded p-2 flex-1"
            />
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
              Actives seulement
            </label>
          </div>

          {/* Formulaire add/edit */}
          <div className="border rounded p-3 mb-4 grid grid-cols-1 midTablet:grid-cols-3 gap-3">
            <input className="border rounded p-2" placeholder="Nom *"
              value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
            <input className="border rounded p-2" placeholder="Identifiant (optionnel)"
              value={draft.fridgeCode} onChange={(e) => setDraft((d) => ({ ...d, fridgeCode: e.target.value }))} />
            <select className="border rounded p-2"
              value={draft.unit} onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))}>
              <option value="°C">°C</option>
              <option value="°F">°F</option>
            </select>
            <input className="border rounded p-2" placeholder="Emplacement"
              value={draft.location} onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))} />
            <input className="border rounded p-2" placeholder="ID emplacement"
              value={draft.locationCode} onChange={(e) => setDraft((d) => ({ ...d, locationCode: e.target.value }))} />
            <input className="border rounded p-2" placeholder="Capteur"
              value={draft.sensorIdentifier} onChange={(e) => setDraft((d) => ({ ...d, sensorIdentifier: e.target.value }))} />
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))} />
              Active
            </label>
            <div className="midTablet:col-span-2 flex gap-2 justify-end">
              {editingId && (
                <button className="px-3 py-1 rounded bg-gray-200" onClick={resetDraft}>Annuler</button>
              )}
              <button className="px-3 py-1 rounded bg-blue text-white" onClick={saveFridge}>
                {editingId ? "Mettre à jour" : "Ajouter"}
              </button>
            </div>
          </div>

          {/* Liste */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="py-6 text-center opacity-60">Chargement…</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-3">Nom</th>
                    <th className="py-2 pr-3">Identifiant</th>
                    <th className="py-2 pr-3">Emplacement</th>
                    <th className="py-2 pr-3">Capteur</th>
                    <th className="py-2 pr-3">Unité</th>
                    <th className="py-2 pr-3">Active</th>
                    <th className="py-2 pr-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr><td colSpan={7} className="py-6 text-center opacity-60">Aucune enceinte</td></tr>
                  )}
                  {items.map((f) => (
                    <tr key={f._id} className="border-b">
                      <td className="py-2 pr-3">{f.name}</td>
                      <td className="py-2 pr-3">{f.fridgeCode || "—"}</td>
                      <td className="py-2 pr-3">{f.location || "—"}{f.locationCode ? <span className="opacity-60"> • {f.locationCode}</span> : null}</td>
                      <td className="py-2 pr-3">{f.sensorIdentifier || "—"}</td>
                      <td className="py-2 pr-3">{f.unit}</td>
                      <td className="py-2 pr-3">{f.isActive ? "Oui" : "Non"}</td>
                      <td className="py-2 pr-0">
                        <div className="flex gap-2 justify-end">
                          <button
                            className="px-3 py-1 rounded bg-green text-white"
                            onClick={() => { setEditingId(f._id); setDraft({
                              name: f.name || "",
                              fridgeCode: f.fridgeCode || "",
                              location: f.location || "",
                              locationCode: f.locationCode || "",
                              sensorIdentifier: f.sensorIdentifier || "",
                              unit: f.unit || "°C",
                              isActive: !!f.isActive,
                            }); }}
                          >
                            Éditer
                          </button>
                          <button
                            className="px-3 py-1 rounded bg-red text-white"
                            onClick={() => deleteFridge(f._id)}
                          >
                            Supprimer
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

        </div>
      </div>
    </div>,
    document.body
  );
}
