const ReservationModel = require("../models/reservation.model");
const CustomerModel = require("../models/customer.model");
const {
  getPerfRequestContext,
  getPerfRequestId,
  isPerfDiagnosticsEnabled,
  perfLog,
  perfNowMs,
  setPerfRequestMetrics,
  shouldLogPerfDetail,
} = require("./perf-diagnostics.service");

const RESTAURANT_RESERVATIONS_SORT = {
  reservationDate: 1,
  reservationTime: 1,
  createdAt: 1,
};

const MANAGER_RESERVATION_LIST_SELECT = [
  "_id",
  "customer",
  "customerFirstName",
  "customerLastName",
  "customerEmail",
  "customerPhone",
  "numberOfGuests",
  "reservationDate",
  "reservationTime",
  "commentary",
  "table",
  "status",
  "pendingExpiresAt",
  "bankHold.enabled",
  "bankHold.status",
  "bankHold.amountTotal",
  "bankHold.currency",
  "bankHold.expiresAt",
  "bankHold.authorizedAt",
  "bankHold.capturedAt",
  "bankHold.releasedAt",
  "bankHold.lastError",
  "waitlistOffer.state",
  "waitlistOffer.offerExpiresAt",
].join(" ");

const CUSTOMER_SUMMARY_SELECT = {
  list: "_id tags",
  detail: "_id tags stats notes lastReservationAt lastReservations createdAt",
};

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseReservationDateKey(value) {
  const match = DATE_KEY_PATTERN.exec(String(value || "").trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function buildReservationDateRange({ from, to } = {}, { maxDays = 62 } = {}) {
  const fromDate = parseReservationDateKey(from);
  const toDate = parseReservationDateKey(to);

  if (!fromDate || !toDate) {
    const error = new Error(
      "Les paramètres from et to sont requis au format yyyy-MM-dd.",
    );
    error.status = 400;
    error.code = "INVALID_RESERVATION_DATE_RANGE";
    throw error;
  }

  const rangeDays =
    Math.floor((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;
  if (rangeDays < 1) {
    const error = new Error("La date from doit précéder ou égaler la date to.");
    error.status = 400;
    error.code = "INVALID_RESERVATION_DATE_RANGE";
    throw error;
  }

  if (rangeDays > maxDays) {
    const error = new Error(
      `La plage de réservations ne peut pas dépasser ${maxDays} jours.`,
    );
    error.status = 400;
    error.code = "RESERVATION_DATE_RANGE_TOO_LARGE";
    throw error;
  }

  const toExclusive = new Date(toDate);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);

  return {
    from: String(from).trim(),
    to: String(to).trim(),
    fromDate,
    toExclusive,
    rangeDays,
  };
}

function buildReservationCustomerName(reservation) {
  const firstName = String(reservation?.customerFirstName || "").trim();
  const lastName = String(reservation?.customerLastName || "").trim();
  return `${firstName} ${lastName}`.trim();
}

function normalizeReservationListItem(reservation) {
  if (!reservation || typeof reservation !== "object") return reservation;

  if (reservation.customerName) {
    return reservation;
  }

  const customerName = buildReservationCustomerName(reservation);
  if (!customerName) return reservation;

  return {
    ...reservation,
    customerName,
  };
}

function normalizeHistoryTime(value) {
  return String(value || "")
    .trim()
    .replace(/h/i, ":");
}

function getHistoryReservationSortValue(item) {
  const dateValue = item?.reservationDate;
  const timeValue = normalizeHistoryTime(item?.reservationTime);
  const datePart =
    dateValue instanceof Date
      ? dateValue.toISOString().slice(0, 10)
      : String(dateValue || "").slice(0, 10);

  if (!datePart) return 0;

  const timestamp = new Date(
    `${datePart}T${timeValue || "00:00"}:00`,
  ).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeCustomerLastReservations(lastReservations = []) {
  if (!Array.isArray(lastReservations)) return [];

  const seen = new Set();

  return lastReservations
    .slice()
    .sort(
      (a, b) =>
        getHistoryReservationSortValue(b) - getHistoryReservationSortValue(a),
    )
    .reduce((items, item) => {
      const reservationId = String(item?.reservationId || item?._id || "");
      const fallbackKey = [
        item?.reservationDate || "",
        item?.reservationTime || "",
        item?.numberOfGuests || "",
        item?.status || "",
      ].join("|");
      const key = reservationId || fallbackKey;

      if (key && seen.has(key)) return items;
      if (key) seen.add(key);

      items.push({
        _id: item?._id || item?.reservationId || undefined,
        reservationId: item?.reservationId || item?._id || undefined,
        reservationDate: item?.reservationDate || null,
        reservationTime: item?.reservationTime || "",
        numberOfGuests: item?.numberOfGuests || 0,
        status: item?.status || "",
      });

      return items;
    }, [])
    .slice(0, 5);
}

function normalizeCustomerSummary(customer, mode = "detail") {
  if (!customer || typeof customer !== "object") return null;

  if (mode === "list") {
    return {
      _id: customer._id,
      tags: Array.isArray(customer.tags) ? customer.tags : [],
    };
  }

  return {
    _id: customer._id,
    tags: Array.isArray(customer.tags) ? customer.tags : [],
    stats: customer.stats || {},
    notes: customer.notes || "",
    lastReservationAt: customer.lastReservationAt || null,
    lastReservations: normalizeCustomerLastReservations(
      customer.lastReservations,
    ),
    createdAt: customer.createdAt || null,
  };
}

function roundPerfDuration(startedAtMs) {
  return Math.round((perfNowMs() - startedAtMs) * 100) / 100;
}

function setDiagnosticMetric(diagnostics, name, value) {
  if (diagnostics) diagnostics[name] = value;
}

async function enrichReservationsWithCustomerSummary(
  reservations = [],
  { restaurantId = null, diagnostics = null, summaryMode = "detail" } = {},
) {
  if (!Array.isArray(reservations) || !reservations.length) return reservations;

  const diagnosticsEnabled = isPerfDiagnosticsEnabled();
  const customerIdsStartedAtMs = diagnosticsEnabled ? perfNowMs() : 0;
  const customerIds = Array.from(
    new Set(
      reservations
        .map((reservation) => String(reservation?.customer || "").trim())
        .filter(Boolean),
    ),
  );
  const customerIdsBuildMs = diagnosticsEnabled
    ? roundPerfDuration(customerIdsStartedAtMs)
    : null;
  if (diagnosticsEnabled) {
    setDiagnosticMetric(diagnostics, "customerIdsBuildMs", customerIdsBuildMs);
    setDiagnosticMetric(diagnostics, "customerUniqueCount", customerIds.length);
  }

  if (!customerIds.length) return reservations;

  const customerQueryStartedAtMs = diagnosticsEnabled ? perfNowMs() : 0;
  const customers = await CustomerModel.find({
    _id: { $in: customerIds },
    ...(restaurantId ? { restaurant_id: restaurantId } : {}),
  })
    .select(
      CUSTOMER_SUMMARY_SELECT[summaryMode] || CUSTOMER_SUMMARY_SELECT.detail,
    )
    .lean();
  const customerQueryMs = diagnosticsEnabled
    ? roundPerfDuration(customerQueryStartedAtMs)
    : null;
  if (diagnosticsEnabled) {
    setDiagnosticMetric(diagnostics, "customerQueryMs", customerQueryMs);
    setDiagnosticMetric(diagnostics, "customerCount", customers.length);
  }

  const customerSummaryStartedAtMs = diagnosticsEnabled ? perfNowMs() : 0;
  const customerSummaryById = new Map(
    customers.map((customer) => {
      const customerId = String(customer._id);
      return [customerId, normalizeCustomerSummary(customer, summaryMode)];
    }),
  );
  const customerSummaryBuildMs = diagnosticsEnabled
    ? roundPerfDuration(customerSummaryStartedAtMs)
    : null;
  if (diagnosticsEnabled) {
    setDiagnosticMetric(
      diagnostics,
      "customerSummaryBuildMs",
      customerSummaryBuildMs,
    );
  }

  const enrichmentStartedAtMs = diagnosticsEnabled ? perfNowMs() : 0;
  const enrichedReservations = reservations.map((reservation) => {
    const customerSummary = customerSummaryById.get(
      String(reservation?.customer || ""),
    );

    if (!customerSummary) return reservation;

    return {
      ...reservation,
      customerSummary,
    };
  });
  const customerEnrichmentMapMs = diagnosticsEnabled
    ? roundPerfDuration(enrichmentStartedAtMs)
    : null;

  if (diagnosticsEnabled) {
    setDiagnosticMetric(
      diagnostics,
      "customerEnrichmentMapMs",
      customerEnrichmentMapMs,
    );
    if (
      !diagnostics &&
      shouldLogPerfDetail("customerEnrichment", {
        durationMs:
          customerIdsBuildMs +
          customerQueryMs +
          customerSummaryBuildMs +
          customerEnrichmentMapMs,
        normalLimit: 10,
      })
    ) {
      perfLog("RESERVATIONS", {
        event: "customer-enrichment",
        requestId: getPerfRequestId(),
        restaurantId: restaurantId ? String(restaurantId) : null,
        reservationCount: reservations.length,
        customerUniqueCount: customerIds.length,
        customerCount: customers.length,
        customerIdsBuildMs,
        customerQueryMs,
        customerSummaryBuildMs,
        customerEnrichmentMapMs,
      });
    }
  }

  return enrichedReservations;
}

async function enrichReservationWithCustomerSummary(reservation) {
  if (!reservation) return reservation;

  const source =
    reservation && typeof reservation.toObject === "function"
      ? reservation.toObject()
      : reservation;

  const [enriched] = await enrichReservationsWithCustomerSummary([source]);
  return enriched || source;
}

function buildRestaurantReservationsQuery(
  restaurantId,
  { dateRange = null, statuses = null } = {},
) {
  const filter = {
    restaurant_id: restaurantId,
  };

  if (dateRange) {
    filter.reservationDate = {
      $gte: dateRange.fromDate,
      $lt: dateRange.toExclusive,
    };
  }

  if (Array.isArray(statuses) && statuses.length) {
    filter.status = { $in: statuses };
  }

  return ReservationModel.find(filter).sort(RESTAURANT_RESERVATIONS_SORT);
}

async function getRestaurantReservationsList(
  restaurantId,
  {
    select = null,
    lean = true,
    dateRange = null,
    statuses = null,
    enrichCustomers = true,
    customerSummaryMode = "detail",
    batchSize = null,
  } = {},
) {
  const diagnosticsEnabled = isPerfDiagnosticsEnabled();
  const serviceStartedAtMs = diagnosticsEnabled ? perfNowMs() : 0;
  const diagnostics = diagnosticsEnabled
    ? {
        reservationCount: 0,
        firstDate: null,
        lastDate: null,
        statusCounts: Object.create(null),
      }
    : null;
  let query = buildRestaurantReservationsQuery(restaurantId, {
    dateRange,
    statuses,
  });

  if (select) {
    query = query.select(select);
  }

  if (lean) {
    query = query.lean();
  }

  if (Number.isInteger(batchSize) && batchSize > 0) {
    query = query.batchSize(batchSize);
  }

  const mongoStartedAtMs = diagnosticsEnabled ? perfNowMs() : 0;
  const reservations = await query;
  if (diagnosticsEnabled) {
    diagnostics.mongoMs = roundPerfDuration(mongoStartedAtMs);
    diagnostics.reservationCount = Array.isArray(reservations)
      ? reservations.length
      : 0;
  }

  if (!lean || !Array.isArray(reservations)) {
    if (diagnosticsEnabled) {
      setPerfRequestMetrics({
        reservationsMongoMs: diagnostics.mongoMs,
        reservationCount: diagnostics.reservationCount,
      });
      const requestRoute = getPerfRequestContext()?.route || "reservationList";
      if (
        shouldLogPerfDetail(requestRoute, {
          durationMs: roundPerfDuration(serviceStartedAtMs),
          normalLimit: requestRoute === "publicReservations" ? 10 : 30,
        })
      ) {
        perfLog("RESERVATIONS", {
          event: "list-service",
          requestId: getPerfRequestId(),
          requestRoute,
          restaurantId: String(restaurantId),
          lean,
          ...diagnostics,
          statusCounts: {},
          totalServiceMs: roundPerfDuration(serviceStartedAtMs),
        });
      }
    }
    return reservations;
  }

  const normalizationStartedAtMs = diagnosticsEnabled ? perfNowMs() : 0;
  const normalizedReservations = reservations.map((reservation) => {
    if (diagnosticsEnabled) {
      const rawDate = reservation?.reservationDate;
      const date =
        rawDate instanceof Date && !Number.isNaN(rawDate.getTime())
          ? rawDate.toISOString().slice(0, 10)
          : String(rawDate || "").slice(0, 10);
      if (date) {
        if (!diagnostics.firstDate || date < diagnostics.firstDate) {
          diagnostics.firstDate = date;
        }
        if (!diagnostics.lastDate || date > diagnostics.lastDate) {
          diagnostics.lastDate = date;
        }
      }

      const status = String(reservation?.status || "unknown");
      diagnostics.statusCounts[status] =
        (diagnostics.statusCounts[status] || 0) + 1;
    }

    return normalizeReservationListItem(reservation);
  });
  if (diagnosticsEnabled) {
    diagnostics.normalizationMs = roundPerfDuration(normalizationStartedAtMs);
  }

  const enrichmentStartedAtMs = diagnosticsEnabled ? perfNowMs() : 0;
  const enrichedReservations = enrichCustomers
    ? await enrichReservationsWithCustomerSummary(normalizedReservations, {
        restaurantId,
        diagnostics,
        summaryMode: customerSummaryMode,
      })
    : normalizedReservations;
  if (diagnosticsEnabled) {
    diagnostics.enrichmentMs = roundPerfDuration(enrichmentStartedAtMs);
    diagnostics.statusDistinctCount = Object.keys(
      diagnostics.statusCounts,
    ).length;
    const processingMs =
      Math.round(
        ((diagnostics.normalizationMs || 0) +
          (diagnostics.customerIdsBuildMs || 0) +
          (diagnostics.customerSummaryBuildMs || 0) +
          (diagnostics.customerEnrichmentMapMs || 0)) *
          100,
      ) / 100;
    const totalServiceMs = roundPerfDuration(serviceStartedAtMs);

    setPerfRequestMetrics({
      reservationsMongoMs: diagnostics.mongoMs,
      reservationCount: diagnostics.reservationCount,
      reservationsFirstDate: diagnostics.firstDate,
      reservationsLastDate: diagnostics.lastDate,
      reservationsStatusDistinctCount: diagnostics.statusDistinctCount,
      customerUniqueCount: diagnostics.customerUniqueCount || 0,
      customerQueryMs: diagnostics.customerQueryMs || 0,
      customerCount: diagnostics.customerCount || 0,
      reservationsNormalizationMs: diagnostics.normalizationMs,
      reservationsEnrichmentMs: diagnostics.enrichmentMs,
      reservationsProcessingMs: processingMs,
      reservationsServiceMs: totalServiceMs,
      reservationsRangeFrom: dateRange?.from || null,
      reservationsRangeTo: dateRange?.to || null,
    });
    const requestRoute = getPerfRequestContext()?.route || "reservationList";
    if (
      shouldLogPerfDetail(requestRoute, {
        durationMs: totalServiceMs,
        normalLimit: requestRoute === "publicReservations" ? 10 : 30,
      })
    ) {
      perfLog("RESERVATIONS", {
        event: "list-service",
        requestId: getPerfRequestId(),
        requestRoute,
        restaurantId: String(restaurantId),
        from: dateRange?.from || null,
        to: dateRange?.to || null,
        mongoMs: diagnostics.mongoMs,
        reservationCount: diagnostics.reservationCount,
        firstDate: diagnostics.firstDate,
        lastDate: diagnostics.lastDate,
        statusDistinctCount: diagnostics.statusDistinctCount,
        statusCounts: diagnostics.statusCounts,
        customerUniqueCount: diagnostics.customerUniqueCount || 0,
        customerIdsBuildMs: diagnostics.customerIdsBuildMs || 0,
        customerQueryMs: diagnostics.customerQueryMs || 0,
        customerCount: diagnostics.customerCount || 0,
        customerSummaryBuildMs: diagnostics.customerSummaryBuildMs || 0,
        customerEnrichmentMapMs: diagnostics.customerEnrichmentMapMs || 0,
        normalizationMs: diagnostics.normalizationMs,
        enrichmentMs: diagnostics.enrichmentMs,
        processingMs,
        totalServiceMs,
      });
    }
  }

  return enrichedReservations;
}

module.exports = {
  MANAGER_RESERVATION_LIST_SELECT,
  buildReservationDateRange,
  buildRestaurantReservationsQuery,
  enrichReservationWithCustomerSummary,
  enrichReservationsWithCustomerSummary,
  getRestaurantReservationsList,
};
