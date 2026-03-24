import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  AlertTriangle,
  CalendarDays,
  Clock3,
  Coffee,
  LogIn,
  LogOut,
  PenLine,
  RefreshCw,
  SquareArrowOutUpRight,
} from "lucide-react";

import SignaturePreviewTimeClockComponent from "./signature-preview.time-clock.component";
import {
  TIME_CLOCK_ACTIONS,
  TIME_CLOCK_REFRESH_EVENT,
  TIME_CLOCK_STORAGE_KEY,
  formatDateKey,
  formatDateTime,
  formatMinutes,
  formatTime,
  getAuthConfig,
  getTimeClockActionLabel,
  getTimeClockAnomalyLabel,
  getTimeClockSituationLabel,
  openTimeClockInNewTab,
  toLocalDateKey,
} from "./time-clock.utils";

function getSituationChipClasses(situation) {
  if (situation === "working") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (situation === "on_break") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-darkBlue/10 bg-white text-darkBlue/70";
}

function getActionIcon(action) {
  if (action === TIME_CLOCK_ACTIONS.CLOCK_IN) return LogIn;
  if (action === TIME_CLOCK_ACTIONS.CLOCK_OUT) return LogOut;
  if (action === TIME_CLOCK_ACTIONS.BREAK_START) return Coffee;
  return Clock3;
}

function EmptyState({ text }) {
  return (
    <div className="rounded-[28px] border border-dashed border-darkBlue/15 bg-white/60 px-5 py-8 text-center text-sm text-darkBlue/55">
      {text}
    </div>
  );
}

function AnomalyBadges({ anomalies = [] }) {
  if (!anomalies.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {anomalies.map((code) => (
        <span
          key={code}
          className="inline-flex items-center gap-1 rounded-full border border-red/15 bg-red/5 px-3 py-1 text-[11px] font-medium text-red"
        >
          <AlertTriangle className="size-3" />
          {getTimeClockAnomalyLabel(code)}
        </span>
      ))}
    </div>
  );
}

