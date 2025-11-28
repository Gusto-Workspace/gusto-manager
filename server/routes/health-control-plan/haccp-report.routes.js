// server/routes/logs/haccp-report.routes.js
const express = require("express");
const router = express.Router();

const authenticateToken = require("../../middleware/authentificate-token");

// MODELS LOGS
const FridgeTemperature = require("../../models/logs/fridge-temperature.model");
const GenericTemperature = require("../../models/logs/generic-temperature.model");
const PreheatTemperature = require("../../models/logs/preheat-temperature.model");
const PostheatTemperature = require("../../models/logs/postheat-temperature.model");
const ServiceTemperature = require("../../models/logs/service-temperature.model");

const ReceptionDelivery = require("../../models/logs/reception-delivery.model");
const InventoryLot = require("../../models/logs/inventory-lot.model");
const RecipeBatch = require("../../models/logs/recipe-batch.model");
const OilChange = require("../../models/logs/oil-change.model");

const CleaningTask = require("../../models/logs/cleaning-task.model");
const PestControl = require("../../models/logs/pest-control.model");
const Microbiology = require("../../models/logs/microbiology.model");
const NonConformity = require("../../models/logs/non-conformity.model");
const SupplierCertificate = require("../../models/logs/supplier-certificate.model");
const Recall = require("../../models/logs/recall.model");
const Calibration = require("../../models/logs/calibration.model");
const TrainingSession = require("../../models/logs/training-session.model");
const Maintenance = require("../../models/logs/maintenance.model");
const WasteEntry = require("../../models/logs/waste-entry.model");
const HealthMeasure = require("../../models/logs/health-measure.model");
const AllergenIncident = require("../../models/logs/allergen-incident.model");

// 👉 modèle Employee pour récupérer les noms/prénoms
const Employee = require("../../models/employee.model");

const { buildHaccpReportPdf } = require("../../services/haccp-report-pdf.service");

/* ---------- helpers ---------- */

function normalizeDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function ensureDateRange(from, to) {
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 jours

  const start = normalizeDate(from) || defaultFrom;
  const end = normalizeDate(to) || now;

  if (start > end) return null;
  return { start, end };
}

/* ---------- route principale ---------- */

