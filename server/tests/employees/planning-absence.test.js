const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");
const EmployeeModel = require("../../models/employee.model");
const RestaurantModel = require("../../models/restaurant.model");

for (const [name, method] of [
  ["shared/notifications", "createAndBroadcastNotification"],
  ["gift-cards/gift-card-lifecycle", "refreshGiftCardLifecycle"],
]) {
  const filename = require.resolve(`../../services/${name}.service`);
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports: { [method]: async () => null },
  };
}

const router = require("../../routes/employees.routes");
const {
  ABSENCE_TYPES,
  resolvePlanningAbsence,
} = require("../../services/employees/planning-absence.service");

const collection = "/restaurants/:restaurantId/employees/:employeeId/shifts";
const dates = {
  start: "2026-11-18T11:00:00.000Z",
  end: "2026-11-18T22:59:00.000Z",
};

function mockShiftRoutes(t) {
  const restaurantId = new mongoose.Types.ObjectId();
  const employeeId = new mongoose.Types.ObjectId();
  const ownerId = new mongoose.Types.ObjectId();
  const profile = { restaurant: restaurantId, shifts: [] };
  profile.shifts.id = (id) =>
    profile.shifts.find((shift) => String(shift._id) === String(id));

  t.mock.method(RestaurantModel, "findById", () => ({
    select: async () => ({ owner_id: ownerId }),
  }));
  t.mock.method(EmployeeModel, "findById", () => ({
    select: () => ({ lean: async () => ({ accountType: "employee" }) }),
  }));
  t.mock.method(EmployeeModel, "updateOne", async () => ({}));
  t.mock.method(EmployeeModel, "findOne", async () => ({
    restaurantProfiles: [profile],
  }));
  const write = t.mock.method(
    EmployeeModel,
    "findOneAndUpdate",
    async (_query, update) => {
      if (update.$push) {
        profile.shifts.push(update.$push["restaurantProfiles.$[profile].shifts"]);
      } else {
        for (const [path, value] of Object.entries(update.$set)) {
          profile.shifts[0][path.split(".").at(-1)] = value;
        }
      }
      return { restaurantProfiles: [profile] };
    },
  );

  async function request(method, body, shiftId) {
    const path = shiftId ? `${collection}/:shiftId` : collection;
    const layer = router.stack.find(
      (item) => item.route?.path === path && item.route.methods[method],
    );
    const result = { status: 200 };
    await layer.route.stack.at(-1).handle(
      {
        params: { employeeId, restaurantId, shiftId },
        user: { id: ownerId, role: "owner" },
        body,
      },
      {
        status(value) {
          result.status = value;
          return this;
        },
        json(value) {
          result.data = value;
          return this;
        },
      },
    );
    return result;
  }
  return { request, write, restaurantId };
}

test("the absence types are consistent with both UI locales", () => {
  for (const locale of ["fr", "en"]) {
    const { absenceTypes } = require(
      `../../../client/public/locales/${locale}/planning.json`,
    );
    assert.deepEqual(
      Object.keys(absenceTypes).sort(),
      [...ABSENCE_TYPES].sort(),
    );
  }
});

test("the shift routes save and update absence fields in the requested restaurant", async (t) => {
  const { request, write, restaurantId } = mockShiftRoutes(t);
  const created = await request("post", {
    ...dates,
    isLeave: true,
    absenceType: "paid_leave",
    absenceDuration: "afternoon",
  });
  assert.equal(created.status, 201);
  const { shift } = created.data;
  assert.equal(shift.absenceType, "paid_leave");
  assert.equal(shift.absenceDuration, "afternoon");
  assert.deepEqual(write.mock.calls[0].arguments[0].restaurants, restaurantId);

  const updated = await request(
    "put",
    { absenceType: "sick_leave" },
    shift._id,
  );
  assert.equal(updated.status, 200);
  assert.equal(updated.data.shift.absenceType, "sick_leave");
  assert.equal(updated.data.shift.absenceDuration, "afternoon");
  assert.deepEqual(
    write.mock.calls[1].arguments[2].arrayFilters[0]["profile.restaurant"],
    restaurantId,
  );

  const work = await request(
    "put",
    { isLeave: false, title: "Service" },
    shift._id,
  );
  assert.equal(work.data.shift.absenceType, null);
  assert.equal(work.data.shift.absenceDuration, null);
});

test("invalid fields are rejected before saving and legacy intervals can be inferred", async (t) => {
  const { request, write } = mockShiftRoutes(t);
  const invalid = await request("post", {
    ...dates,
    isLeave: true,
    absenceType: "unknown",
  });
  assert.equal(invalid.status, 400);
  const work = await request("post", { ...dates, absenceDuration: "custom" });
  assert.equal(work.status, 400);
  assert.equal(write.mock.callCount(), 0);
  assert.deepEqual(
    resolvePlanningAbsence(
      {},
      {
        manualAbsence: true,
        currentShift: { absenceType: "paid_leave", absenceDuration: "full" },
        datesChanged: true,
      },
    ),
    { absenceType: "paid_leave", absenceDuration: null },
  );
});
