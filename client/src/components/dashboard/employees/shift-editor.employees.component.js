import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "next-i18next";
import {
  AlertTriangle,
  ChevronDown,
  Clock3,
  Plus,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import french from "../../../../public/locales/fr/planning.json";
import english from "../../../../public/locales/en/planning.json";
import {
  formatPlanningDuration,
  parsePlanningDate,
  PLANNING_TIME_ZONE,
  plannedShiftMinutes,
} from "./planning-grid.utils.mjs";
import { getShiftMealMeta } from "./planning-meals.utils";
import {
  isHalfDayAbsence,
  normalizeShiftTime,
  SHIFT_TIME_OPTIONS,
  shiftWeekday,
  MAX_SHIFT_BLOCKS,
} from "./shift-editor.utils.mjs";
import ShiftFiles from "./shift-files.employees.component";
import styles from "./shift-editor.module.scss";

const absenceTypes = Object.keys(french.absenceTypes);

export function useShiftEditorLabels() {
  const { t, i18n } = useTranslation("planning");
  const locale = i18n?.language || "fr";
  const fallback = locale.startsWith("fr") ? french : english;
  const label = (key, options) =>
    t(`editor.${key}`, {
      defaultValue: fallback.editor[key],
      ...options,
    });
  const absenceTypeLabel = (type) =>
    t(`absenceTypes.${type}`, { defaultValue: fallback.absenceTypes[type] });
  return { label, locale, absenceTypeLabel };
}

export function shiftEditorTitle(label, draft, employee, multiple = false) {
  if (draft.leaveRequestId)
    return label("linkedTitle", { name: employee?.name });
  if (!employee) return label(draft.isLeave ? "absence" : "shift");
  const key = draft.isLeave
    ? draft.shiftId
      ? "editAbsenceFor"
      : "newAbsenceFor"
    : draft.shiftId
      ? "editShiftFor"
      : multiple ? "newShiftsFor" : "newShiftFor";
  return label(key, { name: employee.name });
}

function ShiftTimeField({ label, value, onChange, showOptions, invalid }) {
  const id = useId();
  const input = useRef(null);
  const menu = useRef(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    const option = menu.current?.children[active];
    if (!option) return;
    const top = option.offsetTop;
    const list = menu.current;
    if (
      top < list.scrollTop ||
      top + option.offsetHeight > list.scrollTop + list.clientHeight
    ) {
      list.scrollTop = top - list.clientHeight / 2 + option.offsetHeight / 2;
    }
  }, [open, active]);

  function openNearValue() {
    const time = normalizeShiftTime(value);
    const nearest = SHIFT_TIME_OPTIONS.findIndex((option) => option >= time);
    setActive(nearest === -1 ? SHIFT_TIME_OPTIONS.length - 1 : nearest);
    setOpen(true);
  }

  function choose(index) {
    onChange(SHIFT_TIME_OPTIONS[index]);
    setOpen(false);
    input.current.focus();
  }

  function handleKey(event) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) openNearValue();
      else {
        const movement = event.key === "ArrowDown" ? 1 : -1;
        setActive((index) =>
          Math.max(
            0,
            Math.min(SHIFT_TIME_OPTIONS.length - 1, index + movement),
          ),
        );
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (open && active >= 0) choose(active);
      else if (normalizeShiftTime(value)) onChange(normalizeShiftTime(value));
      setOpen(false);
    } else if (open && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <div className={styles.timePicker}>
        <input
          id={id}
          ref={input}
          role="combobox"
          aria-autocomplete="none"
          aria-expanded={open}
          aria-controls={open ? `${id}-options` : undefined}
          aria-activedescendant={
            open && active >= 0 ? `${id}-${active}` : undefined
          }
          aria-invalid={invalid || undefined}
          inputMode="numeric"
          autoComplete="off"
          placeholder="HH:mm"
          value={value}
          onChange={(event) => {
            setOpen(false);
            onChange(event.target.value);
          }}
          onKeyDown={handleKey}
          onBlur={() => {
            setOpen(false);
            const formatted = normalizeShiftTime(value);
            if (formatted && formatted !== value) onChange(formatted);
          }}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={showOptions}
          aria-expanded={open}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            input.current.focus();
            if (open) setOpen(false);
            else openNearValue();
          }}
        >
          <ChevronDown size={17} aria-hidden="true" />
        </button>
        {open && (
          <ul
            ref={menu}
            id={`${id}-options`}
            role="listbox"
            aria-label={label}
            className={styles.options}
          >
            {SHIFT_TIME_OPTIONS.map((option, index) => (
              <li
                id={`${id}-${index}`}
                key={option}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(index)}
              >
                {option}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function WorkShiftBlock({ block, range, error, index, multiple, onChange, onRemove, openingHours, postsId, label, locale }) {
  const meal = range.error ? null : getShiftMealMeta({ start: range.start, end: range.end, openingHours });
  const [explicitEnd, setExplicitEnd] = useState(Boolean(block.endDate));
  const showEnd = explicitEnd || Boolean(block.endDate);
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h3><Clock3 size={17} aria-hidden="true" />{multiple ? label("shiftNumber", { number: index + 1 }) : label("schedule")}</h3>
        {onRemove && (
          <button type="button" className={styles.delete} onClick={onRemove} aria-label={label("removeShift", { number: index + 1 })}>
            <Trash2 size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className={styles.columns}>
        <ShiftTimeField label={label("startTime")} value={block.startTime} onChange={(startTime) => onChange({ startTime })}
          showOptions={label("startOptions")} invalid={!normalizeShiftTime(block.startTime)} />
        <ShiftTimeField label={label("endTime")} value={block.endTime} onChange={(endTime) => onChange({ endTime })}
          showOptions={label("endOptions")} invalid={!normalizeShiftTime(block.endTime)} />
      </div>
      <div className={styles.columns}>
        <label className={styles.field}>
          {label("breakMinutes")}
          <input type="number" min="0" step="1" value={block.breakMinutes} aria-invalid={error === "invalidBreak" || undefined}
            onChange={(event) => onChange({ breakMinutes: event.target.value })} />
        </label>
        <div className={styles.field}>
          <span>{label("netDuration")}</span>
          <output className={styles.net} aria-live="polite">
            {range.error || error === "invalidBreak" ? "–" :
              formatPlanningDuration(plannedShiftMinutes(range.start, range.end, Number(block.breakMinutes)))}
          </output>
        </div>
      </div>
      <div className={styles.duration}>
        {range.endsAnotherDay && <small>{label("endsOn", { date: new Intl.DateTimeFormat(locale, {
          timeZone: PLANNING_TIME_ZONE, weekday: "short", day: "numeric", month: "short",
        }).format(range.end) })}</small>}
        <button type="button" className={styles.textButton} onClick={() => {
          onChange({ endDate: showEnd ? "" : range.endDate || block.date });
          setExplicitEnd(!showEnd);
        }}>{label(showEnd ? "inferEndDate" : "setEndDate")}</button>
      </div>
      {showEnd && <label className={styles.field}>{label("endDate")}
        <input type="date" min={block.date} value={block.endDate} onChange={(event) => onChange({ endDate: event.target.value })} />
      </label>}
      <div className={styles.columns}>
        <label className={styles.field}>
          {label("shiftPost")}
          <input list={postsId} maxLength={80} placeholder={label("noPost")} value={block.position}
            onChange={(event) => onChange({ position: event.target.value })} />
        </label>
        <div className={styles.field}>
          <span className={styles.mealLabel}><Utensils size={15} aria-hidden="true" />{label("meals")}</span>
          <p>{meal ? label(meal.mealCount === 0 ? "mealCount_zero" : meal.mealCount === 1 ? "mealCount_one" : "mealCount_other",
            { count: meal.mealCount }) : "–"}
          {meal?.mealPeriods.length > 0 && ` · ${meal.mealPeriods.map((period) => label(period)).join(", ")}`}</p>
        </div>
      </div>
      <label className={styles.field}>{label("title")}
        <input maxLength={200} value={block.title} onChange={(event) => onChange({ title: event.target.value })} />
      </label>
      <label className={styles.field}>{label("notes")}
        <textarea rows={2} maxLength={2000} value={block.notes} onChange={(event) => onChange({ notes: event.target.value })} />
      </label>
      {error && <p className={styles.problem} role="status">{label(error)}</p>}
    </section>
  );
}

function ShiftRepeat({ repeat, date, onChange, label, locale }) {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  return (
    <section className={styles.section}>
      <label className={styles.field}>{label("repeat")}
        <select value={repeat.frequency} onChange={(event) => onChange({
          frequency: event.target.value,
          days: repeat.days.length ? repeat.days : [shiftWeekday(date)].filter(Number.isInteger),
        })}>
          {["none", "daily", "weekly"].map((frequency) => <option key={frequency} value={frequency}>{label(frequency)}</option>)}
        </select>
      </label>
      {repeat.frequency !== "none" && <>
        <label className={styles.field}>{label(repeat.frequency === "daily" ? "dailyInterval" : "weeklyInterval")}
          <input type="number" min="1" max="52" value={repeat.interval} onChange={(event) => onChange({ interval: event.target.value })} />
        </label>
        {repeat.frequency === "weekly" && <fieldset className={styles.durationOptions}>
          <legend>{label("repeatDays")}</legend>
          <div className={styles.choices}>
            {[1, 2, 3, 4, 5, 6, 0].map((day) => <label key={day} className={styles.choice}>
              <input type="checkbox" checked={repeat.days.includes(day)} onChange={(event) => onChange({
                days: event.target.checked ? [...repeat.days, day] : repeat.days.filter((value) => value !== day),
              })} />
              {weekday.format(Date.UTC(2026, 0, 4 + day))}
            </label>)}
          </div>
        </fieldset>}
        <div className={styles.columns}>
          <label className={styles.field}>{label("repeatEnd")}
            <select value={repeat.end} onChange={(event) => onChange({ end: event.target.value })}>
              <option value="count">{label("afterCount")}</option>
              <option value="until">{label("untilDate")}</option>
            </select>
          </label>
          {repeat.end === "count" ? <label className={styles.field}>{label("occurrences")}
            <input type="number" min="2" max="200" value={repeat.count} onChange={(event) => onChange({ count: event.target.value })} />
          </label> : <label className={styles.field}>{label("endDate")}
            <input type="date" min={date} value={repeat.until} onChange={(event) => onChange({ until: event.target.value })} />
          </label>}
        </div>
      </>}
    </section>
  );
}

export default function ShiftEditor({
  draft,
  employee,
  range,
  conflict,
  overtime,
  openingHours,
  posts,
  collection,
  extra,
  repeat,
  batch,
  onExtraChange,
  onAddBlock,
  onRemoveBlock,
  onRemoveFirstBlock,
  onRepeatChange,
  onFileBusy,
  validation,
  submitError,
  saving,
  fileBusy,
  onChange,
  onClose,
  onSave,
  onDelete,
}) {
  const { label, locale, absenceTypeLabel } = useShiftEditorLabels();
  const id = useId();
  const locked = Boolean(draft.leaveRequestId);
  const fullDay = draft.isLeave && draft.absenceDuration === "full";
  const halfDay = draft.isLeave && isHalfDayAbsence(draft.absenceDuration);
  const showTimes = !fullDay && !halfDay;
  const durationChoice = halfDay ? "morning" : draft.absenceDuration;
  const isEditing = Boolean(draft.shiftId);
  const date = parsePlanningDate(draft.date);
  const localizedDate = (value, options) =>
    new Intl.DateTimeFormat(locale, options).format(value);
  const dateLabel = date ? localizedDate(date, { dateStyle: "full" }) : "";
  const multiple = !draft.isLeave && extra.length > 0;
  const [showEndDate, setShowEndDate] = useState(Boolean(draft.endDate));
  const endDateIsExplicit = showEndDate || Boolean(draft.endDate);
  const showDates = fullDay || (showTimes && endDateIsExplicit);
  const tabs = useRef([]);

  return (
    <form
      className={styles.form}
      noValidate
      aria-busy={saving || undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (!locked && !validation && !saving && !fileBusy) onSave();
      }}
    >
      <header className={styles.header}>
        <div>
          <h2>{shiftEditorTitle(label, draft, employee, multiple)}</h2>
          {dateLabel && <p>{dateLabel}</p>}
        </div>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={label("close")}
          onClick={onClose}
          disabled={saving || fileBusy}
        >
          <X size={19} />
        </button>
      </header>
      {!locked && (
        <div
          role="tablist"
          aria-label={label("entryType")}
          className={styles.tabs}
        >
          {[false, true].map((isLeave, index) => (
            <button
              key={String(isLeave)}
              type="button"
              id={`${id}-tab-${index}`}
              role="tab"
              ref={(node) => {
                tabs.current[index] = node;
              }}
              aria-selected={draft.isLeave === isLeave}
              aria-controls={`${id}-panel`}
              tabIndex={draft.isLeave === isLeave ? 0 : -1}
              disabled={saving || fileBusy}
              onClick={() => onChange({ isLeave })}
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? 1
                      : 1 - index;
                onChange({ isLeave: next === 1 });
                tabs.current[next]?.focus();
              }}
            >
              {label(isLeave ? "absence" : "shift")}
            </button>
          ))}
        </div>
      )}
      <div className={styles.body}>
        {locked ? (
          <section className={styles.section}>
            <h3>{label("linkedAbsence")}</h3>
            <p>{label("linkedDescription")}</p>
            <p className={styles.strong}>
              {localizedDate(
                draft.originalStart,
                fullDay
                  ? { dateStyle: "long", timeZone: PLANNING_TIME_ZONE }
                  : { dateStyle: "short", timeStyle: "short", timeZone: PLANNING_TIME_ZONE },
              )}
              {" – "}
              {localizedDate(
                draft.originalEnd,
                fullDay
                  ? { dateStyle: "long", timeZone: PLANNING_TIME_ZONE }
                  : { dateStyle: "short", timeStyle: "short", timeZone: PLANNING_TIME_ZONE },
              )}
            </p>
          </section>
        ) : (
          <fieldset
            className={styles.fields}
            disabled={saving || fileBusy}
            role="tabpanel"
            id={`${id}-panel`}
            aria-labelledby={`${id}-tab-${draft.isLeave ? 1 : 0}`}
          >
            {draft.isLeave && (
              <section className={styles.section}>
                <fieldset className={styles.durationOptions}>
                  <legend>{label("absenceDuration")}</legend>
                  <div className={styles.choices}>
                    {[
                      ["full", "fullDay"],
                      ["morning", "halfDay"],
                      ["custom", "customDuration"],
                    ].map(([value, text]) => (
                      <label key={value} className={styles.choice}>
                        <input
                          type="radio"
                          name={`${id}-duration`}
                          value={value}
                          checked={durationChoice === value}
                          onChange={() => onChange({ absenceDuration: value })}
                        />
                        {label(text)}
                      </label>
                    ))}
                  </div>
                </fieldset>
                {halfDay && (
                  <label className={styles.field}>
                    {label("halfDayPeriod")}
                    <select
                      value={draft.absenceDuration}
                      onChange={(event) =>
                        onChange({ absenceDuration: event.target.value })
                      }
                    >
                      <option value="morning">{label("morning")}</option>
                      <option value="afternoon">{label("afternoon")}</option>
                    </select>
                  </label>
                )}
                <label className={styles.field}>
                  {label("absenceType")}
                  <select
                    value={draft.absenceType}
                    onChange={(event) =>
                      onChange({ absenceType: event.target.value })
                    }
                  >
                    <option value="">{label("unspecifiedAbsence")}</option>
                    {absenceTypes.map((type) => (
                      <option value={type} key={type}>
                        {absenceTypeLabel(type)}
                      </option>
                    ))}
                  </select>
                </label>
              </section>
            )}
            {draft.isLeave && <section className={styles.section}>
              <h3>
                <Clock3 size={17} aria-hidden="true" />
                {label(showTimes ? "schedule" : "period")}
              </h3>
              <div className={styles.columns}>
                <label className={styles.field}>
                  {label(showDates ? "startDate" : "date")}
                  <input
                    type="date"
                    value={draft.date}
                    onChange={(event) => onChange({ date: event.target.value })}
                  />
                </label>
                {showDates && (
                  <label className={styles.field}>
                    {label("endDate")}
                    <input
                      type="date"
                      min={draft.date}
                      value={
                        draft.endDate ||
                        (!fullDay && range.end
                          ? range.endDate
                          : draft.date)
                      }
                      onChange={(event) =>
                        onChange({ endDate: event.target.value })
                      }
                    />
                  </label>
                )}
              </div>
              {showTimes && (
                <>
                  <div className={styles.columns}>
                    <ShiftTimeField
                      label={label("startTime")}
                      value={draft.startTime}
                      onChange={(startTime) => onChange({ startTime })}
                      showOptions={label("startOptions")}
                      invalid={!normalizeShiftTime(draft.startTime)}
                    />
                    <ShiftTimeField
                      label={label("endTime")}
                      value={draft.endTime}
                      onChange={(endTime) => onChange({ endTime })}
                      showOptions={label("endOptions")}
                      invalid={!normalizeShiftTime(draft.endTime)}
                    />
                  </div>
                  <div className={styles.duration}>
                    <output aria-live="polite">
                      {label(
                        draft.isLeave ? "customAbsenceDuration" : "duration",
                      )}{" "}
                      <strong>
                        {range.error
                          ? "–"
                          : formatPlanningDuration(range.minutes)}
                      </strong>
                      {range.endsAnotherDay && (
                        <small>
                          {label("endsOn", {
                            date: localizedDate(range.end, {
                              timeZone: PLANNING_TIME_ZONE,
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                            }),
                          })}
                        </small>
                      )}
                    </output>
                    <button
                      type="button"
                      className={styles.textButton}
                      onClick={() => {
                        if (endDateIsExplicit) onChange({ endDate: "" });
                        setShowEndDate(!endDateIsExplicit);
                      }}
                    >
                      {label(endDateIsExplicit ? "inferEndDate" : "setEndDate")}
                    </button>
                  </div>
                </>
              )}
              {range.error && (
                <p className={styles.problem} role="status">
                  {label(range.error)}
                </p>
              )}
            </section>}
            {!draft.isLeave && (
              <>
                <label className={styles.field}>{label("date")}
                  <input type="date" value={draft.date} onChange={(event) => onChange({ date: event.target.value })} />
                </label>
                <datalist id={`${id}-posts`}>{posts.map((post) => <option key={post} value={post} />)}</datalist>
                <WorkShiftBlock key={draft.key ?? "first"} block={draft} range={range} error={batch?.blockErrors[0] || (isEditing ? validation : null)}
                  index={0} onChange={onChange} onRemove={multiple ? onRemoveFirstBlock : undefined}
                  postsId={`${id}-posts`} {...{ multiple, openingHours, label, locale }} />
                {extra.map((block, index) => <WorkShiftBlock key={block.key} block={{ ...block, date: draft.date }}
                  range={batch.ranges[index + 1]} error={batch.blockErrors[index + 1]} index={index + 1}
                  onChange={(patch) => onExtraChange(block.key, patch)} onRemove={() => onRemoveBlock(block.key)}
                  postsId={`${id}-posts`} {...{ multiple, openingHours, label, locale }} />)}
                {isEditing ? (
                  <>
                    {draft.seriesId && <p className={styles.series}>{label("seriesOccurrence")}</p>}
                    <ShiftFiles url={`${collection}/${draft.shiftId}/files`} {...{ label, onFileBusy }} />
                  </>
                ) : (
                  <>
                    <button type="button" className={styles.addBlock} disabled={extra.length + 1 >= MAX_SHIFT_BLOCKS} onClick={onAddBlock}>
                      <Plus size={17} aria-hidden="true" />{label("addShift")}
                    </button>
                    <ShiftRepeat repeat={repeat} date={draft.date} onChange={onRepeatChange} {...{ label, locale }} />
                    {batch.count && (multiple || batch.count > 1) ? <output className={styles.batchTotal} aria-live="polite">
                      {label("batchTotal", { dates: batch.count, shifts: batch.occurrences.length, duration: formatPlanningDuration(batch.minutes) })}
                    </output> : null}
                    {batch.error && batch.error !== "invalidBatch" &&
                      <p className={styles.problem} role="status">{batch.date ? `${batch.date} · ` : ""}{label(batch.error)}</p>}
                  </>
                )}
              </>
            )}
          </fieldset>
        )}
        {conflict && !locked && (
          <p className={styles.warning} role="status">
            <AlertTriangle size={17} aria-hidden="true" />
            <span>
              {label(conflict.isLeave ? "overlapsAbsence" : "overlapsShift")}
              {conflict.date && ` · ${conflict.date}`}
            </span>
          </p>
        )}
        {overtime && (
          <p className={styles.warning} role="status">
            <AlertTriangle size={17} aria-hidden="true" />
            <span>
              {label(
                overtime.period === "month" ? "overtimeMonth" : "overtimeWeek",
                overtime,
              )}
            </span>
          </p>
        )}
        {submitError && (
          <p className={styles.problem} role="alert">
            {submitError}
          </p>
        )}
      </div>
      <footer className={styles.footer}>
        {isEditing && (
          <button
            type="button"
            className={styles.delete}
            disabled={saving || fileBusy}
            onClick={onDelete}
          >
            <Trash2 size={16} aria-hidden="true" />
            {label(locked ? "cancelLeave" : "delete")}
          </button>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            disabled={saving || fileBusy}
            onClick={onClose}
          >
            {label(locked ? "close" : "cancel")}
          </button>
          {!locked && (
            <button
              type="submit"
              className={styles.primary}
              disabled={saving || fileBusy || Boolean(validation)}
            >
              {label(saving ? "saving" : isEditing ? "update" : "create")}
            </button>
          )}
        </div>
      </footer>
    </form>
  );
}
