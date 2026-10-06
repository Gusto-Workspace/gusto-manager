const operations = new Map();
const RETENTION_MS = 15 * 60 * 1000;
const OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validOperationId(value) {
  return typeof value === "string" && OPERATION_ID.test(value);
}

function prune() {
  const cutoff = Date.now() - RETENTION_MS;
  for (const [id, value] of operations)
    if (value.updatedAt < cutoff) operations.delete(id);
}

function setReferenceProgress(id, update) {
  if (!validOperationId(id)) return null;
  prune();
  const previous = operations.get(id)?.state;
  const status = update.status || previous?.status || "running";
  const progress = status === "completed"
    ? 100
    : Math.min(99, Math.max(previous?.progress || 0, update.progress || 0));
  const state = { ...previous, ...update, status, progress };
  operations.set(id, { state, updatedAt: Date.now() });
  return state;
}

function getReferenceProgress(id) {
  prune();
  return validOperationId(id) ? operations.get(id)?.state || null : null;
}

module.exports = { validOperationId, setReferenceProgress, getReferenceProgress };
