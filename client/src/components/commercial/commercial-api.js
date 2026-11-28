import axios from "axios";
import { jwtDecode } from "jwt-decode";
import { getAdminAuthConfig } from "@/components/dashboard/admin/_shared/utils/admin-auth.utils";

const base = process.env.NEXT_PUBLIC_API_URL;
const sessionKey = "gusto-commercial-token";
export const sellerPath = "/dashboard/seller";
export const sellerLogin = `${sellerPath}/login`;
export const isSellerPath = (path) => path === sellerPath || path?.startsWith(`${sellerPath}/`);
export const commercialAdminPath = "/dashboard/admin/seller";

export async function adminCommercialApi(path, { method = "GET", body, signal, responseType } = {}) {
  try {
    const response = await axios({ ...getAdminAuthConfig(), url: `${base}/admin/commerciaux${path}`, method, data: body, signal, responseType });
    return response.data;
  } catch (error) {
    if (error.code === "ERR_CANCELED") throw error;
    throw Object.assign(new Error(error.response?.data?.message || "L’opération a échoué."), { status: error.response?.status });
  }
}

export function getCommercialSession() {
  return window.sessionStorage.getItem(sessionKey);
}

export function getCommercialSessionExpiry(token) {
  if (!token) return 0;
  try {
    const { exp } = jwtDecode(token);
    return Number.isSafeInteger(exp) ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

export function setCommercialSession(token) {
  if (token) window.sessionStorage.setItem(sessionKey, token);
  else window.sessionStorage.removeItem(sessionKey);
}

export async function commercialApi(path, { method = "GET", body, signal, responseType } = {}) {
  const token = getCommercialSession();
  const multipart = body instanceof FormData;
  const response = await fetch(`${base}/commercial${path}`, {
    method, signal, cache: "no-store", credentials: "omit",
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(body !== undefined && !multipart && { "Content-Type": "application/json" }),
    },
    ...(body !== undefined && { body: multipart ? body : JSON.stringify(body) }),
  });
  if (response.status === 204) return null;
  if (response.ok && responseType === "blob") return response.blob();
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && token && getCommercialSession() === token) {
      setCommercialSession(null);
      window.dispatchEvent(new Event("gusto-commercial-session-ended"));
    }
    throw Object.assign(new Error(json.message || "Opération impossible."), { status: response.status });
  }
  return json;
}
