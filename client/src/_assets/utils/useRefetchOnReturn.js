import { useEffect, useRef } from "react";

export default function useRefetchOnReturn({
  enabled,
  storageKey,
  thresholdMs = 5 * 60 * 1000,
  onSoftReturn,
  onHardReturn,
  markOnMount = true,
}) {
  const lastResumeAtRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    const KEY = storageKey;

    const mark = () => {
      try {
        localStorage.setItem(KEY, String(Date.now()));
      } catch {}
    };

    const getElapsed = () => {
      try {
        const prev = Number(localStorage.getItem(KEY) || 0);
        if (!prev) return Infinity;
        return Date.now() - prev;
      } catch {
        return Infinity;
      }
    };

    const handleResume = (reason) => {
      const now = Date.now();

      if (now - lastResumeAtRef.current < 1200) return;
      lastResumeAtRef.current = now;

      const elapsed = getElapsed();
      const details = { reason };

      if (elapsed >= thresholdMs) {
        onHardReturn?.(elapsed, details);
      } else {
        onSoftReturn?.(elapsed, details);
      }
    };

    if (markOnMount) mark();

    const onVis = () => {
      if (document.visibilityState === "hidden") {
        mark();
        return;
      }

      if (document.visibilityState === "visible") {
        handleResume("visibilitychange");
      }
    };

    const onPageShow = () => {
      handleResume("pageshow");
    };

    const onFocus = () => {
      handleResume("focus");
    };

    const onOnline = () => {
      handleResume("online");
    };

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", mark);
    window.addEventListener("blur", mark);

    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", mark);
      window.removeEventListener("blur", mark);

      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [
    enabled,
    storageKey,
    thresholdMs,
    onSoftReturn,
    onHardReturn,
    markOnMount,
  ]);
}
