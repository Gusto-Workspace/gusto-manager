import axios from "axios";
import { mergeTimeClockPunches } from "./time-clock.offline";
import { cloneSignatureStrokes, toLocalDateKey } from "./time-clock.utils";

const DATABASE = "gusto-time-clock-device";
const STORE = "records";
const ACTIVE_DEVICE = "active-device";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const clockHttp = axios.create({ timeout: 7000 });
const ATTEMPT_WINDOW = 5 * 60 * 1000;
const MAX_OFFLINE_ATTEMPTS = 8;
let connection;

function db() {
  if (!connection) {
    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch((error) => {
      connection = undefined;
      throw error;
    });
  }
  return connection;
}

async function transact(mode, operation) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, mode);
    let result;
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(transaction.error || new Error("Accès au stockage impossible."));
    operation(transaction.objectStore(STORE), (value) => { result = value; });
  });
}

function read(key) {
  return transact("readonly", (store, result) => {
    const request = store.get(key);
    request.onsuccess = () => result(request.result);
  });
}

function readPrefix(prefix) {
  return transact("readonly", (store, result) => {
    const request = store.getAll(IDBKeyRange.bound(prefix, prefix + "\uffff"));
    request.onsuccess = () => result(request.result);
  });
}

function toBase64Url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value) {
  return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (character) => character.charCodeAt(0));
}

function slot(device, name) {
  return `${device.id}:${name}`;
}

function deviceApi(path, body, device) {
  return clockHttp.post(`${process.env.NEXT_PUBLIC_API_URL}/time-clock/device/${path}`, body, {
    headers: device ? { Authorization: `Device ${device.id}.${device.token}` } : {},
  }).then((response) => response.data);
}

async function box(device, key, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: textEncoder.encode(key) },
    device.storageKey, textEncoder.encode(JSON.stringify(value)),
  );
  return { key, iv, encrypted };
}

async function unbox(device, key, envelope) {
  if (!envelope) return null;
  const value = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: envelope.iv, additionalData: textEncoder.encode(key) },
    device.storageKey, envelope.encrypted,
  );
  return JSON.parse(textDecoder.decode(value));
}

export async function getClockDevice() {
  const id = await read(ACTIVE_DEVICE);
  return id ? read(`device:${id}`) : null;
}

export async function pairClockDevice(code) {
  if (!window.isSecureContext || !crypto.subtle) {
    throw new Error("L’association nécessite une connexion HTTPS.");
  }
  const [signing, wrapping, storageKey] = await Promise.all([
    crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]),
    crypto.subtle.generateKey({
      name: "RSA-OAEP", modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256",
    }, false, ["wrapKey", "unwrapKey"]),
    crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]),
  ]);
  const [signingKey, wrappingKey] = await Promise.all([
    crypto.subtle.exportKey("spki", signing.publicKey),
    crypto.subtle.exportKey("spki", wrapping.publicKey),
  ]);
  const response = await deviceApi("pair", { code, signingKey: toBase64Url(signingKey), wrappingKey: toBase64Url(wrappingKey) });
  const pinKey = await crypto.subtle.unwrapKey(
    "raw", fromBase64Url(response.pinKey), wrapping.privateKey, "RSA-OAEP",
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const device = {
    id: response.id, token: response.token, restaurantId: response.restaurantId,
    pinKey, storageKey, signingKey: signing.privateKey,
  };
  await transact("readwrite", (store) => {
    store.put(device, `device:${device.id}`);
    store.put(device.id, ACTIVE_DEVICE);
  });
  try {
    await navigator.storage?.persist?.();
  } catch {
    // L’appareil peut refuser la persistance du stockage.
  }
  return device;
}

export async function forgetClockVault(device) {
  await transact("readwrite", (store) => store.delete(slot(device, "vault")));
}

export async function refreshClockVault(device) {
  const data = await deviceApi("vault", {}, device);
  const key = slot(device, "vault");
  const envelope = await box(device, key, data);
  await transact("readwrite", (store) => {
    const request = store.get(key);
    request.onsuccess = () => {
      if (!(request.result?.asOf > data.asOf)) store.put({ ...envelope, asOf: data.asOf }, key);
    };
  });
}

async function reserveOfflineAttempt(device, now) {
  return transact("readwrite", (store, result) => {
    const key = slot(device, "attempts");
    const request = store.get(key);
    request.onsuccess = () => {
      const previous = request.result || {};
      if (now < (previous.lastAttempt || 0)) return result(null);
      const until = previous.until > now ? previous.until : now + ATTEMPT_WINDOW;
      const count = previous.until === until ? previous.count : 0;
      if (count >= MAX_OFFLINE_ATTEMPTS) return result(null);
      store.put({ until, count: count + 1, lastAttempt: now }, key);
      return result(until);
    };
  });
}

async function releaseSuccessfulAttempt(device, until) {
  await transact("readwrite", (store) => {
    const key = slot(device, "attempts");
    const request = store.get(key);
    request.onsuccess = () => {
      const count = request.result;
      if (count?.until === until) store.put({ ...count, count: Math.max(0, count.count - 1) }, key);
    };
  });
}

export function isClockNetworkError(error) {
  return !error.response && ["ERR_NETWORK", "ECONNABORTED", "ETIMEDOUT"].includes(error.code);
}

export function isClockDeviceRevoked(error) {
  return ["device_revoked", "module_unavailable"].includes(error.response?.data?.code);
}

