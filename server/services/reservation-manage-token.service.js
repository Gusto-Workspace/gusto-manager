const jwt = require("jsonwebtoken");

const RESERVATION_MANAGE_AUDIENCE = "reservation-manage";
const RESERVATION_MANAGE_ISSUER = "gusto-manager";

function getManageTokenSecret() {
  const secret = String(process.env.JWT_SECRET || "").trim();
  if (!secret) {
    throw new Error("JWT_SECRET manquant pour les liens de gestion de réservation.");
  }
  return secret;
}

function createReservationManageToken(reservationId) {
  const normalizedReservationId = String(reservationId || "").trim();
  if (!normalizedReservationId) return "";

  return jwt.sign(
    { scope: RESERVATION_MANAGE_AUDIENCE },
    getManageTokenSecret(),
    {
      subject: normalizedReservationId,
      audience: RESERVATION_MANAGE_AUDIENCE,
      issuer: RESERVATION_MANAGE_ISSUER,
    },
  );
}

function verifyReservationManageToken(token, reservationId) {
  const normalizedToken = String(token || "").trim();
  const normalizedReservationId = String(reservationId || "").trim();
  if (!normalizedToken || !normalizedReservationId) return false;

  try {
    const payload = jwt.verify(normalizedToken, getManageTokenSecret(), {
      audience: RESERVATION_MANAGE_AUDIENCE,
      issuer: RESERVATION_MANAGE_ISSUER,
    });

    return (
      String(payload?.sub || "") === normalizedReservationId &&
      payload?.scope === RESERVATION_MANAGE_AUDIENCE
    );
  } catch (_) {
    return false;
  }
}

module.exports = {
  createReservationManageToken,
  verifyReservationManageToken,
};
