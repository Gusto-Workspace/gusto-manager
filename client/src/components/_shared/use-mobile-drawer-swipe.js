import { useCallback, useEffect, useRef, useState } from "react";

const SWIPE_VELOCITY = 0.6;
const CLOSE_RATIO = 0.25;
const PANEL_FALLBACK = 720;

export default function useMobileDrawerSwipe(onSwipeClose) {
  const panelRef = useRef(null);
  const closeRef = useRef(onSwipeClose);
  const [isTabletUp, setIsTabletUp] = useState(false);
  const [panelHeight, setPanelHeight] = useState(null);
  const [dragY, setDragY] = useState(0);
  const dragStateRef = useRef({
    active: false,
    startY: 0,
    lastY: 0,
    startT: 0,
    lastT: 0,
  });

  useEffect(() => {
    closeRef.current = onSwipeClose;
  }, [onSwipeClose]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const update = () => setIsTabletUp(mediaQuery.matches);

    update();
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", update);
    } else {
      mediaQuery.addListener(update);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener("change", update);
      } else {
        mediaQuery.removeListener(update);
      }
    };
  }, []);

  const measurePanel = useCallback(() => {
    const height = panelRef.current?.getBoundingClientRect().height || 0;
    if (height > 0) setPanelHeight(height);
  }, []);

  const resetDrag = useCallback(() => {
    dragStateRef.current.active = false;
    setDragY(0);
  }, []);

  const dragMax = Math.max(240, (panelHeight || PANEL_FALLBACK) - 12);
  const closeThreshold = Math.max(
    90,
    Math.floor((panelHeight || PANEL_FALLBACK) * CLOSE_RATIO),
  );

  const onPointerDown = useCallback(
    (event) => {
      if (isTabletUp) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;

      const now = performance.now();
      dragStateRef.current = {
        active: true,
        startY: event.clientY,
        lastY: event.clientY,
        startT: now,
        lastT: now,
      };

      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {}
    },
    [isTabletUp],
  );

  const onPointerMove = useCallback(
    (event) => {
      if (isTabletUp || !dragStateRef.current.active) return;

      const nextY = event.clientY;
      const delta = nextY - dragStateRef.current.startY;
      dragStateRef.current.lastY = nextY;
      dragStateRef.current.lastT = performance.now();
      setDragY(Math.max(0, Math.min(dragMax, delta)));
    },
    [dragMax, isTabletUp],
  );

  const onPointerUp = useCallback(() => {
    if (isTabletUp || !dragStateRef.current.active) return;
    dragStateRef.current.active = false;

    const elapsed = Math.max(
      1,
      dragStateRef.current.lastT - dragStateRef.current.startT,
    );
    const velocity =
      (dragStateRef.current.lastY - dragStateRef.current.startY) / elapsed;

    if (dragY >= closeThreshold || velocity >= SWIPE_VELOCITY) {
      closeRef.current?.();
      return;
    }

    setDragY(0);
  }, [closeThreshold, dragY, isTabletUp]);

  const getOverlayOpacity = useCallback(
    (visible) => (visible ? 1 - Math.min(1, dragY / Math.max(1, dragMax)) : 0),
    [dragMax, dragY],
  );

  const getPanelStyle = useCallback(
    (visible) => {
      if (isTabletUp) return undefined;
      return {
        transform: visible ? `translateY(${dragY}px)` : "translateY(100%)",
        transition: dragStateRef.current.active
          ? "none"
          : "transform 240ms ease-out",
        willChange: "transform",
      };
    },
    [dragY, isTabletUp],
  );

  return {
    panelRef,
    isTabletUp,
    measurePanel,
    resetDrag,
    getOverlayOpacity,
    getPanelStyle,
    dragHandleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}
