const { createHash, createHmac } = require("node:crypto");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Employee = require("../../models/employee.model");
const Restaurant = require("../../models/restaurant.model");
const PersonnelInput = require("../../models/personnel-report-input.model");
const SkelloImport = require("../../models/skello-import.model");
const TimeClockSession = require("../../models/time-clock-session.model");
const TimeClockAbsence = require("../../models/time-clock-absence.model");
const { TimeClockPin } = require("../../models/time-clock-device.model");
const { analyzeSkelloWorkbook, SkelloImportError } = require("./skello-workbook.service");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const confirmationSecret = () => createHmac("sha256", process.env.JWT_SECRET).update("skello-import/v1").digest();
const serializeBatch = (batch) => batch && ({
  id: String(batch._id),
  source: batch.source,
  status: batch.status,
  period: { from: batch.from, to: batch.to },
  scope: batch.scope,
  summary: batch.summary,
  createdAt: batch.createdAt,
  removedAt: batch.removedAt,
});

function configuredDatabase(uri) {
  try {
    return decodeURIComponent(new URL(uri).pathname.slice(1));
  } catch {
    return null;
  }
}

function assertDevDatabase() {
  const { NODE_ENV, CONNECTION_STRING_TEST, CONNECTION_STRING } = process.env;
  const db = mongoose.connection.name;
  if (mongoose.connection.readyState !== 1 || NODE_ENV !== "development" ||
      !db || !/(^|[-_])(test|dev|development|recette)([-_]|$)/i.test(db) ||
      db !== configuredDatabase(CONNECTION_STRING_TEST) || db === configuredDatabase(CONNECTION_STRING)) {
    throw new SkelloImportError("L’import Skello est réservé à la base MongoDB de développement vérifiée.", 403);
  }
  return db;
}

async function getTarget(restaurantId, session) {
  const development = assertDevDatabase();
  if (!mongoose.isObjectIdOrHexString(restaurantId)) throw new SkelloImportError("Restaurant invalide.", 400);
  const restaurant = await Restaurant.findById(restaurantId).select("name options.employees").session(session || null).lean();
  if (!restaurant) throw new SkelloImportError("Restaurant introuvable.", 404);
  if (restaurant.options?.employees !== true) throw new SkelloImportError("La gestion du personnel doit être active pour ce restaurant.", 409);
  return { id: restaurantId, name: restaurant.name, database: development };
}

function selectOverlap(restaurant, period, fingerprint) {
  return { restaurant, status: "complete", from: { $lte: period.to }, to: { $gte: period.from },
    fingerprint: { $ne: fingerprint } };
}

function readFile(buffer, scope) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new SkelloImportError("Choisissez un fichier XLSX Skello.", 400);
  return { ...analyzeSkelloWorkbook(buffer, scope), fingerprint: sha256(buffer) };
}

function confirmedClaims(target, actor, fingerprint, scope) {
  return { target: target.id, database: target.database, actor, fingerprint, scope };
}

async function previewSkelloImport({ restaurantId, actor, buffer, scope }) {
  const target = await getTarget(restaurantId);
  const { preview, fingerprint } = readFile(buffer, scope);
  const [previous, conflict] = await Promise.all([
    SkelloImport.findOne({ restaurant: restaurantId, fingerprint }).lean(),
    SkelloImport.findOne(selectOverlap(restaurantId, preview.period, fingerprint)).lean(),
  ]);
  const alreadyImported = previous?.status === "complete";
  const token = alreadyImported || conflict ? null : jwt.sign(
    confirmedClaims(target, actor, fingerprint, scope), confirmationSecret(),
    { expiresIn: "30m", audience: "gusto-skello-import", algorithm: "HS256" },
  );
  return { ...preview, target, token, alreadyImported, previous: serializeBatch(previous), conflict: serializeBatch(conflict) };
}

function assertConfirmation({ token, target, actor, fingerprint, scope }) {
  let claims;
  try {
    claims = jwt.verify(token, confirmationSecret(), { audience: "gusto-skello-import", algorithms: ["HS256"] });
  } catch {
    throw new SkelloImportError("L’aperçu a expiré. Analysez de nouveau le fichier avant de confirmer.", 409);
  }
  if (Object.entries(confirmedClaims(target, actor, fingerprint, scope)).some(([name, value]) => claims[name] !== value)) {
    throw new SkelloImportError("Le fichier, le restaurant ou la période a changé. Relancez l’aperçu.", 409);
  }
}

