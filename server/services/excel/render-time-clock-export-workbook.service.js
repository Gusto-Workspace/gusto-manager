function safeArr(value) {
  return Array.isArray(value) ? value : [];
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatDateKey(value) {
  if (!value) return "";

  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value) {
  if (!value) return "";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function formatTime(value) {
  if (!value) return "";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function formatRangeSheetName(startDate, endDate) {
  const left = String(startDate || "").slice(5).split("-").reverse().join("-");
  const right = String(endDate || "").slice(5).split("-").reverse().join("-");
  const raw = [left, right].filter(Boolean).join(" au ");

  return sanitizeWorksheetName(raw || "Periode");
}

function sanitizeWorksheetName(value) {
  const cleaned = String(value || "Feuille")
    .replace(/[\\/*?:[\]]/g, "-")
    .trim();

  return (cleaned || "Feuille").slice(0, 31);
}

function minutesToHours(value) {
  const hours = Number(value || 0) / 60;
  return Math.round(hours * 100) / 100;
}

function toNumberCell(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return { value: 0, type: "Number" };

  const scale = 10 ** digits;
  return {
    value: Math.round(numeric * scale) / scale,
    type: "Number",
  };
}

function toIntegerCell(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return { value: 0, type: "Number" };

  return {
    value: Math.round(numeric),
    type: "Number",
  };
}

function getContractualLabel(employment = {}) {
  const value = Number(employment?.contractualValue || 0);
  const unit = String(employment?.contractualUnit || "").trim().toLowerCase();

  if (!value && !unit) return "";
  if (!unit) return value ? `${value} h` : "";
  if (!value) {
    if (unit === "week") return "h / semaine";
    if (unit === "month") return "h / mois";
    return unit;
  }

  if (unit === "week") return `${value} h / semaine`;
  if (unit === "month") return `${value} h / mois`;

  return `${value} ${unit}`.trim();
}

function getLeaveTypeLabel(leaveRequest = {}) {
  switch (String(leaveRequest?.type || "").trim()) {
    case "morning":
      return "Conges matin";
    case "afternoon":
      return "Conges apres-midi";
    default:
      return "Conges";
  }
}

function getMealPeriodLabel(periods = []) {
  return safeArr(periods)
    .map((value) => {
      switch (String(value || "").trim()) {
        case "lunch":
          return "Midi";
        case "dinner":
          return "Soir";
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join(", ");
}

function getDateBounds(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T23:59:59.999`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return null;
  }

  return { start, end };
}

function overlapsRange(startValue, endValue, bounds) {
  if (!bounds) return false;

  const start = new Date(startValue);
  const end = new Date(endValue);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;

  return start <= bounds.end && end >= bounds.start;
}

function diffMinutes(startValue, endValue) {
  const start = new Date(startValue);
  const end = new Date(endValue);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return 0;
  }

  return Math.round((end.getTime() - start.getTime()) / 60000);
}

function countCalendarDays(startValue, endValue) {
  const start = new Date(startValue);
  const end = new Date(endValue);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return 0;
  }

  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  let count = 0;

  while (cursor <= last) {
    count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  return count;
}

function computeLeaveDays(leaveRequest = {}) {
  const days = countCalendarDays(leaveRequest.start, leaveRequest.end);
  if (!days) return 0;

  if (leaveRequest.type === "morning" || leaveRequest.type === "afternoon") {
    return Math.round(days * 0.5 * 100) / 100;
  }

  return days;
}

function eachDayBetween(startValue, endValue, iteratee) {
  const start = new Date(startValue);
  const end = new Date(endValue);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return;
  }

  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  while (cursor <= last) {
    iteratee(new Date(cursor.getTime()));
    cursor.setDate(cursor.getDate() + 1);
  }
}

function getContractualMinutesForDay(dayValue, employment = {}) {
  const value = Number(employment?.contractualValue || 0);
  const unit = String(employment?.contractualUnit || "").trim().toLowerCase();

  if (!value) return 0;

  if (unit === "week") {
    return Math.round((value * 60) / 7);
  }

  if (unit === "month") {
    const date = dayValue instanceof Date ? dayValue : new Date(dayValue);
    if (Number.isNaN(date.getTime())) return 0;
    const daysInMonth = new Date(
      date.getFullYear(),
      date.getMonth() + 1,
      0,
    ).getDate();
    if (!daysInMonth) return 0;
    return Math.round((value * 60) / daysInMonth);
  }

  return 0;
}

function computeContractualExpectedMinutes(bounds, employment = {}) {
  if (!bounds) return 0;

  let total = 0;
  eachDayBetween(bounds.start, bounds.end, (day) => {
    total += getContractualMinutesForDay(day, employment);
  });
  return total;
}

function clampLeaveRequestToBounds(leaveRequest = {}, bounds) {
  if (!bounds || !overlapsRange(leaveRequest?.start, leaveRequest?.end, bounds)) {
    return null;
  }

  const start = new Date(
    Math.max(new Date(leaveRequest.start).getTime(), bounds.start.getTime()),
  );
  const end = new Date(
    Math.min(new Date(leaveRequest.end).getTime(), bounds.end.getTime()),
  );

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return null;
  }

  return {
    ...leaveRequest,
    start,
    end,
  };
}

function computeLeaveMinutes(leaveRequest = {}, employment = {}, bounds) {
  const boundedLeave = clampLeaveRequestToBounds(leaveRequest, bounds);
  if (!boundedLeave) return 0;

  if (
    boundedLeave.type !== "full" &&
    diffMinutes(boundedLeave.start, boundedLeave.end) > 0 &&
    diffMinutes(boundedLeave.start, boundedLeave.end) <= 12 * 60
  ) {
    return diffMinutes(boundedLeave.start, boundedLeave.end);
  }

  let total = 0;
  eachDayBetween(boundedLeave.start, boundedLeave.end, (day) => {
    const dailyMinutes = getContractualMinutesForDay(day, employment);
    total +=
      boundedLeave.type === "morning" || boundedLeave.type === "afternoon"
        ? Math.round(dailyMinutes / 2)
        : dailyMinutes;
  });

  return total;
}

function computeLeaveStats(report = {}, bounds) {
  const employment = report?.profile?.employment || {};
  const approvedLeaves = safeArr(report?.profile?.leaveRequests).filter(
    (leaveRequest) =>
      leaveRequest?.status === "approved" &&
      overlapsRange(leaveRequest.start, leaveRequest.end, bounds),
  );

  return approvedLeaves.reduce(
    (totals, leaveRequest) => {
      const boundedLeave = clampLeaveRequestToBounds(leaveRequest, bounds);
      if (!boundedLeave) return totals;

      totals.totalLeaveDays += computeLeaveDays(boundedLeave);
      totals.totalLeaveMinutes += computeLeaveMinutes(
        boundedLeave,
        employment,
        bounds,
      );
      return totals;
    },
    {
      totalLeaveDays: 0,
      totalLeaveMinutes: 0,
    },
  );
}

function buildSummaryRows(reports = [], bounds) {
  return reports.map((report) => {
    const employment = report?.profile?.employment || {};
    const range = report?.range || {};
    const activeDays = safeArr(range.days).filter(
      (day) => Number(day?.totalWorkedMinutes || 0) > 0,
    ).length;
    const contractualMinutes = computeContractualExpectedMinutes(
      bounds,
      employment,
    );
    const overtimeMinutes = Math.max(
      0,
      Number(range.totalWorkedMinutes || 0) - contractualMinutes,
    );
    const leaveStats = computeLeaveStats(report, bounds);

    return [
      report?.employee?.firstname || "",
      report?.employee?.lastname || "",
      report?.employee?.post || "",
      employment.contractType || "",
      getContractualLabel(employment),
      toNumberCell(minutesToHours(contractualMinutes)),
      toNumberCell(minutesToHours(range.totalWorkedMinutes || 0)),
      toNumberCell(minutesToHours(overtimeMinutes)),
      toNumberCell(minutesToHours(leaveStats.totalLeaveMinutes || 0)),
      toNumberCell(leaveStats.totalLeaveDays || 0),
      toNumberCell(minutesToHours(range.totalBreakMinutes || 0)),
      toNumberCell(minutesToHours(range.totalGrossMinutes || 0)),
      toIntegerCell(range.totalSessions || 0),
      toIntegerCell(range.totalMealCount || 0),
      toIntegerCell(activeDays),
      safeArr(range.anomalies).join(", "),
    ];
  });
}

function buildDetailRows(reports = [], bounds) {
  const rows = [];

  reports.forEach((report) => {
    const employment = report?.profile?.employment || {};
    const leaveRequests = safeArr(report?.profile?.leaveRequests);

    safeArr(report?.range?.days).forEach((day) => {
      safeArr(day?.sessions).forEach((session) => {
        const startAt = session?.dayTotals?.startAt || session?.clockInAt;
        const endAt = session?.dayTotals?.endAt || session?.clockOutAt;

        rows.push([
          report?.employee?.firstname || "",
          report?.employee?.lastname || "",
          employment.contractType || "",
          getContractualLabel(employment),
          formatDateKey(day?.date),
          "Travail",
          report?.employee?.post || "",
          formatTime(startAt),
          formatTime(endAt),
          toNumberCell(minutesToHours(session?.dayTotals?.breakMinutes || 0)),
          toNumberCell(minutesToHours(session?.dayTotals?.workedMinutes || 0)),
          toIntegerCell(session?.dayTotals?.mealCount || 0),
          toNumberCell(
            session?.dayTotals?.mealCount > 0
              ? Number(session?.mealAllowance?.amount || 0)
              : 0,
          ),
          session?.dayTotals?.mealCount > 0
            ? getMealPeriodLabel(session?.mealAllowance?.periods)
            : "",
          session?.isManuallyEdited ? "Corrige" : "Pointeuse",
        ]);
      });
    });

    leaveRequests
      .filter(
        (leaveRequest) =>
          leaveRequest?.status === "approved" &&
          overlapsRange(leaveRequest.start, leaveRequest.end, bounds),
      )
      .forEach((leaveRequest) => {
        const leaveMinutes = computeLeaveMinutes(
          leaveRequest,
          employment,
          bounds,
        );
        rows.push([
          report?.employee?.firstname || "",
          report?.employee?.lastname || "",
          employment.contractType || "",
          getContractualLabel(employment),
          formatDateTime(leaveRequest.start).slice(0, 10),
          "Absence",
          getLeaveTypeLabel(leaveRequest),
          formatTime(leaveRequest.start),
          formatTime(leaveRequest.end),
          toNumberCell(0),
          toNumberCell(minutesToHours(leaveMinutes)),
          toIntegerCell(0),
          toNumberCell(0),
          "",
          "Conges approuves",
        ]);
      });
  });

  return rows.sort((left, right) => {
    const nameCompare = `${left[1]} ${left[0]}`.localeCompare(`${right[1]} ${right[0]}`);
    if (nameCompare !== 0) return nameCompare;
    return String(left[4] || "").localeCompare(String(right[4] || ""));
  });
}

function buildLeaveRows(reports = [], bounds) {
  const rows = [];

  reports.forEach((report) => {
    safeArr(report?.profile?.leaveRequests)
      .filter(
        (leaveRequest) =>
          leaveRequest?.status === "approved" &&
          overlapsRange(leaveRequest.start, leaveRequest.end, bounds),
      )
      .forEach((leaveRequest) => {
        const boundedLeave = clampLeaveRequestToBounds(leaveRequest, bounds);
        if (!boundedLeave) return;

        rows.push([
          report?.employee?.lastname || "",
          report?.employee?.firstname || "",
          getLeaveTypeLabel(boundedLeave),
          formatDateTime(boundedLeave.start),
          formatDateTime(boundedLeave.end),
          toNumberCell(
            minutesToHours(
              computeLeaveMinutes(boundedLeave, report?.profile?.employment || {}, bounds),
            ),
          ),
          toNumberCell(computeLeaveDays(boundedLeave)),
        ]);
      });
  });

  return rows.sort((left, right) => {
    const nameCompare = `${left[0]} ${left[1]}`.localeCompare(`${right[0]} ${right[1]}`);
    if (nameCompare !== 0) return nameCompare;
    return String(left[3] || "").localeCompare(String(right[3] || ""));
  });
}

function buildLeaveBalanceRows(reports = []) {
  return reports.map((report) => {
    const employment = report?.profile?.employment || {};

    return [
      report?.employee?.lastname || "",
      report?.employee?.firstname || "",
      toNumberCell(employment.leaveBalancePreviousYear || 0),
      toNumberCell(employment.leaveBalanceCurrentYear || 0),
      toNumberCell(employment.leaveBalanceAvailable || 0),
    ];
  });
}

function buildEmployeeSheetRows(reports = []) {
  return reports.map((report) => {
    const employment = report?.profile?.employment || {};

    return [
      report?.employee?.firstname || "",
      report?.employee?.lastname || "",
      report?.employee?.email || "",
      report?.rawEmployee?.phone || "",
      report?.employee?.post || "",
      employment.payrollCode || "",
      employment.contractType || "",
      getContractualLabel(employment),
      employment.primaryEstablishment || "",
    ];
  });
}

function buildWorkbookDefinition({
  restaurantName = "Restaurant",
  startDate,
  endDate,
  reports = [],
  generatedAt = new Date(),
}) {
  const bounds = getDateBounds(startDate, endDate);

  return [
    {
      name: formatRangeSheetName(startDate, endDate),
      title: "Synthese heures salaries",
      headers: [
        "Prenom",
        "Nom",
        "Poste",
        "Type de contrat",
        "Temps contractuel",
        "Temps contractuel periode (h)",
        "Heures travaillees (h)",
        "Heures supp (h)",
        "Absences (h)",
        "Conges (jours)",
        "Pause (h)",
        "Temps brut (h)",
        "Services",
        "Repas",
        "Jours actifs",
        "Anomalies",
      ],
      rows: buildSummaryRows(reports, bounds),
    },
    {
      name: "Fiche employes",
      title: "Fiche employes",
      headers: [
        "Prenom",
        "Nom",
        "Email",
        "Telephone",
        "Poste",
        "Code paie",
        "Type de contrat",
        "Temps contractuel",
        "Etablissement principal",
      ],
      rows: buildEmployeeSheetRows(reports),
    },
    {
      name: "Details",
      title: "Details heures et absences",
      headers: [
        "Prenom",
        "Nom",
        "Type de contrat",
        "Temps contractuel",
        "Date",
        "Travail / Absence",
        "Nom du poste / type d'absence",
        "Debut",
        "Fin",
        "Pause (h)",
        "Heures (h)",
        "Repas dus",
        "Montant repas (EUR)",
        "Periodes repas",
        "Source",
      ],
      rows: buildDetailRows(reports, bounds),
    },
    {
      name: "Absences Employes",
      title: "Absences employes",
      headers: [
        "Nom",
        "Prenom",
        "Type absence",
        "Date de debut",
        "Date de fin",
        "Nb heures",
        "Nb jours",
      ],
      rows: buildLeaveRows(reports, bounds),
    },
    {
      name: "Solde Conges",
      title: "Solde conges",
      headers: ["Nom", "Prenom", "N-1", "N", "Conges disponibles"],
      rows: buildLeaveBalanceRows(reports),
    },
  ].map((sheet) => ({
    ...sheet,
    restaurantName,
    startDate,
    endDate,
    generatedAt,
  }));
}

function columnNumberToLetters(value) {
  let column = Number(value || 1);
  let out = "";

  while (column > 0) {
    const remainder = (column - 1) % 26;
    out = String.fromCharCode(65 + remainder) + out;
    column = Math.floor((column - 1) / 26);
  }

  return out || "A";
}

function normalizeCell(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {
      value: value.value ?? "",
      type: value.type === "Number" ? "Number" : "String",
    };
  }

  return { value: value ?? "", type: "String" };
}

function renderCellXml(cell, rowIndex, columnIndex, styleIndex = 0) {
  const normalized = normalizeCell(cell);
  const ref = `${columnNumberToLetters(columnIndex)}${rowIndex}`;
  const styleAttr = styleIndex > 0 ? ` s="${styleIndex}"` : "";

  if (normalized.type === "Number") {
    return `<c r="${ref}"${styleAttr}><v>${escapeXml(normalized.value)}</v></c>`;
  }

  return `<c r="${ref}" t="inlineStr"${styleAttr}><is><t xml:space="preserve">${escapeXml(normalized.value)}</t></is></c>`;
}

function renderRowXml(cells = [], rowIndex, styleIndex = 0) {
  if (!Array.isArray(cells) || !cells.length) {
    return `<row r="${rowIndex}"/>`;
  }

  const renderedCells = cells
    .map((cell, index) => renderCellXml(cell, rowIndex, index + 1, styleIndex))
    .join("");

  return `<row r="${rowIndex}">${renderedCells}</row>`;
}

function renderWorksheetXml(sheet) {
  const rows = [];
  let rowIndex = 1;

  rows.push(renderRowXml([sheet.title], rowIndex, 2));
  rowIndex += 1;

  rows.push(
    renderRowXml(
      [
        "Restaurant",
        sheet.restaurantName,
        "Periode",
        `${formatDateKey(sheet.startDate)} au ${formatDateKey(sheet.endDate)}`,
        "Genere le",
        formatDateTime(sheet.generatedAt),
      ],
      rowIndex,
      0,
    ),
  );
  rowIndex += 1;

  rows.push(renderRowXml([], rowIndex));
  rowIndex += 1;

  rows.push(renderRowXml(sheet.headers, rowIndex, 1));
  rowIndex += 1;

  safeArr(sheet.rows).forEach((row) => {
    rows.push(renderRowXml(row, rowIndex, 0));
    rowIndex += 1;
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews>
    <sheetView workbookViewId="0"/>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <sheetData>
    ${rows.join("")}
  </sheetData>
</worksheet>`;
}

function buildWorkbookXml(sheets = []) {
  const sheetNodes = sheets
    .map(
      (sheet, index) =>
        `<sheet name="${escapeXml(sanitizeWorksheetName(sheet.name))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook
  xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${sheetNodes}
  </sheets>
</workbook>`;
}

function buildWorkbookRelsXml(sheets = []) {
  const relationships = sheets
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .concat([
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
    ])
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${relationships}
</Relationships>`;
}

function buildRootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function buildStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="13"/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF9"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`;
}

function buildContentTypesXml(sheets = []) {
  const worksheetOverrides = sheets
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  ${worksheetOverrides}
</Types>`;
}

function buildAppPropsXml(sheets = []) {
  const titles = sheets.map((sheet) => `<vt:lpstr>${escapeXml(sheet.name)}</vt:lpstr>`).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties
  xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
  xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Gusto Manager</Application>
  <HeadingPairs>
    <vt:vector size="2" baseType="variant">
      <vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant>
      <vt:variant><vt:i4>${sheets.length}</vt:i4></vt:variant>
    </vt:vector>
  </HeadingPairs>
  <TitlesOfParts>
    <vt:vector size="${sheets.length}" baseType="lpstr">
      ${titles}
    </vt:vector>
  </TitlesOfParts>
</Properties>`;
}

function buildCorePropsXml(generatedAt = new Date()) {
  const isoDate = new Date(generatedAt).toISOString();

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties
  xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:dcmitype="http://purl.org/dc/dcmitype/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>Gusto Manager</dc:creator>
  <cp:lastModifiedBy>Gusto Manager</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${isoDate}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${isoDate}</dcterms:modified>
</cp:coreProperties>`;
}

function createCrc32Table() {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let current = index;

    for (let bit = 0; bit < 8; bit += 1) {
      current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
    }

    table[index] = current >>> 0;
  }

  return table;
}

const CRC32_TABLE = createCrc32Table();

function crc32(buffer) {
  let current = 0xffffffff;

  for (const byte of buffer) {
    current = CRC32_TABLE[(current ^ byte) & 0xff] ^ (current >>> 8);
  }

  return (current ^ 0xffffffff) >>> 0;
}

function toDosDateTime(dateValue = new Date()) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  return {
    time: (hours << 11) | (minutes << 5) | seconds,
    date: ((year - 1980) << 9) | (month << 5) | day,
  };
}

function buildZip(entries = [], generatedAt = new Date()) {
  const fileParts = [];
  const centralDirectoryParts = [];
  let offset = 0;
  const dos = toDosDateTime(generatedAt);

  entries.forEach((entry) => {
    const nameBuffer = Buffer.from(entry.name);
    const dataBuffer = Buffer.isBuffer(entry.data)
      ? entry.data
      : Buffer.from(String(entry.data || ""), "utf8");
    const checksum = crc32(dataBuffer);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(dos.time, 10);
    localHeader.writeUInt16LE(dos.date, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(dataBuffer.length, 18);
    localHeader.writeUInt32LE(dataBuffer.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    fileParts.push(localHeader, nameBuffer, dataBuffer);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dos.time, 12);
    centralHeader.writeUInt16LE(dos.date, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(dataBuffer.length, 20);
    centralHeader.writeUInt32LE(dataBuffer.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralDirectoryParts.push(centralHeader, nameBuffer);
    offset += localHeader.length + nameBuffer.length + dataBuffer.length;
  });

  const centralDirectoryBuffer = Buffer.concat(centralDirectoryParts);
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(0, 4);
  endOfCentralDirectory.writeUInt16LE(0, 6);
  endOfCentralDirectory.writeUInt16LE(entries.length, 8);
  endOfCentralDirectory.writeUInt16LE(entries.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectoryBuffer.length, 12);
  endOfCentralDirectory.writeUInt32LE(offset, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20);

  return Buffer.concat([
    ...fileParts,
    centralDirectoryBuffer,
    endOfCentralDirectory,
  ]);
}

function buildWorkbookBuffer({
  restaurantName = "Restaurant",
  startDate,
  endDate,
  reports = [],
  generatedAt = new Date(),
}) {
  const sheets = buildWorkbookDefinition({
    restaurantName,
    startDate,
    endDate,
    reports,
    generatedAt,
  });

  const entries = [
    {
      name: "[Content_Types].xml",
      data: buildContentTypesXml(sheets),
    },
    {
      name: "_rels/.rels",
      data: buildRootRelsXml(),
    },
    {
      name: "docProps/app.xml",
      data: buildAppPropsXml(sheets),
    },
    {
      name: "docProps/core.xml",
      data: buildCorePropsXml(generatedAt),
    },
    {
      name: "xl/workbook.xml",
      data: buildWorkbookXml(sheets),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: buildWorkbookRelsXml(sheets),
    },
    {
      name: "xl/styles.xml",
      data: buildStylesXml(),
    },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: renderWorksheetXml(sheet),
    })),
  ];

  return buildZip(entries, generatedAt);
}

module.exports = {
  buildWorkbookBuffer,
};
