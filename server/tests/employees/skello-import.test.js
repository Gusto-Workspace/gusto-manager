const assert = require("node:assert/strict");
const { test } = require("node:test");
const { once } = require("node:events");
const { DateTime } = require("luxon");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { strFromU8, unzipSync, zipSync } = require("fflate");
const { packageWorkbook, renderRowXml } = require("../../services/excel/render-time-clock-export-workbook.service");
const { parseXlsxSheets } = require("../../services/dish-card-import.service");
const { analyzeSkelloWorkbook } = require("../../services/employees/skello-workbook.service");
const { restoreSkelloHistoricalLateness } = require("../../services/employees/skello-import.service");

process.env.JWT_SECRET = "secret-uniquement-pour-la-recette-skello";
process.env.TIME_CLOCK_SECRET = "secret-pointeuse-uniquement-pour-la-recette-skello";
const importRouter = require("../../routes/admin/skello-import.routes");
const payrollRouter = require("../../routes/time-clock.routes");
const authRouter = require("../../routes/auth.routes");
const Employee = require("../../models/employee.model");
const Restaurant = require("../../models/restaurant.model");
const Owner = require("../../models/owner.model");
const Admin = require("../../models/admin.model");
const Session = require("../../models/time-clock-session.model");
const Notification = require("../../models/notification.model");
const PersonnelInput = require("../../models/personnel-report-input.model");
const SkelloImport = require("../../models/skello-import.model");
const { TimeClockPin } = require("../../models/time-clock-device.model");

const makeExcelDate = (date) => DateTime.fromISO(date, { zone: "UTC" }).toMillis() / 86_400_000 + 25569;
const work = (date, start, end, name = "Source Démo", code = "-") => [
  "Prénom confidentiel", name, code, "CDI", 35, "heures", "Site source", DateTime.fromISO(date).weekNumber,
  makeExcelDate(date), "travail", "Cuisinier", "Site source", makeExcelDate(`${date}T${start}`),
  end.includes("T") ? makeExcelDate(end) : makeExcelDate(`${date}T${end}`), 0.5, "Note confidentielle", 1, 1,
];