function employeeFingerprint(employee) {
  return sha256(JSON.stringify(employee));
}

function inputFingerprint(input) {
  return sha256(JSON.stringify(input));
}

function importedIdentity(batch, order) {
  const suffix = String(order).padStart(2, "0");
  return { firstname: "Salarié fictif", lastname: `Skello ${batch.toString().slice(-6)}-${suffix}`,
    email: `skello-${batch}-${suffix}@example.invalid` };
}

function buildEmployee(person, batch, restaurant) {
  const snapshot = { ...importedIdentity(batch, person.order), phone: "Non renseigné", post: person.post,
    ...(person.start && { dateOnPost: person.start }) };
  return new Employee({
    ...snapshot,
    historicalImport: batch,
    restaurants: [restaurant],
    restaurantProfiles: [{
      restaurant, snapshot, shifts: person.shifts,
      employment: { contractType: person.type, contractualValue: person.volume, contractualUnit: "week" },
    }],
  });
}

function buildInputs(entries, employee, profile, restaurant, batch, actor) {
  return entries.map(({ kind, date, values }) => {
    let storedValues = values;
    if (kind === "historicalLate") {
      const events = values.events.map(({ start, end, minutes }) => {
        const matches = (profile.shifts || []).filter((shift) => !shift.isLeave && +shift.start === +start && +shift.end === +end);
        if (matches.length !== 1) throw new SkelloImportError("Un retard ne correspond plus à un service unique du lot.", 409);
        return { shiftId: String(matches[0]._id), start, end, minutes };
      });
      storedValues = { source: "skello", batch: String(batch), events };
    }
    return { _id: `${restaurant}:${profile._id}:${kind}:${date}`, restaurant, employee: employee._id,
      profile: profile._id, kind, date, values: storedValues, revision: 1, updatedBy: actor };
  });
}

async function readManifest(restaurant, batch, session) {
  const employees = await Employee.find({ historicalImport: batch, restaurants: restaurant })
    .select("+password +sessionVersion +historicalImport +restaurantProfiles.planningFiles").sort("_id").session(session).lean();
  const ids = employees.map(({ _id }) => _id);
  const inputs = await PersonnelInput.find({ employee: { $in: ids } }).sort("_id").session(session).lean();
  const otherRecords = await TimeClockSession.exists({ employee: { $in: ids } }).session(session) ||
    await TimeClockAbsence.exists({ employee: { $in: ids } }).session(session) ||
    await TimeClockPin.exists({ employee: { $in: ids } }).session(session);
  return {
    employees: employees.map((employee) => ({ id: String(employee._id), fingerprint: employeeFingerprint(employee) })),
    inputs: inputs.map((input) => ({ id: input._id, fingerprint: inputFingerprint(input) })),
    otherRecords: Boolean(otherRecords),
  };
}

async function listSkelloImports(restaurantId) {
  const target = await getTarget(restaurantId);
  const batches = await SkelloImport.find({ restaurant: restaurantId }).sort({ createdAt: -1 }).limit(30).lean();
  return { target, batches: batches.map(serializeBatch) };
}

