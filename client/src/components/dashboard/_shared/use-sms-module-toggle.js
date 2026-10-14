import { useEffect, useRef, useState } from "react";
import axios from "axios";

export default function useSmsModuleToggle({ restaurantId, module, enabled, modules, commercial, onUpdated }) {
  const [pending, setPending] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [visual, setVisual] = useState(null);
  const [error, setError] = useState("");
  const flight = useRef(null);
  const pendingRef = useRef(null);
  const current = useRef(null);
  current.current = { restaurantId, module, enabled, modules, commercial, onUpdated };

  function storePending(value) {
    pendingRef.current = value;
    setPending(value);
  }

  function belongs(request) {
    return current.current.restaurantId === request.restaurantId && current.current.module === request.module;
  }

  function isCurrent(request) {
    return flight.current === request && belongs(request);
  }

  function parameterUrl(selectedModule) {
    const path = selectedModule === "reservations" ? "sms-reminders" : "take-away/sms-notifications";
    return `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/${path}`;
  }

  function requiredAction(nextEnabled, snapshot) {
    if (!snapshot.commercial || typeof snapshot.enabled !== "boolean") return null;
    if (nextEnabled) {
      if (!snapshot.commercial.active) return "reactivate";
      return snapshot.commercial.status === "scheduled" ? "cancel_deactivation" : null;
    }
    const other = module === "reservations" ? "take_away" : "reservations";
    return snapshot.enabled && snapshot.modules?.[other] !== true && snapshot.commercial.active &&
      snapshot.commercial.status !== "scheduled" ? "schedule_deactivation" : null;
  }

  function key() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  useEffect(() => {
    return () => {
      flight.current?.controller?.abort();
      flight.current = null;
      pendingRef.current = null;
    };
  }, [restaurantId, module]);

  useEffect(() => {
    setPending(null);
    setVisual(null);
    setPhase("idle");
    setError("");
  }, [restaurantId, module]);

  useEffect(() => {
    if (visual?.settled && visual.value === enabled) setVisual(null);
  }, [visual, enabled]);

  async function prepare(request) {
    if (flight.current || !belongs(request)) return;
    const read = { ...request, controller: new AbortController() };
    flight.current = read;
    storePending({ ...request, ready: false });
    setPhase("preparing");
    setError("");
    try {
      // Read-only quote: closing the modal cannot leave a module modified.
      const { data } = await axios.get(parameterUrl("reservations"), { signal: read.controller.signal });
      if (!isCurrent(read)) return;
      const snapshot = { enabled: data.modules?.[module] ?? data.settings?.enabled,
        modules: data.modules, commercial: data.commercial };
      const action = requiredAction(request.enabled, snapshot);
      current.current.onUpdated(data);
      flight.current = null;
      if (!action && request.requestAction === "set_module") {
        storePending(null);
        return run({ ...request, action: undefined });
      }
      storePending({ ...request, action: action || request.action, commercial: data.commercial, ready: true });
      setPhase("idle");
    } catch (failure) {
      if (!isCurrent(read)) return;
      setError(failure.response?.data?.message || "Impossible de vérifier l’abonnement SMS.");
      flight.current = null;
      setPhase("idle");
    }
  }

  async function run(request, confirm = false) {
    if (flight.current || !belongs(request)) return;
    flight.current = request;
    setPhase("saving");
    setError("");
    if (typeof request.enabled === "boolean") setVisual({ value: request.enabled, settled: false });
    try {
      const { data } = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/sms-subscription/actions`,
        { action: request.requestAction, module, enabled: request.enabled,
          confirm, confirmedAction: request.action, idempotencyKey: request.key },
        { headers: { "Idempotency-Key": request.key } },
      );
      if (!isCurrent(request)) return;
      if (data.confirmationRequired) {
        // The server may know about an opposite toggle changed in another tab.
        current.current.onUpdated(data);
        setVisual(null);
        storePending({ ...request, action: data.confirmationRequired, commercial: data.commercial, ready: true, applied: false });
      } else {
        current.current.onUpdated(data, request.action);
        setVisual({ value: data.modules[module], settled: true });
        if (data.documentPending) {
          storePending({ ...request, commercial: data.commercial, applied: true, ready: true });
          setError("La modification est prise en compte. Réessayez pour finaliser sa confirmation.");
        } else {
          storePending(null);
        }
      }
    } catch (failure) {
      if (!isCurrent(request)) return;
      setVisual(null);
      setError(failure.response?.data?.message || "Impossible de modifier les notifications SMS.");
      setPhase("recovering");
      try {
        // A timeout may occur after the server committed. Refresh only the
        // activation/commercial snapshot, without reloading the settings UI.
        const { data } = await axios.get(parameterUrl(module));
        if (!isCurrent(request)) return;
        current.current.onUpdated(data);
        setVisual({ value: data.modules[module], settled: true });
        const applied = request.action === "schedule_deactivation"
          ? data.commercial?.status === "scheduled" && data.modules[module] === false
          : ["cancel_deactivation", "reactivate"].includes(request.action) &&
            data.commercial?.active && data.commercial.status !== "scheduled" &&
            (request.enabled === undefined || data.modules[module] === true);
        if (applied && pendingRef.current) {
          storePending({ ...request, commercial: data.commercial, applied: true, ready: true });
        }
      } catch (_) {
        if (isCurrent(request)) setError((value) => `${value} L’état enregistré n’a pas pu être vérifié.`);
      }
    } finally {
      if (isCurrent(request)) {
        flight.current = null;
        setPhase("idle");
      }
    }
  }

  function changeModule(nextEnabled) {
    if (flight.current || pendingRef.current) return;
    const snapshot = current.current;
    const request = { restaurantId, module, requestAction: "set_module", enabled: nextEnabled,
      key: key(), action: requiredAction(nextEnabled, snapshot), commercial: snapshot.commercial };
    return request.action ? prepare(request) : run(request);
  }

  function close() {
    if (flight.current && !flight.current.controller) return;
    flight.current?.controller?.abort();
    flight.current = null;
    storePending(null);
    setVisual(null);
    setPhase("idle");
    setError("");
  }

  const visualEnabled = visual?.value ?? Boolean(enabled);
  return {
    pending, error, enabled: visualEnabled, loading: phase !== "idle",
    preparing: phase === "preparing", confirming: phase === "saving" || phase === "recovering",
    statusText: phase === "recovering" ? "Vérification de l’état SMS…" : phase === "saving"
      ? typeof flight.current?.enabled === "boolean"
        ? visualEnabled ? "Activation en cours…" : "Désactivation en cours…"
        : "Mise à jour en cours…" : "",
    changeModule,
    cancelScheduledDeactivation: (value) => {
      if (flight.current || pendingRef.current) return;
      return prepare({ restaurantId, module, requestAction: "cancel_deactivation",
        action: "cancel_deactivation", key: key(), commercial: value });
    },
    confirm: () => {
      const request = pendingRef.current;
      if (!request || flight.current) return;
      return request.ready ? run(request, true) : prepare(request);
    },
    close,
  };
}
