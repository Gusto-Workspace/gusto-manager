const assert = require("node:assert/strict");
const test = require("node:test");

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const OwnerModel = require("../models/owner.model");
const EmployeeModel = require("../models/employee.model");

const {
  buildSessionVersionFilter,
  canUpdateOwnerEmail,
  createSuperAdminSessionClaims,
  getSessionVersion,
  hasMatchingSessionVersion,
  incrementSessionVersion,
  isSuperAdminSession,
  matchesSuperAdminPassword,
  normalizeSessionVersion,
  revokeAllAccountSessions,
  rotatePasswordSession,
  signAccountToken,
  validatePasswordChangeInput,
} = require("../services/account-session.service");

test("normalizes and increments account session versions", () => {
  const account = {};

  assert.equal(normalizeSessionVersion(undefined), 0);
  assert.equal(normalizeSessionVersion(-1), 0);
  assert.equal(getSessionVersion(account), 0);
  assert.equal(hasMatchingSessionVersion({}, account), true);
  assert.equal(incrementSessionVersion(account), 1);
  assert.equal(getSessionVersion(account), 1);
  assert.equal(hasMatchingSessionVersion({}, account), false);
  assert.equal(hasMatchingSessionVersion({ sessionVersion: 1 }, account), true);
});

test("refreshing an account token removes stale JWT timestamps", () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "account-session-test-secret";

  try {
    const token = signAccountToken({
      id: "owner-id",
      role: "owner",
      sessionVersion: 3,
      iat: 1,
      exp: 2,
    });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    assert.equal(decoded.id, "owner-id");
    assert.equal(decoded.sessionVersion, 3);
    assert.notEqual(decoded.iat, 1);
    assert.equal(decoded.exp, undefined);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("super-admin owner sessions have no automatic expiration", () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "account-session-test-secret";

  try {
    const superAdminClaims = createSuperAdminSessionClaims();
    const token = signAccountToken({
      id: "owner-id",
      role: "owner",
      sessionVersion: 0,
      ...superAdminClaims,
    });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    assert.equal(decoded.exp, undefined);
    assert.equal(decoded.superAdmin, true);
    assert.equal(decoded.authMethod, "super_admin");
    assert.equal(
      decoded.superAdminSessionId,
      superAdminClaims.superAdminSessionId,
    );
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("renewing a super-admin token preserves its session marker", () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "account-session-test-secret";

  try {
    const claims = createSuperAdminSessionClaims();
    const initialToken = signAccountToken({
      id: "owner-id",
      role: "owner",
      sessionVersion: 2,
      ...claims,
    });

    const renewedToken = signAccountToken({
      ...jwt.decode(initialToken),
      firstname: "Updated",
    });

    const decoded = jwt.verify(renewedToken, process.env.JWT_SECRET);
    assert.equal(decoded.exp, undefined);
    assert.equal(decoded.superAdmin, true);
    assert.equal(decoded.authMethod, "super_admin");
    assert.equal(decoded.superAdminSessionId, claims.superAdminSessionId);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("explicit token expiration options remain supported", () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "account-session-test-secret";

  try {
    const token = signAccountToken(
      {
        id: "owner-id",
        role: "owner",
        sessionVersion: 0,
        ...createSuperAdminSessionClaims(),
      },
      { expiresIn: "2h" },
    );
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    assert.equal(decoded.exp - decoded.iat, 2 * 60 * 60);
    assert.equal(decoded.superAdmin, true);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("invalid password inputs and bcrypt errors are rejected", async () => {
  const passwordHash = bcrypt.hashSync("current-password", 4);

  assert.equal(
    await OwnerModel.schema.methods.comparePassword(undefined, passwordHash),
    false,
  );
  assert.equal(
    await EmployeeModel.schema.methods.comparePassword(undefined, passwordHash),
    false,
  );
  assert.equal(
    await OwnerModel.schema.methods.comparePassword("wrong", passwordHash),
    false,
  );
  assert.deepEqual(validatePasswordChangeInput(undefined, "new-password"), {
    field: "currentPassword",
    message: "Current password is required",
  });
  assert.equal(
    validatePasswordChangeInput("wrong-password", "new-password"),
    null,
  );
  assert.deepEqual(validatePasswordChangeInput("current-password", ""), {
    field: "newPassword",
    message: "New password must contain at least 6 characters",
  });
});

test("super-admin sessions are identifiable and cannot mutate credentials", () => {
  const session = createSuperAdminSessionClaims();

  assert.equal(isSuperAdminSession(session), true);
  assert.equal(
    canUpdateOwnerEmail(session, "owner@example.com", "attacker@example.com"),
    false,
  );
  assert.equal(
    canUpdateOwnerEmail(session, "owner@example.com", "owner@example.com"),
    true,
  );
});

test("password rotation uses the initiating JWT version as an atomic guard", async () => {
  let receivedFilter;
  const AccountModel = {
    findOneAndUpdate(filter) {
      receivedFilter = filter;
      return { select: async () => null };
    },
  };

  const result = await rotatePasswordSession({
    AccountModel,
    accountId: "owner-id",
    currentPasswordHash: "stored-hash",
    expectedSessionVersion: 3,
    newPassword: "new-password",
  });

  assert.equal(result, null);
  assert.deepEqual(receivedFilter, {
    _id: "owner-id",
    sessionVersion: 3,
    password: "stored-hash",
  });
  assert.deepEqual(buildSessionVersionFilter("legacy-id", 0), {
    _id: "legacy-id",
    $or: [{ sessionVersion: 0 }, { sessionVersion: { $exists: false } }],
  });
});

test("admin revocation atomically invalidates every previous token", async () => {
  let receivedUpdate;
  const AccountModel = {
    findByIdAndUpdate(_id, update) {
      receivedUpdate = update;
      return { select: async () => ({ sessionVersion: 4 }) };
    },
  };

  const account = await revokeAllAccountSessions(AccountModel, "owner-id");

  assert.deepEqual(receivedUpdate, { $inc: { sessionVersion: 1 } });
  assert.equal(
    hasMatchingSessionVersion(
      {
        sessionVersion: 3,
        ...createSuperAdminSessionClaims(),
      },
      account,
    ),
    false,
  );
  assert.equal(hasMatchingSessionVersion({}, account), false);
});

test("super-admin authentication requires the configured bcrypt hash", async () => {
  const previousHash = process.env.SUPER_ADMIN_PASSWORD_HASH;
  process.env.SUPER_ADMIN_PASSWORD_HASH = bcrypt.hashSync(
    "test-master-password",
    4,
  );

  try {
    assert.equal(await matchesSuperAdminPassword("test-master-password"), true);
    assert.equal(await matchesSuperAdminPassword("wrong-password"), false);
  } finally {
    if (previousHash === undefined) {
      delete process.env.SUPER_ADMIN_PASSWORD_HASH;
    } else {
      process.env.SUPER_ADMIN_PASSWORD_HASH = previousHash;
    }
  }
});
