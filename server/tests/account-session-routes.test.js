const assert = require("node:assert/strict");
const test = require("node:test");

process.env.STRIPE_API_SECRET_KEY ||= "sk_test_account_session";
process.env.JWT_SECRET ||= "account-session-route-test-secret";

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const OwnerModel = require("../models/owner.model");
const EmployeeModel = require("../models/employee.model");
const authRouter = require("../routes/auth.routes");
const ownerRouter = require("../routes/owners.routes");
const {
  createSuperAdminSessionClaims,
} = require("../services/account-session.service");

function getRouteHandler(router, path, method) {
  const layer = router.stack.find(
    (item) => item.route?.path === path && item.route.methods?.[method],
  );
  assert.ok(layer, `Missing ${method.toUpperCase()} ${path}`);
  return layer.route.stack.at(-1).handle;
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
}

test("owner password and email routes enforce session security", async (t) => {
  const updatePassword = getRouteHandler(
    ownerRouter,
    "/owner/update-password",
    "put",
  );
  const updateData = getRouteHandler(ownerRouter, "/owner/update-data", "put");
  const originalFindById = OwnerModel.findById;
  const originalFindOneAndUpdate = OwnerModel.findOneAndUpdate;
  t.after(() => {
    OwnerModel.findById = originalFindById;
    OwnerModel.findOneAndUpdate = originalFindOneAndUpdate;
  });

  await t.test("missing currentPassword is rejected", async () => {
    const res = createResponse();
    await updatePassword(
      {
        user: { id: "owner-id", role: "owner", sessionVersion: 3 },
        body: { newPassword: "new-password" },
      },
      res,
    );
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.field, "currentPassword");
  });

  await t.test("a super-admin session cannot change the password", async () => {
    const res = createResponse();
    await updatePassword(
      {
        user: {
          id: "owner-id",
          role: "owner",
          sessionVersion: 3,
          ...createSuperAdminSessionClaims(),
        },
        body: {
          currentPassword: "current-password",
          newPassword: "new-password",
        },
      },
      res,
    );
    assert.equal(res.statusCode, 403);
  });

  await t.test("a wrong current password is rejected", async () => {
    OwnerModel.findById = () => ({
      select: async () => ({
        password: "stored-hash",
        comparePassword: async () => false,
      }),
    });

    const res = createResponse();
    await updatePassword(
      {
        user: { id: "owner-id", role: "owner", sessionVersion: 3 },
        body: {
          currentPassword: "wrong-password",
          newPassword: "new-password",
        },
      },
      res,
    );
    assert.equal(res.statusCode, 401);
  });

  await t.test(
    "a super-admin session cannot change the owner email",
    async () => {
      OwnerModel.findById = () => ({
        select: async () => ({ email: "owner@example.com" }),
      });

      const res = createResponse();
      await updateData(
        {
          user: {
            id: "owner-id",
            role: "owner",
            sessionVersion: 3,
            ...createSuperAdminSessionClaims(),
          },
          body: { email: "attacker@example.com" },
        },
        res,
      );
      assert.equal(res.statusCode, 403);
    },
  );

  await t.test(
    "profile renewal preserves the super-admin session marker",
    async () => {
      const owner = {
        _id: "owner-id",
        email: "owner@example.com",
        firstname: "Owner",
        lastname: "Example",
        sessionVersion: 3,
        save: async () => {},
      };
      OwnerModel.findById = () => ({
        then(resolve, reject) {
          return Promise.resolve(owner).then(resolve, reject);
        },
        select() {
          return {
            lean: async () => ({
              _id: owner._id,
              sessionVersion: owner.sessionVersion,
            }),
          };
        },
      });

      const superAdminClaims = createSuperAdminSessionClaims();
      const res = createResponse();
      await updateData(
        {
          user: {
            id: "owner-id",
            role: "owner",
            sessionVersion: 3,
            ...superAdminClaims,
          },
          body: { email: "owner@example.com", firstname: "Updated" },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
      assert.equal(decoded.superAdmin, true);
      assert.equal(decoded.authMethod, "super_admin");
      assert.equal(
        decoded.superAdminSessionId,
        superAdminClaims.superAdminSessionId,
      );
      assert.equal(decoded.exp, undefined);
    },
  );

  await t.test(
    "only the password-changing request receives version N+1",
    async () => {
      OwnerModel.findById = () => ({
        select: async () => ({
          _id: "owner-id",
          password: "stored-hash",
          comparePassword: async () => true,
        }),
      });
      OwnerModel.findOneAndUpdate = (filter) => ({
        select: async () =>
          filter.sessionVersion === 3 ? { sessionVersion: 4 } : null,
      });

      const res = createResponse();
      await updatePassword(
        {
          user: { id: "owner-id", role: "owner", sessionVersion: 3 },
          body: {
            currentPassword: "current-password",
            newPassword: "new-password",
          },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      assert.equal(
        jwt.verify(res.body.token, process.env.JWT_SECRET).sessionVersion,
        4,
      );
    },
  );

  await t.test(
    "a request that lost the version race gets no token",
    async () => {
      OwnerModel.findById = () => ({
        select: async () => ({
          _id: "owner-id",
          password: "stored-hash",
          comparePassword: async () => true,
        }),
      });
      OwnerModel.findOneAndUpdate = () => ({ select: async () => null });

      const res = createResponse();
      await updatePassword(
        {
          user: { id: "owner-id", role: "owner", sessionVersion: 3 },
          body: {
            currentPassword: "current-password",
            newPassword: "new-password",
          },
        },
        res,
      );

      assert.equal(res.statusCode, 403);
      assert.equal(res.body.token, undefined);
    },
  );
});

test("the super-admin password authenticates owners only", async (t) => {
  const login = getRouteHandler(authRouter, "/user/login", "post");
  const originalOwnerFindOne = OwnerModel.findOne;
  const originalEmployeeFindOne = EmployeeModel.findOne;
  const previousSuperAdminHash = process.env.SUPER_ADMIN_PASSWORD_HASH;
  const superAdminPassword = "route-test-super-admin-password";
  process.env.SUPER_ADMIN_PASSWORD_HASH = bcrypt.hashSync(
    superAdminPassword,
    4,
  );

  t.after(() => {
    OwnerModel.findOne = originalOwnerFindOne;
    EmployeeModel.findOne = originalEmployeeFindOne;
    if (previousSuperAdminHash === undefined) {
      delete process.env.SUPER_ADMIN_PASSWORD_HASH;
    } else {
      process.env.SUPER_ADMIN_PASSWORD_HASH = previousSuperAdminHash;
    }
  });

  await t.test(
    "an owner receives an identifiable super-admin token",
    async () => {
      const owner = {
        _id: "owner-id",
        firstname: "Owner",
        lastname: "Example",
        email: "owner@example.com",
        password: bcrypt.hashSync("real-owner-password", 4),
        sessionVersion: 4,
        toObject: () => ({
          _id: "owner-id",
          email: "owner@example.com",
          password: "stored-hash",
          sessionVersion: 4,
        }),
      };
      OwnerModel.findOne = () => ({
        select: () => ({ populate: async () => owner }),
      });

      const res = createResponse();
      await login(
        {
          body: {
            email: "owner@example.com",
            password: superAdminPassword,
          },
        },
        res,
      );

      assert.equal(res.statusCode, 200);
      const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
      assert.equal(decoded.role, "owner");
      assert.equal(decoded.sessionVersion, 4);
      assert.equal(decoded.superAdmin, true);
      assert.equal(decoded.authMethod, "super_admin");
      assert.equal(typeof decoded.superAdminSessionId, "string");
      assert.equal(decoded.exp, undefined);
      assert.equal(res.body.owner.password, undefined);
      assert.equal(res.body.owner.sessionVersion, undefined);
    },
  );

  await t.test("an employee cannot use the super-admin password", async () => {
    OwnerModel.findOne = () => ({
      select: () => ({ populate: async () => null }),
    });
    EmployeeModel.findOne = () => ({
      select: async () => ({
        password: bcrypt.hashSync("real-employee-password", 4),
      }),
    });

    const res = createResponse();
    await login(
      {
        body: {
          email: "employee@example.com",
          password: superAdminPassword,
        },
      },
      res,
    );

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.token, undefined);
  });
});
