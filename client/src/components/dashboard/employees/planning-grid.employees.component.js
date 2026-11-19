import { useState } from "react";
import { format, getISOWeek } from "date-fns";
import { useTranslation } from "next-i18next";
import { enGB, fr } from "date-fns/locale";
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  Search,
  Send,
  UtensilsCrossed,
  X,
} from "lucide-react";
import french from "../../../../public/locales/fr/planning.json";
import english from "../../../../public/locales/en/planning.json";
import styles from "./planning-grid.module.scss";
import {
  formatPlanningDuration,
  getPlanningSlot,
  parisPlanningDateKey,
  parisPlanningTime,
  PLANNING_TIME_ZONE,
  getPlanningTimeline,
  layOutPlanningDay,
  parsePlanningDate,
  planningDateKey,
  PLANNING_GROUPS,
  PLANNING_VIEWS,
} from "./planning-grid.utils.mjs";
import { getShiftMealMeta } from "./planning-meals.utils";

const EMPLOYEE_COLORS = [
  "#405d9c",
  "#096d65",
  "#754895",
  "#9a4c24",
  "#923b60",
  "#306476",
];

export function PlanningToolbar({
  date,
  period,
  view,
  group,
  query,
  employeeId,
  employees,
  onDate,
  onStep,
  onToday,
  onView,
  onGroup,
  onQuery,
  onEmployee,
  onClear,
  onBack,
  onLeaves,
  onExport,
  onSend,
}) {
  const { t, i18n } = useTranslation("employees");
  const label = (key) => t(`planning:grid.${key}`);
  const locale = i18n.language?.startsWith("en") ? enGB : fr;
  const fmt = (value, pattern) => format(value, pattern, { locale });
  let rangeLabel = fmt(date, "EEEE d MMMM yyyy");
  if (view === PLANNING_VIEWS.WEEK)
    rangeLabel = `${fmt(period.start, "d MMM")} – ${fmt(period.days.at(-1), "d MMM yyyy")}`;
  if (view === PLANNING_VIEWS.MONTH) rangeLabel = fmt(date, "MMMM yyyy");

  return (
    <header className={styles.toolbar}>
      <div className={styles.brandRow}>
        <div className={styles.titleGroup}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={onBack}
            aria-label={t("titles.main")}
            title={t("titles.main")}
          >
            <ArrowLeft aria-hidden="true" size={17} />
          </button>
          <h2>{t("titles.planning")}</h2>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.control}
            onClick={onLeaves}
            title={t("titles.daysOff")}
          >
            <CalendarDays aria-hidden="true" size={16} />
            {t("titles.daysOff")}
          </button>
          <button
            type="button"
            className={styles.control}
            onClick={onExport}
            title={label("export")}
          >
            <Download aria-hidden="true" size={16} />
            {label("export")}
          </button>
          <button
            type="button"
            className={styles.control}
            onClick={onSend}
            title={label("send")}
          >
            <Send aria-hidden="true" size={16} />
            {label("send")}
          </button>
        </div>
      </div>

      <div className={styles.navigationRow}>
        <div className={styles.periodControls}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => onStep(-1)}
            aria-label={label("previous")}
            title={label("previous")}
          >
            <ChevronLeft aria-hidden="true" size={17} />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => onStep(1)}
            aria-label={label("next")}
            title={label("next")}
          >
            <ChevronRight aria-hidden="true" size={17} />
          </button>
          <button type="button" className={styles.control} onClick={onToday}>
            {label("today")}
          </button>
          <div className={styles.periodTitle} aria-live="polite">
            <strong>{rangeLabel}</strong>
            {view === PLANNING_VIEWS.WEEK && (
              <small>
                {label("week")} {getISOWeek(period.start)}
              </small>
            )}
          </div>
          <input
            type="date"
            className={styles.dateInput}
            value={planningDateKey(date)}
            aria-label={label("chooseDate")}
            onChange={(event) => {
              const selected = parsePlanningDate(event.target.value);
              if (selected) onDate(selected);
            }}
          />
        </div>
        <div
          className={styles.segmented}
          role="group"
          aria-label={label("view")}
        >
          {Object.values(PLANNING_VIEWS).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={item === view}
              onClick={() => onView(item)}
            >
              {label(item)}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.filterRow}>
        <div
          className={styles.segmented}
          role="group"
          aria-label={label("group")}
        >
          {Object.values(PLANNING_GROUPS).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={item === group}
              onClick={() => onGroup(item)}
            >
              {label(item)}
            </button>
          ))}
        </div>
        <label className={styles.search}>
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={query}
            aria-label={label("search")}
            placeholder={label("search")}
            onChange={(event) => onQuery(event.target.value)}
          />
        </label>
        <select
          className={styles.employeeFilter}
          value={employeeId ?? ""}
          aria-label={label("employeeFilter")}
          onChange={(event) => onEmployee(event.target.value || null)}
        >
          <option value="">{label("allEmployees")}</option>
          {employees.map((employee) => (
            <option key={employee._id} value={employee._id}>
              {employee.name}
            </option>
          ))}
        </select>
        {(query || employeeId) && (
          <button
            type="button"
            className={styles.iconButton}
            onClick={onClear}
            aria-label={label("clear")}
            title={label("clear")}
          >
            <X aria-hidden="true" size={16} />
          </button>
        )}
      </div>
    </header>
  );
}

