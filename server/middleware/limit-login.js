const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_SOURCE = 30;
const MAX_ATTEMPTS_PER_ACCOUNT_AND_SOURCE = 8;
const MAX_TRACKED_KEYS = 10000;

const attempts = new Map();

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function consumeAttempt(key, limit, now) {
  const current = attempts.get(key);

  if (!current || current.resetAt <= now) {
    const next = { count: 1, resetAt: now + WINDOW_MS };
    attempts.set(key, next);
    return { allowed: true, ...next };
  }

  current.count += 1;
  return { allowed: current.count <= limit, ...current };
}

function pruneExpiredAttempts(now) {
  if (attempts.size < MAX_TRACKED_KEYS) return;

  for (const [key, value] of attempts) {
    if (value.resetAt <= now) attempts.delete(key);
  }
}

function limitLogin(req, res, next) {
  const now = Date.now();
  pruneExpiredAttempts(now);

  const source = String(req.ip || req.socket?.remoteAddress || "unknown");
  const email = normalizeEmail(req.body?.email);
  const sourceAttempt = consumeAttempt(
    `source:${source}`,
    MAX_ATTEMPTS_PER_SOURCE,
    now,
  );
  const accountAttempt = consumeAttempt(
    `account:${source}:${email}`,
    MAX_ATTEMPTS_PER_ACCOUNT_AND_SOURCE,
    now,
  );

  if (sourceAttempt.allowed && accountAttempt.allowed) return next();

  const resetAt = Math.max(sourceAttempt.resetAt, accountAttempt.resetAt);
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
  res.set("Retry-After", String(retryAfterSeconds));
  return res
    .status(429)
    .json({ message: "Trop de tentatives. Réessayez plus tard." });
}

function resetLoginLimiterForTests() {
  attempts.clear();
}

module.exports = limitLogin;
module.exports.resetLoginLimiterForTests = resetLoginLimiterForTests;
