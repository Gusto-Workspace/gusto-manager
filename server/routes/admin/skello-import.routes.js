const express = require("express");
const multer = require("multer");
const { isObjectIdOrHexString } = require("mongoose");
const Admin = require("../../models/admin.model");
const authenticateAdmin = require("../../middleware/authenticate-admin");
const { requireAdminRole } = authenticateAdmin;
const { SkelloImportError } = require("../../services/employees/skello-workbook.service");
const {
  assertDevDatabase, listSkelloImports, previewSkelloImport, runSkelloImport, removeSkelloImport,
} = require("../../services/employees/skello-import.service");
const {
  listSkelloEmployees, previewSkelloEmployees, applySkelloEmployees,
} = require("../../services/employees/skello-employee-import.service");

const router = express.Router();
const path = "/admin/restaurants/:id/skello-imports";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 4, fieldSize: 32768 },
  fileFilter(_request, file, done) {
    done(/\.xlsx$/i.test(file.originalname || "") ? null : new Error("format"), true);
  },
}).single("file");

function sendError(error, res) {
  if (error instanceof SkelloImportError) return res.status(error.status).json({ message: error.message });
  // The uploaded file and Mongo errors can contain source or connection data.
  return res.status(500).json({ message: "L’opération Skello n’a pas pu être terminée." });
}

function privateResponse(_req, res, next) {
  res.set("Cache-Control", "private, no-store");
  next();
}

function protectFixture(_req, res, next) {
  try {
    assertDevDatabase();
    return next();
  } catch (error) {
    return sendError(error, res);
  }
}

async function requireCurrentAdmin(req, res, next) {
  try {
    if (!isObjectIdOrHexString(req.user.id) || !await Admin.exists({ _id: req.user.id, role: "admin" })) {
      return res.status(403).json({ message: "Un compte d’administrateur actif est requis." });
    }
    return next();
  } catch (error) {
    return sendError(error, res);
  }
}

function uploadWorkbook(req, res, next) {
  upload(req, res, (error) => {
    if (!error) return next();
    return res.status(400).json({ message: "Choisissez un seul fichier XLSX de 5 Mo maximum." });
  });
}

function handler(action) {
  return async (req, res) => {
    try {
      const result = await action({
        restaurantId: req.params.id,
        actor: String(req.user.id),
        buffer: req.file?.buffer,
        scope: req.body?.scope || "weeks",
        token: req.body?.token,
        batchId: req.params.batchId,
        choices: req.body?.choices,
        confirmed: req.body?.confirmed,
      });
      return res.json(result);
    } catch (error) {
      return sendError(error, res);
    }
  };
}

const access = [privateResponse, authenticateAdmin, requireAdminRole];
const workforceAccess = [...access, requireCurrentAdmin];
router.get(path, ...workforceAccess, handler(({ restaurantId }) => listSkelloEmployees(restaurantId)));
router.post(`${path}/preview`, ...workforceAccess, uploadWorkbook, handler(previewSkelloEmployees));
router.post(path, ...workforceAccess, uploadWorkbook, handler(applySkelloEmployees));

// The legacy tool generates fictitious payroll fixtures and retains its database safeguards.
const fixturePath = `${path}/recette`;
const fixtureAccess = [...access, protectFixture];
router.get(fixturePath, ...fixtureAccess, handler(({ restaurantId }) => listSkelloImports(restaurantId)));
router.post(`${fixturePath}/preview`, ...fixtureAccess, uploadWorkbook, handler(previewSkelloImport));
router.post(fixturePath, ...fixtureAccess, uploadWorkbook, handler(runSkelloImport));
router.delete(`${fixturePath}/:batchId`, ...fixtureAccess, handler(removeSkelloImport));

module.exports = router;
