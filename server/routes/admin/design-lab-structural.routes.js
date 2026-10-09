const express = require("express");
const mongoose = require("mongoose");
const authenticateAdmin = require("../../middleware/authenticate-admin");
const { requireAdminRole } = require("../../middleware/authenticate-admin");
const StructuralReference = require("../../models/structural-reference.model");
const { randomUUID }=require('node:crypto');
const {failureDiagnostic,safeText}=require('../../services/design-lab/structural-operation-diagnostic');
const {
  createStructuralService,
  sourceFields,
} = require("../../services/design-lab/structural-reference.service");
const {
  portfolioCaptureEnabled,
  requirePortfolioCaptureEnabled,
} = require("../../services/design-lab/portfolio-capture.service");

function createRouter({
  Model = StructuralReference,
  service = createStructuralService(),
  fields = sourceFields,
  captureGate = requirePortfolioCaptureEnabled,
  auth = authenticateAdmin,
  role = requireAdminRole,
  logger = console,
} = {}) {
  const router = express.Router();
  const root = "/admin/design-lab/structural-references";
  router.use(root, auth, role);
  const safe = (reference) => {
    const result = reference.toObject ? reference.toObject() : { ...reference };
    delete result.operationToken;
    return result;
  };
  const route = (handler) => async (req, res) => {
    const startedAt=Date.now();
    if (req.params.id && !mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ message: "ID invalide." });
    try {
      await handler(req, res);
    } catch (error) {
      const diagnostic=error.operationDiagnostic || failureDiagnostic(error,{referenceId:req.params.id,
        generationId:randomUUID(),phase:'api_'+String(req.method||'request').toLowerCase(),startedAt});
      if(!error.operationDiagnostic)logger.warn?.('structural:route_failed',JSON.stringify(diagnostic));
      res
        .status(error.status || 500)
        .json({
          code:diagnostic.code,
          referenceId:diagnostic.referenceId,
          generationId:diagnostic.generationId,
          phase:diagnostic.phase,
          message: error.status
            ? safeText(error.message,500)
            : "Erreur des références structurelles.",
        });
    }
  };
  router.get(
    root,
    route(async (_req, res) => {
      await service.reconcileExpiredOperations?.();
      res.json({
        references: (await Model.find().sort({ updatedAt: -1 }).lean()).map(
          safe,
        ),
        captureEnabled: portfolioCaptureEnabled(),
      });
    }),
  );
  router.get(
    `${root}/:id`,
    route(async (req, res) => {
      await service.reconcileExpiredOperations?.({ referenceId: req.params.id });
      const reference = await Model.findById(req.params.id).lean();
      if (!reference)
        return res.status(404).json({ message: "Référence introuvable." });
      res.json({
        reference: safe(reference),
        captureEnabled: portfolioCaptureEnabled(),
      });
    }),
  );
  router.post(
    root,
    route(async (req, res) => {
      captureGate();
      const reference = await Model.create(await fields(req.body || {}));
      res
        .status(201)
        .json({ reference: safe(await service.run(reference._id)) });
    }),
  );
  router.patch(
    `${root}/:id`,
    route(async (req, res) =>
      res.json({
        reference: safe(await service.patch(req.params.id, req.body || {})),
      }),
    ),
  );
  router.post(
    `${root}/:id/analyze`,
    route(async (req, res) => {
      // Reject obsolete non-paying requests from cached tabs; never activate
      // a mode or silently turn such a request into a paid product run.
      if(req.body?.requirePlatformValidation===true)
        return res.status(409).json({message:"Mode non payant désactivé sur le serveur. Actualisez la page ; aucune analyse n'a été lancée."});
      res.json({ reference: safe(await service.run(req.params.id,{confirmUncertainVision:req.body?.confirmUncertainVision===true})) });
    }),
  );
  router.get(`${root}/:id/analysis-attempts`, route(async (req, res) =>
    res.json({ attempts: await service.listAttempts(req.params.id) }),
  ));
  router.get(`${root}/:id/analysis-attempts/:attemptId`, route(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.attemptId)) return res.status(400).json({ message: "ID de tentative invalide." });
    res.json({ attempt: await service.getAttempt(req.params.id, req.params.attemptId) });
  }));
  router.post(`${root}/:id/analysis-attempts/:attemptId/resume`, route(async (req,res)=>{
    if(!mongoose.isValidObjectId(req.params.attemptId))return res.status(400).json({message:'ID de tentative invalide.'});
    // Retrieve a previously authorized provider response. This action cannot
    // create a response or grant permission for a new paid analysis.
    res.json({reference:safe(await service.resume(req.params.id,req.params.attemptId))});
  }));
  // Explicit local revalidation of a durable response; never calls Vision.
  router.post(`${root}/:id/analysis-attempts/:attemptId/reprocess`, route(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.attemptId)) return res.status(400).json({ message: "ID de tentative invalide." });
    res.json({ reference: await service.reprocess(req.params.id, req.params.attemptId) });
  }));
  router.delete(
    `${root}/:id`,
    route(async (req, res) => {
      await service.remove(req.params.id);
      res.json({ deleted: true });
    }),
  );
  return router;
}
module.exports = createRouter();
module.exports.createRouter = createRouter;
