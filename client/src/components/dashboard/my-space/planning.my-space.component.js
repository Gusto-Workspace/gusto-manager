import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Coffee, Utensils, UsersRound } from "lucide-react";
import { useTranslation } from "next-i18next";
import { ClockDialog } from "../time-clock/register-controls.time-clock.component";
import { isPlanningDate, movePersonalPlanning, personalShifts, planningDateKey, planningDateLabel, planningRange,
  planningTimeLabel, shiftsForDate } from "./my-space-planning.utils.mjs";

const control = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-darkBlue/15 bg-white px-3 text-sm font-semibold transition hover:bg-lightGrey focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet";
const weekday = { weekday: "long", day: "numeric", month: "long" };

export function usePersonalPlanning({ employeeId, restaurantId, planningRevision }) {
  const [response, setResponse] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${restaurantId}:${employeeId}`;
  useEffect(() => {
    if (!restaurantId || !employeeId) return;
    const controller = new AbortController();
    axios.get(`${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/${employeeId}/shifts`, {
      params: { scope: "personal" }, signal: controller.signal,
    }).then(({ data }) => {
      if (!controller.signal.aborted) setResponse({ key, shifts: personalShifts(data.shifts) });
    }).catch((error) => {
      if (!controller.signal.aborted) setResponse({ key, error: error.response?.status || true, shifts: [] });
    });
    return () => controller.abort();
  }, [employeeId, restaurantId, key, planningRevision, attempt]);
  const current = response?.key === key ? response : null;
  return { shifts: current?.shifts || [], loading: !current, error: current?.error,
    retry: () => { setResponse(null); setAttempt((value) => value + 1); } };
}

export function ScheduleFeedback({ schedule }) {
  const { t } = useTranslation("myspace");
  if (schedule.loading) return <p role="status" className="rounded-xl bg-white p-5 text-sm text-darkBlue/75">{t("workspace.loadingPlanning")}</p>;
  if (!schedule.error) return null;
  return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red/40 bg-white p-4 text-sm">
    <span>{t(schedule.error === 403 ? "workspace.planningDenied" : "workspace.planningError")}</span>
    <button type="button" className={control} onClick={schedule.retry}>{t("workspace.retry")}</button>
  </div>;
}

function duration(minutes, t) {
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${String(minutes % 60).padStart(2,"0")}` : ""}`
    : t("workspace.minutes", { count: minutes });
}

function shiftLabel(shift, t) {
  return shift.absence ? t(`planning:absenceTypes.${shift.absence}`, { defaultValue: shift.title || t("workspace.absence") })
    : shift.position || shift.title || t("workspace.shift");
}

export function PersonalShiftCard({ shift, onClick }) {
  const { t } = useTranslation(["myspace", "planning"]);
  const time = shift.fullDay ? t("workspace.fullDay") : `${planningTimeLabel(shift.start)} – ${planningTimeLabel(shift.end)}`;
  const tone = shift.absence ? "border-orange/50 bg-white" : "border-violet/45 bg-white hover:border-violet";
  return <button type="button" onClick={() => onClick(shift)}
    className={`grid w-full min-w-0 gap-2.5 rounded-2xl border border-l-4 px-4 py-3.5 text-left shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet ${tone}`}>
    <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <strong className="text-base leading-tight tabular-nums">{time}</strong>
      {!shift.absence && <span className="rounded-lg bg-lightGrey px-2 py-1 text-xs font-semibold text-darkBlue/85">{duration(shift.netMinutes, t)}</span>}
    </span>
    <span className="min-w-0 break-words text-sm font-semibold">{shiftLabel(shift, t)}</span>
    {!shift.absence && (shift.pause > 0 || shift.mealCount > 0) && <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-darkBlue/75">
      {shift.pause > 0 && !shift.absence && <span className="inline-flex items-center gap-1.5"><Coffee size={14} aria-hidden="true" />{t("workspace.break", { count: shift.pause })}</span>}
      {shift.mealCount > 0 && !shift.absence && <span className="inline-flex items-center gap-1.5"><Utensils size={14} aria-hidden="true" />{t("workspace.meals", { count: shift.mealCount })}</span>}
    </span>}
  </button>;
}

export function PersonalShiftDetails({ shift, onClose }) {
  const { t, i18n } = useTranslation(["myspace", "planning"]);
  if (!shift) return null;
  const locale = i18n.language === "en" ? "en-GB" : "fr-FR";
  const endDate = planningDateKey(shift.end);
  const begins = planningDateLabel(shift.startDate, locale, weekday);
  const ends = endDate === shift.startDate ? "" : planningDateLabel(endDate, locale, weekday);
  return <ClockDialog title={shiftLabel(shift, t)} onClose={onClose}>
    <dl className="grid gap-3 rounded-xl border border-darkBlue/10 bg-lightGrey/55 p-4 text-sm">
      <div><dt className="font-semibold">{t("workspace.date")}</dt><dd className="capitalize">{begins}{ends && ` – ${ends}`}</dd></div>
      <div><dt className="font-semibold">{t("workspace.schedule")}</dt>
        <dd>{shift.fullDay ? t("workspace.fullDay") : `${planningTimeLabel(shift.start)} – ${planningTimeLabel(shift.end)}`}</dd></div>
      {!shift.absence && <div><dt className="font-semibold">{t("workspace.duration")}</dt><dd>{duration(shift.netMinutes, t)}
        {shift.pause > 0 && ` · ${t("workspace.break", { count: shift.pause })}`}</dd></div>}
    </dl>
    {shift.notes && <p className="mt-4 whitespace-pre-wrap break-words rounded-xl border border-darkBlue/10 p-4 text-sm">{shift.notes}</p>}
  </ClockDialog>;
}

export default function PlanningMySpaceComponent({ schedule, canManage, initialPlanningDate }) {
  const { t, i18n } = useTranslation("myspace");
  const locale = i18n.language === "en" ? "en-GB" : "fr-FR";
  const today = planningDateKey(new Date());
  const [date, setDate] = useState(() => isPlanningDate(initialPlanningDate) ? initialPlanningDate : today);
  const [view, setView] = useState("week");
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    if (isPlanningDate(initialPlanningDate)) setDate(initialPlanningDate);
  }, [initialPlanningDate]);
  const range = useMemo(() => planningRange(date, view), [date, view]);
  const caption = view === "month" ? planningDateLabel(range.from, locale, { month: "long", year: "numeric" }) :
    [planningDateLabel(range.from, locale, { day: "numeric", month: "short" }),
      planningDateLabel(range.to, locale, { day: "numeric", month: "short", year: "numeric" })].join(" – ");
  const dates = view === "month" ? range.dates.filter((key) => shiftsForDate(schedule.shifts, key).length) : range.dates;
  return <section id="my-planning" className="grid min-w-0 gap-5" aria-label={t("workspace.planning")}>
    <div className="grid gap-4 rounded-2xl border border-darkBlue/10 bg-white p-4 midTablet:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-xl bg-lightGrey p-1" aria-label={t("workspace.planningView")}>
          {["week", "month"].map((mode) => <button key={mode} type="button" aria-pressed={view === mode}
            className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${view === mode ? "bg-darkBlue text-white" : "text-darkBlue/75"}`}
            onClick={() => setView(mode)}>{t(`workspace.${mode}`)}</button>)}
        </div>
        {canManage && <Link className={control} href="/dashboard/employees/planning"><UsersRound size={17} aria-hidden="true" />{t("workspace.team")}</Link>}
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
        <button type="button" className={control} onClick={() => setDate(movePersonalPlanning(date, view, -1))} aria-label={t("workspace.previous")}><ChevronLeft size={20} /></button>
        <p className="text-center text-sm font-semibold capitalize midTablet:text-base" aria-live="polite">{caption}</p>
        <button type="button" className={control} onClick={() => setDate(movePersonalPlanning(date, view, 1))} aria-label={t("workspace.next")}><ChevronRight size={20} /></button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-darkBlue/10 pt-3">
        <label className="inline-flex min-h-11 items-center gap-2 text-sm font-medium">
          <CalendarDays size={17} aria-hidden="true" />
          <input className="min-w-0 rounded-lg border border-darkBlue/15 px-2 py-2 text-sm" type="date" value={date}
            aria-label={t("workspace.jumpDate")} onChange={(event) => { if (isPlanningDate(event.target.value)) setDate(event.target.value); }} />
        </label>
        <button type="button" className={control} onClick={() => setDate(today)}>{t("workspace.today")}</button>
      </div>
    </div>
    <ScheduleFeedback schedule={schedule} />
    {!schedule.loading && !schedule.error && <>
      {!dates.length && <p className="rounded-xl border border-darkBlue/10 bg-white p-5 text-sm text-darkBlue/75">{t("workspace.emptyPlanning")}</p>}
      <ol className="grid gap-4 midTablet:grid-cols-2 desktop:grid-cols-3">
        {dates.map((key) => {
          const shifts = shiftsForDate(schedule.shifts, key);
          return <li key={key} className={`min-w-0 rounded-2xl border p-3.5 ${key === today ? "border-violet/35 bg-violet/10" : "border-darkBlue/10 bg-white/60"}`}>
            <h3 className="mb-3 flex items-center justify-between gap-2 text-sm font-semibold capitalize">
              <span className="min-w-0">{planningDateLabel(key, locale, weekday)}</span>
              {key === today && <span className="ml-auto shrink-0 rounded-md bg-violet px-2 py-1 text-[10px] font-semibold normal-case text-white">{t("workspace.today")}</span>}
            </h3>
            {shifts.length ? <div className="grid gap-2">{shifts.map((shift) =>
              <PersonalShiftCard key={shift.id} shift={shift} onClick={setSelected} />
            )}</div> : <p className="flex items-center gap-2 px-1 pb-2 text-sm text-darkBlue/70"><Clock3 size={15} aria-hidden="true" />{t("workspace.emptyDay")}</p>}
          </li>;
        })}
      </ol>
    </>}
    <PersonalShiftDetails shift={selected} onClose={() => setSelected(null)} />
  </section>;
}