function ShiftCard({
  segment,
  color,
  mode,
  openingHours,
  onOpen,
  style,
  shiftTime,
  label,
}) {
  const { event } = segment;
  const isWeek = mode === "week";
  const { hasMeal } = getShiftMealMeta({
    start: event.start,
    end: event.end,
    openingHours,
    isLeave: event.isLeave,
  });
  const workTitle = event.position || event.shiftLabel || (isWeek ? label("noPost") : label("shift"));
  const absenceTitle = event.absenceType && label(`absenceTypes.${event.absenceType}`);
  const title = event.isLeave
    ? absenceTitle ||
      label(
        event.leaveType === "morning" || event.leaveType === "afternoon"
          ? event.leaveType
          : "leave",
      )
    : workTitle;
  const crossesDay = parisPlanningDateKey(event.start) !== parisPlanningDateKey(event.end);
  const separator = isWeek ? " - " : "–";
  const range = `${parisPlanningTime(segment.start)}${separator}${segment.endsAtMidnight ? "24:00" : parisPlanningTime(segment.end)}`;
  const visibleRange = event.fullDay ? label("allDay") : range;
  const duration = mode !== "month" && !event.isLeave && formatPlanningDuration(event.minutes);
  const fullRange = `${shiftTime(event.start, crossesDay)}${isWeek ? separator : " – "}${shiftTime(event.end, crossesDay)}`;
  const description = `${title} · ${event.fullDay ? label("allDay") : fullRange}${duration ? ` · ${duration}` : ""}${hasMeal ? ` · ${label("meal")}` : ""}`;
  const postColor = event.position && EMPLOYEE_COLORS[
    [...event.position].reduce((index, character) => (index * 31 + character.codePointAt(0)) % EMPLOYEE_COLORS.length, 0)
  ];
  return (
    <button
      type="button"
      className={`${styles.shift} ${styles[`${mode}Shift`]} ${event.isLeave ? styles.leave : ""}`}
      style={{ ...style, "--employee-accent": postColor || color }}
      onClick={() => onOpen(event)}
      title={description}
      aria-label={description}
    >
      <span className={styles.shiftTime}>
        {mode === "month"
          ? event.isLeave
            ? title
            : parisPlanningTime(event.start).replace(":", "h")
          : visibleRange}
      </span>
      {mode !== "month" && (
        <span className={styles.shiftMeta}>
          <span>{title}</span>
          {duration && !segment.fromPreviousDay && <small>{duration}</small>}
        </span>
      )}
      {mode === "month" && !event.isLeave && (
        <span className={styles.shiftTime}>{parisPlanningTime(event.end).replace(":", "h")}</span>
      )}
      {hasMeal && mode !== "month" && (
        <UtensilsCrossed className={styles.meal} size={12} aria-hidden="true" />
      )}
    </button>
  );
}

