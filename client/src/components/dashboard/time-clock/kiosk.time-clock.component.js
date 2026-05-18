import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import axios from "axios";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Search,
  Users,
  X,
} from "lucide-react";

import { GlobalContext } from "@/contexts/global.context";

import SignaturePadTimeClockComponent from "./signature-pad.time-clock.component";
import {
  cacheTimeClockKioskStates,
  cacheTimeClockRestaurantSnapshot,
  getMergedKioskState,
  getPendingPunchCountForRestaurant,
  isTimeClockOfflineCapable,
  queueOfflinePunch,
  readTimeClockOfflineEntry,
  replayPendingTimeClockPunches,
  saveTimeClockKioskStateForEmployee,
  toKioskStateSummary,
} from "./time-clock.offline";
import {
  TIME_CLOCK_ACTIONS,
  emitTimeClockRefresh,
  formatDate,
  formatMinutes,
  formatTime,
  getAuthConfig,
  getEmployeeDisplayName,
  getTimeClockActionLabel,
  getTimeClockSituationLabel,
  normalizeSearchText,
  toLocalDateKey,
} from "./time-clock.utils";

function getEmployeeSnapshot(employee, restaurantId) {
  const profile = (employee?.restaurantProfiles || []).find(
    (item) => String(item.restaurant) === String(restaurantId),
  );

  return profile?.snapshot || {};
}

function getSituationClasses(situation) {
  if (situation === "working") {
    return "border-green/20 bg-green/10 text-green";
  }

  if (situation === "on_break") {
    return "border-orange/20 bg-orange/10 text-orange";
  }

  return "border-darkBlue/10 bg-white text-darkBlue/70";
}

function getActionClasses(isActive) {
  return isActive
    ? "border-blue bg-blue text-white shadow-sm"
    : "border-darkBlue/10 bg-white text-darkBlue/75 hover:bg-darkBlue/5";
}

function buildClientMutationId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `tc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function isLikelyOfflineError(error) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return true;
  }

  if (!error?.response) return true;

  return false;
}

function getConnectionChipClasses(isOnline) {
  if (!isOnline) {
    return "border-orange/90 bg-orange/50 text-orange";
  }

  return "border-green/90 bg-green/50 text-green";
}

function buildToastId() {
  return `toast_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getToastClasses(type) {
  if (type === "success") {
    return "border-green/20 bg-white text-darkBlue";
  }

  if (type === "warning") {
    return "border-orange/25 bg-white text-darkBlue";
  }

  return "border-red/20 bg-white text-darkBlue";
}