function fixture({ change = "", homonym = false, from = "2026-10-01", to = "2026-10-31", history = false } = {}) {
  const sheet = (name, rows) => ({ name, rows });
  const first = DateTime.fromISO(from);
  const last = DateTime.fromISO(to);
  const services = [
    ["2026-10-01", "08:00", "12:00", 3.5, 3.25, 0],
    ["2026-10-31", change === "conflit horaire" ? "22:00" : "23:00", "2026-11-01T02:00", 2.5, 2.75, 2],
    ["2026-11-01", "10:00", "14:00", 3.5, 3.75, 3.5],
    ["2026-11-02", "08:00", "12:00", 3.5, 3.5, 0],
  ].filter(([date]) => date >= first.startOf("week").toISODate() && date <= last.endOf("week").toISODate());
  const absence = (date, label, start, end) => ["Prénom confidentiel", "Source Démo", "TEST-01", "CDI", 35, "heures",
    "Site source", DateTime.fromISO(date).weekNumber, makeExcelDate(date), "absence", label, "Site source",
    start ? makeExcelDate(`${date}T${start}`) : "toute la journée", end ? makeExcelDate(`${date}T${end}`) : null];
  const absences = [absence("2026-10-02", "Congé payé"), absence("2026-11-01", "Arrêt maladie", "16:00", "18:00"),
    absence("2026-11-03", "Congé payé")].filter((row) => row[8] >= makeExcelDate(first.startOf("week").toISODate()) &&
      row[8] <= makeExcelDate(last.endOf("week").toISODate()));
  const sheets = [
    sheet(`${first.toFormat("dd-MM")} - ${last.toFormat("dd-MM")}`, [
      ["Nom", "Prénom", "Matricule de paie", "Type de Contrat", "Volume Horaire Hebdomadaire (h)*", "Intitulé Poste",
        "Date de début de contrat", "Salaire Mensuel Brut (€)", "Note d’archivage", "Heures Travaillées (h)",
        "Heures rémunérées (h)", "Heures du dimanche 50% (h)"],
      ["Source Démo", "Prénom confidentiel", homonym ? "TEST-01" : "-", "CDI", 35, "Cuisinier", "01/09/26", 1800, change,
        history ? (from === "2026-10-01" ? 6 : from === "2026-11-01" ? 7 : 9.5) : 6.5,
        history ? (from === "2026-10-01" ? 6 : from === "2026-11-01" ? 7.25 : 10) : null,
        history ? (from === "2026-10-01" ? 2 : from === "2026-11-01" ? 3.5 : 5.5) : null],
      ...(homonym ? [["Source Démo", "Prénom confidentiel", "TEST-02", "CDI", 35]] : []),
    ]),
    sheet("Fiche employés", [
      [null, null, null, null, null, null, "Détail Planning", "Détail Planning", "Détail Planning"],
      [null, "Poste", null, null, null, null, "Début", "Fin", "Pause (h)", "Retard (h)"],
      [`Total Période (${first.toFormat("dd/MM/yyyy")}-${last.toFormat("dd/MM/yyyy")})`],
      ...(history ? services.map(([date, start, end]) => [DateTime.fromISO(date).setLocale("fr").toFormat("cccc d LLLL"),
        "Cuisinier", null, null, null, null, start, end.slice(-5), 0.5]) : [
        ["Mercredi 30 septembre", "Cuisinier", null, null, null, null, "18h00", "01h00", 0.5],
        ["Jeudi 1 octobre", "Cuisinier", null, null, null, null, "19h00", "02h00", 0.5, 0.42],
      ]),
    ]),
    sheet("Détails", [
      ["Prénom", "Nom", "Matricule de paie", "Type de contrat", "Temps contractuel", "Heures / jours", "Etablissement principal",
        "N° semaine", "Date", "Travail / Absence", "Nom du poste / type d’absence", "Shift / absence effectué à", "Début", "Fin",
        "Pause (h)", "Note", "Repas Dûs", "Avantages Nature", "Retard (h)", "Heures Travaillées (h)",
        "Heures rémunérées (h)", "Heures du dimanche 50% (h)", "Pause rémunérée (h)"],
      ...(history ? [...services.map(([date, start, end, worked, paid, sunday]) =>
        [...work(date, start, end, undefined, "TEST-01"), date === "2026-10-01" ? 0.25 : 0, worked, paid, sunday, 0.5]), ...absences] : [
      work("2026-09-30", "18:00", "2026-10-01T01:00", undefined, homonym ? "TEST-01" : "-"),
      [...work("2026-10-01", "19:00", "2026-10-02T02:00"), 0.42],
      ["Prénom confidentiel", "Source Démo", homonym ? "TEST-01" : "-", "CDI", 35, "heures", "Site source", 40,
        makeExcelDate("2026-10-02"), "absence", "Repos hebdomadaire", "Site source", "toute la journée"],
      work("2026-11-01", "08:00", "12:00", undefined, homonym ? "TEST-01" : "-"),
      ]),
    ]),
    sheet("Absences Employés", [
      ["Nom", "Prénom", "Matricule de paie", "Type absence", "Date de début", "Date de fin", "Nb heures", "Nb jours"],
      ["Source Démo", "Prénom confidentiel", "-", "Retard", "01/10/26", "01/10/26", 0.42, 1],
    ]),
    sheet("Solde Congés", [
      ["Nom", "Prénom", "Matricule de paie", "N : Solde de congés payés", "Congés disponibles"],
      ["Source Démo", "Prénom confidentiel", homonym ? "TEST-01" : "-", 2, 2],
    ]),
  ];
  return packageWorkbook(sheets, ({ rows }) => `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${
    rows.map((row, index) => renderRowXml(row.map((value) => typeof value === "number" ? { type: "Number", value } : value), index + 1)).join("")
  }</sheetData></worksheet>`, new Date("2026-11-20T12:00:00Z"));
}

