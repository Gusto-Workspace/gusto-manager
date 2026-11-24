import useDialogBackdrop from "../_shared/use-dialog-backdrop";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import axios from "axios";
import { BriefcaseBusiness, CalendarDays, CalendarOff, ChevronDown, ChevronLeft, ChevronRight, Clock3, Download, FileSpreadsheet, Pencil, Search, TrendingUp, Wallet, X } from "lucide-react";
import CatalogHeaderDashboardComponent from "../_shared/catalog-header.dashboard.component";
import { directoryPath } from "./employee-directory.utils.mjs";
import { formatReportValue, formatReportWeek, isReportPeriod, moveReportPeriod, reportMonth, reportPeriodLabel, visibleReportColumns } from "./personnel-report.utils.mjs";
import PersonnelReportInputDialog, { personnelReportInputsUrl } from "./personnel-report-input.employees.component";
import HrQuestionnaire from "./hr-questionnaire.employees.component";

const control = "inline-flex min-h-10 min-w-0 items-center gap-2 rounded-lg border border-darkBlue/15 bg-white px-3 text-sm text-darkBlue";
const button = `${control} justify-center font-semibold hover:bg-lightGrey disabled:opacity-50`;
const identityCell = "sticky left-0 border-r border-[#dbe5f4] px-3 text-left";
const metricCell = "min-w-[7.25rem] border-r border-[#e5ebf6] px-3 text-right tabular-nums";
const initialGroups = { time: true, absence: true };
const groupStyle = {
  contract: { Icon: BriefcaseBusiness, header: "border-[#44886c] bg-[#e2f2ea] text-[#205f4a]", subheader: "bg-[#f1f8f4]" },
  salary: { Icon: Wallet, header: "border-[#8f69bb] bg-[#efe8fa] text-[#60418b]", subheader: "bg-[#f7f3fc]" },
  time: { Icon: Clock3, header: "border-[#4b74cd] bg-[#e3edff] text-[#244b95]", subheader: "bg-[#f0f5ff]" },
  premium: { Icon: TrendingUp, header: "border-[#cb8a40] bg-[#fff0d9] text-[#815120]", subheader: "bg-[#fff7ea]" },
  absence: { Icon: CalendarOff, header: "border-[#bc6983] bg-[#f9e6ee] text-[#873751]", subheader: "bg-[#fff3f7]" },
  compensation: { Icon: Wallet, header: "border-[#398c93] bg-[#e1f2f4] text-[#27656d]", subheader: "bg-[#f0f9fa]" },
  leave: { Icon: CalendarDays, header: "border-[#658c59] bg-[#e8f2e6] text-[#3f6634]", subheader: "bg-[#f4f8f2]" },
  annual: { Icon: TrendingUp, header: "border-[#4b74cd] bg-[#e3edff] text-[#244b95]", subheader: "bg-[#f0f5ff]" },
  skello: { Icon: FileSpreadsheet, header: "border-[#398c93] bg-[#e1f2f4] text-[#27656d]", subheader: "bg-[#f0f9fa]" },
};
const leaveStatusLabels = {
  needsOpening: "Solde d’ouverture requis",
  missingContract: "Date de prise de poste manquante",
  unknownDuration: "Durée de congé à compléter",
};

function ReportDialog({ title, description, onClose, children }) {
  const ref = useRef(null);
  const backdrop = useDialogBackdrop(onClose);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog ref={ref} aria-label={title}
      {...backdrop}
      className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl rounded-2xl bg-white p-0 text-darkBlue shadow-xl backdrop:bg-darkBlue/45">
      <header className="sticky top-0 flex items-start justify-between gap-3 border-b border-darkBlue/10 bg-[#f3f7ff] p-4 midTablet:p-5">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {description && <p className="mt-1 text-sm text-darkBlue/70">{description}</p>}
        </div>
        <button type="button" aria-label="Fermer" onClick={onClose} className={`${button} shrink-0 px-2`}><X size={17} /></button>
      </header>
      <div className="p-4 midTablet:p-5">{children}</div>
    </dialog>
  );
}

