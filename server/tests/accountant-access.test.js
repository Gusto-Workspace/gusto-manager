const assert = require("node:assert/strict");
const { once } = require("node:events");
const { Readable, Writable } = require("node:stream");
const test = require("node:test");
const axios = require("axios");
const cloudinary = require("cloudinary").v2;
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET ||= "accountant-access-test-secret";

const EmployeeModel = require("../models/employee.model");
const RestaurantModel = require("../models/restaurant.model");

const notificationsServicePath = require.resolve(
  "../services/notifications.service",
);
require.cache[notificationsServicePath] = {
  id: notificationsServicePath,
  filename: notificationsServicePath,
  loaded: true,
  exports: { createAndBroadcastNotification: async () => null },
};

const giftCardLifecycleServicePath = require.resolve(
  "../services/gift-card-lifecycle.service",
);
require.cache[giftCardLifecycleServicePath] = {
  id: giftCardLifecycleServicePath,
  filename: giftCardLifecycleServicePath,
  loaded: true,
  exports: { refreshGiftCardLifecycle: async () => null },
};

const employeesRouter = require("../routes/employees.routes");
const timeClockRouter = require("../routes/time-clock.routes");
const {
  isAccountantRouteAllowed,
  restrictAccountantAccess,
} = require("../middleware/restrict-accountant-access");
const {
  decorateRestaurantEmployees,
} = require("../services/employee-serialization.service");

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

test("accountant API gate only permits the dedicated read/write surface", () => {
  assert.equal(isAccountantRouteAllowed("GET", "/accountants/me"), true);
  assert.equal(
    isAccountantRouteAllowed(
      "POST",
      "/restaurants/restaurant-a/time-clock/export/excel",
    ),
    true,
  );
  assert.equal(
    isAccountantRouteAllowed(
      "POST",
      "/restaurants/restaurant-a/employees/accountant-a/documents",
    ),
    true,
  );
  assert.equal(
    isAccountantRouteAllowed(
      "GET",
      "/restaurants/restaurant-a/employees/accountant-a/documents/Gusto_Workspace/restaurants/restaurant-a/private.pdf/download",
    ),
    true,
  );
  assert.equal(
    isAccountantRouteAllowed(
      "DELETE",
      "/restaurants/restaurant-a/employees/employee-a/documents/document-a",
    ),
    false,
  );
  assert.equal(
    isAccountantRouteAllowed("GET", "/owner/restaurants/restaurant-a"),
    false,
  );
  assert.equal(
    isAccountantRouteAllowed(
      "PATCH",
      "/restaurants/restaurant-a/time-clock/sessions/session-a",
    ),
    false,
  );
});

test("restaurant serialization keeps accountants out of the workforce list", () => {
  const restaurant = decorateRestaurantEmployees(
    { _id: "restaurant-a", name: "Restaurant A" },
    "restaurant-a",
    [
      {
        _id: "employee-a",
        accountType: "employee",
        restaurantProfiles: [{ restaurant: "restaurant-a" }],
      },
      {
        _id: "accountant-a",
        accountType: "accountant",
        restaurantProfiles: [{ restaurant: "restaurant-a" }],
      },
    ],
  );

  assert.deepEqual(
    restaurant.employees.map((employee) => employee._id),
    ["employee-a"],
  );
  assert.deepEqual(
    restaurant.accountants.map((employee) => employee._id),
    ["accountant-a"],
  );
});

test("a valid accountant token is rejected on a non-accountant endpoint", () => {
  const token = jwt.sign(
    { id: "accountant-a", role: "accountant", restaurantId: "restaurant-a" },
    process.env.JWT_SECRET,
  );
  const response = createResponse();
  let nextCalled = false;

  restrictAccountantAccess(
    {
      method: "GET",
      path: "/owner/restaurants/restaurant-a",
      headers: { authorization: `Bearer ${token}` },
    },
    response,
    () => {
      nextCalled = true;
    },
  );

  assert.equal(response.statusCode, 403);
  assert.equal(response.body.message, "Forbidden");
  assert.equal(nextCalled, false);
});

