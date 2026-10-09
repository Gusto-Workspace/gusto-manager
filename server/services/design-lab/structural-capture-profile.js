const { performance } = require("node:perf_hooks");

// Passive timings only, kept outside captureCoverage/localMetadata so they
// never become Vision input or alter capture decisions/deadlines.
function createCaptureProfile(now = () => performance.now()) {
  const started = now(), events = [], aggregates = new Map(), stack = [];
  let phase = "identify_scroller", phaseStarted = started;
  const phases = {};
  const finishPhase = (at) => { phases[phase] = (phases[phase] || 0) + at - phaseStarted; phaseStarted = at; };
  return {
    phase(next) { if (next !== phase) { finishPhase(now()); phase = next; } },
    async time(operation, work, details = {}) {
      const span = { phase, operation, ...details, startedMs: now() - started, childMs: 0 };
      const parent = stack.at(-1); stack.push(span);
      try { return await work(); }
      catch (error) { span.failed = true; throw error; }
      finally {
        span.durationMs = now() - started - span.startedMs;
        span.selfMs = Math.max(0, span.durationMs - span.childMs);
        stack.pop(); if (parent) parent.childMs += span.durationMs;
        const key = `${span.phase}:${operation}`;
        const aggregate = aggregates.get(key) || { phase: span.phase, operation, count: 0, durationMs: 0, selfMs: 0, maximumMs: 0 };
        aggregate.count++; aggregate.durationMs += span.durationMs; aggregate.selfMs += span.selfMs;
        aggregate.maximumMs = Math.max(aggregate.maximumMs, span.durationMs); aggregates.set(key, aggregate);
        if (events.length < 10000) events.push(span);
      }
    },
    snapshot() {
      const at = now(); finishPhase(at);
      return { version: 1, elapsedMs: at - started, phases: { ...phases },
        operations: [...aggregates.values()].map((value) => ({ ...value })),
        events: events.map((value) => ({ ...value })), truncated: events.length === 10000 };
    },
  };
}
module.exports = { createCaptureProfile };