let ready;
function prepareTransactions() {
  // MongoDB must create these collections before the transaction can write to them.
  if (!ready) {
    ready = Promise.all([SkelloImport.init(), PersonnelInput.init()]).catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

async function runSkelloImport({ restaurantId, actor, buffer, scope, token }) {
  const target = await getTarget(restaurantId);
  const { people, preview, fingerprint } = readFile(buffer, scope);
  const existing = await SkelloImport.findOne({ restaurant: restaurantId, fingerprint }).lean();
  if (existing?.status === "complete") return { alreadyImported: true, batch: serializeBatch(existing) };
  assertConfirmation({ token, target, actor, fingerprint, scope });
  await prepareTransactions();
  const candidate = new mongoose.Types.ObjectId();
  const { period } = preview;
  try {
    return await mongoose.connection.transaction(async (session) => {
      const previous = await SkelloImport.findOne({ restaurant: restaurantId, fingerprint }).session(session).lean();
      if (previous?.status === "complete") return { alreadyImported: true, batch: serializeBatch(previous) };
      const conflict = await SkelloImport.exists(selectOverlap(restaurantId, period, fingerprint)).session(session);
      if (conflict) throw new SkelloImportError("Un autre lot couvre déjà une partie de cette période.", 409);
      const batchId = previous?._id || candidate;
      const employees = people.map((person) => buildEmployee(person, batchId, restaurantId));
      const inputs = people.flatMap(({ inputs }, index) =>
        buildInputs(inputs, employees[index], employees[index].restaurantProfiles[0], restaurantId, batchId, actor));
      const updated = await Restaurant.updateOne({ _id: restaurantId, "options.employees": true }, {
        $addToSet: { employees: { $each: employees.map(({ _id }) => _id) } },
      }, { session });
      if (!updated.modifiedCount) throw new SkelloImportError("Le restaurant a changé depuis l’aperçu.", 409);
      await Employee.insertMany(employees, { session });
      if (inputs.length) await PersonnelInput.insertMany(inputs, { session });
      const manifest = await readManifest(restaurantId, batchId, session);
      const batch = await SkelloImport.findOneAndUpdate({ restaurant: restaurantId, fingerprint }, {
        $setOnInsert: { _id: batchId, restaurant: restaurantId, fingerprint },
        $set: { from: period.from, to: period.to, scope, status: "complete", actor, summary: preview, manifest },
        $unset: { removedBy: "", removedAt: "" },
      }, { upsert: true, new: true, session });
      return { alreadyImported: false, batch: serializeBatch(batch) };
    });
  } catch (error) {
    if (error instanceof SkelloImportError) throw error;
    const previous = await SkelloImport.findOne({ restaurant: restaurantId, fingerprint }).lean().catch(() => null);
    if (previous?.status === "complete") return { alreadyImported: true, batch: serializeBatch(previous) };
    await SkelloImport.updateOne({ restaurant: restaurantId, fingerprint }, {
      $setOnInsert: { restaurant: restaurantId, fingerprint, from: period.from, to: period.to, scope,
        actor, status: "failed", summary: { ...preview, executionError: "Transaction interrompue. Relancez un aperçu pour réessayer." } },
    }, { upsert: true }).catch(() => {});
    throw new SkelloImportError("Import interrompu. La transaction n’a créé aucune donnée RH. Relancez un aperçu pour réessayer.", 503);
  }
}

async function restoreSkelloHistoricalLateness({ restaurantId, batchId, actor, buffer }) {
  await getTarget(restaurantId);
  if (!mongoose.isObjectIdOrHexString(batchId) || !Buffer.isBuffer(buffer) || !buffer.length || !actor) {
    throw new SkelloImportError("Le lot, le classeur d’origine et l’opérateur sont requis.", 400);
  }
  const filter = { _id: batchId, restaurant: restaurantId, fingerprint: sha256(buffer), source: "skello", status: "complete" };
  const original = await SkelloImport.findOne(filter).select("scope").lean();
  if (!original) throw new SkelloImportError("Le classeur ne correspond pas au lot de cet établissement.", 409);
  const { people, preview } = analyzeSkelloWorkbook(buffer, original.scope);
  await prepareTransactions();
  return mongoose.connection.transaction(async (session) => {
    const batch = await SkelloImport.findOne(filter).select("+manifest").session(session);
    if (!batch?.manifest || batch.scope !== original.scope || batch.from !== preview.period.from || batch.to !== preview.period.to) {
      throw new SkelloImportError("Le lot a changé depuis la vérification du classeur.", 409);
    }
    const members = new Set(batch.manifest.employees.map(({ id }) => id));
    const employees = await Employee.find({ historicalImport: batchId, restaurants: restaurantId }).session(session).lean();
    const byEmail = new Map(employees.map((employee) => [employee.email, employee]));
    const inputs = people.flatMap(({ order, inputs }) => {
      const entries = inputs.filter(({ kind }) => kind === "historicalLate");
      if (!entries.length) return [];
      const employee = byEmail.get(importedIdentity(batch._id, order).email);
      const profile = employee?.restaurantProfiles?.find(({ restaurant }) => String(restaurant) === String(restaurantId));
      if (!profile || !members.has(String(employee._id))) throw new SkelloImportError("Un salarié du lot n’est plus rattaché.", 409);
      return buildInputs(entries, employee, profile, restaurantId, batch._id, actor);
    });
    const existing = new Map((await PersonnelInput.find({ _id: { $in: inputs.map(({ _id }) => _id) } })
      .session(session).lean()).map((input) => [input._id, input]));
    const added = inputs.filter((input) => {
      const current = existing.get(input._id);
      if (!current) return true;
      if (current.kind !== input.kind || String(current.restaurant) !== String(input.restaurant) ||
          String(current.profile) !== String(input.profile) || String(current.employee) !== String(input.employee) ||
          current.date !== input.date || inputFingerprint(current.values) !== inputFingerprint(input.values)) {
        throw new SkelloImportError("Un retard historique existe avec des données différentes.", 409);
      }
      return false;
    });
    if (added.length) {
      await PersonnelInput.insertMany(added, { session });
      const inserted = await PersonnelInput.find({ _id: { $in: added.map(({ _id }) => _id) } }).session(session).lean();
      const manifestInputs = new Map(batch.manifest.inputs.map((input) => [input.id, input]));
      for (const input of inserted) manifestInputs.set(input._id, { id: input._id, fingerprint: inputFingerprint(input) });
      const sorted = [...manifestInputs.values()].sort((first, second) => first.id < second.id ? -1 : first.id > second.id ? 1 : 0);
      batch.manifest = { ...batch.manifest, inputs: sorted };
      batch.summary = { ...batch.summary, counts: { ...batch.summary.counts, historicalLate: preview.counts.historicalLate } };
      await batch.save({ session });
    }
    return { added: added.reduce((total, input) => total + input.values.events.length, 0), count: preview.counts.historicalLate };
  });
}

async function removeSkelloImport({ restaurantId, actor, batchId, confirmed }) {
  await getTarget(restaurantId);
  if (!mongoose.isObjectIdOrHexString(batchId) || confirmed !== true) {
    throw new SkelloImportError("Confirmez le retrait du lot choisi.", 400);
  }
  return mongoose.connection.transaction(async (session) => {
    const batch = await SkelloImport.findOne({ _id: batchId, restaurant: restaurantId }).select("+manifest").session(session);
    if (!batch) throw new SkelloImportError("Lot introuvable.", 404);
    if (batch.status === "removed") return serializeBatch(batch);
    if (batch.status !== "complete") throw new SkelloImportError("Le lot ne contient aucune donnée à retirer.", 409);
    const current = await readManifest(restaurantId, batchId, session);
    if (JSON.stringify(current) !== JSON.stringify(batch.manifest)) {
      throw new SkelloImportError("Le lot a été modifié ou contient des données ajoutées depuis l’import. Le retrait est bloqué.", 409);
    }
    const ids = current.employees.map(({ id }) => id);
    if (await Restaurant.exists({ _id: { $ne: restaurantId }, employees: { $in: ids } }).session(session)) {
      throw new SkelloImportError("Un profil du lot a été rattaché à un autre restaurant. Le retrait est bloqué.", 409);
    }
    await Employee.deleteMany({ _id: { $in: ids }, historicalImport: batchId, restaurants: restaurantId }, { session });
    await PersonnelInput.deleteMany({ _id: { $in: current.inputs.map(({ id }) => id) }, restaurant: restaurantId }, { session });
    await Restaurant.updateOne({ _id: restaurantId }, { $pull: { employees: { $in: ids } } }, { session });
    batch.status = "removed";
    batch.removedAt = new Date();
    batch.removedBy = actor;
    batch.manifest = undefined;
    await batch.save({ session });
    return serializeBatch(batch);
  });
}

module.exports = { listSkelloImports, previewSkelloImport, runSkelloImport, restoreSkelloHistoricalLateness, removeSkelloImport, assertDevDatabase };