function PlanningCell({
  segments,
  employee,
  position,
  day,
  mode,
  label,
  fmt,
  shiftTime,
  color,
  openingHours,
  onAdd,
  onOpen,
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = mode === "month" && !expanded ? segments.slice(0, 2) : segments;
  const extra = segments.length - 2;
  return (
    <div
      className={`${styles.cellContent} ${mode === "week" && segments.length ? styles.weekWithShifts : ""}`}
    >
      {shown.map((segment) => (
        <ShiftCard
          key={segment.event.id}
          {...{ segment, mode, label, shiftTime, color, openingHours, onOpen }}
        />
      ))}
      {mode === "month" && extra > 0 && (
        <button
          type="button"
          className={styles.more}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? label("less") : `+${extra}`}
        </button>
      )}
      <button
        type="button"
        className={`${styles.cellAdd} ${segments.length ? "" : styles.emptyAdd}`}
        onClick={() => onAdd(employee._id, getPlanningSlot(day), position)}
        aria-label={`${label("add")} · ${employee.name} · ${fmt(day, "PPP")}`}
      >
        <Plus size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

function DayLane({
  segments,
  employee,
  position,
  period,
  timeline,
  label,
  fmt,
  shiftTime,
  color,
  openingHours,
  onAdd,
  onOpen,
}) {
  const { start, startInstant, endInstant } = period;
  const positioned = layOutPlanningDay(segments, startInstant, endInstant);
  const rows = positioned.reduce(
    (max, item) => Math.max(max, item.lane + 1),
    1,
  );

  function selectHour(event) {
    const { left, width } = event.currentTarget.getBoundingClientRect();
    const minute =
      event.detail === 0
        ? null
        : Math.max(
            0,
            Math.min(
              timeline.minutes - 30,
              Math.floor(
                (((event.clientX - left) / width) * timeline.minutes) / 30,
              ) * 30,
            ),
          );
    onAdd(employee._id, getPlanningSlot(start, minute), position);
  }

  return (
    <div
      className={styles.timeline}
      style={{ "--hours": timeline.minutes / 60, "--lanes": rows }}
    >
      <button
        type="button"
        className={styles.timelineAdd}
        onClick={selectHour}
        aria-label={`${label("add")} · ${employee.name} · ${fmt(start, "PPP")}`}
      />
      {positioned.map(({ left, width, lane, ...segment }) => (
        <ShiftCard
          key={segment.event.id}
          mode="day"
          style={{
            left: `${left}%`,
            width: `${width}%`,
            top: `calc(7px + ${lane} * 42px)`,
          }}
          {...{ segment, label, shiftTime, color, openingHours, onOpen }}
        />
      ))}
    </div>
  );
}

export function PlanningGrid({
  view,
  period,
  data,
  employeeColors,
  openingHours,
  onDay,
  onAdd,
  onOpen,
}) {
  const { t, i18n } = useTranslation("employees");
  const locale = i18n.language?.startsWith("en") ? enGB : fr;
  const absenceLabels = (locale === enGB ? english : french).absenceTypes;
  const label = (key) => {
    if (!key.startsWith("absenceTypes.")) return t(`planning:grid.${key}`);
    const type = key.slice("absenceTypes.".length);
    if (!Object.hasOwn(absenceLabels, type)) return "";
    return t(`planning:${key}`, { defaultValue: absenceLabels[type] });
  };
  const fmt = (value, pattern) => format(value, pattern, { locale });
  const shiftDate = new Intl.DateTimeFormat(i18n.language || "fr", {
    timeZone: PLANNING_TIME_ZONE, day: "numeric", month: "short",
  });
  const hourWithOffset = new Intl.DateTimeFormat(i18n.language || "fr", {
    timeZone: PLANNING_TIME_ZONE, hour: "2-digit", minute: "2-digit",
    hourCycle: "h23", timeZoneName: "shortOffset",
  });
  const shiftTime = (value, withDate) =>
    `${withDate ? `${shiftDate.format(value)} ` : ""}${parisPlanningTime(value)}`;
  const isDay = view === PLANNING_VIEWS.DAY;
  const isMonth = view === PLANNING_VIEWS.MONTH;
  const today = parisPlanningDateKey(new Date());
  const timeline = isDay
    ? getPlanningTimeline(period.startInstant, period.endInstant)
    : null;
  const minWidth =
    290 +
    (isDay
      ? (timeline.minutes / 60) * 52
      : period.days.length * (isMonth ? 58 : 120));
  const columnCount = (isDay ? 1 : period.days.length) + 2;

  function dayClass(day, index) {
    return `${planningDateKey(day) === today ? styles.today : ""} ${isMonth && index > 0 && day.getDay() === 1 ? styles.weekBreak : ""}`;
  }

  return (
    <>
      <div
        className={styles.scroll}
        tabIndex={0}
        role="region"
        aria-label={`${t("titles.planning")} · ${label(view)}`}
      >
        <table
          className={`${styles.table} ${isMonth ? styles.monthTable : ""}`}
          style={{ minWidth }}
        >
          <colgroup>
            <col className={styles.employeeColumn} />
            {(isDay ? [period.start] : period.days).map((day) => (
              <col key={planningDateKey(day)} />
            ))}
            <col className={styles.totalColumn} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className={styles.identity}>
                {label("employees")}
              </th>
              {isDay ? (
                <th
                  scope="col"
                  className={dayClass(period.start, 0)}
                  aria-label={label("hours")}
                >
                  <div
                    className={styles.hourLabels}
                    style={{
                      gridTemplateColumns: `repeat(${timeline.hours.length}, minmax(0, 1fr))`,
                    }}
                  >
                    {timeline.hours.map((hour) => (
                      <span key={+hour} title={hourWithOffset.format(hour)}>
                        {parisPlanningTime(hour)}
                      </span>
                    ))}
                  </div>
                </th>
              ) : (
                period.days.map((day, index) => (
                  <th
                    key={planningDateKey(day)}
                    scope="col"
                    className={dayClass(day, index)}
                  >
                    <button
                      type="button"
                      className={styles.dayHeader}
                      onClick={() => onDay(day)}
                      aria-label={`${label("openDay")} · ${fmt(day, "PPP")}`}
                      aria-current={
                        planningDateKey(day) === today ? "date" : undefined
                      }
                    >
                      <span>{fmt(day, "EEE")}</span>
                      <strong>{fmt(day, isMonth ? "d" : "d MMM")}</strong>
                    </button>
                  </th>
                ))
              )}
              <th scope="col" className={styles.total}>
                {label("total")}
              </th>
            </tr>
          </thead>
          {data.groups.length === 0 && (
            <tbody>
              <tr>
                <td colSpan={columnCount} className={styles.empty}>
                  {label("noEmployees")}
                </td>
              </tr>
            </tbody>
          )}
          {data.groups.map(({ label: groupLabel, rows, minutes }) => (
            <tbody key={groupLabel}>
              {groupLabel && (
                <tr className={styles.groupRow}>
                  <th scope="rowgroup" className={styles.identity}>
                    {groupLabel} <small>· {rows.length}</small>
                  </th>
                  <td colSpan={columnCount - 2} />
                  <td className={styles.total}>
                    {formatPlanningDuration(minutes)}
                  </td>
                </tr>
              )}
              {rows.map(({ employee, cells, position, minutes: rowMinutes }) => {
                const color =
                  EMPLOYEE_COLORS[
                    (employeeColors.get(String(employee._id)) || 0) %
                      EMPLOYEE_COLORS.length
                  ];
                const employment = employee.employment;
                const hasContractHours =
                  employment.contractualValue > 0 &&
                  ["week", "month"].includes(employment.contractualUnit);
                return (
                  <tr key={employee._id}>
                    <th scope="row" className={styles.identity}>
                      <div className={styles.person}>
                        <span
                          className={styles.initials}
                          style={{ "--employee-accent": color }}
                          aria-hidden="true"
                        >
                          {`${employee.firstname?.[0] || ""}${employee.lastname?.[0] || ""}`.toUpperCase()}
                        </span>
                        <div>
                          <strong>{employee.name}</strong>
                          <small>
                            {[
                              employee.post,
                              employment.contractType,
                              hasContractHours &&
                                `${employment.contractualValue} ${label(employment.contractualUnit === "week" ? "weeklyHours" : "monthlyHours")}`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                        </div>
                      </div>
                    </th>
                    {isDay ? (
                      <td className={styles.dayCell}>
                        <DayLane
                          {...{
                            employee,
                            position,
                            period,
                            timeline,
                            label,
                            fmt,
                            shiftTime,
                            color,
                            openingHours,
                            onAdd,
                            onOpen,
                          }}
                          segments={cells[0]}
                        />
                      </td>
                    ) : (
                      cells.map((segments, index) => {
                        const day = period.days[index];
                        return (
                          <td
                            key={planningDateKey(day)}
                            className={dayClass(day, index)}
                          >
                            <PlanningCell
                              mode={isMonth ? "month" : "week"}
                              {...{
                                day,
                                segments,
                                employee,
                                position,
                                label,
                                fmt,
                                shiftTime,
                                color,
                                openingHours,
                                onAdd,
                                onOpen,
                              }}
                            />
                          </td>
                        );
                      })
                    )}
                    <td className={styles.total}>
                      {formatPlanningDuration(rowMinutes)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
          <tfoot>
            <tr>
              <th scope="row" className={styles.identity}>
                {label("plannedHours")}
              </th>
              {data.dailyMinutes.map((minutes, index) => (
                <td
                  key={planningDateKey(period.days[index])}
                  className={dayClass(period.days[index], index)}
                >
                  {formatPlanningDuration(minutes)}
                </td>
              ))}
              <td className={styles.total}>
                {formatPlanningDuration(data.totalMinutes)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className={styles.legend}>
        <span>
          <i className={styles.workSwatch} />
          {label("shift")}
        </span>
        <span>
          <i className={styles.leaveSwatch} />
          {label("leave")}
        </span>
        <span>{label("totalRule")}</span>
        {data.carriedMinutes > 0 && (
          <span>
            {t("planning:grid.carryOver", {
              duration: formatPlanningDuration(data.carriedMinutes),
            })}
          </span>
        )}
      </div>
    </>
  );
}