test("accountant documents target classic employees in the selected restaurant", async (t) => {
  const originalRestaurantFindById = RestaurantModel.findById;
  const originalEmployeeFindById = EmployeeModel.findById;
  const originalEmployeeExists = EmployeeModel.exists;

  const accountant = {
    _id: "accountant-a",
    accountType: "accountant",
    restaurants: ["restaurant-a", "restaurant-b"],
    restaurantProfiles: [
      { restaurant: "restaurant-a", options: {}, documents: [] },
      { restaurant: "restaurant-b", options: {}, documents: [] },
    ],
  };
  const accountantB = {
    _id: "accountant-b",
    accountType: "accountant",
    restaurants: ["restaurant-a"],
    restaurantProfiles: [
      { restaurant: "restaurant-a", options: {}, documents: [] },
    ],
  };
  const employeeA = {
    _id: "employee-a",
    accountType: "employee",
    restaurants: ["restaurant-a"],
    restaurantProfiles: [{ restaurant: "restaurant-a", documents: [] }],
  };
  const employeeB = {
    _id: "employee-b",
    accountType: "employee",
    restaurants: ["restaurant-b"],
    restaurantProfiles: [{ restaurant: "restaurant-b", documents: [] }],
  };

  RestaurantModel.findById = (restaurantId) => ({
    select: async () => ({
      _id: restaurantId,
      owner_id: `owner-${restaurantId}`,
      employees:
        restaurantId === "restaurant-a"
          ? ["accountant-a", "accountant-b", "employee-a"]
          : ["accountant-a", "employee-b"],
    }),
  });
  EmployeeModel.findById = async (employeeId) => {
    if (employeeId === "accountant-a") return accountant;
    if (employeeId === "accountant-b") return accountantB;
    if (employeeId === "employee-a") return employeeA;
    if (employeeId === "employee-b") return employeeB;
    return null;
  };
  EmployeeModel.exists = async () => true;

  t.after(() => {
    RestaurantModel.findById = originalRestaurantFindById;
    EmployeeModel.findById = originalEmployeeFindById;
    EmployeeModel.exists = originalEmployeeExists;
  });

  const getAccess =
    employeesRouter._employeeDocumentSecurity.getEmployeeDocumentRouteAccess;
  const ownAccess = await getAccess(
    {
      user: {
        id: "accountant-a",
        role: "accountant",
        restaurantId: "restaurant-a",
      },
    },
    "restaurant-a",
    "accountant-a",
  );
  assert.equal(ownAccess.error.status, 403);

  const otherEmployeeAccess = await getAccess(
    {
      user: {
        id: "accountant-a",
        role: "accountant",
        restaurantId: "restaurant-a",
      },
    },
    "restaurant-a",
    "employee-a",
  );
  assert.equal(otherEmployeeAccess.error, undefined);

  const secondAccountantAccess = await getAccess(
    {
      user: {
        id: "accountant-b",
        role: "accountant",
        restaurantId: "restaurant-a",
      },
    },
    "restaurant-a",
    "employee-a",
  );
  assert.equal(secondAccountantAccess.error, undefined);

  const managerOnlyAccess = await getAccess(
    {
      user: {
        id: "accountant-a",
        role: "accountant",
        restaurantId: "restaurant-a",
      },
    },
    "restaurant-a",
    "employee-a",
    { managerOnly: true },
  );
  assert.equal(managerOnlyAccess.error.status, 403);

  const otherTenantEmployeeAccess = await getAccess(
    {
      user: {
        id: "accountant-a",
        role: "accountant",
        restaurantId: "restaurant-a",
      },
    },
    "restaurant-a",
    "employee-b",
  );
  assert.equal(otherTenantEmployeeAccess.error.status, 403);

  const otherRestaurantAccess = await getAccess(
    {
      user: {
        id: "accountant-a",
        role: "accountant",
        restaurantId: "restaurant-a",
      },
    },
    "restaurant-b",
    "employee-b",
  );
  assert.equal(otherRestaurantAccess.error.status, 403);
});