async function offlineClockIdentity(device, pin) {
  const key = slot(device, "vault");
  const vault = await unbox(device, key, await read(key));
  const now = Date.now();
  if (!vault || now < vault.asOf - 60_000 || now >= vault.expiresAt) {
    throw new Error("Reconnectez la tablette pour renouveler les autorisations hors ligne.");
  }
  const until = await reserveOfflineAttempt(device, now);
  if (!until) throw new Error("Trop de tentatives. Réessayez dans quelques minutes.");
  const tag = toBase64Url(await crypto.subtle.sign("HMAC", device.pinKey, textEncoder.encode(pin)));
  const entry = vault.entries.find((item) => item.tag === tag);
  if (!entry) throw new Error("Code PIN non reconnu.");
  await releaseSuccessfulAttempt(device, until);
  const stateKey = slot(device, `state:${entry.kiosk.employee.id}`);
  const cached = await unbox(device, stateKey, await read(stateKey));
  const kiosk = cached?.lastUpdatedAt > entry.kiosk.lastUpdatedAt ? cached : entry.kiosk;
  return { kiosk, grant: entry.grant, expiresAt: vault.expiresAt };
}

async function readQueue(device, type) {
  const envelopes = await readPrefix(slot(device, `${type}:`));
  const entries = await Promise.all(envelopes.map((item) => unbox(device, item.key, item)));
  return entries.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.clientMutationId.localeCompare(b.clientMutationId));
}

export async function identifyClockEmployee(device, pin, online) {
  if (!/^[0-9]{4}$/.test(pin)) throw new Error("Saisissez exactement quatre chiffres.");
  let response;
  if (online) {
    try {
      response = await deviceApi("identify", { pin }, device);
    } catch (error) {
      if (!isClockNetworkError(error)) throw error;
    }
  }
  const identity = response || await offlineClockIdentity(device, pin);
  const pending = await readQueue(device, "pending");
  const kiosk = mergeTimeClockPunches({
    baseState: identity.kiosk,
    employee: identity.kiosk.employee,
    anchorDate: toLocalDateKey(),
    pending,
  });
  return { ...identity, kiosk };
}

export async function recordClockPunch(device, identity, action, signatureStrokes) {
  const occurredAt = new Date().toISOString();
  const punch = {
    employeeId: identity.kiosk.employee.id,
    action, occurredAt,
    businessDate: identity.kiosk.state.activeSession?.businessDate || toLocalDateKey(occurredAt),
    clientMutationId: crypto.randomUUID(),
    grant: identity.grant,
    signature: { strokes: cloneSignatureStrokes(signatureStrokes) },
  };
  const fields = JSON.stringify([
    device.restaurantId, punch.employeeId, punch.action, punch.businessDate,
    punch.occurredAt, punch.clientMutationId, punch.grant, punch.signature.strokes,
  ]);
  punch.proof = toBase64Url(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, device.signingKey, textEncoder.encode(fields),
  ));
  const key = slot(device, `pending:${punch.clientMutationId}`);
  const envelope = await box(device, key, punch);
  await transact("readwrite", (store) => store.add(envelope, key));
  return punch.clientMutationId;
}

async function sendQueue(device) {
  const outcome = { accepted: [], refused: [] };
  for (const punch of await readQueue(device, "pending")) {
    const id = punch.clientMutationId;
    const pendingKey = slot(device, `pending:${id}`);
    let data;
    try {
      const response = await clockHttp.post(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${device.restaurantId}/time-clock/punch`,
        punch, {
          headers: { Authorization: `Device ${device.id}.${device.token}` },
        },
      );
      data = response.data;
    } catch (error) {
      if (![400, 404, 409, 422].includes(error.response?.status)) {
        outcome.error = error;
        break;
      }
      const key = slot(device, `refused:${id}`);
      const refusal = await box(device, key, { ...punch, reason: error.response.data?.message });
      await transact("readwrite", (store) => {
        store.put(refusal, key);
        store.delete(pendingKey);
      });
      outcome.refused.push(id);
      continue;
    }
    const key = slot(device, `state:${punch.employeeId}`);
    const snapshot = data.kiosk ? await box(device, key, data.kiosk) : null;
    await transact("readwrite", (store) => {
      if (snapshot) store.put(snapshot, key);
      store.delete(pendingKey);
    });
    outcome.accepted.push(id);
  }
  return outcome;
}

export function syncClockDevice(device) {
  if (!navigator.locks) return sendQueue(device);
  return navigator.locks.request(slot(device, "sync"), () => sendQueue(device));
}

export async function clockDeviceQueueCounts(device) {
  const [pending, refused] = await Promise.all([
    readPrefix(slot(device, "pending:")), readPrefix(slot(device, "refused:")),
  ]);
  return { pending: pending.length, refused: refused.length };
}

export async function listClockRecoveryItems(restaurantId) {
  const devices = (await readPrefix("device:")).filter((device) => device.restaurantId === restaurantId);
  const groups = await Promise.all(devices.map(async (device) => {
    const [pending, refused] = await Promise.all([readQueue(device, "pending"), readQueue(device, "refused")]);
    return [
      ...pending.map((item) => ({ ...item, status: "En attente" })),
      ...refused.map((item) => ({ ...item, status: "À régulariser" })),
    ];
  }));
  return groups.flat().map(({ employeeId, occurredAt, action, clientMutationId, status, reason }) => ({
    employeeId, occurredAt, action, clientMutationId, status, reason,
  }));
}
