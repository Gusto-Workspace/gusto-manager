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

function sanitizeWorksheetName(value) {
  const cleaned = String(value || "Feuille")
    .replace(/[\\/*?:[\]]/g, "-")
    .trim();

  return (cleaned || "Feuille").slice(0, 31);
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

function buildSummaryRows(employees = []) {
  return employees.map((employeePayload) => {
    const plannedDays = safeArr(employeePayload?.days).filter(
      (day) => safeArr(day?.shifts).length > 0,
    ).length;
    const leaveDays = safeArr(employeePayload?.days).filter((day) =>
      safeArr(day?.shifts).some((shift) => shift?.isLeave),
    ).length;

    return [
      employeePayload?.employee?.firstname || "",
      employeePayload?.employee?.lastname || "",
      employeePayload?.employee?.post || "",
      toIntegerCell(plannedDays),
      toIntegerCell(employeePayload?.totals?.shiftCount || 0),
      toNumberCell(minutesToHours(employeePayload?.totals?.plannedMinutes || 0)),
      toIntegerCell(leaveDays),
    ];
  });
}

function buildDetailRows(employees = []) {
  const rows = [];

  employees.forEach((employeePayload) => {
    safeArr(employeePayload?.days).forEach((day) => {
      safeArr(day?.shifts).forEach((shift) => {
        rows.push([
          employeePayload?.employee?.firstname || "",
          employeePayload?.employee?.lastname || "",
          employeePayload?.employee?.post || "",
          formatDateKey(day?.date),
          shift?.isLeave ? "Congé" : "Service",
          shift?.title || shift?.textLabel || "",
          shift?.startLabel || "",
          shift?.endLabel || "",
          toNumberCell(minutesToHours(shift?.durationMinutes || 0)),
        ]);
      });
    });
  });

  return rows.sort((left, right) => {
    const nameCompare = `${left[1]} ${left[0]}`.localeCompare(`${right[1]} ${right[0]}`);
    if (nameCompare !== 0) return nameCompare;
    return String(left[3] || "").localeCompare(String(right[3] || ""));
  });
}

function buildWorkbookDefinition({
  restaurantName = "Restaurant",
  startDate,
  endDate,
  employees = [],
}) {
  const generatedAt = new Date();

  return [
    {
      name: "Planning synthese",
      title: "Synthese planning salaries",
      restaurantName,
      startDate,
      endDate,
      generatedAt,
      headers: [
        "Prenom",
        "Nom",
        "Poste",
        "Jours planifies",
        "Services",
        "Heures planifiees (h)",
        "Jours avec conges",
      ],
      rows: buildSummaryRows(employees),
    },
    {
      name: "Planning details",
      title: "Details planning salaries",
      restaurantName,
      startDate,
      endDate,
      generatedAt,
      headers: [
        "Prenom",
        "Nom",
        "Poste",
        "Date",
        "Type",
        "Intitule",
        "Debut",
        "Fin",
        "Duree (h)",
      ],
      rows: buildDetailRows(employees),
    },
  ];
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

function getCellDisplayValue(cell) {
  const normalized = normalizeCell(cell);
  return String(normalized.value ?? "");
}

function computeColumnWidths(sheet) {
  const widthByColumn = [];
  const metadataRow = [
    "Restaurant",
    sheet.restaurantName,
    "Periode",
    `${formatDateKey(sheet.startDate)} au ${formatDateKey(sheet.endDate)}`,
    "Genere le",
    formatDateTime(sheet.generatedAt),
  ];
  const allRows = [[sheet.title], metadataRow, [], sheet.headers, ...safeArr(sheet.rows)];

  allRows.forEach((row) => {
    safeArr(row).forEach((cell, index) => {
      const longestLine = getCellDisplayValue(cell)
        .split(/\r?\n/u)
        .reduce((max, line) => Math.max(max, line.length), 0);

      widthByColumn[index] = Math.max(widthByColumn[index] || 0, longestLine);
    });
  });

  return widthByColumn.map((length, index) => ({
    index: index + 1,
    width: Math.max(8, Math.min(60, Number(length || 0) + 2)),
  }));
}

function renderColumnsXml(columnWidths = []) {
  if (!Array.isArray(columnWidths) || !columnWidths.length) return "";

  const columns = columnWidths
    .map(
      ({ index, width }) =>
        `<col min="${index}" max="${index}" width="${width}" bestFit="1" customWidth="1"/>`,
    )
    .join("");

  return `<cols>${columns}</cols>`;
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
  const metadataRow = [
    "Restaurant",
    sheet.restaurantName,
    "Periode",
    `${formatDateKey(sheet.startDate)} au ${formatDateKey(sheet.endDate)}`,
    "Genere le",
    formatDateTime(sheet.generatedAt),
  ];
  const columnsXml = renderColumnsXml(computeColumnWidths(sheet));

  rows.push(renderRowXml([sheet.title], rowIndex, 2));
  rowIndex += 1;

  rows.push(renderRowXml(metadataRow, rowIndex, 0));
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
  ${columnsXml}
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
  const titles = sheets
    .map((sheet) => `<vt:lpstr>${escapeXml(sheet.name)}</vt:lpstr>`)
    .join("");

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
  employees = [],
  generatedAt = new Date(),
}) {
  const sheets = buildWorkbookDefinition({
    restaurantName,
    startDate,
    endDate,
    employees,
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