test("the accountant employee list serializer exposes no HR fields", () => {
  const { serializeEmployeeForAccountant } =
    employeesRouter._accountantSecurity;
  const serialized = serializeEmployeeForAccountant(
    {
      _id: "employee-a",
      firstname: "Global",
      lastname: "Name",
      email: "private@example.com",
      phone: "0102030405",
      secuNumber: "private",
      post: "Serveur",
      profilePicture: {
        url: "https://image.example/avatar",
        public_id: "secret",
      },
      restaurantProfiles: [
        {
          restaurant: "restaurant-a",
          snapshot: {
            firstname: "Paul",
            lastname: "Dupont",
            post: "Chef de cuisine",
          },
          employment: { contractType: "CDI" },
          shifts: ["private"],
          documents: ["private"],
        },
      ],
    },
    "restaurant-a",
  );

  assert.deepEqual(serialized, {
    _id: "employee-a",
    firstname: "Paul",
    lastname: "Dupont",
    post: "Chef de cuisine",
    profilePicture: { url: "https://image.example/avatar" },
  });
  assert.equal(serialized.email, undefined);
  assert.equal(serialized.restaurantProfiles, undefined);
});

test("every accountant in the restaurant can read accountant documents", () => {
  const { accountantCanReadDocument } =
    employeesRouter._employeeDocumentSecurity;
  const accountantA = { id: "accountant-a", role: "accountant" };
  const accountantB = { id: "accountant-b", role: "accountant" };
  const document = {
    uploadedBy: {
      id: "accountant-a",
      role: "accountant",
      name: "Comptable A",
    },
  };

  assert.equal(accountantCanReadDocument(accountantA, document), true);
  assert.equal(accountantCanReadDocument(accountantB, document), true);
  assert.equal(
    accountantCanReadDocument(accountantB, {
      uploadedBy: { id: "accountant-a", role: "owner" },
    }),
    false,
  );
});

