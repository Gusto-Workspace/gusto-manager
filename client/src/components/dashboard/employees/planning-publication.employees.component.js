import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { format, getISOWeek } from "date-fns";
import { enGB, fr } from "date-fns/locale";
import { CalendarCheck, Info, Lock, LockOpen, Mail, MessageSquare, X } from "lucide-react";
import { useTranslation } from "next-i18next";
import { parsePlanningDate } from "./planning-grid.utils.mjs";
import styles from "./planning-grid.module.scss";

const api = (restaurantId) => `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/planning`;

export function usePlanningPeriodState(restaurantId, range, revision) {
  const [state, setState] = useState(null);
  const [failed, setFailed] = useState(false);
  const from = range?.from;
  const to = range?.to;
  const key = `${restaurantId}:${from}:${to}`;
  useEffect(() => {
    if (!restaurantId || !from || !to) return;
    const controller = new AbortController();
    setFailed(false);
    axios.get(`${api(restaurantId)}/publication`, { params: { from, to }, signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setState({ key, data }); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [restaurantId, from, to, key, revision]);
  return { data: state?.key === key ? state.data : null, failed };
}

function rangeLabel(range, t, locale, includeWeek = true) {
  const from = parsePlanningDate(range.from);
  const to = parsePlanningDate(range.to);
  const full = (date) => format(date, "d MMMM yyyy", { locale });
  if (range.from === range.to) return full(from);
  const short = from.getFullYear() === to.getFullYear() ? format(from, "d MMMM", { locale }) : full(from);
  return t(includeWeek ? "weekRange" : "dateRange", { week: getISOWeek(from), from: short, to: full(to) });
}

function DialogHeading({ title, subtitle, onClose, label, busy, Icon }) {
  return <header className={styles.commandHeading}>
    <div className={styles.publicationTitle}>
      <Icon size={21} aria-hidden="true" />
      <div><h2>{title}</h2><p className={styles.commandHelp}>{subtitle}</p></div>
    </div>
    <button type="button" aria-label={label} onClick={onClose} disabled={busy}><X size={17} aria-hidden="true" /></button>
  </header>;
}

function PublicationSwitch({ icon: Icon, label, detail, ...input }) {
  return <label className={styles.publicationSwitch}>
    <Icon size={17} aria-hidden="true" />
    <span>{label}{detail && <small>{detail}</small>}</span>
    <input type="checkbox" role="switch" {...input} />
  </label>;
}

export function PlanningPublicationDialog({ Dialog, restaurantId, ranges, initialDate, revision, onClose, onChanged }) {
  const { t: translate, i18n } = useTranslation("planning");
  const t = (name, options) => translate(`publication.${name}`, options);
  const locale = i18n.language?.startsWith("en") ? enGB : fr;
  const [range, setRange] = useState(() => ranges.find(({ from, to }) => from <= initialDate && initialDate <= to) || ranges[0]);
  const { data, failed } = usePlanningPeriodState(restaurantId, range, revision);
  const [selected, setSelected] = useState(null);
  const [notify, setNotify] = useState(false);
  const [email, setEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const request = useRef(null);
  const pending = useRef(false);
  const recipients = data?.recipients || [];
  const ids = recipients.map(({ employeeId }) => employeeId);
  const selectedIds = ids.filter((id) => !selected || selected.includes(id));
  const allSelected = ids.length > 0 && selectedIds.length === ids.length;
  const latest = data?.history?.[0];
  const missing = recipients.filter(({ employeeId, emailAvailable }) => selectedIds.includes(employeeId) && !emailAvailable);

  async function publish() {
    if (pending.current || !selectedIds.length || !data) return;
    pending.current = true;
    setBusy(true);
    setError("");
    const body = { ...range, employeeIds: selectedIds, notify, email };
    const signature = JSON.stringify(body);
    if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
    try {
      const response = await axios.post(`${api(restaurantId)}/publication`, { ...body, requestId: request.current.id });
      onChanged();
      if (email) setResult(response.data.publication);
      else onClose();
    } catch (err) {
      setError(err.response?.data?.message || t("failed"));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <Dialog label={t("title")} onClose={busy ? undefined : onClose}>
    <DialogHeading title={t("title")} subtitle={rangeLabel(range, t, locale)} Icon={CalendarCheck}
      onClose={onClose} label={t("close")} busy={busy} />
    {result ? <>
      <p>{t("emailResult")}</p>
      <ul className={styles.publicationRecipients}>{result.recipients.map(({ employeeId, name, emailStatus }) =>
        <li className={styles.publicationResult} key={employeeId}><strong>{name}</strong><span>{t(`email_${emailStatus}`)}</span></li>)}</ul>
      <div className={styles.commandButtons}><button type="button" onClick={onClose}>{t("close")}</button></div>
    </> : <>
      {ranges.length > 1 && <label className={styles.commandField}>{t("chooseWeek")}
        <select value={range.from} disabled={busy} onChange={(event) => {
          setRange(ranges.find(({ from }) => from === event.target.value));
          setSelected(null);
          setError("");
        }}>
          {ranges.map((week) => <option value={week.from} key={week.from}>{rangeLabel(week, t, locale)}</option>)}
        </select>
      </label>}
      <p className={styles.publicationInfo}><Info size={19} aria-hidden="true" />{t("visibility")}</p>
      <fieldset className={styles.publicationFieldset} disabled={busy || !data}>
        <legend>{t("recipients")}</legend>
        <div className={styles.publicationResult}><label><input type="checkbox" checked={allSelected}
          disabled={!ids.length} onChange={() => setSelected(allSelected ? [] : ids)} /> {t("all")}</label>
          <span>{t("selected", { count: selectedIds.length })}</span></div>
        <ul className={styles.publicationRecipients}>{recipients.map(({ employeeId, name, emailAvailable }) =>
          <li key={employeeId}><label><input type="checkbox" checked={selectedIds.includes(employeeId)}
            onChange={() => setSelected(selectedIds.includes(employeeId)
              ? selectedIds.filter((id) => id !== employeeId) : [...selectedIds, employeeId])} /> {name}</label>
            {email && !emailAvailable && <small>{t("email_skipped")}</small>}
          </li>)}</ul>
        {data && !recipients.length && <p className={styles.commandHelp}>{t("noRecipients")}</p>}
      </fieldset>
      {latest && <div className={styles.publicationHistory}>
        <strong>{t("lastPublication")}</strong>
        <p>{rangeLabel(latest, t, locale, false)}</p>
        <p>{t("history", {
          date: new Intl.DateTimeFormat(locale.code, { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(latest.createdAt)),
          author: latest.author,
        })}</p>
        <p>{latest.recipients.map(({ name }) => name).join(", ")}</p>
      </div>}
      <div className={styles.publicationChannels}>
        <PublicationSwitch icon={CalendarCheck} label={t("notify")} detail={t("notifyHelp")} disabled={busy} checked={notify} onChange={(event) => setNotify(event.target.checked)} />
        <PublicationSwitch icon={Mail} label={t("email")} detail={email && missing.length ? t("missingEmail", { count: missing.length }) : undefined}
          disabled={busy} checked={email} onChange={(event) => setEmail(event.target.checked)} />
        <PublicationSwitch icon={MessageSquare} label={t("sms")} detail={t("soon")} disabled checked={false} />
      </div>
      {(error || failed) && <p className={styles.commandError} role="alert">{error || t("loadFailed")}</p>}
      <div className={styles.commandButtons}>
        <button type="button" disabled={busy} onClick={onClose}>{t("cancel")}</button>
        <button type="button" className={styles.publicationPrimary} disabled={!data || !selectedIds.length || busy} onClick={publish}>
          {t("publish")}
        </button>
      </div>
    </>}
  </Dialog>;
}

export function PlanningLockDialog({ Dialog, restaurantId, range, lockedDays, onClose, onChanged }) {
  const { t: translate, i18n } = useTranslation("planning");
  const t = (name, options) => translate(`publication.${name}`, options);
  const locale = i18n.language?.startsWith("en") ? enGB : fr;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const allLocked = lockedDays.length > 0 && lockedDays.every(Boolean);
  const hasLock = lockedDays.some(Boolean);

  async function save(locked) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await axios.put(`${api(restaurantId)}/lock`, { ...range, locked });
      onChanged();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || t("failed"));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <Dialog label={t("lockTitle")} onClose={busy ? undefined : onClose}>
    <DialogHeading title={t("lockTitle")} subtitle={rangeLabel(range, t, locale, false)}
      Icon={allLocked ? Lock : LockOpen} onClose={onClose} label={t("close")} busy={busy} />
    <p className={styles.publicationInfo}><Info size={19} aria-hidden="true" />{t("lockHelp")}</p>
    {error && <p className={styles.commandError} role="alert">{error}</p>}
    <div className={styles.commandButtons}>
      <button type="button" disabled={busy} onClick={onClose}>{t("cancel")}</button>
      {hasLock && <button type="button" disabled={busy} onClick={() => save(false)}>{t("unlock")}</button>}
      {!allLocked && <button type="button" className={styles.publicationPrimary} disabled={busy} onClick={() => save(true)}>{t("lock")}</button>}
    </div>
  </Dialog>;
}
