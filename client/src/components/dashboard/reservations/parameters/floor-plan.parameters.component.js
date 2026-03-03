import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Plus, Pencil, Copy, Trash2, ChevronLeft } from "lucide-react";

import dynamic from "next/dynamic";

const RoomEditorParametersComponent = dynamic(
  () => import("./room-editor.parameters.component"),
  { ssr: false },
);

function safeArr(a) {
  return Array.isArray(a) ? a : [];
}

export default function FloorPlanParametersComponent({
  restaurantId,
  tablesCatalog, // [{_id,name,seats}]
}) {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("list"); // "list" | "edit"
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [error, setError] = useState("");

  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const catalog = useMemo(() => safeArr(tablesCatalog), [tablesCatalog]);

  async function fetchRooms() {
    try {
      setLoading(true);
      setError("");
      if (!restaurantId) return;

      const res = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/floorplans/rooms`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      setRooms(safeArr(res.data?.rooms));
    } catch (e) {
      setError(
        e?.response?.data?.message || "Impossible de récupérer les salles.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRooms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const activeRoom = useMemo(
    () => rooms.find((r) => String(r._id) === String(activeRoomId)) || null,
    [rooms, activeRoomId],
  );

  async function createRoom() {
    try {
      setError("");
      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/floorplans/rooms`,
        { name: "Nouvelle salle" },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const nextRooms = safeArr(res.data?.rooms);
      setRooms(nextRooms);

      // ouvrir directement l’éditeur
      const created = nextRooms[nextRooms.length - 1];
      if (created?._id) {
        setActiveRoomId(created._id);
        setMode("edit");
      }
    } catch (e) {
      setError(e?.response?.data?.message || "Impossible de créer la salle.");
    }
  }

  async function duplicateRoom(roomId) {
    try {
      setError("");
      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/floorplans/rooms/${roomId}/duplicate`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setRooms(safeArr(res.data?.rooms));
    } catch (e) {
      setError(
        e?.response?.data?.message || "Impossible de dupliquer la salle.",
      );
    }
  }

  async function deleteRoom(roomId) {
    if (!confirm("Supprimer cette salle ?")) return;
    try {
      setError("");
      const res = await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/floorplans/rooms/${roomId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setRooms(safeArr(res.data?.rooms));
      if (String(activeRoomId) === String(roomId)) {
        setMode("list");
        setActiveRoomId(null);
      }
    } catch (e) {
      setError(
        e?.response?.data?.message || "Impossible de supprimer la salle.",
      );
    }
  }

  const card = "rounded-3xl border border-darkBlue/10 bg-white/70 shadow-sm";
  const cardInner = "px-2 py-4 mobile:p-4 midTablet:p-6";
  const title = "text-base font-semibold text-darkBlue";
  const hint = "text-sm text-darkBlue/60";

  if (mode === "edit" && activeRoom) {
    return (
      <div>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className={title + " truncate"}>
              Plan de salle • {activeRoom.name}
            </p>
            <p className={hint}>
              Ajoute tes tables depuis le catalogue et place-les.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setMode("list")}
            className="inline-flex items-center gap-2 rounded-2xl border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition px-4 h-10 text-sm font-semibold text-darkBlue"
          >
            <ChevronLeft className="size-4 text-darkBlue/60" />
            Retour
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-red">{error}</p>}

        <div className="mt-4">
          <RoomEditorParametersComponent
            restaurantId={restaurantId}
            room={activeRoom}
            tablesCatalog={catalog}
            onSaved={(nextRoom, nextRooms) => {
              if (nextRooms) setRooms(nextRooms);
              else {
                setRooms((prev) =>
                  prev.map((r) =>
                    String(r._id) === String(nextRoom._id) ? nextRoom : r,
                  ),
                );
              }
            }}
          />
        </div>
      </div>
    );
  }

  // LISTE DES SALLES (ZenChef-like)
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={title}>Plan de salle</p>
          <p className={hint}>
            Crée tes salles (salle principale, terrasse…) puis place tes tables
            sur le plan.
          </p>
        </div>

        <button
          type="button"
          onClick={createRoom}
          className="inline-flex items-center gap-2 rounded-2xl bg-blue text-white px-4 h-10 text-sm font-semibold hover:bg-blue/90 active:scale-[0.98] transition"
        >
          <Plus className="size-4" />
          Nouvelle salle
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red">{error}</p>}

      <div className="mt-4">
        {loading ? (
          <div className="text-sm text-darkBlue/60 italic">Chargement…</div>
        ) : rooms.length === 0 ? (
          <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-4 text-sm text-darkBlue/60">
            Aucune salle pour le moment.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {rooms.map((r) => {
              const tablesCount = safeArr(r.objects).filter(
                (o) => o?.type === "table",
              ).length;
              const totalSeats = safeArr(r.objects)
                .filter((o) => o?.type === "table")
                .reduce((acc, o) => {
                  const ref = catalog.find(
                    (t) => String(t._id) === String(o.tableRefId),
                  );
                  return acc + Number(ref?.seats || 0);
                }, 0);

              return (
                <div
                  key={String(r._id)}
                  className="rounded-2xl border border-darkBlue/10 bg-white/60 p-4 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-darkBlue truncate">
                      {r.name}
                    </p>
                    <p className="text-sm text-darkBlue/50">
                      {tablesCount} table(s) • {totalSeats} couverts
                    </p>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveRoomId(r._id);
                        setMode("edit");
                      }}
                      className="inline-flex items-center justify-center size-10 rounded-2xl border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition"
                      title="Modifier"
                      aria-label="Modifier"
                    >
                      <Pencil className="size-4 text-darkBlue/70" />
                    </button>

                    <button
                      type="button"
                      onClick={() => duplicateRoom(r._id)}
                      className="inline-flex items-center justify-center size-10 rounded-2xl border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition"
                      title="Dupliquer"
                      aria-label="Dupliquer"
                    >
                      <Copy className="size-4 text-darkBlue/70" />
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteRoom(r._id)}
                      className="inline-flex items-center justify-center size-10 rounded-2xl bg-red text-white hover:opacity-90 transition"
                      title="Supprimer"
                      aria-label="Supprimer"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* petit warning si catalogue vide */}
      {catalog.length === 0 && (
        <div className="mt-4 rounded-2xl border border-orange/30 bg-orange/10 px-4 py-3 text-sm text-darkBlue/80">
          <p className="font-semibold text-darkBlue">
            Catalogue de tables vide
          </p>
          <p className="mt-1 text-darkBlue/70">
            Ajoute d’abord des tables dans la section “Gestion intelligente”
            (Nom + Places), puis reviens ici pour les placer sur le plan.
          </p>
        </div>
      )}
    </div>
  );
}