function WeekClassification({ hours }) {
  const { breakdown, paidAbsences, contractWeek } = hours;
  const rows = [["Volume contractuel de la semaine", contractWeek]];
  if (breakdown) {
    const source = { validated: "pointages validés", planning: "planning", hybrid: "planning et pointages validés" }[breakdown.source];
    rows.push([`Travail retenu pour les tranches (${source})`, breakdown.worked],
      ["Absences assimilées pour les tranches", breakdown.credited]);
    if (!breakdown.credited && !breakdown.needsReview) {
      rows.push(["Travail inclus dans le volume contractuel", Math.min(breakdown.worked, breakdown.target)]);
    }
    const labels = { extra: "Heures supplémentaires exceptionnelles", structural: "Heures supplémentaires structurelles", complement: "Heures complémentaires" };
    for (const [key, duration] of Object.entries(breakdown.bands)) {
      const [, category, rate] = /^(extra|structural|complement)(\d+)$/.exec(key);
      rows.push([`${labels[category]} · ${rate} %`, duration]);
    }
  }
  if (paidAbsences && !paidAbsences.incomplete) rows.push(["Absences indemnisées par l’employeur", paidAbsences.employer],
    ["Absences indemnisées par un tiers", paidAbsences.thirdParty]);
  return <section className="mb-4">
    <h3 className="mb-2 font-semibold">Répartition hebdomadaire</h3>
    <dl className="divide-y divide-darkBlue/10">{rows.map(([label, minutes]) => <div key={label} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <dt>{label}</dt><dd className="shrink-0 font-semibold tabular-nums">{formatReportValue(minutes, "minutes")}</dd></div>)}</dl>
    {(!breakdown || breakdown.needsReview) && <p className="mt-1 text-sm">Classification à vérifier selon le contrat, les règles actives et les validations.</p>}
    {paidAbsences?.incomplete && <p className="mt-1 text-sm">Indemnisation des absences à préciser.</p>}
  </section>;
}

function ReportHoursDetails({ detail, columns, onClose }) {
  const { employee, hours, week } = detail;
  return (
    <ReportDialog title={week ? `Détail des heures · ${week.label}` : "Détail des heures de la période"}
      description={`${employee.firstname} ${employee.lastname}${week ? ` · ${formatReportWeek(week)}` : ""}`} onClose={onClose}>
      {week && <WeekClassification hours={hours} />}
      <dl className="grid grid-cols-1 gap-2 mobile:grid-cols-2">
        {columns.map(({ key, label, type }) => (
          <div key={key} className={`rounded-lg px-3 py-2 ${["planned", "paid", "worked"].includes(key) ? "bg-[#eaf1ff]" : "bg-[#f6f8fc]"}`}>
            <dt className="text-xs font-semibold text-darkBlue/70">{key === "plannedBreak" ? "Pause planifiée" : label}</dt>
            <dd className="mt-1 font-semibold tabular-nums">{formatReportValue(hours[key], type)}</dd>
          </div>
        ))}
      </dl>
      {week && <p className="mt-3 text-xs text-darkBlue/65">Le détail ci-dessus couvre les jours de la période sélectionnée.</p>}
      {hours.retainedWeek != null && <p className="mt-2 text-sm font-semibold text-darkBlue">
        Heures retenues du lundi au dimanche, absences comprises {formatReportValue(hours.retainedWeek, "minutes")}
      </p>}
      {hours.plannedWeek != null && <p className="mt-2 text-sm text-darkBlue/75">
        Total planifié du lundi au dimanche {formatReportValue(hours.plannedWeek, "minutes")}
      </p>}
      {hours.plannedWeekCredit > 0 && <p className="mt-2 text-sm text-darkBlue/75">
        Absences prises en compte sur la semaine {formatReportValue(hours.plannedWeekCredit, "minutes")}
      </p>}
      {hours.historicalWeek > 0 && <p className="mt-2 text-sm text-darkBlue/75">
        Services historiques retenus sur la semaine {formatReportValue(hours.historicalWeek, "minutes")}
        {hours.historicalOverlap && " · La source Skello cumule des services qui se chevauchent."}
      </p>}
      {hours.timedSicknessWeek > 0 && <p className="mt-2 text-sm text-darkBlue/75">
        Arrêts maladie à horaires {formatReportValue(hours.timedSicknessWeek, "minutes")}
      </p>}
      {hours.exceptional != null && <p className="mt-2 text-sm text-darkBlue/75">
        Heures supplémentaires ou complémentaires de la période {formatReportValue(hours.exceptional, "minutes")}
      </p>}
      {hours.counterVariation != null && <p className="mt-2 text-sm text-darkBlue/75">
        Variation du compteur sur la semaine {formatReportValue(hours.counterVariation, "minutes")}
      </p>}
      {hours.requiresCorrection && <p className="mt-2 text-sm font-semibold text-[#815120]">Heures rémunérées à compléter dans la Pointeuse.</p>}
      {hours.provisional && <p className="mt-2 text-xs font-semibold text-[#815120]">Un pointage est encore en cours.</p>}
    </ReportDialog>
  );
}

