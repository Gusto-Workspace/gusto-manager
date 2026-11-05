const twilio = require("twilio");
const { parsePhoneNumberFromString } = require("libphonenumber-js");

function normalizePhone(value) {
  const phone = parsePhoneNumberFromString(String(value || ""), "FR");
  return phone && phone.isValid() ? phone.number : null;
}

// The externally configured origin is trusted, never the incoming Host or
// forwarded headers. The original URL includes any Twilio-signed query string.
function validateWebhook({ authToken, accountSid, expectedAccountSid, signature, publicOrigin, originalUrl, body }) {
  if (!authToken || !accountSid || accountSid !== expectedAccountSid || !signature || !publicOrigin) return false;
  let origin;
  try {
    const parsed = new URL(publicOrigin);
    if (parsed.protocol !== "https:" || parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username || parsed.password) return false;
    origin = parsed.origin;
  } catch (_) {
    return false;
  }
  if (!String(originalUrl || "").startsWith("/" ) || String(originalUrl).startsWith("//")) return false;
  return twilio.validateRequest(authToken, signature, origin + originalUrl, body || {});
}

// SIP completion describes the child leg; only Dial action supplies the
// authoritative business outcome. A late event must never reopen a call.
function reduceCallState(current = {}, event = {}) {
  const next = { ...current };
  const rank = { incoming: 0, initiated: 1, ringing: 2, answered: 3 };
  if (event.kind === "dial-action") {
    if (!next.outcome && ["completed", "busy", "no-answer", "failed", "canceled"].includes(event.status)) {
      next.outcome = event.status;
      next.state = event.status === "completed" ? "completed" : "missed";
      if (Number.isFinite(event.duration) && event.duration >= 0) next.duration = event.duration;
    }
  } else if (event.kind === "sip" && !next.outcome) {
    if (Object.hasOwn(rank, event.status) && (rank[event.status] > (rank[next.state] ?? -1))) next.state = event.status;
    if (event.status === "completed") next.sipCompleted = true;
  }
  return next;
}

module.exports = { normalizePhone, validateWebhook, reduceCallState };
