export const SMART_AVAILABILITY_SETUP_ERROR_MESSAGE =
  "Créez d’abord une salle et placez au moins une table sur le plan avant d’activer la gestion intelligente.";

export function getSmartAvailabilitySetupState({
  tablesCatalog = [],
  floorplanRooms = [],
} = {}) {
  const safeTables = Array.isArray(tablesCatalog) ? tablesCatalog : [];
  const safeRooms = Array.isArray(floorplanRooms) ? floorplanRooms : [];

  const catalogTableIds = new Set(
    safeTables.map((table) => String(table?._id || "").trim()).filter(Boolean),
  );

  const placedTableIds = new Set();
  let roomsWithPlacedTables = 0;

  safeRooms.forEach((room) => {
    const objects = Array.isArray(room?.objects) ? room.objects : [];
    let roomHasPlacedTable = false;

    objects.forEach((obj) => {
      if (obj?.type !== "table" || !obj?.tableRefId) return;

      const tableRefId = String(obj.tableRefId || "").trim();
      if (!tableRefId || !catalogTableIds.has(tableRefId)) return;

      placedTableIds.add(tableRefId);
      roomHasPlacedTable = true;
    });

    if (roomHasPlacedTable) {
      roomsWithPlacedTables += 1;
    }
  });

  return {
    roomsCount: safeRooms.length,
    tablesCount: safeTables.length,
    placedTablesCount: placedTableIds.size,
    roomsWithPlacedTables,
    canEnable:
      safeRooms.length > 0 && safeTables.length > 0 && placedTableIds.size > 0,
  };
}