function WeekCell({ column, hours, employee, onOpen }) {
  if (!hours) return <span className="text-darkBlue/40">—</span>;
  const value = formatReportValue(hours.retainedWeek, "decimalHours");
  return (
    <button type="button" aria-label={`Détail ${column.label} pour ${employee.firstname} ${employee.lastname}`}
      title="Voir les heures prévues, pointées et rémunérées" onClick={() => onOpen({ employee, hours, week: column.week })}
      className="ml-auto grid w-full justify-items-end rounded-md px-2 py-1 text-[#244b95] hover:bg-[#dbe9ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue">
      <span className={`font-semibold ${hours.retainedWeek == null ? "text-darkBlue/40" : "text-darkBlue"}`}>{value}</span>
      {hours.plannedWeekSurplus > 0 && <span className="text-xs font-semibold text-[#a82742]" title="Dépassement du volume contractuel">
        (+{formatReportValue(hours.plannedWeekSurplus, "decimalHours")})
      </span>}
    </button>
  );
}

function ReportTable({ report, open, toggle, onEdit }) {
  const groups = report.groups.map((group) => ({ ...group, visible: visibleReportColumns(group, open[group.id]),
    style: groupStyle[group.id] || groupStyle.time }));
  const [hoursDetail, setHoursDetail] = useState(null);
  return (
    <>
      <div className="max-h-[68vh] max-w-full overflow-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
      tabIndex={0} role="region" aria-label="Tableau du rapport RH, défilement horizontal">
      <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
        <caption className="sr-only">Indicateurs RH par salarié</caption>
        <thead>
          <tr className="font-semibold">
            <th rowSpan={2} scope="col" className={`${identityCell} top-0 z-30 min-w-[9rem] border-b border-b-[#dbe5f4] bg-white font-semibold text-[#244b95] midTablet:min-w-[12rem]`}>Salarié</th>
            {groups.map((group) => {
              const { Icon, header } = group.style;
              return (
                <th key={group.id} colSpan={group.visible.length} scope="colgroup"
                  className={`sticky top-0 z-20 h-12 border-t-2 border-r text-left ${header}`}>
                  <button type="button" aria-expanded={Boolean(open[group.id])} onClick={() => toggle(group.id)}
                    className="flex h-[46px] w-full items-center gap-2 whitespace-nowrap px-3 text-left text-xs font-bold hover:bg-white/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue">
                    <Icon size={15} aria-hidden="true" />{group.label}
                    <ChevronDown size={15} aria-hidden="true" className={`ml-auto ${open[group.id] ? "rotate-180" : ""}`} />
                  </button>
                </th>
              );
            })}
          </tr>
          <tr>
            {groups.flatMap((group) => group.visible.map((column) => (
              <th key={`${group.id}:${column.key}`} scope="col" title={column.hint || (column.unavailable ? "Indicateur non disponible dans Gusto" : undefined)}
                className={`${metricCell} sticky top-12 z-10 max-w-[10rem] border-b border-[#dbe5f4] py-2 text-xs font-semibold text-darkBlue/80 ${group.style.subheader}`}>
                {column.label}{column.unavailable && <sup className="ml-0.5" aria-hidden="true">*</sup>}
                {column.week && <span className="mt-0.5 block whitespace-nowrap text-[10px] font-normal text-darkBlue/65">{formatReportWeek(column.week)}</span>}
                {column.weekLabel && <span className="mt-0.5 block text-[10px] font-normal text-darkBlue/70">{column.weekLabel}</span>}
              </th>
            )))}
          </tr>
        </thead>
        <tbody>
          {report.rows.map(({ employee, values, weeklyHours, former, provisional, mealDays = [], leaveStatus }, index) => (
            <tr key={employee.id} className="group odd:bg-white even:bg-[#f6f9fe] hover:bg-[#edf4ff]">
              <th scope="row" className={`${identityCell} z-[5] max-w-[13rem] border-b border-[#e5ebf6] py-2.5 font-semibold group-hover:bg-[#edf4ff] ${index % 2 ? "bg-[#f6f9fe]" : "bg-white"}`}>
                <div className="flex items-center gap-2">
                  <span className="hidden size-8 shrink-0 place-items-center rounded-full bg-[#e6edff] text-xs text-[#244b95] midTablet:grid" aria-hidden="true">
                    {`${employee.firstname?.[0] || ""}${employee.lastname?.[0] || ""}`.toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    {former ? <span className="block break-words">{employee.firstname} {employee.lastname}</span> :
                      <Link href={`${directoryPath}/${employee.id}`} className="block break-words hover:text-blue hover:underline">
                        {employee.firstname} {employee.lastname}
                      </Link>}
                    {(former || provisional || employee.post || values.weeklyHours != null) && (
                      <span className="mt-0.5 flex flex-wrap items-center gap-1 text-xs font-normal text-darkBlue/65">
                        {[former ? "Ancien salarié" : employee.post, provisional ? "Pointage en cours" : null].filter(Boolean).join(" · ")}
                        {values.weeklyHours != null && <span className="rounded bg-[#e8effb] px-1.5 text-[10px] font-semibold text-[#244b95]">{formatReportValue(values.weeklyHours, "hours")}</span>}
                      </span>
                    )}
                  </div>
                  {["planned", "gross", "paid"].some((key) => values[key] != null) && (
                    <button type="button" aria-label={`Voir les heures de ${employee.firstname} ${employee.lastname} sur la période`}
                      title="Détail des heures de la période" className="grid size-7 shrink-0 place-items-center rounded-md text-[#244b95] hover:bg-[#dbe9ff]"
                      onClick={() => setHoursDetail({ employee, hours: { ...values, provisional } })}><Clock3 size={14} /></button>
                  )}
                </div>
              </th>
              {groups.flatMap((group) => group.visible.map((column) => {
                const value = formatReportValue(values[column.key], column.decimal ? "decimalHours" : column.type);
                const editable = !former && column.edit && (column.edit !== "meals" || mealDays.some((day) =>
                  day.mode === "combined" && day.date <= report.today));
                return <td key={`${group.id}:${column.key}`}
                  className={`${metricCell} border-b border-[#e5ebf6] py-2 ${column.week ? "bg-[#edf4ff]/55 px-1" : ""} ${values[column.key] == null ? "text-darkBlue/40" : ""}`}>
                  {column.week
                    ? <WeekCell column={column} employee={employee} hours={weeklyHours?.[column.key]} onOpen={setHoursDetail} />
                    : column.key === "leaveAvailable" && leaveStatusLabels[leaveStatus] && !former
                      ? <Link href={{ pathname: `${directoryPath}/${employee.id}`, query: { tab: "employment" } }}
                        className="text-xs font-medium text-blue hover:underline">{leaveStatusLabels[leaveStatus]}</Link>
                      : column.key === "premiums" && values.overtimeNeedsReview
                        ? <span className="text-xs font-medium text-[#815120]" title="Le temps partiel atteint le seuil hebdomadaire à temps plein">À vérifier</span>
                      : editable ? <button type="button" className="inline-flex min-h-7 items-center gap-2 rounded px-1.5 hover:bg-[#dbe9ff]"
                      aria-label={`Modifier ${column.label} pour ${employee.firstname} ${employee.lastname}`}
                      onClick={() => onEdit({ kind: column.edit, employee, mealDays, today: report.today })}>
                      {value}<Pencil size={12} className="text-darkBlue/65" aria-hidden="true" />
                    </button> : value}
                </td>;
              }))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {hoursDetail && <ReportHoursDetails detail={hoursDetail} columns={report.hoursColumns} onClose={() => setHoursDetail(null)} />}
    </>
  );
}

function PeriodFields({ from, to, onChange }) {
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);
  const [error, setError] = useState("");
  function submit(event) {
    event.preventDefault();
    if (!isReportPeriod(start, end)) {
      setError("Choisissez une période valide de 92 jours maximum.");
      return;
    }
    setError("");
    onChange({ from: start, to: end });
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <label className="grid min-w-0 gap-1 text-xs font-semibold">Du
        <input type="date" required value={start} onChange={(event) => setStart(event.target.value)} className={control} />
      </label>
      <label className="grid min-w-0 gap-1 text-xs font-semibold">Au
        <input type="date" required value={end} onChange={(event) => setEnd(event.target.value)} className={control} />
      </label>
      <button type="submit" className={button}>Appliquer</button>
      {error && <span role="alert" className="w-full text-xs text-red">{error}</span>}
    </form>
  );
}

export default function PersonnelReport({ restaurantId }) {
  const router = useRouter();
  const { from: routeFrom, to: routeTo } = router.query;
  const { from, to } = isReportPeriod(routeFrom, routeTo) ? { from: routeFrom, to: routeTo } : reportMonth();
  const [search, setSearch] = useState("");
  const [querySearch, setQuerySearch] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [post, setPost] = useState("");
  const [openGroups, setOpenGroups] = useState(initialGroups);
  const [request, setRequest] = useState(null);
  const [retry, setRetry] = useState(0);
  const [edit, setEdit] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const exportRequest = useRef(null);
  const exportMenu = useRef(null);
  const endpoint = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/reports`;
  const requestKey = JSON.stringify([from, to, querySearch, employeeId, post, retry]);
  const current = request?.key === requestKey ? request : null;
  const report = current?.report;
  const payrollIssues = report?.payrollIssues || [];
  const payrollOverlap = payrollIssues.some(({ kind }) => kind === "payrollOverlap");
  const options = request?.options || [];
  const posts = [...new Set(options.map((item) => item.post).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));

  useEffect(() => {
    const timer = setTimeout(() => setQuerySearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => () => exportRequest.current?.abort(), []);

  useEffect(() => {
    if (!exportOpen) return undefined;
    function dismissOutside(event) {
      if (!exportMenu.current?.contains(event.target)) setExportOpen(false);
    }
    document.addEventListener("pointerdown", dismissOutside, true);
    return () => document.removeEventListener("pointerdown", dismissOutside, true);
  }, [exportOpen]);

  useEffect(() => {
    if (!router.isReady) return undefined;
    const controller = new AbortController();
    setExportError("");
    axios.get(endpoint, { params: { from, to, search: querySearch, employeeId, post }, signal: controller.signal })
      .then(({ data }) => {
        if (!controller.signal.aborted) setRequest({ key: requestKey, report: data, options: data.options });
      }).catch((failure) => {
        if (!controller.signal.aborted) {
          setRequest({ key: requestKey, error: failure.response?.data?.message || "Impossible de charger le rapport RH.", options: [] });
        }
      });
    return () => controller.abort();
  }, [endpoint, router.isReady, from, to, querySearch, employeeId, post, requestKey]);

  function changePeriod(period) {
    router.push({ pathname: router.pathname, query: period }, undefined, { shallow: true, scroll: false });
  }

  async function exportExcel() {
    if (!report || payrollIssues.length || exporting || search.trim() !== querySearch) return;
    const controller = new AbortController();
    exportRequest.current = controller;
    setExporting(true);
    setExportError("");
    setExportOpen(false);
    try {
      const response = await axios.post(`${endpoint}/export/excel`, { from, to, search: querySearch, employeeId, post },
        { responseType: "blob", signal: controller.signal });
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      const filename = /filename="([^"]+)"/.exec(response.headers["content-disposition"] || "")?.[1];
      link.href = url;
      link.download = filename || `rapport-rh-${from}-au-${to}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) {
      if (controller.signal.aborted) return;
      const body = failure.response?.data;
      const message = body instanceof Blob ? await body.text().then((value) => JSON.parse(value).message).catch(() => "") : "";
      setExportError(message || "Impossible de télécharger le rapport Excel. Réessayez.");
    } finally {
      if (!controller.signal.aborted) {
        exportRequest.current = null;
        setExporting(false);
      }
    }
  }

  return (
    <section className="grid min-w-0 gap-4">
      <CatalogHeaderDashboardComponent title="Rapport RH" onBack={() => router.push(directoryPath)} backLabel="Retour à la gestion du personnel"
        actions={
          <div className="flex flex-wrap gap-2">
            {report?.canConfigure && <button type="button" className={button} onClick={() => setEdit({ kind: "settings" })}>Paramètres</button>}
            <div ref={exportMenu} className="relative" onKeyDown={(event) => {
              if (event.key === "Escape" && exportOpen) {
                setExportOpen(false);
                exportMenu.current?.firstElementChild?.focus();
              }
            }}>
            <button type="button" aria-expanded={exportOpen} disabled={!report?.rows.length || payrollIssues.length > 0 || exporting || search.trim() !== querySearch}
              className={button} onClick={() => setExportOpen((value) => !value)}>
              <Download size={16} aria-hidden="true" />{exporting ? "Export en cours…" : "Options d’export"}<ChevronDown size={14} aria-hidden="true" />
            </button>
            {exportOpen && report?.rows.length > 0 && search.trim() === querySearch && (
              <div className="absolute right-0 top-full z-40 mt-1 min-w-max rounded-lg border border-darkBlue/15 bg-white p-1 shadow-lg">
                <button type="button" className={button} onClick={exportExcel}>Télécharger (Excel)</button>
              </div>
            )}
            </div>
          </div>
        }
      />
      {request?.report?.canConfigure && <HrQuestionnaire key={restaurantId} restaurantId={restaurantId} onApplied={() => setRetry((value) => value + 1)} />}
      {payrollIssues.length > 0 && <aside role="status" className="rounded-xl border border-darkBlue/15 bg-white p-3 text-sm">
        <p className="font-semibold">{payrollOverlap ? "Export de paie en attente de correction" : "Paramètre à confirmer"}</p>
        <p>{payrollOverlap ? "Traitez les points ci-dessous avant d’exporter cette période en Excel."
          : "Complétez les réglages ci-dessous pour exporter cette période en Excel."}</p>
        <ul className="list-disc pl-5">{payrollIssues.map(({ kind, message }) => <li key={kind}>{message}</li>)}</ul>
      </aside>}
      <div className="grid min-w-0 gap-3 rounded-xl border border-darkBlue/10 bg-white p-3 midTablet:p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" aria-label="Période précédente" title="Période précédente" className={button}
              onClick={() => changePeriod(moveReportPeriod({ from, to }, -1))}><ChevronLeft size={16} aria-hidden="true" /></button>
            <span className="flex items-center gap-2 px-1 text-sm font-semibold"><CalendarDays size={16} aria-hidden="true" />{reportPeriodLabel({ from, to })}</span>
            <button type="button" aria-label="Période suivante" title="Période suivante" className={button}
              onClick={() => changePeriod(moveReportPeriod({ from, to }, 1))}><ChevronRight size={16} aria-hidden="true" /></button>
            <button type="button" className={button} onClick={() => changePeriod(reportMonth())}>Ce mois</button>
          </div>
          <PeriodFields key={`${from}:${to}`} from={from} to={to} onChange={changePeriod} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[min(100%,14rem)] flex-1">
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-3 text-darkBlue/55" />
            <input type="search" aria-label="Rechercher un salarié" placeholder="Nom, poste ou matricule" value={search}
              onChange={(event) => setSearch(event.target.value.slice(0, 120))} className={`${control} w-full pl-9`} />
          </label>
          <select aria-label="Filtrer par salarié" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className={`${control} max-w-full`}>
            <option value="">Tous les salariés</option>
            {employeeId && !options.some((item) => item.id === employeeId) && <option value={employeeId}>Salarié sélectionné</option>}
            {options.map((item) => <option value={item.id} key={item.id}>{item.firstname} {item.lastname}{item.former ? " (ancien)" : ""}</option>)}
          </select>
          <select aria-label="Filtrer par poste" value={post} onChange={(event) => setPost(event.target.value)} className={`${control} max-w-full`}>
            <option value="">Tous les postes</option>
            {post && !posts.includes(post) && <option value={post}>{post}</option>}
            {posts.map((value) => <option value={value} key={value}>{value}</option>)}
          </select>
          {(employeeId || post || search) && <button type="button" className={button}
            onClick={() => { setEmployeeId(""); setPost(""); setSearch(""); setQuerySearch(""); }}>Effacer les filtres</button>}
        </div>
        {report?.weeks.length > 0 && (
          <p className="text-xs font-semibold text-[#244b95]">
            {report.weeks.length === 1
              ? `Semaine ${report.weeks[0].label.slice(1)}`
              : `Semaines ${report.weeks[0].label.slice(1)} à ${report.weeks.at(-1).label.slice(1)}`}
          </p>
        )}
      </div>
      {exportError && <p className="text-sm text-red" role="alert">{exportError}</p>}
      <div className="min-w-0 overflow-hidden rounded-xl border border-darkBlue/10 bg-white">
        {!current ? <p role="status" className="px-4 py-8 text-sm text-darkBlue/70">Chargement du rapport…</p> :
          current.error ? (
            <div className="flex flex-wrap items-center gap-3 p-4">
              <p role="alert" className="text-sm text-red">{current.error}</p>
              <button type="button" className={button} onClick={() => setRetry((value) => value + 1)}>Réessayer</button>
            </div>
          ) : report.rows.length ? <ReportTable report={report} open={openGroups} onEdit={setEdit}
            toggle={(group) => setOpenGroups((state) => ({ ...state, [group]: !state[group] }))} /> :
            <p role="status" className="px-4 py-8 text-center text-sm text-darkBlue/70">Aucun salarié pour cette période et ces filtres.</p>}
      </div>
      {report?.rows.length > 0 && (
        <details className="rounded-xl border border-darkBlue/10 bg-white px-4 py-3 text-sm text-darkBlue/75">
          <summary className="cursor-pointer font-semibold">Lire les chiffres du rapport</summary>
          <ul className="mt-2 grid list-disc gap-1 pl-5">
            <li>Le planning compte les services au jour de leur début. Les heures pointées et rémunérées sont réparties par jour, comme dans la Pointeuse.</li>
            <li>Les colonnes Sxx additionnent les heures planifiées nettes et les absences prises en compte. Le dépassement du volume contractuel s’affiche en rouge. Une semaine s’affiche si la période va jusqu’à son dimanche. Clique sur le total pour consulter le détail.</li>
            <li>Les heures rémunérées tiennent compte des corrections et des pauses déduites. Elles peuvent inclure des services en attente de validation.</li>
            <li>Les absences affichent les événements applicables et distinguent jours calendaires et absences à horaires.</li>
            <li>Les règles du restaurant déterminent les repas dus. Saisis les repas pris sur place dans « Avantages Nature », y compris zéro. Le rapport calcule les indemnités quand les saisies nécessaires sont renseignées.</li>
            <li>Les majorations hebdomadaires utilisent la semaine entière pour déclencher les tranches, même si le rapport n’en affiche qu’une partie.</li>
            <li>Le seuil atteint par un salarié à temps partiel est signalé pour vérification s’il rejoint le seuil du temps plein.</li>
            <li>Le solde de congés disponible tient compte des congés approuvés planifiés jusqu’à la fin de la période affichée.</li>
            <li>Les colonnes marquées * nécessitent des données ou règles de paie supplémentaires. Le tiret indique une valeur indisponible.</li>
          </ul>
        </details>
      )}
      {edit && <PersonnelReportInputDialog kind={edit.kind} baseUrl={personnelReportInputsUrl(restaurantId, edit.employee?.id)}
        employeeName={edit.employee && `${edit.employee.firstname} ${edit.employee.lastname}`}
        from={from} to={to} mealDays={edit.mealDays}
        initialDate={edit.kind === "meals" ? edit.mealDays.find((day) =>
          day.mode === "combined" && (day.due || day.works) && day.taken == null && day.date <= edit.today)?.date :
          edit.kind === "hoursEntry" ? to : from.slice(0, 7)}
        onClose={() => setEdit(null)} onSaved={({ keepOpen }) => {
          if (!keepOpen) setEdit(null);
          setRetry((value) => value + 1);
        }} />}
    </section>
  );
}
