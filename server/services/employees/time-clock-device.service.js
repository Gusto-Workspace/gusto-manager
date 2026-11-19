const {
  constants, createCipheriv, createDecipheriv, createHash, createHmac,
  createPublicKey, publicEncrypt, randomBytes, randomUUID, verify,
} = require("node:crypto");
const jwt = require("jsonwebtoken");

const OFFLINE_LIFETIME_MS = 12 * 60 * 60 * 1000;
const MAX_REPLAY_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const ONLINE_LIFETIME_MS = 2 * 60 * 1000;
const ATTEMPT_WINDOW_MS = 5 * 60 * 1000;
const ONLINE_ATTEMPT_LIMIT = 24;
const FAILED_ATTEMPT_LIMIT = 8;
const PAIRING_LIFETIME_MS = 10 * 60 * 1000;

function clockKey(purpose, scope = "") {
  const secret = process.env.TIME_CLOCK_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error("Missing time clock secret");
  return createHmac("sha256", secret).update(JSON.stringify(["gusto-time-clock-v1", purpose, scope])).digest();
}

function isPersonalPin(pin) {
  return typeof pin === "string" && /^[0-9]{4}$/.test(pin);
}

function pairingDigest(value) {
  return createHash("sha256").update(value).digest("base64url");
}

function lookupPin(restaurant, pin) {
  return createHmac("sha256", clockKey("lookup", String(restaurant).toLowerCase())).update(pin).digest("base64url");
}

function devicePinKey(device) {
  return clockKey("offline-device-pin", String(device._id));
}

function pinAad(restaurant, employee, profile) {
  return JSON.stringify([String(restaurant).toLowerCase(), String(employee).toLowerCase(), profile || ""]);
}

function sealPin({ restaurant, employee, profile, pin, changedBy }) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", clockKey("pin-at-rest", String(restaurant).toLowerCase()), iv);
  cipher.setAAD(Buffer.from(pinAad(restaurant, employee, profile)));
  const ciphertext = Buffer.concat([cipher.update(pin, "utf8"), cipher.final()]);
  return {
    profile, changedBy, lookup: lookupPin(restaurant, pin), revision: randomUUID(),
    sealedPin: Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url"),
  };
}

function unsealPin(entry) {
  const { restaurant, employee, profile } = entry;
  const bytes = Buffer.from(entry.sealedPin, "base64url");
  const cipher = createDecipheriv("aes-256-gcm", clockKey("pin-at-rest", String(restaurant).toLowerCase()), bytes.subarray(0, 12));
  cipher.setAAD(Buffer.from(pinAad(restaurant, employee, profile)));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]);
}

function revealPin(entry) {
  const pin = unsealPin(entry);
  try {
    return pin.toString("utf8");
  } finally {
    pin.fill(0);
  }
}

function offlinePinTag(device, entry) {
  const pin = unsealPin(entry);
  try {
    return createHmac("sha256", devicePinKey(device)).update(pin).digest("base64url");
  } finally {
    pin.fill(0);
  }
}

function validDevicePublicKeys(signingKey, wrappingKey) {
  if (typeof signingKey !== "string" || typeof wrappingKey !== "string" ||
      signingKey.length > 256 || wrappingKey.length > 1024) return false;
  try {
    const sign = readDeviceKey(signingKey);
    const wrap = readDeviceKey(wrappingKey);
    return sign.asymmetricKeyType === "ec" &&
      sign.asymmetricKeyDetails.namedCurve === "prime256v1" &&
      wrap.asymmetricKeyType === "rsa" &&
      wrap.asymmetricKeyDetails.modulusLength === 2048 &&
      wrap.asymmetricKeyDetails.publicExponent === 65537n;
  } catch {
    return false;
  }
}

function readDeviceKey(key) {
  return createPublicKey({ key: Buffer.from(key, "base64url"), type: "spki", format: "der" });
}

function wrapDevicePinKey(device) {
  return publicEncrypt({
    key: readDeviceKey(device.wrappingKey),
    padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: "sha256",
  }, devicePinKey(device)).toString("base64url");
}

function issuePunchGrant(device, credential, now, offline) {
  return jwt.sign({
    restaurant: String(device.restaurant), device: String(device._id),
    employee: String(credential.employee), revision: credential.revision,
    issuedAt: +now, until: +now + (offline ? OFFLINE_LIFETIME_MS : ONLINE_LIFETIME_MS),
    mode: offline ? "offline" : "online",
  }, clockKey("punch-grant"), { algorithm: "HS256", audience: "gusto-time-clock-punch", noTimestamp: true });
}

function signedPunchFields(restaurant, punch) {
  return JSON.stringify([
    String(restaurant), punch.employeeId, punch.action, punch.businessDate,
    punch.occurredAt, punch.clientMutationId, punch.grant, punch.signature?.strokes,
  ]);
}

function verifyPunchProof(device, punch) {
  if (typeof punch.proof !== "string" || !/^[\w-]{86}$/.test(punch.proof) ||
      typeof punch.grant !== "string" || punch.grant.length > 1400 ||
      typeof punch.clientMutationId !== "string" || !/^[\w-]{15,120}$/.test(punch.clientMutationId)) return false;
  try {
    return verify("sha256", Buffer.from(signedPunchFields(device.restaurant, punch)), {
      key: readDeviceKey(device.signingKey), dsaEncoding: "ieee-p1363",
    }, Buffer.from(punch.proof, "base64url"));
  } catch {
    return false;
  }
}

function readPunchGrant(device, punch, now = new Date()) {
  try {
    const grant = jwt.verify(punch.grant, clockKey("punch-grant"), {
      algorithms: ["HS256"], audience: "gusto-time-clock-punch",
    });
    const at = new Date(punch.occurredAt);
    if (grant.restaurant !== String(device.restaurant) || grant.device !== String(device._id) ||
        grant.employee !== punch.employeeId || !Number.isFinite(+at) ||
        at.toISOString() !== punch.occurredAt || +at < grant.issuedAt - 60_000 ||
        +at >= grant.until || +at > +now + 60_000 || +at < +now - MAX_REPLAY_AGE_MS) return null;
    return grant;
  } catch {
    return null;
  }
}

module.exports = {
  ATTEMPT_WINDOW_MS, FAILED_ATTEMPT_LIMIT, ONLINE_ATTEMPT_LIMIT, ONLINE_LIFETIME_MS, OFFLINE_LIFETIME_MS, PAIRING_LIFETIME_MS,
  isPersonalPin, issuePunchGrant, lookupPin, offlinePinTag, pairingDigest,
  readPunchGrant, revealPin, sealPin, validDevicePublicKeys, verifyPunchProof, wrapDevicePinKey,
};