function SummaryCard({ title, subtitle, worked, breaks, sessions }) {
  return (
    <div className="rounded-[28px] border border-darkBlue/10 bg-white px-5 py-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-darkBlue/45">
        {title}
      </p>
      <p className="mt-1 text-sm text-darkBlue/70">{subtitle}</p>

      <div className="mt-5 flex flex-col gap-2">
        <div className="flex items-end justify-between gap-3">
          <span className="text-sm text-darkBlue/60">Heures nettes</span>
          <span className="text-2xl font-semibold text-darkBlue">
            {formatMinutes(worked)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 text-sm text-darkBlue/65">
          <span>Pauses</span>
          <span>{formatMinutes(breaks)}</span>
        </div>

        <div className="flex items-center justify-between gap-3 text-sm text-darkBlue/65">
          <span>Services</span>
          <span>{sessions}</span>
        </div>
      </div>
    </div>
  );
}

function RangeTable({ days = [], title, emptyText }) {
  const rows = title === "Récap mensuel" ? [...days].reverse() : days;
  const visibleRows =
    title === "Récap mensuel"
      ? rows.filter((day) => day.sessionCount > 0 || day.anomalies?.length > 0)
      : rows;

  return (
    <section className="rounded-[30px] border border-darkBlue/10 bg-white px-5 py-5 shadow-sm">
      <div className="flex items-center gap-3">
        <CalendarDays className="size-5 text-blue" />
        <h3 className="text-lg font-semibold text-darkBlue">{title}</h3>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {!visibleRows.length ? (
          <p className="text-sm text-darkBlue/55">{emptyText}</p>
        ) : (
          visibleRows.map((day) => (
            <div
              key={day.date}
              className="rounded-2xl border border-darkBlue/10 bg-lightGrey/45 px-4 py-3"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-darkBlue">{formatDateKey(day.date)}</p>
                  <p className="text-xs text-darkBlue/55">
                    {day.sessionCount > 0
                      ? `${day.sessionCount} service${day.sessionCount > 1 ? "s" : ""}`
                      : "Aucun service"}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-sm text-darkBlue/70">
                  <span>Net {formatMinutes(day.totalWorkedMinutes)}</span>
                  <span>Pauses {formatMinutes(day.totalBreakMinutes)}</span>
                  <span>Brut {formatMinutes(day.totalGrossMinutes)}</span>
                </div>
              </div>

              <div className="mt-3">
                <AnomalyBadges anomalies={day.anomalies || []} />
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function SessionCard({ session, onOpenSignature }) {
  return (
    <article className="rounded-[26px] border border-darkBlue/10 bg-lightGrey/45 px-4 py-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-lg font-semibold text-darkBlue">
            {formatTime(session.clockInAt)}{" "}
            <span className="text-darkBlue/35">→</span>{" "}
            {session.clockOutAt ? formatTime(session.clockOutAt) : "en cours"}
          </p>

          <p className="mt-1 text-sm text-darkBlue/65">
            Net {formatMinutes(session.totals.workedMinutes)} · Pauses{" "}
            {formatMinutes(session.totals.breakMinutes)} · Brut{" "}
            {formatMinutes(session.totals.grossMinutes)}
          </p>
        </div>

        <span
          className={[
            "inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-medium",
            getSituationChipClasses(session.situation),
          ].join(" ")}
        >
          {getTimeClockSituationLabel(session.situation)}
        </span>
      </div>

      <div className="mt-4">
        <AnomalyBadges anomalies={session.anomalies || []} />
      </div>

      {!!session.breaks?.length && (
        <div className="mt-4 rounded-2xl border border-darkBlue/10 bg-white/80 px-4 py-3">
          <p className="text-sm font-semibold text-darkBlue">Pauses</p>

          <div className="mt-3 flex flex-col gap-2">
            {session.breaks.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-1 text-sm text-darkBlue/70 md:flex-row md:items-center md:justify-between"
              >
                <span>
                  {formatTime(item.startAt)} →{" "}
                  {item.endAt ? formatTime(item.endAt) : "en cours"}
                </span>
                <span>{formatMinutes(item.durationMinutes)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-darkBlue/10 bg-white/80 px-4 py-3">
        <p className="text-sm font-semibold text-darkBlue">Historique du service</p>

        <div className="mt-3 flex flex-col gap-2">
          {(session.events || []).map((event) => {
            const Icon = getActionIcon(event.type);

            return (
              <div
                key={event.id}
                className="flex flex-col gap-2 rounded-2xl border border-darkBlue/10 bg-lightGrey/40 px-3 py-3 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-9 items-center justify-center rounded-2xl border border-darkBlue/10 bg-white text-darkBlue/70">
                    <Icon className="size-4" />
                  </span>

                  <div>
                    <p className="text-sm font-medium text-darkBlue">
                      {getTimeClockActionLabel(event.type)}
                    </p>
                    <p className="text-xs text-darkBlue/55">
                      {formatDateTime(event.at)}
                    </p>
                  </div>
                </div>

                {event.signature ? (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenSignature?.(
                        event.signature,
                        `${getTimeClockActionLabel(event.type)} · ${formatDateTime(event.at)}`,
                      )
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-darkBlue/10 bg-white px-3 py-2 text-sm text-darkBlue/70 transition hover:bg-darkBlue/5"
                  >
                    <PenLine className="size-4" />
                    Signature
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </article>
  );
}

export default function TimeClockSummaryComponent({
  restaurantId,
  employeeId = null,
  selfView = false,
  title = "Pointeuse",
  subtitle = "",
  allowOpenKiosk = false,
}) {
  const [anchorDate, setAnchorDate] = useState(() => toLocalDateKey(new Date()));
  const [reloadKey, setReloadKey] = useState(0);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [signatureModal, setSignatureModal] = useState(null);

  useEffect(() => {
    setAnchorDate(toLocalDateKey(new Date()));
    setSummary(null);
    setLoading(true);
    setError("");
  }, [restaurantId, employeeId, selfView]);

  useEffect(() => {
    if (!restaurantId || (!selfView && !employeeId)) return;

    let cancelled = false;
    const withSkeleton = !summary;

    async function run() {
      if (withSkeleton) setLoading(true);
      else setRefreshing(true);

      setError("");

      try {
        const endpoint = selfView
          ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/time-clock/me/summary`
          : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/time-clock/employees/${employeeId}/summary`;

        const { data } = await axios.get(
          endpoint,
          getAuthConfig({
            params: {
              anchorDate,
            },
          }),
        );

        if (cancelled) return;
        setSummary(data || null);
      } catch (requestError) {
        if (cancelled) return;
        console.error("Failed to fetch time-clock summary:", requestError);
        setError("Impossible de charger les horaires pointés.");
      } finally {
        if (cancelled) return;
        setLoading(false);
        setRefreshing(false);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [anchorDate, employeeId, restaurantId, reloadKey, selfView]);

  useEffect(() => {
    function handleRefresh() {
      setReloadKey((value) => value + 1);
    }

    function handleStorage(event) {
      if (event.key !== TIME_CLOCK_STORAGE_KEY) return;
      handleRefresh();
    }

    window.addEventListener(TIME_CLOCK_REFRESH_EVENT, handleRefresh);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(TIME_CLOCK_REFRESH_EVENT, handleRefresh);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!summary?.state?.activeSession) return;

    const timer = window.setInterval(() => {
      setReloadKey((value) => value + 1);
    }, 60000);

    return () => window.clearInterval(timer);
  }, [summary?.state?.activeSession]);

  const monthRows = useMemo(() => {
    const source = summary?.month?.days || [];
    return [...source].reverse().filter(
      (day) => day.sessionCount > 0 || (day.anomalies || []).length > 0,
    );
  }, [summary?.month?.days]);

  if (loading) {
    return (
      <section className="rounded-[30px] border border-darkBlue/10 bg-white px-6 py-8 shadow-sm">
        <p className="text-sm text-darkBlue/60">Chargement des horaires pointés…</p>
      </section>
    );
  }

  return (
    <>
      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="inline-flex size-12 items-center justify-center rounded-2xl border border-darkBlue/10 bg-white text-blue shadow-sm">
                <Clock3 className="size-5" />
              </span>

              <div>
                <h2 className="text-xl font-semibold text-darkBlue">{title}</h2>
                {subtitle ? (
                  <p className="text-sm text-darkBlue/60">{subtitle}</p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-2xl border border-darkBlue/10 bg-white px-3 py-2 shadow-sm">
              <CalendarDays className="size-4 text-darkBlue/55" />
              <input
                type="date"
                value={anchorDate}
                onChange={(event) => setAnchorDate(event.target.value)}
                className="bg-transparent text-sm text-darkBlue outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => setReloadKey((value) => value + 1)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-darkBlue/10 bg-white px-4 py-3 text-sm font-medium text-darkBlue shadow-sm transition hover:bg-darkBlue/5"
            >
              <RefreshCw
                className={[
                  "size-4",
                  refreshing ? "animate-spin" : "",
                ].join(" ")}
              />
              Actualiser
            </button>

            {allowOpenKiosk ? (
              <button
                type="button"
                onClick={openTimeClockInNewTab}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-blue/90"
              >
                <SquareArrowOutUpRight className="size-4" />
                Ouvrir la borne
              </button>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="rounded-[28px] border border-red/15 bg-red/5 px-5 py-4 text-sm text-red">
            {error}
          </div>
        ) : null}

        <section className="rounded-[30px] border border-darkBlue/10 bg-white px-5 py-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={[
                    "inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium",
                    getSituationChipClasses(summary?.state?.situation),
                  ].join(" ")}
                >
                  {getTimeClockSituationLabel(summary?.state?.situation)}
                </span>

                <span className="text-sm text-darkBlue/55">
                  {summary?.employee
                    ? `${summary.employee.firstname} ${summary.employee.lastname}`.trim()
                    : ""}
                </span>
              </div>

              <div className="text-sm text-darkBlue/70">
                {summary?.state?.activeSession ? (
                  <>
                    Service commencé à {formatTime(summary.state.activeSession.clockInAt)}
                    {summary.state.situation === "on_break"
                      ? " · pause actuellement en cours"
                      : ""}
                  </>
                ) : (
                  "Aucun service ouvert actuellement."
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {(summary?.state?.availableActions || []).map((action) => (
                <span
                  key={action}
                  className="inline-flex items-center rounded-full border border-darkBlue/10 bg-lightGrey/50 px-3 py-1 text-xs font-medium text-darkBlue/70"
                >
                  {getTimeClockActionLabel(action)}
                </span>
              ))}
            </div>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-3">
          <SummaryCard
            title="Journalier"
            subtitle={formatDateKey(summary?.day?.date)}
            worked={summary?.day?.totalWorkedMinutes || 0}
            breaks={summary?.day?.totalBreakMinutes || 0}
            sessions={summary?.day?.sessionCount || 0}
          />

          <SummaryCard
            title="Hebdomadaire"
            subtitle={`${formatDateKey(summary?.week?.startDate)} → ${formatDateKey(summary?.week?.endDate)}`}
            worked={summary?.week?.totalWorkedMinutes || 0}
            breaks={summary?.week?.totalBreakMinutes || 0}
            sessions={summary?.week?.totalSessions || 0}
          />

          <SummaryCard
            title="Mensuel"
            subtitle={`${formatDateKey(summary?.month?.startDate)} → ${formatDateKey(summary?.month?.endDate)}`}
            worked={summary?.month?.totalWorkedMinutes || 0}
            breaks={summary?.month?.totalBreakMinutes || 0}
            sessions={summary?.month?.totalSessions || 0}
          />
        </div>

        <section className="rounded-[30px] border border-darkBlue/10 bg-white px-5 py-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Clock3 className="size-5 text-blue" />
            <h3 className="text-lg font-semibold text-darkBlue">
              Détail journalier
            </h3>
          </div>

          <p className="mt-2 text-sm text-darkBlue/60">
            {formatDateKey(summary?.day?.date)} · Net{" "}
            {formatMinutes(summary?.day?.totalWorkedMinutes || 0)} · Pauses{" "}
            {formatMinutes(summary?.day?.totalBreakMinutes || 0)}
          </p>

          <div className="mt-4">
            <AnomalyBadges anomalies={summary?.day?.anomalies || []} />
          </div>

          <div className="mt-5 flex flex-col gap-4">
            {(summary?.day?.sessions || []).length ? (
              summary.day.sessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  onOpenSignature={(signature, titleText) =>
                    setSignatureModal({ signature, title: titleText })
                  }
                />
              ))
            ) : (
              <EmptyState text="Aucun pointage enregistré sur cette journée." />
            )}
          </div>
        </section>

        <RangeTable
          title="Récap hebdomadaire"
          days={summary?.week?.days || []}
          emptyText="Aucun pointage sur la semaine sélectionnée."
        />

        <section className="rounded-[30px] border border-darkBlue/10 bg-white px-5 py-5 shadow-sm">
          <div className="flex items-center gap-3">
            <CalendarDays className="size-5 text-blue" />
            <h3 className="text-lg font-semibold text-darkBlue">Récap mensuel</h3>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            {!monthRows.length ? (
              <p className="text-sm text-darkBlue/55">
                Aucun pointage sur le mois sélectionné.
              </p>
            ) : (
              monthRows.map((day) => (
                <div
                  key={day.date}
                  className="rounded-2xl border border-darkBlue/10 bg-lightGrey/45 px-4 py-3"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-medium text-darkBlue">{formatDateKey(day.date)}</p>
                      <p className="text-xs text-darkBlue/55">
                        {day.sessionCount} service{day.sessionCount > 1 ? "s" : ""}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-sm text-darkBlue/70">
                      <span>Net {formatMinutes(day.totalWorkedMinutes)}</span>
                      <span>Pauses {formatMinutes(day.totalBreakMinutes)}</span>
                      <span>Brut {formatMinutes(day.totalGrossMinutes)}</span>
                    </div>
                  </div>

                  <div className="mt-3">
                    <AnomalyBadges anomalies={day.anomalies || []} />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-[30px] border border-darkBlue/10 bg-white px-5 py-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Clock3 className="size-5 text-blue" />
            <h3 className="text-lg font-semibold text-darkBlue">Historique</h3>
          </div>

          <div className="mt-4 flex flex-col gap-4">
            {(summary?.history || []).length ? (
              summary.history.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  onOpenSignature={(signature, titleText) =>
                    setSignatureModal({ signature, title: titleText })
                  }
                />
              ))
            ) : (
              <EmptyState text="Aucun historique disponible pour le moment." />
            )}
          </div>
        </section>
      </section>

      {signatureModal ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            onClick={() => setSignatureModal(null)}
            aria-label="Fermer"
          />

          <div className="relative w-full max-w-[700px] rounded-[32px] border border-darkBlue/10 bg-lightGrey p-5 shadow-[0_24px_80px_rgba(19,30,54,0.22)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-lg font-semibold text-darkBlue">
                  Signature
                </h4>
                <p className="text-sm text-darkBlue/60">
                  {signatureModal.title}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSignatureModal(null)}
                className="inline-flex size-10 items-center justify-center rounded-2xl border border-darkBlue/10 bg-white text-darkBlue/60 transition hover:bg-darkBlue/5"
              >
                ×
              </button>
            </div>

            <SignaturePreviewTimeClockComponent
              signature={signatureModal.signature}
              className="mt-5"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