test("typed Excel dates, overnight pauses, ISO weeks and source scope are handled without inventing punches", () => {
  const { people, preview, reportCandidates } = analyzeSkelloWorkbook(fixture());
  assert.deepEqual(preview.period, { from: "2026-09-28", to: "2026-11-01" });
  assert.deepEqual(preview.weeks.map(({ week }) => week), [40, 41, 42, 43, 44]);
  assert.equal(preview.counts.shifts, 2);
  assert.equal(preview.counts.punches, 0);
  assert.equal(preview.counts.historicalLate, 1);
  const [late] = people[0].inputs.filter(({ kind }) => kind === "historicalLate");
  assert.deepEqual(late.values.events, [{ start: new Date("2026-10-01T17:00:00Z"), end: new Date("2026-10-02T00:00:00Z"), minutes: 25 }]);
  assert.equal(preview.counts.absences, 1);
  assert.deepEqual(preview.shiftTotals, { netMinutes: 780, pauseMinutes: 60 });
  assert.equal(people[0].shifts[0].end.toISOString(), "2026-09-30T23:00:00.000Z");
  assert.equal(people[0].shifts.at(-1).isLeave, true);
  assert.match(preview.issues[0].reason, /Détail Planning/);
  assert.equal(reportCandidates.length, 1);
  assert.equal(reportCandidates[0].date, "2026-11-01");
  assert.equal(reportCandidates[0].start.toISOString(), "2026-11-01T07:00:00.000Z");
  assert.doesNotMatch(JSON.stringify(reportCandidates), /Prénom confidentiel|Source Démo|Note confidentielle|Site source/);
  assert.doesNotMatch(JSON.stringify(people), /Prénom confidentiel|Source Démo|Note confidentielle|Site source/);
  const month = analyzeSkelloWorkbook(fixture(), "month");
  assert.equal(month.preview.counts.outside, 2);
  assert.equal(month.preview.counts.shifts, 1);
});

test("homonyms require a source identifier and spreadsheet formulas are refused", () => {
  const { people, preview } = analyzeSkelloWorkbook(fixture({ homonym: true }));
  assert.equal(people.length, 2);
  assert.equal(people[1].shifts.length, 0);
  assert.ok(preview.issues.some(({ reason }) => reason.includes("ambigu")));
  const archive = unzipSync(fixture());
  archive["xl/worksheets/sheet1.xml"] = Buffer.from(strFromU8(archive["xl/worksheets/sheet1.xml"])
    .replace("<v>1800</v>", "<f>1000+800</f><v>1800</v>"));
  assert.throws(() => analyzeSkelloWorkbook(Buffer.from(zipSync(archive))), /Classeur XLSX/);
});

