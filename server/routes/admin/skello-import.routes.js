const express = require("express");
const multer = require("multer");
const authenticateAdmin = require("../../middleware/authenticate-admin");
const { requireAdminRole } = authenticateAdmin;
const { SkelloImportError } = require("../../services/employees/skello-workbook.service");
const {
  assertDevDatabase, listSkelloImports, previewSkelloImport, runSkelloImport, removeSkelloImport,
} = require("../../services/employees/skello-import.service");

const router = express.Router();
const path = "/admin/restaurants/:id/skello-imports";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 2, fieldSize: 4096 },
  fileFilter(_request, file, done) {
    done(/\.xlsx$/i.test(file.originalname || "") ? null : new Error("format"), true);
  },
}).single("file");

function sendError(error, res) {
  if (error instanceof SkelloImportError) return res.status(error.status).json({ message: error.message });
  // The uploaded file and Mongo errors can contain source or connection data.
  return res.status(500).json({ message: "L’opération Skello n’a pas pu être terminée." });
}

function protect(req, res, next) {
  res.set("Cache-Control", "private, no-store");
  try {
    assertDevDatabase();
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
        confirmed: req.body?.confirmed,
      });
      return res.json(result);
    } catch (error) {
      return sendError(error, res);
    }
  };
}

const access = [authenticateAdmin, requireAdminRole, protect];
router.get(path, ...access, handler(({ restaurantId }) => listSkelloImports(restaurantId)));
router.post(`${path}/preview`, ...access, uploadWorkbook, handler(previewSkelloImport));
router.post(path, ...access, uploadWorkbook, handler(runSkelloImport));
router.delete(`${path}/:batchId`, ...access, handler(removeSkelloImport));

module.exports = router;
