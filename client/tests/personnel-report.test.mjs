import assert from "node:assert/strict";
import { test } from "node:test";
import { formatReportValue, isReportPeriod, moveReportPeriod, reportMonth, visibleReportColumns } from "../src/components/dashboard/employees/personnel-report.utils.mjs";

test("month navigation follows the calendar, and custom ranges preserve their length", () => {
  const december = reportMonth("2026-12-15");
  assert.deepEqual(december, { from: "2026-12-01", to: "2026-12-31" });
  assert.deepEqual(moveReportPeriod(december, 1), { from: "2027-01-01", to: "2027-01-31" });
  assert.deepEqual(moveReportPeriod({ from: "2026-10-24", to: "2026-10-26" }, 1), { from: "2026-10-27", to: "2026-10-29" });
  assert.equal(isReportPeriod("2026-02-30", "2026-03-05"), false);
  assert.equal(isReportPeriod("2026-01-01", "2026-04-05"), false);
});

test("repli replaces the detail columns with their actual summary, and unknown values stay distinct from zero", () => {
  const summary = { key: "planned" };
  const detail = [{ key: "gross" }, { key: "paid" }];
  assert.deepEqual(visibleReportColumns({ summary, columns: detail }, false), [summary]);
  assert.deepEqual(visibleReportColumns({ summary, columns: detail }, true), detail);
  assert.equal(formatReportValue(null, "minutes"), "—");
  assert.equal(formatReportValue(0, "minutes"), "0 h 00");
  assert.equal(formatReportValue(-15, "minutes"), "−0 h 15");
});
