import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { LayoutGrid } from "lucide-react";
import {
  getActiveFloorPlanRooms,
  getDefaultActiveFloorPlanRoomId,
} from "./floor-plan.rooms.utils";

const FloorPlanCanvasReservationsComponent = dynamic(
  () => import("./floor-plan-canvas.reservations.component"),
  { ssr: false },
);

function safeArr(value) {
  return Array.isArray(value) ? value : [];
}

function getSingleConfiguredTableId(table) {
  const tableIds = Array.isArray(table?.tableIds) ? table.tableIds : [];

  if (tableIds.length === 1) {
    return String(tableIds[0] || "").trim();
  }

  const fallbackId = String(table?._id || "").trim();
  if (!fallbackId || tableIds.length > 1) return "";

  return fallbackId;
}

export default function FloorPlanSelectorReservationsComponent({
  reservationParameters,
  tablesCatalog,
  reservations,
  selectedDate,
  selectedTime,
  availableTables,
  selectedTableValue,
  onSelectTableValue,
}) {
  const floorPlanRooms = reservationParameters?.floorplan?.rooms || [];

  const activeRooms = useMemo(
    () => getActiveFloorPlanRooms(floorPlanRooms),
    [floorPlanRooms],
  );

  const catalogTableIds = useMemo(() => {
    return new Set(
      safeArr(tablesCatalog)
        .map((table) => String(table?._id || "").trim())
        .filter(Boolean),
    );
  }, [tablesCatalog]);

  const roomsWithPlacedTables = useMemo(() => {
    return activeRooms.filter((room) =>
      safeArr(room?.objects).some(
        (obj) =>
          obj?.type === "table" &&
          catalogTableIds.has(String(obj?.tableRefId || "").trim()),
      ),
    );
  }, [activeRooms, catalogTableIds]);

  const [activeRoomId, setActiveRoomId] = useState(() =>
    getDefaultActiveFloorPlanRoomId(roomsWithPlacedTables),
  );
  const [selectedTableState, setSelectedTableState] = useState(null);

  useEffect(() => {
    setActiveRoomId((prev) => {
      const hasPrev = roomsWithPlacedTables.some(
        (room) => String(room?._id || "") === String(prev || ""),
      );

      return hasPrev ? prev : getDefaultActiveFloorPlanRoomId(roomsWithPlacedTables);
    });
  }, [roomsWithPlacedTables]);

  useEffect(() => {
    setSelectedTableState(null);
  }, [activeRoomId, selectedDate, selectedTime]);

  const activeRoom = useMemo(() => {
    return (
      roomsWithPlacedTables.find(
        (room) => String(room?._id || "") === String(activeRoomId || ""),
      ) || null
    );
  }, [roomsWithPlacedTables, activeRoomId]);

  const selectableSingleTables = useMemo(() => {
    return safeArr(availableTables).filter((table) => {
      return Boolean(getSingleConfiguredTableId(table));
    });
  }, [availableTables]);

  const selectableConfiguredTableIds = useMemo(() => {
    return selectableSingleTables
      .map((table) => getSingleConfiguredTableId(table))
      .filter(Boolean);
  }, [selectableSingleTables]);

  const selectedConfiguredTableIds = useMemo(() => {
    const selected = selectableSingleTables.find(
      (table) => String(table?._id || "") === String(selectedTableValue || ""),
    );

    if (!selected) return [];

    const tableId = getSingleConfiguredTableId(selected);
    return tableId ? [tableId] : [];
  }, [selectableSingleTables, selectedTableValue]);

  useEffect(() => {
    if (!selectedConfiguredTableIds.length) {
      setSelectedTableState(null);
    }
  }, [selectedConfiguredTableIds]);

  if (!activeRoom) {
    return null;
  }

  return (
    <div className="rounded-3xl border border-darkBlue/10 bg-white/70 shadow-sm p-4 midTablet:p-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 midTablet:flex-row midTablet:items-center midTablet:justify-between">
          <div className="min-w-0">
            <p className="text-base font-semibold text-darkBlue inline-flex items-center gap-2">
              <LayoutGrid className="size-4 text-darkBlue/60" />
              Plan de salle
            </p>
            <p className="mt-1 text-sm text-darkBlue/60">
              Cliquez sur une table disponible pour la sélectionner. Les tables
              grisées ne sont pas sélectionnables pour ce créneau.
            </p>
          </div>

          {roomsWithPlacedTables.length > 1 ? (
            <select
              value={activeRoomId}
              onChange={(e) => setActiveRoomId(e.target.value)}
              className="h-11 w-full midTablet:w-[240px] rounded-2xl border border-darkBlue/10 bg-white/80 px-4 text-base outline-none transition focus:border-blue/60 focus:ring-2 focus:ring-blue/20"
            >
              {roomsWithPlacedTables.map((room) => (
                <option key={room._id} value={room._id}>
                  {room.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        <div className="rounded-[28px] overflow-hidden">
          <FloorPlanCanvasReservationsComponent
            room={activeRoom}
            reservations={reservations}
            tablesCatalog={tablesCatalog}
            reservationParameters={reservationParameters}
            selectedDate={selectedDate}
            selectedTime={selectedTime}
            liveMode={false}
            selectedTableState={selectedTableState}
            onSelectTable={setSelectedTableState}
            selectionMode
            selectableConfiguredTableIds={selectableConfiguredTableIds}
            selectedConfiguredTableIds={selectedConfiguredTableIds}
            onSelectConfiguredTable={(configuredTableId, nextState) => {
              if (!configuredTableId) {
                onSelectTableValue?.("");
                setSelectedTableState(null);
                return;
              }

              const wanted = selectableSingleTables.find(
                (table) =>
                  getSingleConfiguredTableId(table) ===
                  String(configuredTableId || "").trim(),
              );

              if (!wanted?._id) return;

              onSelectTableValue?.(String(wanted._id));
              setSelectedTableState(nextState || null);
            }}
          />
        </div>
      </div>
    </div>
  );
}
