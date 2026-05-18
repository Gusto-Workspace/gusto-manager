function safeArr(value) {
  return Array.isArray(value) ? value : [];
}

export function isFloorPlanRoomEnabled(room) {
  return room?.enabled !== false;
}

export function getFloorPlanRoomsFromParameters(parameters = {}) {
  return safeArr(parameters?.floorplan?.rooms);
}

export function getActiveFloorPlanRooms(rooms = []) {
  return safeArr(rooms).filter(isFloorPlanRoomEnabled);
}

export function getDefaultActiveFloorPlanRoomId(rooms = []) {
  const activeRooms = getActiveFloorPlanRooms(rooms);
  return activeRooms.length ? String(activeRooms[0]?._id || "") : "";
}

export function getDisabledFloorPlanTableIds(parameters = {}) {
  const ids = new Set();
  const rooms = getFloorPlanRoomsFromParameters(parameters);

  rooms.forEach((room) => {
    if (isFloorPlanRoomEnabled(room)) return;

    safeArr(room?.objects).forEach((obj) => {
      if (obj?.type !== "table" || !obj?.tableRefId) return;
      ids.add(String(obj.tableRefId || "").trim());
    });
  });

  return ids;
}

export function buildFloorPlanRoomMetaByTableId(rooms = []) {
  const map = new Map();

  safeArr(rooms).forEach((room) => {
    const roomName = String(room?.name || "").trim() || "Salle sans nom";
    const enabled = isFloorPlanRoomEnabled(room);

    safeArr(room?.objects).forEach((obj) => {
      if (obj?.type !== "table" || !obj?.tableRefId) return;

      const key = String(obj.tableRefId || "").trim();
      if (!key || map.has(key)) return;

      map.set(key, {
        roomId: room?._id ? String(room._id) : "",
        roomName,
        enabled,
      });
    });
  });

  return map;
}