export default function TimeClockKioskComponent({ offlineBootstrap = null }) {
  const { restaurantContext } = useContext(GlobalContext);

  const signaturePadRef = useRef(null);
  const toastTimeoutsRef = useRef(new Map());

  const [now, setNow] = useState(() => new Date());
  const [search, setSearch] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [selectedAction, setSelectedAction] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncingPending, setSyncingPending] = useState(false);
  const [signatureStrokes, setSignatureStrokes] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [serverStatesByEmployee, setServerStatesByEmployee] = useState({});
  const [queueVersion, setQueueVersion] = useState(0);
  const [statesReady, setStatesReady] = useState(false);
  const [pendingPunchCount, setPendingPunchCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);

  const restaurantData =
    restaurantContext?.restaurantData || offlineBootstrap?.restaurant || null;
  const restaurantId = restaurantData?._id || "";
  const employees = restaurantData?.employees || [];
  const user =
    restaurantContext?.userConnected || offlineBootstrap?.user || null;
  const currentDateKey = toLocalDateKey(now);

  const currentEmployeeRecord = employees.find(
    (employee) => String(employee._id) === String(user?.id),
  );

  const currentProfile = currentEmployeeRecord
    ? (currentEmployeeRecord.restaurantProfiles || []).find(
        (item) => String(item.restaurant) === String(restaurantId),
      )
    : null;

  const canManageAllEmployees =
    user?.role === "owner" ||
    currentProfile?.options?.employees === true ||
    user?.options?.employees === true;

  const availableEmployees = useMemo(() => {
    const baseList = canManageAllEmployees
      ? employees
      : employees.filter(
          (employee) => String(employee._id) === String(user?.id),
        );

    return baseList.map((employee) => {
      const snapshot = getEmployeeSnapshot(employee, restaurantId);

      return {
        ...employee,
        firstname: snapshot.firstname || employee.firstname || "",
        lastname: snapshot.lastname || employee.lastname || "",
        post: snapshot.post || employee.post || "",
        searchText: normalizeSearchText(
          `${snapshot.firstname || employee.firstname || ""} ${snapshot.lastname || employee.lastname || ""} ${snapshot.post || employee.post || ""}`,
        ),
      };
    });
  }, [canManageAllEmployees, employees, restaurantId, user?.id]);

  const filteredEmployees = useMemo(() => {
    if (!search.trim()) return availableEmployees;

    const normalizedSearch = normalizeSearchText(search);
    return availableEmployees.filter((employee) =>
      employee.searchText.includes(normalizedSearch),
    );
  }, [availableEmployees, search]);

  const selectedEmployee = availableEmployees.find(
    (employee) => String(employee._id) === String(selectedEmployeeId),
  );

  const summary = useMemo(() => {
    if (!restaurantId || !selectedEmployee) return null;

    return getMergedKioskState({
      restaurantId,
      employee: selectedEmployee,
      anchorDate: currentDateKey,
      serverState:
        serverStatesByEmployee?.[String(selectedEmployee._id)] || null,
      now,
    });
  }, [
    currentDateKey,
    now,
    queueVersion,
    restaurantId,
    selectedEmployee,
    serverStatesByEmployee,
  ]);

  const removeToast = useCallback((toastId) => {
    const timeoutId = toastTimeoutsRef.current.get(toastId);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      toastTimeoutsRef.current.delete(toastId);
    }

    setToasts((previous) => previous.filter((toast) => toast.id !== toastId));
  }, []);

  const pushToast = useCallback((toast) => {
    const id = buildToastId();

    setToasts((previous) => [...previous, { id, ...toast }]);

    if (typeof window !== "undefined") {
      const timeoutId = window.setTimeout(() => {
        toastTimeoutsRef.current.delete(id);
        setToasts((previous) => previous.filter((toast) => toast.id !== id));
      }, 5000);

      toastTimeoutsRef.current.set(id, timeoutId);
    }
  }, []);

  const refreshOfflineStatus = useCallback(() => {
    if (!restaurantId || !isTimeClockOfflineCapable()) {
      setPendingPunchCount(0);
      setQueueVersion((value) => value + 1);
      return;
    }

    setPendingPunchCount(getPendingPunchCountForRestaurant(restaurantId));
    setQueueVersion((value) => value + 1);
  }, [restaurantId]);

  const loadKioskStates = useCallback(
    async ({ silent = false } = {}) => {
      if (!restaurantId) {
        setServerStatesByEmployee({});
        setStatesReady(true);
        return false;
      }

      const cachedEntry = readTimeClockOfflineEntry(restaurantId);
      const cachedStates =
        cachedEntry?.anchorDate === currentDateKey
          ? cachedEntry?.statesByEmployee || {}
          : {};

      if (!silent) setLoadingSummary(true);

      if (!isOnline) {
        setServerStatesByEmployee(cachedStates);
        setStatesReady(true);
        refreshOfflineStatus();
        if (!silent && !Object.keys(cachedStates).length) {
          pushToast({
            type: "warning",
            title: "Mode hors ligne",
            description:
              "Aucune synchronisation du jour n'est disponible. Les nouveaux pointages seront conservés localement puis renvoyés plus tard.",
          });
        }
        if (!silent) setLoadingSummary(false);
        return false;
      }

      try {
        const { data } = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/time-clock/kiosk/states`,
          getAuthConfig({
            params: {
              anchorDate: currentDateKey,
            },
          }),
        );

        const nextStates =
          data?.statesByEmployee && typeof data.statesByEmployee === "object"
            ? data.statesByEmployee
            : {};

        setServerStatesByEmployee(nextStates);
        setStatesReady(true);
        cacheTimeClockKioskStates({
          restaurantId,
          anchorDate: data?.anchorDate || currentDateKey,
          statesByEmployee: nextStates,
        });
        refreshOfflineStatus();
        return true;
      } catch (error) {
        console.error("Failed to fetch kiosk states:", error);

        setServerStatesByEmployee(cachedStates);
        setStatesReady(true);
        refreshOfflineStatus();

        if (!silent) {
          pushToast({
            type: Object.keys(cachedStates).length ? "warning" : "error",
            title: Object.keys(cachedStates).length
              ? "Dernier état restauré"
              : "Chargement impossible",
            description: Object.keys(cachedStates).length
              ? "La borne utilise le dernier état synchronisé en attendant le retour de la connexion."
              : "Impossible de récupérer l'état courant de la borne.",
          });
        }

        return false;
      } finally {
        if (!silent) setLoadingSummary(false);
      }
    },
    [currentDateKey, isOnline, pushToast, refreshOfflineStatus, restaurantId],
  );

  const syncPendingPunches = useCallback(
    async ({ silent = true } = {}) => {
      if (syncingPending || !restaurantId || !isOnline) return null;

      const token =
        typeof window !== "undefined" ? localStorage.getItem("token") : null;
      if (!token) return null;

      setSyncingPending(true);

      try {
        const result = await replayPendingTimeClockPunches({
          restaurantId,
          token,
          apiUrl: process.env.NEXT_PUBLIC_API_URL,
          onItemSynced: ({ punch, data }) => {
            if (data?.summary) {
              const kioskState = toKioskStateSummary(data.summary);
              setServerStatesByEmployee((previous) => ({
                ...previous,
                [String(punch.employeeId)]: kioskState,
              }));
            }
          },
        });

        refreshOfflineStatus();

        if ((result?.synced || 0) > 0) {
          emitTimeClockRefresh();
        }

        if ((result?.synced || 0) > 0 || (result?.failed || 0) > 0) {
          await loadKioskStates({ silent: true });
        }

        if (!silent) {
          if ((result?.failed || 0) > 0) {
            pushToast({
              type: "warning",
              title: "Synchronisation partielle",
              description: `${result.failed} pointage(s) en attente ont été refusés et doivent être vérifiés.`,
            });
          } else if ((result?.synced || 0) > 0) {
            pushToast({
              type: "success",
              title: "Synchronisation terminée",
              description: `${result.synced} pointage(s) en attente ont été envoyés.`,
            });
          }
        }

        return result;
      } finally {
        setSyncingPending(false);
      }
    },
    [
      isOnline,
      loadKioskStates,
      pushToast,
      refreshOfflineStatus,
      restaurantId,
      syncingPending,
    ],
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setIsOnline(navigator.onLine);
    }

    function handleOnline() {
      setIsOnline(true);
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    return () => {
      toastTimeoutsRef.current.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      toastTimeoutsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!restaurantData?._id) return;
    cacheTimeClockRestaurantSnapshot({
      restaurant: restaurantData,
      user,
    });
  }, [restaurantData, user]);

  useEffect(() => {
    refreshOfflineStatus();
  }, [refreshOfflineStatus]);

  useEffect(() => {
    if (!availableEmployees.length) {
      setSelectedEmployeeId("");
      return;
    }

    if (
      selectedEmployeeId &&
      availableEmployees.some(
        (employee) => String(employee._id) === String(selectedEmployeeId),
      )
    ) {
      return;
    }

    setSelectedEmployeeId(String(availableEmployees[0]._id));
  }, [availableEmployees, selectedEmployeeId]);

  useEffect(() => {
    setStatesReady(false);
    loadKioskStates();
  }, [loadKioskStates, reloadKey]);

  useEffect(() => {
    const availableActions = summary?.state?.availableActions || [];

    if (!availableActions.length || !statesReady) {
      setSelectedAction("");
      return;
    }

    if (availableActions.length === 1) {
      setSelectedAction(availableActions[0]);
      return;
    }

    if (!availableActions.includes(selectedAction)) {
      setSelectedAction("");
    }
  }, [selectedAction, statesReady, summary?.state?.availableActions]);

  useEffect(() => {
    if (!isOnline || pendingPunchCount <= 0) return;
    syncPendingPunches({ silent: true });
  }, [isOnline, pendingPunchCount, syncPendingPunches]);

  useEffect(() => {
    if (!isOnline || !summary?.state?.activeSession) return;

    const timer = window.setInterval(() => {
      setReloadKey((value) => value + 1);
    }, 60000);

    return () => window.clearInterval(timer);
  }, [isOnline, summary?.state?.activeSession]);

  useEffect(() => {
    signaturePadRef.current?.clear?.();
    setSignatureStrokes([]);
    setSelectedAction("");
  }, [selectedEmployeeId]);

  async function queueCurrentPunchOffline(actionTime) {
    const queuedPunch = queueOfflinePunch({
      restaurantId,
      employee: selectedEmployee,
      action: selectedAction,
      businessDate: currentDateKey,
      signatureStrokes,
      occurredAt: actionTime,
    });

    if (!queuedPunch) {
      pushToast({
        type: "error",
        title: "Pointage non enregistré",
        description:
          "Impossible de conserver ce pointage hors ligne sur cette tablette.",
      });
      return false;
    }

    refreshOfflineStatus();
    signaturePadRef.current?.clear?.();
    setSignatureStrokes([]);

    pushToast({
      type: "warning",
      title: "Pointage conservé hors ligne",
      description: `${getEmployeeDisplayName(selectedEmployee)} · ${formatTime(actionTime)} · en attente de synchronisation`,
    });

    emitTimeClockRefresh();
    return true;
  }

  async function handleSubmit() {
    if (!restaurantId || !selectedEmployee || !selectedAction || saving) return;

    if (!signatureStrokes.length) {
      pushToast({
        type: "error",
        title: "Signature requise",
        description: "Dessinez la signature avant de valider le pointage.",
      });
      return;
    }

    const actionTime = new Date();

    if (!isOnline) {
      await queueCurrentPunchOffline(actionTime);
      return;
    }

    setSaving(true);

    try {
      const clientMutationId = buildClientMutationId();
      const { data } = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/time-clock/punch`,
        {
          employeeId: selectedEmployee._id,
          action: selectedAction,
          businessDate: currentDateKey,
          occurredAt: actionTime.toISOString(),
          clientMutationId,
          signature: {
            strokes: signatureStrokes,
          },
          source: "kiosk",
        },
        getAuthConfig(),
      );

      const kioskState = toKioskStateSummary(data?.summary || null);
      if (kioskState) {
        setServerStatesByEmployee((previous) => ({
          ...previous,
          [String(selectedEmployee._id)]: kioskState,
        }));
        saveTimeClockKioskStateForEmployee({
          restaurantId,
          anchorDate: kioskState.anchorDate || currentDateKey,
          employeeId: selectedEmployee._id,
          kioskState,
        });
      }

      signaturePadRef.current?.clear?.();
      setSignatureStrokes([]);

      pushToast({
        type: "success",
        title: getTimeClockActionLabel(selectedAction),
        description: `${getEmployeeDisplayName(selectedEmployee)} · ${formatTime(actionTime)}`,
      });

      refreshOfflineStatus();
      emitTimeClockRefresh();
    } catch (error) {
      console.error("Failed to submit kiosk punch:", error);

      if (isLikelyOfflineError(error)) {
        await queueCurrentPunchOffline(actionTime);
      } else {
        pushToast({
          type: "error",
          title: "Pointage non enregistré",
          description:
            error?.response?.data?.message ||
            "Impossible d'enregistrer ce pointage pour le moment.",
        });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleRefresh() {
    if (!restaurantId) return;

    if (!isOnline) {
      refreshOfflineStatus();
      pushToast({
        type: "warning",
        title: "Mode hors ligne",
        description:
          "La borne utilise le dernier état connu jusqu'au retour de la connexion.",
      });
      return;
    }

    await syncPendingPunches({ silent: true });
    setReloadKey((value) => value + 1);
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="rounded-[34px] bg-darkBlue px-6 py-6 text-white shadow-[0_24px_80px_rgba(19,30,54,0.22)]">
        <div className="flex flex-col gap-5 desktop:flex-row desktop:items-end desktop:justify-between">
          <div>
            <div className="relative inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-white/80">
              <Clock3 className="size-3.5" />
              Pointeuse
            </div>

            <h1 className="mt-4 text-3xl font-semibold leading-tight midTablet:text-4xl">
              Borne de pointage
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-white/75 midTablet:text-base">
              Sélectionnez un salarié, choisissez l&apos;action proposée, signez,
              puis validez le pointage.
            </p>
          </div>

          <div className="relative rounded-[28px] border border-white/10 bg-white/10 px-5 py-4 text-right">
            <p className="text-sm uppercase tracking-[0.16em] text-white/60">
              Date et heure
            </p>
            <p className="mt-2 text-lg font-medium">{formatDate(now)}</p>
            <p className="mt-1 text-4xl font-semibold tracking-tight">
              {formatTime(now)}
            </p>

             <span
                className={[
                  "absolute rounded-full border px-2 py-2 right-2 top-2 translate-x-1/2 -translate-y-1/2",
                  getConnectionChipClasses(isOnline),
                ].join(" ")}
              />
          </div>
        </div>
      </div>

      <div className="grid gap-6 desktop:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[30px] border border-darkBlue/10 bg-white px-5 py-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-11 items-center justify-center rounded-2xl border border-darkBlue/10 bg-lightGrey/60 text-blue">
              <Users className="size-5" />
            </span>

            <div>
              <h2 className="text-lg font-semibold text-darkBlue">Salariés</h2>
              <p className="text-sm text-darkBlue/60">
                {canManageAllEmployees
                  ? "Recherche rapide et sélection tactile."
                  : "Votre compte est limité à votre propre pointage."}
              </p>
            </div>
          </div>

          {availableEmployees.length > 1 ? (
            <div className="relative mt-5">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-darkBlue/35" />
              <input
                type="text"
                inputMode="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher un salarié"
                className="h-14 w-full rounded-[24px] border border-darkBlue/10 bg-lightGrey/45 pl-11 pr-12 text-base text-darkBlue outline-none transition focus:border-blue/35 focus:bg-white"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-4 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-darkBlue/45 transition hover:bg-darkBlue/5 hover:text-darkBlue"
                  aria-label="Réinitialiser la recherche"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="mt-5 grid max-h-[58vh] grid-cols-1 gap-2 overflow-y-auto pr-1 midTablet:grid-cols-2">
            {filteredEmployees.length ? (
              filteredEmployees.map((employee) => {
                const isSelected =
                  String(employee._id) === String(selectedEmployeeId);

                return (
                  <button
                    key={employee._id}
                    type="button"
                    onClick={() => setSelectedEmployeeId(String(employee._id))}
                    className={[
                      "rounded-[26px] border px-4 py-4 text-left transition",
                      isSelected
                        ? "border-blue bg-blue text-white shadow-sm"
                        : "border-darkBlue/10 bg-lightGrey/45 text-darkBlue hover:bg-darkBlue/5",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold">
                          {employee.firstname} {employee.lastname}
                        </p>
                        <p
                          className={[
                            "mt-1 text-sm",
                            isSelected ? "text-white/75" : "text-darkBlue/55",
                          ].join(" ")}
                        >
                          {employee.post || "Poste non renseigné"}
                        </p>
                      </div>

                      <span
                        className={[
                          "mt-0.5 inline-flex size-3 rounded-full",
                          isSelected ? "bg-white" : "bg-blue/30",
                        ].join(" ")}
                      />
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="rounded-[24px] border border-dashed border-darkBlue/15 bg-lightGrey/35 px-4 py-6 text-center text-sm text-darkBlue/55 midTablet:col-span-2">
                Aucun salarié ne correspond à cette recherche.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[30px] border border-darkBlue/10 bg-white px-5 py-5 shadow-sm">
          <div className="flex flex-row items-start justify-between gap-4">
            <div>
              <p className="text-sm text-darkBlue/55">Salarié sélectionné</p>
              <h2 className="mt-1 text-2xl font-semibold text-darkBlue">
                {selectedEmployee
                  ? `${selectedEmployee.firstname} ${selectedEmployee.lastname}`
                  : "Aucun salarié"}
              </h2>
              <p className="mt-1 text-sm text-darkBlue/60">
                {selectedEmployee?.post || "Poste non renseigné"}
              </p>
            </div>

            <button
              type="button"
              onClick={handleRefresh}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-darkBlue/10 bg-lightGrey/45 px-4 py-3 text-sm font-medium text-darkBlue transition hover:bg-darkBlue/5"
            >
              <RefreshCw
                className={[
                  "size-4",
                  loadingSummary || syncingPending ? "animate-spin" : "",
                ].join(" ")}
              />
              Actualiser
            </button>
          </div>

          <div className="mt-5 rounded-[26px] border border-darkBlue/10 bg-lightGrey/45 px-4 py-4">
            <div className="flex flex-col gap-3 midTablet:flex-row midTablet:items-center midTablet:justify-between">
              <div>
                <span
                  className={[
                    "inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium",
                    getSituationClasses(summary?.state?.situation),
                  ].join(" ")}
                >
                  {statesReady
                    ? getTimeClockSituationLabel(summary?.state?.situation)
                    : "Chargement"}
                </span>

                <p className="mt-3 text-sm text-darkBlue/65">
                  {summary?.state?.activeSession
                    ? `Service démarré à ${formatTime(summary.state.activeSession.clockInAt)}`
                    : "Aucun service ouvert pour le moment."}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm text-darkBlue/70">
                <span>
                  Aujourd&apos;hui{" "}
                  {formatMinutes(summary?.day?.totalWorkedMinutes || 0)}
                </span>
                <span>
                  Pauses {formatMinutes(summary?.day?.totalBreakMinutes || 0)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <div className="mt-3 grid gap-3 midTablet:grid-cols-2">
              {(statesReady ? summary?.state?.availableActions || [] : []).map(
                (action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => setSelectedAction(action)}
                    className={[
                      "rounded-[26px] border px-4 py-4 text-left transition",
                      getActionClasses(selectedAction === action),
                    ].join(" ")}
                  >
                    <p className="font-medium">
                      {getTimeClockActionLabel(action)}
                    </p>
                    <p
                      className={[
                        "mt-2 text-sm",
                        selectedAction === action
                          ? "text-white/80"
                          : "text-darkBlue/55",
                      ].join(" ")}
                    >
                      {action === TIME_CLOCK_ACTIONS.CLOCK_IN
                        ? "Crée un nouveau service."
                        : action === TIME_CLOCK_ACTIONS.BREAK_START
                          ? "Démarre une pause pour le service en cours."
                          : action === TIME_CLOCK_ACTIONS.BREAK_END
                            ? "Reprend le service après la pause."
                            : "Clôture le service en cours."}
                    </p>
                  </button>
                ),
              )}

              {!statesReady ||
              !(summary?.state?.availableActions || []).length ? (
                <div className="rounded-[24px] border border-dashed border-darkBlue/15 bg-lightGrey/35 px-4 py-6 text-sm text-darkBlue/55 midTablet:col-span-2">
                  {loadingSummary
                    ? "Chargement de l'état de la borne."
                    : "Sélectionnez un salarié pour connaître les actions disponibles."}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-5">
            <SignaturePadTimeClockComponent
              ref={signaturePadRef}
              className="mt-3"
              onChange={setSignatureStrokes}
              placeholder="Signature du salarié"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              signaturePadRef.current?.clear?.();
              setSignatureStrokes([]);
            }}
            className="text-sm text-darkBlue/55 transition hover:text-darkBlue mt-5 w-full text-end"
          >
            Effacer
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              !selectedEmployee ||
              !selectedAction ||
              !signatureStrokes.length ||
              saving
            }
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-[28px] bg-blue px-5 py-4 text-base font-medium text-white shadow-sm transition hover:bg-blue/90 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {saving ? (
              <>
                <RefreshCw className="size-5 animate-spin" />
                Validation en cours...
              </>
            ) : (
              <>
                <CheckCircle2 className="size-5" />
                Valider le pointage
              </>
            )}
          </button>
        </section>
      </div>

      {toasts.length ? (
        <div className="pointer-events-none fixed bottom-4 left-4 z-[80] flex w-[calc(100vw-2rem)] max-w-[420px] flex-col gap-3">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={[
                "pointer-events-auto rounded-[24px] border px-4 py-4 shadow-[0_20px_45px_rgba(19,30,54,0.18)] backdrop-blur",
                getToastClasses(toast.type),
              ].join(" ")}
            >
              <div className="flex items-start gap-3">
                {toast.type === "success" ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green" />
                ) : (
                  <AlertTriangle
                    className={[
                      "mt-0.5 size-5 shrink-0",
                      toast.type === "warning" ? "text-orange" : "text-red",
                    ].join(" ")}
                  />
                )}

                <div className="min-w-0 flex-1">
                  <p className="font-medium text-darkBlue">{toast.title}</p>
                  <p className="mt-1 text-sm text-darkBlue/70">
                    {toast.description}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => removeToast(toast.id)}
                  className="inline-flex size-7 items-center justify-center rounded-full text-darkBlue/45 transition hover:bg-darkBlue/5 hover:text-darkBlue"
                  aria-label="Fermer la notification"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
