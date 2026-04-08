export function getAdminToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("admin-token") || "";
}

export function getAdminAuthConfig(config = {}) {
  const token = getAdminToken();

  if (!token) {
    return { ...config };
  }

  return {
    ...config,
    headers: {
      ...(config.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  };
}
