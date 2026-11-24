import { useState } from "react";
import { format, getISOWeek } from "date-fns";
import { useTranslation } from "next-i18next";
import { enGB, fr } from "date-fns/locale";
import {
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Hourglass,
  Lock,
  LockOpen,
  Plus,
  Search,
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
  weeklyPlanningDifference,
} from "./planning-grid.utils.mjs";
import { getShiftMealMeta } from "./planning-meals.utils";
import CatalogHeaderDashboardComponent from "../_shared/catalog-header.dashboard.component";
import { eventsInCell } from "./planning-actions.utils.mjs";
import {
  CellSelection, cellInteractionProps, DragPreview, DropChoices,
  ShiftContextMenu, ShiftMenuTrigger, usePlanningDrag, useShiftMenu,
} from "./planning-drag.employees";

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
  onPublish,
  publicationStatus,
  onLockPeriod,
  hasPeriodLock,
  counterControl,
}) {
  const { t, i18n } = useTranslation("employees");
  const label = (key) => t(`planning:grid.${key}`);
  const locale = i18n.language?.startsWith("en") ? enGB : fr;
  const fmt = (value, pattern) => format(value, pattern, { locale });
  let rangeLabel = fmt(date, "EEEE d MMMM yyyy");
  if (view === PLANNING_VIEWS.WEEK)
    rangeLabel = `${fmt(period.start, "d MMM")} – ${fmt(period.days.at(-1), "d MMM yyyy")}`;
  if (view === PLANNING_VIEWS.MONTH) rangeLabel = fmt(date, "MMMM yyyy");
  const partlyPublished = publicationStatus === "partial";
  const fullyPublished = publicationStatus === "published";
  const PublishIcon = fullyPublished ? Check : partlyPublished ? Hourglass : CalendarCheck;
  const publishLabel = t(fullyPublished || partlyPublished ? "planning:publication.published" : "planning:publication.publish");
  const partialLabel = partlyPublished ? t("planning:publication.partial") : undefined;

  return (
    <>
      <CatalogHeaderDashboardComponent title={t("titles.planning")} onBack={onBack} backLabel={t("titles.main")}
        actionsClassName={styles.actions} actions={<>
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
          {onPublish && (
            <button type="button" className={`${styles.control} ${styles.publicationPrimary}`} onClick={onPublish}
              aria-label={partialLabel} title={partialLabel}>
              <PublishIcon aria-hidden="true" size={16} />
              {publishLabel}
            </button>
          )}
        </>} />
      <div className={styles.toolbar}>
      <div className={styles.navigationRow}>
        <div className={styles.periodControls}>
          {onLockPeriod && <button type="button" className={styles.iconButton} onClick={onLockPeriod}
            title={t("planning:publication.lockTitle")} aria-label={t("planning:publication.lockTitle")}>
            {hasPeriodLock ? <Lock size={17} aria-hidden="true" /> : <LockOpen size={17} aria-hidden="true" />}
          </button>}
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
        <div className={styles.employeeControls}><select
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
        </select>{counterControl}</div>
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
      </div>
    </>
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
  interactions,
  cell,
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
  const { commands, drag, menuState } = interactions;
  const interactive = commands?.enabled && !event.isLeave;
  return <div
    className={`${styles.shiftItem} ${mode === "day" ? styles.dayShiftItem : ""} ${interactive ? styles.manageableShift : ""}`}
    style={style}
    data-planning-shift={event.id}
  >
    <button
      type="button"
      className={`${styles.shift} ${styles[`${mode}Shift`]} ${event.isLeave ? styles.leave : ""}`}
      style={{ "--employee-accent": postColor || color }}
      onClick={(e) => {
        if (drag.wasDrag(e)) return;
        if (!commands?.busy) onOpen(event);
      }}
      {...(interactive && {
        onPointerDown: (e) => drag.start(e, cell, "card", [event]),
        onPointerMove: drag.move, onPointerUp: drag.finish,
        onPointerCancel: drag.cancel, onLostPointerCapture: drag.cancel,
        onContextMenu: (e) => {
          e.preventDefault();
          if (!commands.busy) menuState.open(event, e.currentTarget, cell);
        },
      })}
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
    {interactive && mode !== "month" && <ShiftMenuTrigger shift={event} {...{ menuState, cell }} busy={commands.busy}
      label={`${commands.label("menu")} · ${description}`} />}
  </div>;
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
  interactions,
  cell,
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = mode === "month" && !expanded ? segments.slice(0, 2) : segments;
  const extra = segments.length - 2;
  return (
    <div
      className={styles.cellContent}
    >
      {shown.map((segment) => (
        <ShiftCard
          key={segment.event.id}
          {...{ segment, mode, label, shiftTime, color, openingHours, onOpen, interactions, cell }}
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
  interactions,
  cell,
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
          {...{ segment, label, shiftTime, color, openingHours, onOpen, interactions, cell }}
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
  commands,
  group,
  lockedByDate,
  onLockDay,
  counters,
  targets,
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
  const visibleRows = [...new Set(data.groups.flatMap(({ rows }) => rows.map(({ employee }) => String(employee._id))))];
  const selectedIds = new Set(commands?.selection?.events.map(({ id }) => id));
  const drag = usePlanningDrag(commands, visibleRows);
  const menuState = useShiftMenu();
  const interactions = { commands, drag, menuState, allowHandle: !isDay && group === PLANNING_GROUPS.EMPLOYEES };

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
                    <div className={styles.dayControls}>
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
                    {onLockDay && <button type="button" className={styles.dayLock} data-locked={lockedByDate.get(planningDateKey(day)) || undefined}
                      onClick={() => onLockDay(planningDateKey(day))}
                      title={t(lockedByDate.get(planningDateKey(day)) ? "planning:publication.unlock" : "planning:publication.lock")}
                      aria-label={`${t(lockedByDate.get(planningDateKey(day)) ? "planning:publication.unlock" : "planning:publication.lock")} · ${fmt(day, "PPP")}`}>
                      {lockedByDate.get(planningDateKey(day)) ? <Lock size={13} aria-hidden="true" /> : <LockOpen size={13} aria-hidden="true" />}
                    </button>}
                    </div>
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
                const rowKey = `${groupLabel}:${employee._id}`;
                const getCell = (day, segments) => {
                  const date = planningDateKey(day);
                  const employeeId = String(employee._id);
                  const key = `${rowKey}:${date}`;
                  const events = eventsInCell(segments);
                  const selectable = commands?.enabled && interactions.allowHandle && events.length > 0;
                  return {
                    key, employeeId, date, name: employee.name, events, selectable,
                    selected: Boolean(selectable && commands.selection?.key === key && events.every(({ id }) => selectedIds.has(id))),
                  };
                };
                const dayCell = isDay ? getCell(period.start, cells[0]) : null;
                const color =
                  EMPLOYEE_COLORS[
                    (employeeColors.get(String(employee._id)) || 0) %
                      EMPLOYEE_COLORS.length
                  ];
                const employment = employee.employment;
                const target = targets?.[String(employee._id)];
                const difference = view === PLANNING_VIEWS.WEEK && group === PLANNING_GROUPS.EMPLOYEES
                  ? target ? target.minutes == null ? null : rowMinutes - target.minutes
                    : weeklyPlanningDifference(employment, rowMinutes) : null;
                const counter = counters?.[String(employee._id)];
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
                          {(target?.weeklyHours || hasContractHours) ? <small>
                            {target?.weeklyHours ?? employment.contractualValue} {label(target?.weeklyHours || employment.contractualUnit === "week" ? "weeklyHours" : "monthlyHours")}
                          </small> : null}
                          {Number.isFinite(counter?.balance) && <span className={styles.hoursCounter}>
                            {t("planning:counters.balance")} {counter.balance < 0 ? "−" : counter.balance > 0 ? "+" : ""}{formatPlanningDuration(Math.abs(counter.balance))}
                          </span>}
                          {Number.isFinite(counter?.annualRemaining) && <span className={styles.hoursCounter}>
                            {t("planning:counters.annual")} {counter.annualRemaining < 0 ? "−" : ""}{formatPlanningDuration(Math.abs(counter.annualRemaining))}
                          </span>}
                          {counters && target?.hasCounter && !Number.isFinite(counter?.balance) && !Number.isFinite(counter?.annualRemaining) &&
                            <span className={styles.hoursCounter}>{t("planning:counters.unavailable")}</span>}
                        </div>
                      </div>
                    </th>
                    {isDay ? (
                      <td className={`${styles.dayCell} ${styles.dropCell}`} {...cellInteractionProps(dayCell, drag)}>
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
                            interactions,
                          }}
                          cell={dayCell}
                          segments={cells[0]}
                        />
                        {commands?.enabled && <DropChoices drag={drag} cell={dayCell} label={commands.label} />}
                      </td>
                    ) : (
                      cells.map((segments, index) => {
                        const day = period.days[index];
                        const cell = getCell(day, segments);
                        return (
                          <td
                            key={planningDateKey(day)}
                            className={`${dayClass(day, index)} ${styles.dropCell}`}
                            {...cellInteractionProps(cell, drag, isMonth)}
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
                                interactions,
                                cell,
                              }}
                            />
                            {cell.selectable && <CellSelection {...{ cell, interactions }} />}
                            {commands?.enabled && <DropChoices {...{ drag, cell }} label={commands.label} />}
                          </td>
                        );
                      })
                    )}
                    <td className={styles.total}>
                      {formatPlanningDuration(rowMinutes)}
                      {difference !== null && difference !== 0 && (
                        <span className={`${styles.contractDifference} ${difference > 0 ? styles.contractOver : styles.contractUnder}`}
                          title={label(difference > 0 ? "contractOver" : "contractUnder")}>
                          <span aria-hidden="true">{difference > 0 ? "+" : "−"} </span>
                          <span className="sr-only">{label(difference > 0 ? "contractOver" : "contractUnder")} </span>
                          {formatPlanningDuration(Math.abs(difference))}
                        </span>
                      )}
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
      {commands?.enabled && <>
        <ShiftContextMenu state={menuState} commands={commands} />
        <DragPreview preview={drag.preview} ghost={drag.ghost} label={commands.label} time={parisPlanningTime} />
      </>}
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
