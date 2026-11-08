const ACTIONABLE_STATUSES = new Set(["missed", "busy"]);
const STATUS_RANK = { incoming: 0, initiated: 1, ringing: 2, answered: 3, completed: 4, missed: 4, failed: 4, busy: 4, canceled: 4 };

export function mergeCalls(previous, incoming, readThrough) {
  const next = { ...previous };
  for (const call of incoming) {
    const old = next[call.id];
    if (old && (new Date(old.updatedAt) > new Date(call.updatedAt) || (STATUS_RANK[old.status] || 0) > (STATUS_RANK[call.status] || 0))) continue;
    const alreadyRead = old?.readAt || (readThrough && ACTIONABLE_STATUSES.has(call.status) && new Date(call.updatedAt).getTime() <= new Date(readThrough).getTime() ? readThrough : null);
    next[call.id] = alreadyRead && !call.readAt ? { ...call, read: true, readAt: alreadyRead } : call;
  }
  return next;
}

export function markCallsRead(previous, event) {
  const readTime = new Date(event.readAt).getTime();
  if (!Number.isFinite(readTime)) return previous;
  const next = { ...previous };
  for (const call of Object.values(previous)) {
    if (!call.read && ACTIONABLE_STATUSES.has(call.status) && new Date(call.updatedAt).getTime() <= readTime) next[call.id] = { ...call, read: true, readAt: event.readAt };
  }
  return next;
}

export function shouldHighlightCall(call, { open, highlightIds, highlightReadAt }) {
  return ACTIONABLE_STATUSES.has(call.status) && Boolean(!call.read || (open && (highlightIds.includes(call.id) || (highlightReadAt && call.readAt === highlightReadAt))));
}