router.post(
  "/restaurants/:restaurantId/haccp-report",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const { from, to, restaurantName } = req.body || {};

      const range = ensureDateRange(from, to);
      if (!range) {
        return res
          .status(400)
          .json({ error: "Plage de dates invalide (from/to)" });
      }
      const { start, end } = range;

      const baseFilter = { restaurantId };

      const queries = [
        // Températures
        FridgeTemperature.find({
          ...baseFilter,
          createdAt: { $gte: start, $lte: end },
        }).lean(),
        GenericTemperature.find({
          ...baseFilter,
          createdAt: { $gte: start, $lte: end },
        }).lean(),
        PreheatTemperature.find({
          ...baseFilter,
          createdAt: { $gte: start, $lte: end },
        }).lean(),
        PostheatTemperature.find({
          ...baseFilter,
          createdAt: { $gte: start, $lte: end },
        }).lean(),
        ServiceTemperature.find({
          ...baseFilter,
          createdAt: { $gte: start, $lte: end },
        }).lean(),

        // Réceptions / traçabilité
        ReceptionDelivery.find({
          ...baseFilter,
          receivedAt: { $gte: start, $lte: end },
        }).lean(),
        InventoryLot.find({
          ...baseFilter,
          $or: [
            { dlc: { $gte: start, $lte: end } },
            { ddm: { $gte: start, $lte: end } },
            { openedAt: { $gte: start, $lte: end } },
            { internalUseBy: { $gte: start, $lte: end } },
          ],
        }).lean(),
        RecipeBatch.find({
          ...baseFilter,
          preparedAt: { $gte: start, $lte: end },
        }).lean(),

        // Huile de friture
        OilChange.find({
          ...baseFilter,
          performedAt: { $gte: start, $lte: end },
        }).lean(),

        // Nettoyage & maintenance
        CleaningTask.find({
          ...baseFilter,
          "history.doneAt": { $gte: start, $lte: end },
        }).lean(),
        PestControl.find({
          ...baseFilter,
          lastVisitAt: { $gte: start, $lte: end },
        }).lean(),
        Microbiology.find({
          ...baseFilter,
          sampledAt: { $gte: start, $lte: end },
        }).lean(),
        NonConformity.find({
          ...baseFilter,
          reportedAt: { $gte: start, $lte: end },
        }).lean(),
        SupplierCertificate.find({
          ...baseFilter,
          uploadedAt: { $gte: start, $lte: end },
        }).lean(),
        Recall.find({
          ...baseFilter,
          initiatedAt: { $gte: start, $lte: end },
        }).lean(),
        Calibration.find({
          ...baseFilter,
          calibratedAt: { $gte: start, $lte: end },
        }).lean(),
        TrainingSession.find({
          ...baseFilter,
          date: { $gte: start, $lte: end },
        }).lean(),
        Maintenance.find({
          ...baseFilter,
          "history.doneAt": { $gte: start, $lte: end },
        }).lean(),
        WasteEntry.find({
          ...baseFilter,
          date: { $gte: start, $lte: end },
        }).lean(),
        HealthMeasure.find({
          ...baseFilter,
          performedAt: { $gte: start, $lte: end },
        }).lean(),
        AllergenIncident.find({
          ...baseFilter,
          detectedAt: { $gte: start, $lte: end },
        }).lean(),
      ];

      const [
        fridgeTemps,
        genericTemps,
        preheatTemps,
        postheatTemps,
        serviceTemps,
        receptions,
        inventoryLots,
        recipeBatches,
        oilChanges,
        cleaningTasks,
        pestControls,
        microbiology,
        nonConformities,
        supplierCerts,
        recalls,
        calibrations,
        trainingSessions,
        maintenanceOps,
        wasteEntries,
        healthMeasures,
        allergenIncidents,
      ] = await Promise.all(queries);

      /* ---------- Récupération des employés pour les formations ---------- */

      let employeesById = {};
      const allEmployeeIds = new Set();

      trainingSessions.forEach((session) => {
        (session.attendees || []).forEach((att) => {
          if (att.employeeId) {
            allEmployeeIds.add(String(att.employeeId));
          }
        });
      });

      if (allEmployeeIds.size > 0) {
        const employees = await Employee.find({
          _id: { $in: Array.from(allEmployeeIds) },
        })
          .select("firstname lastname")
          .lean();

        employeesById = employees.reduce((acc, emp) => {
          acc[String(emp._id)] = {
            firstname: emp.firstname,
            lastname: emp.lastname,
          };
          return acc;
        }, {});
      }

      // On ajoute un snapshot nom/prénom directement sur chaque attendee
      trainingSessions.forEach((session) => {
        (session.attendees || []).forEach((att) => {
          if (!att.employeeId) return;
          const snap = employeesById[String(att.employeeId)];
          if (snap) {
            att.employeeSnapshot = {
              firstname: snap.firstname,
              lastname: snap.lastname,
            };
          }
        });
      });

      const payload = {
        restaurantId,
        restaurantName: restaurantName || null,
        period: { from: start, to: end },
        data: {
          temperatures: {
            fridges: fridgeTemps,
            generic: genericTemps,
            preheat: preheatTemps,
            postheat: postheatTemps,
            service: serviceTemps,
          },
          receptions,
          inventoryLots,
          recipeBatches,
          oilChanges,
          cleaningTasks,
          pestControls,
          microbiology,
          nonConformities,
          supplierCerts,
          recalls,
          calibrations,
          trainingSessions,
          maintenanceOps,
          wasteEntries,
          healthMeasures,
          allergenIncidents,
        },
      };

      const pdfBuffer = await buildHaccpReportPdf(payload);

      const fromIso = start.toISOString().slice(0, 10);
      const toIso = end.toISOString().slice(0, 10);
      const safeName = (restaurantName || `restaurant-${restaurantId}`)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="haccp-${safeName}-${fromIso}-to-${toIso}.pdf"`,
      });

      return res.send(pdfBuffer);
    } catch (err) {
      console.error(
        "POST /restaurants/:restaurantId/haccp-report - error:",
        err
      );
      return res.status(500).json({
        error: "Erreur lors de la génération du rapport HACCP",
      });
    }
  }
);

module.exports = router;
