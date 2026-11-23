const express = require("express");
const authenticateAdmin = require("../../middleware/authenticate-admin");
const authenticateToken = require("../../middleware/authentificate-token");
const { HrConfigurationError } = require("../../services/employees/hr-configuration-format.service");
const { listImports, exportConfiguration, exportBackup, previewImport, reviewRule, applyImport, restoreImport } = require("../../services/employees/hr-configuration-import.service");
const { draftOverview, saveDraft, previewDraft, applyDraft } = require("../../services/employees/hr-configuration-draft.service");

const router = express.Router();
const path = "/admin/restaurants/:id/hr-configuration";
const access = [authenticateAdmin, authenticateAdmin.requireAdminRole];

function handle(action) {
  return async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    try {
      return res.json(await action({
        restaurantId: req.params.id, batchId: req.params.batchId, actor: String(req.user.id),
        ownerId: req.hrOwner,
        configuration: req.body?.configuration, effect: req.body?.effect, effects: req.body?.effects, token: req.body?.token, confirmed: req.body?.confirmed,
        review: req.body?.review, draft: req.body?.draft, revision: req.body?.revision,
      }));
    } catch (error) {
      if (error instanceof HrConfigurationError) return res.status(error.status).json({ message: error.message });
      return res.status(500).json({ message: "La configuration RH n’a pas pu être traitée." });
    }
  };
}

router.get(path, ...access, handle(({ restaurantId }) => listImports(restaurantId)));
router.get(`${path}/export`, ...access, handle(({ restaurantId }) => exportConfiguration(restaurantId)));
router.get(`${path}/:batchId/backup`, ...access, handle(exportBackup));
router.post(`${path}/preview`, ...access, handle(previewImport));
router.post(`${path}/review`, ...access, handle(reviewRule));
router.post(`${path}/apply`, ...access, handle(applyImport));
router.post(`${path}/:batchId/restore`, ...access, handle(restoreImport));

function requireOwner(req, res, next) {
  if (req.user?.role !== "owner" || req.params.id !== String(req.user.restaurantId || "")) {
    return res.status(403).json({ message: "Sélectionnez votre restaurant. Cette configuration est réservée à son propriétaire." });
  }
  req.hrOwner = String(req.user.id);
  return next();
}

const ownerPath = "/restaurants/:id/hr-configuration";
const ownerAccess = [authenticateToken, requireOwner];
router.get(`${ownerPath}/history`, ...ownerAccess, handle(({ restaurantId, ownerId }) => listImports(restaurantId, ownerId)));
router.post(`${ownerPath}/:batchId/restore`, ...ownerAccess, handle(restoreImport));
for (const [base, permissions] of [[path, access], [ownerPath, ownerAccess]]) {
  router.get(`${base}/draft`, ...permissions, handle(draftOverview));
  router.put(`${base}/draft`, ...permissions, handle(saveDraft));
  router.post(`${base}/draft/preview`, ...permissions, handle(previewDraft));
  router.post(`${base}/draft/apply`, ...permissions, handle(applyDraft));
}

module.exports = router;
