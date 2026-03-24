import { useContext, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";

import { GlobalContext } from "@/contexts/global.context";

import SignaturePadTimeClockComponent from "./signature-pad.time-clock.component";
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
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (situation === "on_break") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-darkBlue/10 bg-white text-darkBlue/70";
}

function getActionClasses(isActive) {
  return isActive
    ? "border-blue bg-blue text-white shadow-sm"
    : "border-darkBlue/10 bg-white text-darkBlue/75 hover:bg-darkBlue/5";
}

export default function TimeClockKioskComponent() {
  const { restaurantContext } = useContext(GlobalContext);

  const signaturePadRef = useRef(null);

  const [now, setNow] = useState(() => new Date());
  const [search, setSearch] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [selectedAction, setSelectedAction] = useState("");
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signatureStrokes, setSignatureStrokes] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const restaurantId = restaurantContext?.restaurantData?._id;
  const employees = restaurantContext?.restaurantData?.employees || [];
  const user = restaurantContext?.userConnected;

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
      : employees.filter((employee) => String(employee._id) === String(user?.id));

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
  const currentDateKey = toLocalDateKey(now);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

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
    if (!feedback) return;

    const timer = window.setTimeout(() => {
      setFeedback(null);
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    if (!restaurantId || !selectedEmployeeId) {
      setSummary(null);
      return;
    }

    let cancelled = false;

    async function run() {
      setLoadingSummary(true);

      try {
        const { data } = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/time-clock/employees/${selectedEmployeeId}/summary`,
          getAuthConfig({
            params: {
              anchorDate: currentDateKey,
            },
          }),
        );

        if (cancelled) return;
        setSummary(data || null);
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to fetch kiosk summary:", error);
        setFeedback({
          type: "error",
          title: "Chargement impossible",
          description: "Impossible de récupérer l'état courant de ce salarié.",
        });
      } finally {
        if (!cancelled) setLoadingSummary(false);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [currentDateKey, restaurantId, selectedEmployeeId, reloadKey]);

  useEffect(() => {
    const availableActions = summary?.state?.availableActions || [];

    if (!availableActions.length) {
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
  }, [selectedAction, summary?.state?.availableActions]);

  useEffect(() => {
    if (!summary?.state?.activeSession) return;

    const timer = window.setInterval(() => {
      setReloadKey((value) => value + 1);
    }, 60000);

    return () => window.clearInterval(timer);
  }, [summary?.state?.activeSession]);

  async function handleSubmit() {
    if (!restaurantId || !selectedEmployee || !selectedAction || saving) return;

    if (!signatureStrokes.length) {
      setFeedback({
        type: "error",
        title: "Signature requise",
        description: "Dessinez la signature avant de valider le pointage.",
      });
      return;
    }

    setSaving(true);

    try {
      const { data } = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/time-clock/punch`,
        {
          employeeId: selectedEmployee._id,
          action: selectedAction,
          businessDate: currentDateKey,
          signature: {
            strokes: signatureStrokes,
          },
          source: "kiosk",
        },
        getAuthConfig(),
      );

      setSummary(data?.summary || null);
      signaturePadRef.current?.clear?.();
      setSignatureStrokes([]);

      const nextActions = data?.summary?.state?.availableActions || [];
      if (nextActions.length === 1) setSelectedAction(nextActions[0]);
      else setSelectedAction("");

      setFeedback({
        type: "success",
        title: getTimeClockActionLabel(selectedAction),
        description: `${getEmployeeDisplayName(selectedEmployee)} · ${formatTime(new Date())}`,
      });

      emitTimeClockRefresh();
    } catch (error) {
      console.error("Failed to submit kiosk punch:", error);
      setFeedback({
        type: "error",
        title: "Pointage non enregistré",
        description:
          error?.response?.data?.message ||
          "Impossible d'enregistrer ce pointage pour le moment.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="rounded-[34px] bg-darkBlue px-6 py-6 text-white shadow-[0_24px_80px_rgba(19,30,54,0.22)]">
        <div className="flex flex-col gap-5 desktop:flex-row desktop:items-end desktop:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-white/80">
              <Clock3 className="size-3.5" />
              Pointeuse
            </div>

            <h1 className="mt-4 text-3xl font-semibold leading-tight midTablet:text-4xl">
              Borne de pointage
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-white/75 midTablet:text-base">
              Sélectionnez un salarié, choisissez l'action proposée, signez, puis
              validez le pointage.
            </p>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/10 px-5 py-4 text-right">
            <p className="text-sm uppercase tracking-[0.16em] text-white/60">
              Date et heure
            </p>
            <p className="mt-2 text-lg font-medium">{formatDate(now)}</p>
            <p className="mt-1 text-4xl font-semibold tracking-tight">
              {formatTime(now)}
            </p>
          </div>
        </div>
      </div>

      {feedback ? (
        <div
          className={[
            "rounded-[28px] border px-5 py-4 shadow-sm",
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red/15 bg-red/5 text-red",
          ].join(" ")}
        >
          <div className="flex items-start gap-3">
            {feedback.type === "success" ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            )}

            <div>
              <p className="font-medium">{feedback.title}</p>
              <p className="mt-1 text-sm opacity-90">{feedback.description}</p>
            </div>
          </div>
        </div>
      ) : null}

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
                type="search"
                inputMode="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher un salarié"
                className="h-14 w-full rounded-[24px] border border-darkBlue/10 bg-lightGrey/45 pl-11 pr-4 text-base text-darkBlue outline-none transition focus:border-blue/35 focus:bg-white"
              />
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
          <div className="flex flex-col gap-4 midTablet:flex-row midTablet:items-start midTablet:justify-between">
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
              onClick={() => setReloadKey((value) => value + 1)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-darkBlue/10 bg-lightGrey/45 px-4 py-3 text-sm font-medium text-darkBlue transition hover:bg-darkBlue/5"
            >
              <RefreshCw
                className={[
                  "size-4",
                  loadingSummary ? "animate-spin" : "",
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
                  {getTimeClockSituationLabel(summary?.state?.situation)}
                </span>

                <p className="mt-3 text-sm text-darkBlue/65">
                  {summary?.state?.activeSession
                    ? `Service démarré à ${formatTime(summary.state.activeSession.clockInAt)}`
                    : "Aucun service ouvert pour le moment."}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm text-darkBlue/70">
                <span>Aujourd'hui {formatMinutes(summary?.day?.totalWorkedMinutes || 0)}</span>
                <span>Pauses {formatMinutes(summary?.day?.totalBreakMinutes || 0)}</span>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <p className="text-sm font-medium text-darkBlue">Action à valider</p>

            <div className="mt-3 grid gap-3 midTablet:grid-cols-2">
              {(summary?.state?.availableActions || []).map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => setSelectedAction(action)}
                  className={[
                    "rounded-[26px] border px-4 py-4 text-left transition",
                    getActionClasses(selectedAction === action),
                  ].join(" ")}
                >
                  <p className="font-medium">{getTimeClockActionLabel(action)}</p>
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
              ))}

              {!(summary?.state?.availableActions || []).length ? (
                <div className="rounded-[24px] border border-dashed border-darkBlue/15 bg-lightGrey/35 px-4 py-6 text-sm text-darkBlue/55 midTablet:col-span-2">
                  Sélectionnez un salarié pour connaître les actions disponibles.
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-darkBlue">Signature</p>

              <button
                type="button"
                onClick={() => {
                  signaturePadRef.current?.clear?.();
                  setSignatureStrokes([]);
                }}
                className="text-sm text-darkBlue/55 transition hover:text-darkBlue"
              >
                Effacer
              </button>
            </div>

            <SignaturePadTimeClockComponent
              ref={signaturePadRef}
              className="mt-3"
              onChange={setSignatureStrokes}
              placeholder="Signature du salarié"
            />
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              !selectedEmployee || !selectedAction || !signatureStrokes.length || saving
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
    </section>
  );
}