const testUri = process.env.GUSTO_CLOCK_TEST_MONGO_URI;
test("admin preview, atomic import, report, retry and guarded removal on an isolated MongoDB replica set", {
  skip: testUri ? false : "Configure a dedicated loopback replica set with GUSTO_CLOCK_TEST_MONGO_URI",
}, async (t) => {
  const uri = new URL(testUri);
  assert.equal(uri.protocol, "mongodb:");
  assert.equal(uri.hostname, "127.0.0.1");
  assert.equal(uri.pathname, "/");
  assert.equal(uri.username + uri.password, "");
  uri.pathname = `/skello-test-${new mongoose.Types.ObjectId()}`;
  process.env.CONNECTION_STRING_TEST = uri.href;
  process.env.NODE_ENV = "development";
  await mongoose.connect(uri.href, { serverSelectionTimeoutMS: 4000 });
  t.after(async () => {
    try { await mongoose.connection.dropDatabase(); } finally { await mongoose.disconnect(); }
  });
  await Promise.all([SkelloImport.init(), PersonnelInput.init(), Employee.init()]);
  const [restaurant, other, owner, existing, admin] = Array.from({ length: 5 }, () => new mongoose.Types.ObjectId());
  await Admin.collection.insertOne({ _id: admin, role: "admin" });
  await Owner.collection.insertOne({ _id: owner, firstname: "Responsable fictif", restaurants: [restaurant] });
  await Restaurant.collection.insertMany([
    { _id: restaurant, owner_id: owner, name: "Recette Skello", options: { employees: true }, employees: [existing] },
    { _id: other, name: "Autre établissement", options: { employees: true }, employees: [] },
  ]);
  await Employee.collection.insertOne({ _id: existing, firstname: "Existant", lastname: "Fictif", restaurants: [restaurant],
    restaurantProfiles: [{ restaurant }] });
  const app = express().use(express.json()).use(importRouter).use(payrollRouter).use(authRouter);
  const listener = app.listen(0, "127.0.0.1");
  await once(listener, "listening");
  t.after(() => listener.close());
  function request(path, options = {}, role = "admin") {
    const token = jwt.sign({ role, id: String(role === "owner" ? owner : admin), restaurantId: String(restaurant) }, process.env.JWT_SECRET);
    return fetch(`http://127.0.0.1:${listener.address().port}${path}`, {
      ...options, headers: { ...(options.headers || {}), ...(role && { Authorization: `Bearer ${token}` }) },
    });
  }
  const realPath = `/admin/restaurants/${restaurant}/skello-imports`;
  const otherRealPath = `/admin/restaurants/${other}/skello-imports`;
  const path = `${realPath}/recette`;
  const otherPath = `${otherRealPath}/recette`;
  const file = fixture();
  const send = (where, token, buffer = file) => {
    const data = new FormData();
    data.set("file", new Blob([buffer]), "synthese.xlsx");
    data.set("scope", "weeks");
    if (token) data.set("token", token);
    return request(where, { method: "POST", body: data });
  };
  const json = (body, method = "POST") => ({
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  assert.equal((await request(path, {}, null)).status, 403);
  assert.equal((await request(path, {}, "seller")).status, 403);
  process.env.NODE_ENV = "production";
  assert.equal((await request(path)).status, 403);
  process.env.NODE_ENV = "development";
  assert.equal((await send(`${path}/preview`, null, Buffer.from("invalid"))).status, 422);
  const previewResponse = await send(`${path}/preview`);
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  assert.equal(await Employee.countDocuments(), 1);
  assert.equal(await SkelloImport.countDocuments(), 0);
  assert.equal((await send(otherPath, preview.token)).status, 409);
  assert.equal((await send(path)).status, 409);

  // Trigger a failure after the restaurant membership write, to exercise atomic rollback and retry.
  const insert = PersonnelInput.insertMany;
  PersonnelInput.insertMany = async () => { throw new Error("synthetic database failure"); };
  try {
    assert.equal((await send(path, preview.token)).status, 503);
  } finally {
    PersonnelInput.insertMany = insert;
  }
  assert.equal(await Employee.countDocuments(), 1);
  assert.equal((await Restaurant.findById(restaurant).lean()).employees.length, 1);
  assert.equal(await SkelloImport.countDocuments({ status: "failed" }), 1);

  const concurrent = await Promise.all([send(path, preview.token), send(path, preview.token)]);
  assert.deepEqual(concurrent.map(({ status }) => status), [200, 200]);
  const results = await Promise.all(concurrent.map((response) => response.json()));
  assert.deepEqual(results.map(({ alreadyImported }) => alreadyImported).sort(), [false, true]);
  const { batch } = results[0];
  const employee = await Employee.findOne({ historicalImport: batch.id }).select("+password").lean();
  assert.equal(employee.password, undefined);
  assert.match(employee.email, /@example\.invalid$/);
  assert.doesNotMatch(JSON.stringify(employee), /Prénom confidentiel|Source Démo|Note confidentielle|Site source/);
  assert.equal(await Employee.countDocuments(), 2);
  assert.equal(await Session.countDocuments(), 0);
  assert.equal(await TimeClockPin.countDocuments(), 0);
  assert.equal(await Notification.countDocuments(), 0);
  assert.equal((await request("/auth/send-reset-code", json({ email: employee.email }), null)).status, 404);
  assert.equal((await Restaurant.findById(other).lean()).employees.length, 0);

  const root = `/restaurants/${restaurant}`;
  const range = `from=2026-10-01&to=2026-10-31&employeeId=${employee._id}`;
  const report = await (await request(`${root}/employees/reports?${range}`, {}, "owner")).json();
  assert.equal(report.rows[0].values.planned, 390);
  assert.equal(report.rows[0].values.plannedBreak, 30);
  assert.equal(report.rows[0].values.absenceCount, 1);
  assert.equal(report.rows[0].values.late, 25);
  assert.equal(report.rows[0].values.paid, undefined);
  const register = await (await request(`${root}/time-clock/register?${range}`, {}, "owner")).json();
  assert.equal(register.rows[0].days.flatMap(({ sessions }) => sessions).length, 0);
  assert.equal(register.rows[0].days.flatMap(({ shifts }) => shifts).filter((shift) => !shift.absence).length, 1);
  const exportResponse = await request(`${root}/employees/reports/export/excel`,
    json({ from: "2026-10-01", to: "2026-10-31", employeeId: String(employee._id) }), "owner");
  assert.equal(exportResponse.status, 200);
  const workbook = parseXlsxSheets(Buffer.from(await exportResponse.arrayBuffer()));
  assert.equal(workbook.length, 5);
  assert.ok(workbook.find(({ name }) => name === "Détails").rows.some((r) => Math.round(r[15] * 60) === 25 && r[16] === "Retard historique (Skello)"));
  assert.equal(workbook.find(({ name }) => name === "Absences Employés").rows.filter((r) => r[3] === "Retard" && r[8] === "Historique Skello").length, 1);

  const storedLate = await PersonnelInput.findOne({ employee: employee._id, kind: "historicalLate" }).lean();
  await PersonnelInput.deleteOne({ _id: storedLate._id });
  await SkelloImport.collection.updateOne({ _id: new mongoose.Types.ObjectId(batch.id) }, {
    $pull: { "manifest.inputs": { id: storedLate._id } }, $unset: { "summary.counts.historicalLate": "" },
  });
  const restore = { restaurantId: String(restaurant), batchId: batch.id, actor: String(admin), buffer: file };
  await assert.rejects(restoreSkelloHistoricalLateness({ ...restore, buffer: fixture({ change: "différent" }) }), { status: 409 });
  await assert.rejects(restoreSkelloHistoricalLateness({ ...restore, restaurantId: String(other) }), { status: 409 });
  assert.deepEqual(await restoreSkelloHistoricalLateness(restore), { added: 1, count: 1 });
  assert.deepEqual(await restoreSkelloHistoricalLateness(restore), { added: 0, count: 1 });
  assert.equal(await Session.countDocuments(), 0);

  const alternate = await (await send(`${path}/preview`, null, fixture({ change: "autre fichier" }))).json();
  assert.equal(alternate.conflict.id, batch.id);
  assert.equal(alternate.token, null);
  assert.equal((await request(`${otherPath}/${batch.id}`, json({ confirmed: true }, "DELETE"))).status, 404);
  assert.equal((await request(`${path}/${batch.id}`, json({}, "DELETE"))).status, 400);
  await Employee.updateOne({ _id: employee._id }, { $set: { post: "Modifié après import" } });
  assert.equal((await request(`${path}/${batch.id}`, json({ confirmed: true }, "DELETE"))).status, 409);
  await Employee.updateOne({ _id: employee._id }, { $set: { post: employee.post } });
  assert.equal((await request(`${path}/${batch.id}`, json({ confirmed: true }, "DELETE"))).status, 200);
  assert.equal(await Employee.countDocuments(), 1);
  assert.equal(await PersonnelInput.countDocuments(), 0);
  assert.equal(await Employee.exists({ _id: existing }) != null, true);
  assert.equal((await Restaurant.findById(restaurant).lean()).employees.length, 1);

  await t.test("production admits an explicitly confirmed workforce plan and keeps payroll and tenant data intact", async () => {
    process.env.NODE_ENV = "production";
    assert.equal((await request(realPath)).status, 200);
    await Admin.updateOne({ _id: admin }, { $set: { role: "seller" } });
    assert.equal((await request(realPath)).status, 403);
    await Admin.updateOne({ _id: admin }, { $set: { role: "admin" } });
    assert.equal((await request(realPath, {}, "owner")).status, 403);
    assert.equal((await request(path)).status, 403);
    const rosterProfile = new mongoose.Types.ObjectId();
    await Employee.updateOne({ _id: existing }, { $set: { restaurantProfiles: [{
      _id: rosterProfile, restaurant, employment: { payrollCode: "TEST-01", contractType: "CDD", contractualValue: 28 },
    }] } });
    const realFile = fixture({ homonym: true, history: true });
    const plan = [{ order: 1, destination: String(existing) }, { order: 2, destination: "create" }];
    function sendReal(where, { choices, token, confirmed, buffer = realFile } = {}) {
      const data = new FormData();
      data.set("file", new Blob([buffer]), "rapport.xlsx");
      data.set("scope", "weeks");
      if (choices) data.set("choices", JSON.stringify(choices));
      if (token) data.set("token", token);
      if (confirmed) data.set("confirmed", "true");
      return request(where, { method: "POST", body: data });
    }
    const preview = await (await sendReal(`${realPath}/preview`)).json();
    assert.equal(preview.rows[0].candidates[0].id, String(existing));
    assert.equal(preview.rows[0].canCreate, false);
    assert.equal(preview.rows[1].canCreate, true);
    assert.equal(preview.token, null);
    assert.equal(await Employee.countDocuments(), 1);

    const incorrect = await (await sendReal(`${realPath}/preview`, { choices: [
      { order: 1, destination: String(new mongoose.Types.ObjectId()) }, plan[1],
    ] })).json();
    assert.ok(incorrect.rows[0].error);
    assert.equal(incorrect.token, null);
    const reviewed = await (await sendReal(`${realPath}/preview`, { choices: plan })).json();
    assert.ok(reviewed.token);
    const apply = { choices: plan, token: reviewed.token, confirmed: true };
    assert.equal((await sendReal(realPath, { ...apply, confirmed: false })).status, 400);
    assert.equal((await sendReal(otherRealPath, apply)).status, 409);
    assert.equal((await sendReal(realPath, { ...apply, buffer: fixture({ homonym: true, change: "fichier différent" }) })).status, 409);
    assert.equal((await sendReal(realPath, { ...apply, choices: [plan[0], { order: 2, destination: "skip" }] })).status, 409);
    await Employee.updateOne({ _id: existing }, { $set: { firstname: "Modifié" } });
    assert.equal((await sendReal(realPath, apply)).status, 409);
    const checkedAgain = await (await sendReal(`${realPath}/preview`, { choices: plan })).json();
    const requests = await Promise.all([sendReal(realPath, { ...apply, token: checkedAgain.token }), sendReal(realPath, { ...apply, token: checkedAgain.token })]);
    assert.deepEqual(requests.map(({ status }) => status), [200, 200]);
    const results = await Promise.all(requests.map((response) => response.json()));
    assert.deepEqual(results.map(({ alreadyImported }) => alreadyImported).sort(), [false, true]);
    assert.deepEqual(results[0].batch.summary.counts, { created: 1, linked: 1, skipped: 0 });
    assert.doesNotMatch(JSON.stringify(results), /Prénom confidentiel|Source Démo|Site source/);
    const created = await Employee.findOne({ _id: { $ne: existing } })
      .select("+password +restaurantProfiles.skelloPayrollCode").lean();
    assert.equal(created.firstname, "Prénom confidentiel");
    assert.equal(created.email, undefined);
    assert.equal(created.password, undefined);
    assert.equal(created.restaurantProfiles[0].skelloPayrollCode, "test-02");
    assert.equal(created.restaurantProfiles[0].employment.payrollCode, "TEST-02");
    const current = await Employee.findById(existing).select("+restaurantProfiles.skelloPayrollCode").lean();
    assert.equal(String(current.restaurantProfiles[0]._id), String(rosterProfile));
    assert.equal(current.restaurantProfiles[0].skelloPayrollCode, "test-01");
    assert.equal(current.restaurantProfiles[0].employment.contractualValue, 28);
    assert.equal(await Session.countDocuments(), 0);
    assert.equal(await TimeClockPin.countDocuments(), 0);
    assert.ok(await PersonnelInput.countDocuments({ kind: "historicalWork", source: "skello" }) > 0);
    assert.equal(await SkelloImport.countDocuments({ mode: "workforce" }), 1);
    assert.equal((await Restaurant.findById(other).lean()).employees.length, 0);
    const november = fixture({ homonym: true, history: true, from: "2026-11-01", to: "2026-11-30" });
    const newReport = await (await sendReal(`${realPath}/preview`, { buffer: november })).json();
    assert.deepEqual(preview.period, { from: "2026-09-28", to: "2026-11-01" });
    assert.deepEqual(newReport.period, { from: "2026-10-26", to: "2026-12-06" });
    assert.equal(newReport.rows[1].canCreate, false);
    assert.equal(newReport.rows[1].candidates[0].id, String(created._id));
    const nextPlan = [plan[0], { order: 2, destination: String(created._id) }];
    const next = await (await sendReal(`${realPath}/preview`, { buffer: november, choices: nextPlan })).json();
    assert.ok(next.token);
    const nextApply = { buffer: november, choices: nextPlan, token: next.token, confirmed: true };
    const balance = await PersonnelInput.create({ _id: `${restaurant}:${rosterProfile}:leave:2026-10-01`, restaurant,
      employee: existing, profile: rosterProfile, kind: "leave", date: "2026-10-01", revision: 1,
      updatedBy: String(owner), values: { leaveAvailable: 9 } });
    const inputsBeforeFailure = await PersonnelInput.countDocuments();
    const writeBatch = SkelloImport.create;
    SkelloImport.create = async () => { throw new Error("synthetic workforce batch failure"); };
    try {
      assert.equal((await sendReal(realPath, nextApply)).status, 503);
    } finally {
      SkelloImport.create = writeBatch;
    }
    assert.equal((await Employee.collection.findOne({ _id: existing })).__v, current.__v);
    assert.equal((await Employee.collection.findOne({ _id: created._id })).__v, created.__v);
    assert.equal(await PersonnelInput.countDocuments(), inputsBeforeFailure);
    assert.equal(await SkelloImport.countDocuments({ mode: "workforce" }), 1);
    const second = await sendReal(realPath, nextApply);
    assert.equal(second.status, 200);
    const secondSummary = (await second.json()).batch.summary;
    assert.deepEqual(secondSummary.counts, { created: 0, linked: 2, skipped: 0 });
    assert.ok(secondSummary.history.duplicateHistory >= 3);
    const replay = await sendReal(realPath, { ...apply, token: checkedAgain.token });
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).alreadyImported, true);
    assert.equal((await (await sendReal(`${realPath}/preview`)).json()).alreadyImported, true);
    assert.equal(await Employee.countDocuments(), 2);
    assert.equal((await Restaurant.findById(restaurant).lean()).employees.length, 2);
    assert.equal(await Session.countDocuments(), 0);
    assert.deepEqual((await PersonnelInput.findById(balance._id).lean()).values, { leaveAvailable: 9 });
    const preserved = await Employee.findById(existing).lean();
    assert.deepEqual(preserved.restaurantProfiles[0].employment, current.restaurantProfiles[0].employment);
    assert.deepEqual(preserved.restaurantProfiles[0].shifts, current.restaurantProfiles[0].shifts);
    const overlapping = fixture({ homonym: true, history: true, from: "2026-10-26", to: "2026-11-08" });
    const overlapPreview = await (await sendReal(`${realPath}/preview`, { buffer: overlapping, choices: nextPlan })).json();
    assert.equal(overlapPreview.rows[0].history.counts.shifts, 0);
    assert.equal(overlapPreview.rows[0].history.counts.absences, 0);
    assert.equal(overlapPreview.rows[0].history.counts.duplicateHistory, 5);
    assert.equal((await sendReal(realPath, { buffer: overlapping, choices: nextPlan, token: overlapPreview.token, confirmed: true })).status, 200);
    const conflicting = fixture({ homonym: true, history: true, change: "conflit horaire" });
    const conflict = await (await sendReal(`${realPath}/preview`, { buffer: conflicting, choices: nextPlan })).json();
    assert.equal(conflict.token, null);
    assert.ok(conflict.rows[0].history.conflicts.some(({ date }) => date === "2026-10-31"));
    const kept = [{ ...nextPlan[0], keepExisting: true }, nextPlan[1]];
    const reviewedConflict = await (await sendReal(`${realPath}/preview`, { buffer: conflicting, choices: kept })).json();
    assert.ok(reviewedConflict.token);
    assert.equal((await sendReal(realPath, { buffer: conflicting, choices: kept, token: reviewedConflict.token, confirmed: true })).status, 200);
    const timeline = await (await request(realPath)).json();
    assert.equal(timeline.batches.length, 4);
    assert.ok(timeline.batches.every(({ actor }) => actor === String(admin)));

    async function checkReport(from, to, minutes, paid, sunday, absences) {
      const filters = { from, to, employeeId: String(existing) };
      const report = await (await request(`${root}/employees/reports?${new URLSearchParams(filters)}`, {}, "owner")).json();
      const { values } = report.rows[0];
      assert.equal(values.planned, minutes);
      assert.equal(values.paid, paid);
      assert.equal(values.referenceWorked, minutes);
      assert.equal(values.worked, undefined);
      assert.equal(values["skello:premium:sunday:50"], sunday);
      assert.equal(values.absenceCount, absences);
      assert.equal(values.mealsDue, 2);
      assert.equal(values.leaveAvailable, 2);
      const file = await request(`${root}/employees/reports/export/excel`, json(filters), "owner");
      assert.equal(file.status, 200);
      const sheets = parseXlsxSheets(Buffer.from(await file.arrayBuffer()), { storedValuesOnly: true });
      assert.equal(sheets.length, 5);
      assert.ok(sheets[0].rows.some((row) => row.includes("Heures rémunérées · Skello")));
      assert.ok(sheets[1].rows.some((row) => row.includes("Service historique (Skello)") || row.includes("Service historique (Skello) · Retard historique (Skello)")));
      const details = sheets[2].rows.filter((row) => row[9] === "Travail");
      assert.equal(details.length, 2);
      assert.equal(details.reduce((total, row) => total + row[32], 0) * 60, paid);
      assert.ok(sheets[3].rows.some((row) => row.includes("Historique Skello")));
      assert.equal(sheets[4].rows[1][9], 2);
      return report.rows[0];
    }
    await checkReport("2026-10-01", "2026-10-31", 360, 360, 120, 1);
    const nov = await checkReport("2026-11-01", "2026-11-30", 420, 435, 210, 2);
    assert.equal(nov.weeklyHours["2026-W44"].historicalWeek, 360);
  });
});
