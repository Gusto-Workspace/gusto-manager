export const RESERVATION_DISPLAY_STATUS_KEYS = [
  "Pending",
  "Confirmed",
  "Finished",
  "Canceled",
];

export function getReservationDisplayStatus(status) {
  switch (String(status || "").trim()) {
    case "AwaitingBankHold":
    case "Pending":
      return "Pending";
    case "Confirmed":
    case "Active":
    case "Late":
      return "Confirmed";
    case "Finished":
      return "Finished";
    case "Canceled":
    case "Rejected":
      return "Canceled";
    default:
      return String(status || "").trim() || null;
  }
}

export function getReservationStatusLabel(status) {
  switch (getReservationDisplayStatus(status)) {
    case "Pending":
      return "En attente";
    case "Confirmed":
      return "Confirmée";
    case "Finished":
      return "Terminée";
    case "Canceled":
      return "Annulée";
    default:
      return String(status || "").trim() || "-";
  }
}

export function getReservationStatusClassName(status) {
  switch (getReservationDisplayStatus(status)) {
    case "Pending":
      return "bg-blue/10 text-blue border-blue/30";
    case "Confirmed":
      return "bg-blue/15 text-blue border-blue/40";
    case "Finished":
      return "bg-darkBlue/5 text-darkBlue/70 border-darkBlue/20";
    case "Canceled":
      return "bg-red/10 text-red border-red/30";
    default:
      return "bg-darkBlue/5 text-darkBlue/70 border-darkBlue/20";
  }
}

export function createReservationDisplayStatusCounter() {
  return {
    Pending: 0,
    Confirmed: 0,
    Finished: 0,
    Canceled: 0,
  };
}

export function createReservationDisplayStatusBuckets() {
  return {
    Pending: [],
    Confirmed: [],
    Finished: [],
    Canceled: [],
  };
}
