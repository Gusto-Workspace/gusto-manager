const NotificationModel = require("../models/notification.model");
const { broadcastToRestaurant } = require("./sse-bus.service");
const { sendPushToModule } = require("./webpush.service");

function pad2(n) {
  return String(n).padStart(2, "0");
}

function startOfDayTs(dt) {
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
}

function sameDay(a, b) {
  return startOfDayTs(new Date(a)) === startOfDayTs(new Date(b));
}

function formatDateFR(d) {
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("fr-FR");
}

/* ========================= RÉSERVATIONS ========================= */

function buildLocalDateTime(reservationDate, reservationTime) {
  if (!reservationDate) return null;

  const base = new Date(reservationDate);
  if (Number.isNaN(base.getTime())) return null;

  let hh = 0;
  let mm = 0;

  if (typeof reservationTime === "string" && reservationTime.includes(":")) {
    const [hStr, mStr] = reservationTime.split(":");
    hh = Number(hStr);
    mm = Number(mStr);
    if (Number.isNaN(hh)) hh = 0;
    if (Number.isNaN(mm)) mm = 0;
  }

  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    hh,
    mm,
    0,
    0,
  );
}

function fmtReservationRelativeFR(reservationDate, reservationTime) {
  const dt = buildLocalDateTime(reservationDate, reservationTime);
  if (!dt) return "";

  const now = new Date();
  const diffDays = Math.round(
    (startOfDayTs(dt) - startOfDayTs(now)) / (24 * 60 * 60 * 1000),
  );

  const hh = pad2(dt.getHours());
  const mm = pad2(dt.getMinutes());

  if (diffDays === 0) return `aujourd’hui à ${hh}:${mm}`;
  if (diffDays === 1) return `demain à ${hh}:${mm}`;
  if (diffDays === 2) return `après-demain à ${hh}:${mm}`;

  const dd = pad2(dt.getDate());
  const mo = pad2(dt.getMonth() + 1);
  const yyyy = dt.getFullYear();
  return `${dd}/${mo}/${yyyy} à ${hh}:${mm}`;
}

/* ========================= NOTIFICATIONS ========================= */

function buildNotificationContent({ type, data }) {
  switch (type) {
    case "reservation_created": {
      const name = data?.customerName || "Nouvelle réservation";
      const guests = data?.numberOfGuests
        ? `• ${data.numberOfGuests} pers.`
        : "";

      const when = fmtReservationRelativeFR(
        data?.reservationDate,
        data?.reservationTime,
      );

      const status = String(data?.status || "").toLowerCase();
      const isPending = status === "pending";

      const title = isPending
        ? "⏳ Nouvelle table en attente"
        : "🍽️ Nouvelle table réservée";

      return {
        title,
        message: `${name} ${guests} ${when}`.replace(/\s+/g, " ").trim(),
        link: "/dashboard/reservations",
      };
    }

    case "giftcard_purchased": {
      const euros =
        typeof data?.amount === "number"
          ? `${(data.amount / 100).toFixed(2)}€`
          : "";
      const benef = [data?.beneficiaryFirstName, data?.beneficiaryLastName]
        .filter(Boolean)
        .join(" ");

      return {
        title: "Carte cadeau vendue",
        message: `${euros ? `Montant ${euros}` : "Nouvel achat"}${
          benef ? ` • Pour ${benef}` : ""
        }`.trim(),
        link: "/dashboard/gift-cards",
      };
    }

    case "leave_request_created": {
      const emp = data?.employeeName || "Un employé";
      const startRaw = data?.start;
      const endRaw = data?.end;
      const typeRaw = (data?.type || "").toLowerCase();

      const start = formatDateFR(startRaw);
      const end = formatDateFR(endRaw);

      let periodText = "";

      if (startRaw && endRaw && !sameDay(startRaw, endRaw)) {
        // 🔹 Plusieurs jours
        periodText = `du ${start} au ${end}`;
      } else if (startRaw) {
        // 🔹 Un seul jour
        if (typeRaw === "full") periodText = `${start} journée entière`;
        else if (typeRaw === "morning") periodText = `${start} matin`;
        else if (typeRaw === "afternoon") periodText = `${start} après-midi`;
        else periodText = start;
      }

      return {
        title: "Demande de congés",
        message: `${emp} • ${periodText}`.replace(/\s+/g, " ").trim(),
        link: "/dashboard/employees/planning/days-off",
      };
    }

    default:
      return { title: "Notification", message: "Nouvel événement", link: "" };
  }
}

function buildNotificationMeta({ type, data }) {
  switch (type) {
    case "reservation_created":
      return {
        reservationId: data?._id || data?.reservationId || null,
        reservationStatus: data?.status || null,
        reservationDate: data?.reservationDate || null,
        reservationTime: data?.reservationTime || null,
        numberOfGuests: data?.numberOfGuests || null,
        customerName: data?.customerName || null,
      };

    case "giftcard_purchased":
      return {
        purchaseId: data?._id || data?.purchaseId || null,
        amount: data?.amount ?? null,
        beneficiaryFirstName: data?.beneficiaryFirstName || null,
        beneficiaryLastName: data?.beneficiaryLastName || null,
      };

    case "leave_request_created":
      return {
        employeeId: data?.employeeId || null,
        employeeName: data?.employeeName || null,
        start: data?.start || null,
        end: data?.end || null,
        leaveType: data?.type || null,
      };

    default:
      return {};
  }
}

async function createAndBroadcastNotification({
  restaurantId,
  module,
  type,
  data = {},
}) {
  const content = buildNotificationContent({ type, data });
  const meta = buildNotificationMeta({ type, data });

  const notif = await NotificationModel.create({
    restaurantId,
    module,
    type,
    title: content.title,
    message: content.message,
    link: content.link,
    data,
    meta,
    read: false,
    readAt: null,
  });

  broadcastToRestaurant(String(restaurantId), {
    type: "notification_created",
    notification: {
      _id: String(notif._id),
      restaurantId: String(restaurantId),
      module: notif.module,
      type: notif.type,
      title: notif.title,
      message: notif.message,
      link: notif.link,
      data: notif.data,
      meta: notif.meta,
      read: notif.read,
      createdAt: notif.createdAt,
    },
  });

  // 🔔 Envoi push OS (web push)
  try {
    await sendPushToModule({
      restaurantId,
      module,
      title: content.title,
      message: content.message,
      link:
        module === "reservations"
          ? "/dashboard/webapp/reservations"
          : module === "gift_cards"
            ? "/dashboard/webapp/gift-cards"
            : notif.link || "/dashboard",

      data: meta,
    });
  } catch (err) {
    console.error("WebPush error:", err?.message || err);
  }

  return notif;
}

module.exports = { createAndBroadcastNotification };