test("accountant B lists and downloads accountant A document with its author", async (t) => {
  const originalRestaurantFindById = RestaurantModel.findById;
  const originalEmployeeFindById = EmployeeModel.findById;
  const originalPrivateDownloadUrl = cloudinary.utils.private_download_url;
  const originalAxiosGet = axios.get;
  const document = {
    public_id: "restaurant-a/employee-a/bulletin.pdf",
    filename: "bulletin.pdf",
    title: "Bulletin janvier",
    format: "pdf",
    mimeType: "application/pdf",
    resource_type: "raw",
    delivery_type: "authenticated",
    uploadedAt: new Date("2026-01-31T12:00:00.000Z"),
    uploadedBy: {
      id: "accountant-a",
      role: "accountant",
      name: "Comptable A",
    },
  };
  const accountantB = {
    _id: "accountant-b",
    accountType: "accountant",
    restaurants: ["restaurant-a"],
    restaurantProfiles: [{ restaurant: "restaurant-a" }],
  };
  const employeeA = {
    _id: "employee-a",
    accountType: "employee",
    restaurants: ["restaurant-a"],
    restaurantProfiles: [{ restaurant: "restaurant-a", documents: [document] }],
  };

  function queryResult(value) {
    return {
      lean: async () => value,
      then(resolve, reject) {
        return Promise.resolve(value).then(resolve, reject);
      },
    };
  }

  RestaurantModel.findById = () => ({
    select: async () => ({
      _id: "restaurant-a",
      owner_id: "owner-a",
      employees: ["accountant-a", "accountant-b", "employee-a"],
    }),
  });
  EmployeeModel.findById = (employeeId) =>
    queryResult(employeeId === "accountant-b" ? accountantB : employeeA);
  cloudinary.utils.private_download_url = () =>
    "https://storage.invalid/signed-document";
  axios.get = async () => ({
    data: Readable.from([Buffer.from("%PDF-1.7\n%%EOF\n")]),
  });

  t.after(() => {
    RestaurantModel.findById = originalRestaurantFindById;
    EmployeeModel.findById = originalEmployeeFindById;
    cloudinary.utils.private_download_url = originalPrivateDownloadUrl;
    axios.get = originalAxiosGet;
  });

  const listRoute = employeesRouter.stack.find(
    (layer) =>
      layer.route?.path ===
        "/restaurants/:restaurantId/employees/:employeeId/documents" &&
      layer.route.methods.get,
  ).route;
  const listHandler = listRoute.stack[listRoute.stack.length - 1].handle;
  const listResponse = createResponse();
  listResponse.setHeader = () => {};

  await listHandler(
    {
      params: { restaurantId: "restaurant-a", employeeId: "employee-a" },
      user: {
        id: "accountant-b",
        role: "accountant",
        restaurantId: "restaurant-a",
      },
    },
    listResponse,
  );

  assert.equal(listResponse.statusCode, 200);
  assert.equal(listResponse.body.documents.length, 1);
  assert.equal(listResponse.body.documents[0].title, "Bulletin janvier");
  assert.deepEqual(listResponse.body.documents[0].uploadedBy, {
    name: "Comptable A",
  });

  const chunks = [];
  const downloadResponse = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
  downloadResponse.statusCode = 200;
  downloadResponse.headers = {};
  downloadResponse.setHeader = (name, value) => {
    downloadResponse.headers[String(name).toLowerCase()] = value;
  };
  downloadResponse.status = function status(value) {
    this.statusCode = value;
    return this;
  };
  downloadResponse.json = function json(value) {
    this.body = value;
    return this;
  };

  const downloadRoute = employeesRouter.stack.find(
    (layer) =>
      layer.route?.path ===
        "/restaurants/:restaurantId/employees/:employeeId/documents/:public_id(*)/download" &&
      layer.route.methods.get,
  ).route;
  const downloadHandler =
    downloadRoute.stack[downloadRoute.stack.length - 1].handle;
  const downloadFinished = once(downloadResponse, "finish");

  await downloadHandler(
    {
      params: {
        restaurantId: "restaurant-a",
        employeeId: "employee-a",
        public_id: document.public_id,
      },
      user: {
        id: "accountant-b",
        role: "accountant",
        restaurantId: "restaurant-a",
      },
    },
    downloadResponse,
  );
  await downloadFinished;

  assert.equal(downloadResponse.statusCode, 200);
  assert.equal(downloadResponse.headers["content-type"], "application/pdf");
  assert.match(Buffer.concat(chunks).toString(), /^%PDF/);
});

test("time-clock access derives the accountant tenant from the JWT", async (t) => {
  const originalRestaurantFindById = RestaurantModel.findById;
  const originalEmployeeFindById = EmployeeModel.findById;

  RestaurantModel.findById = (restaurantId) => ({
    select: async () => ({
      _id: restaurantId,
      owner_id: "owner-a",
      employees: ["accountant-a", "employee-a"],
      opening_hours: [],
    }),
  });
  EmployeeModel.findById = async () => ({
    _id: "accountant-a",
    accountType: "accountant",
    restaurants: ["restaurant-a", "restaurant-b"],
  });

  t.after(() => {
    RestaurantModel.findById = originalRestaurantFindById;
    EmployeeModel.findById = originalEmployeeFindById;
  });

  const { getAccessContext, workforceAccountFilter } =
    timeClockRouter._timeClockSecurity;
  const allowed = await getAccessContext(
    {
      user: {
        id: "accountant-a",
        role: "accountant",
        restaurantId: "restaurant-a",
      },
    },
    "restaurant-a",
  );
  assert.equal(allowed.canExportHours, true);
  assert.equal(allowed.isManager, false);

  const denied = await getAccessContext(
    {
      user: {
        id: "accountant-a",
        role: "accountant",
        restaurantId: "restaurant-a",
      },
    },
    "restaurant-b",
  );
  assert.equal(denied.error.status, 403);
  assert.deepEqual(workforceAccountFilter(), {
    $or: [{ accountType: "employee" }, { accountType: { $exists: false } }],
  });
});
