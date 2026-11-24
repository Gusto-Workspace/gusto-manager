const assert = require("node:assert/strict");
const test = require("node:test");
const { compareTimeClockRegisters } = require("../../scripts/compare-time-clock-registers");

const period = { from: "2026-09-28", to: "2026-11-01" };
const service = { employee: "E01", date: "2026-10-24", service: "S01",
  plannedIn: "2026-10-24T18:00+02:00", plannedOut: "2026-10-25T00:00+02:00",
  clockedIn: "2026-10-24T16:01Z", clockedOut: "2026-10-25T02:10+01:00",
  paidIn: "2026-10-24T16:00Z", paidOut: "2026-10-25T01:10Z",
  plannedBreak: 30, clockedBreak: 0, paidBreak: 30, paidMinutes: 520, lateMinutes: 1,
  validated: true, absent: false, corrections: ["departure", "pause"], anomalies: [],
};

test("compares overnight instants across the Paris time change and preserves zero and false", () => {
  const result = compareTimeClockRegisters({ ...period, skello: [service], gusto: [{ ...service,
    clockedOut: "2026-10-25T01:10:00Z", corrections: ["pause", "departure"],
  }] });
  assert.equal(result.counts.matched, 1);
  assert.deepEqual(result.comparablePaidMinutes, { skello: 520, gusto: 520, services: 1 });
});

test("separates known differences, unavailable fields and unmatched services from comparable totals", () => {
  const result = compareTimeClockRegisters({ ...period,
    skello: [service, { ...service, service: "S02" }, { ...service, service: "S03" }],
    gusto: [{ ...service, paidMinutes: 510, paidBreak: 40, clockedBreak: null, validated: false },
      { ...service, service: "S03", corrections: null }, { ...service, employee: "E02" }],
  });
  assert.deepEqual(result.counts, { skello: 3, gusto: 3, matched: 0, different: 1, incomplete: 1, missingSkello: 1, missingGusto: 1 });
  assert.deepEqual(result.services[0].differences.map(({ field }) => field), ["paidBreak", "paidMinutes", "validated"]);
  assert.deepEqual(result.services[0].unavailable, [{ field: "clockedBreak", skello: false, gusto: true }]);
  assert.deepEqual(result.comparablePaidMinutes, { skello: 1040, gusto: 1030, services: 2 });
});

test("rejects ambiguous service keys, imprecise time zones and out-of-period entries", () => {
  assert.throws(() => compareTimeClockRegisters({ ...period, skello: [service, service], gusto: [] }), /duplicate service/);
  assert.throws(() => compareTimeClockRegisters({ ...period, skello: [], gusto: [{ ...service, clockedOut: "2026-10-25T02:10" }] }), /invalid clockedOut/);
  assert.throws(() => compareTimeClockRegisters({ ...period, skello: [{ ...service, date: "2026-11-02" }], gusto: [] }), /selected period/);
});
