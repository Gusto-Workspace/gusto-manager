import { useEffect } from "react";

export default function useRefetchOnReturn({
  enabled,
  storageKey,
  thresholdMs = 5 * 60 * 1000,
  onRefetch,
  markOnMount = true,
}) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    const KEY = storageKey;

    const mark = () => {
      try {
        localStorage.setItem(KEY, String(Date.now()));
      } catch {}
    };

    const shouldRefetch = () => {
      try {
        const prev = Number(localStorage.getItem(KEY) || 0);
        return Date.now() - prev > thresholdMs;
      } catch {
        return true;
      }
    };

    if (markOnMount) mark();

    const onVis = () => {
      if (document.visibilityState === "hidden") {
        mark();
        return;
      }

      if (document.visibilityState === "visible" && shouldRefetch()) {
        onRefetch?.();
      }
    };

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", mark);
    window.addEventListener("blur", mark);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", mark);
      window.removeEventListener("blur", mark);
    };
  }, [enabled, storageKey, thresholdMs, onRefetch, markOnMount]);
}
