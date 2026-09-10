const assert = require("node:assert/strict");
const test = require("node:test");
const { Writable } = require("stream");

process.env.JWT_SECRET ||= "employee-documents-security-test-secret";

const cloudinary = require("cloudinary").v2;
const EmployeeModel = require("../models/employee.model");
const RestaurantModel = require("../models/restaurant.model");
const authenticateToken = require("../middleware/authentificate-token");

const notificationsServicePath = require.resolve(
  "../services/notifications.service",
);
require.cache[notificationsServicePath] = {
  id: notificationsServicePath,
  filename: notificationsServicePath,
  loaded: true,
  exports: {
    createAndBroadcastNotification: async () => null,
  },
};

const giftCardLifecycleServicePath = require.resolve(
  "../services/gift-card-lifecycle.service",
);
require.cache[giftCardLifecycleServicePath] = {
  id: giftCardLifecycleServicePath,
  filename: giftCardLifecycleServicePath,
  loaded: true,
  exports: {
    refreshGiftCardLifecycle: async () => null,
  },
};

const employeesRouter = require("../routes/employees.routes");
const {
  EMPLOYEE_DOCUMENT_DOWNLOAD_URL_TTL_SECONDS,
  EMPLOYEE_DOCUMENT_MAX_FILE_SIZE,
  EmployeeDocumentValidationError,
  buildEmployeeDocumentDownloadUrl,
  getDocumentContentDisposition,
  getDocumentContentType,
  serializeEmployeeDocument,
  setPrivateDocumentResponseHeaders,
  validateEmployeeDocumentFile,
} = require("../services/employee-documents.service");
const {
  decorateEmployeeForRestaurant,
  sanitizeEmployeeForRestaurants,
} = require("../services/employee-serialization.service");

const { findEmployeeDocument, getEmployeeDocumentRouteAccess } =
  employeesRouter._employeeDocumentSecurity;

function pdfFile(overrides = {}) {
  const buffer = Buffer.from("%PDF-1.7\n%%EOF\n");
  return {
    originalname: "bulletin-septembre.pdf",
    mimetype: "application/pdf",
    size: buffer.length,
    buffer,
    ...overrides,
  };
}

function responseRecorder() {
  const result = { status: 200, body: null, headers: {} };
  return {
    result,
    response: {
      setHeader(name, value) {
        result.headers[String(name).toLowerCase()] = value;
      },
      status(status) {
        result.status = status;
        return this;
      },
      json(body) {
        result.body = body;
        return this;
      },
    },
  };
}

function accessRestaurant(overrides = {}) {
  return {
    _id: "restaurant-a",
    owner_id: "owner-a",
    employees: ["employee-a", "manager-a"],
    ...overrides,
  };
}

function employeeAccount(id, restaurantId, options = {}) {
  return {
    _id: id,
    restaurants: [restaurantId],
    restaurantProfiles: [{ restaurant: restaurantId, options, documents: [] }],
  };
}

function mockDocumentAccessModels(
  t,
  { restaurant, currentEmployee = null, targetExists = true },
) {
  const originalRestaurantFindById = RestaurantModel.findById;
  const originalEmployeeFindById = EmployeeModel.findById;
  const originalEmployeeExists = EmployeeModel.exists;

  RestaurantModel.findById = () => ({
    select: async () => restaurant,
  });
  EmployeeModel.findById = async () => currentEmployee;
  EmployeeModel.exists = async () => targetExists;

  t.after(() => {
    RestaurantModel.findById = originalRestaurantFindById;
    EmployeeModel.findById = originalEmployeeFindById;
    EmployeeModel.exists = originalEmployeeExists;
  });
}

test("employee document validation accepts a real PDF", () => {
  const result = validateEmployeeDocumentFile(pdfFile());

  assert.equal(result.extension, ".pdf");
  assert.equal(result.mimeType, "application/pdf");
  assert.equal(result.filename, "bulletin-septembre.pdf");
});

test("employee document validation rejects active, spoofed, empty and oversized files", () => {
  const rejectedFiles = [
    pdfFile({
      originalname: "bulletin.html",
      mimetype: "text/html",
      buffer: Buffer.from("<html></html>"),
    }),
    pdfFile({
      originalname: "bulletin.svg",
      mimetype: "image/svg+xml",
      buffer: Buffer.from("<svg></svg>"),
    }),
    pdfFile({
      originalname: "bulletin.pdf.exe",
      mimetype: "application/octet-stream",
    }),
    pdfFile({ mimetype: "text/html" }),
    pdfFile({ buffer: Buffer.from("not a PDF") }),
    pdfFile({ buffer: Buffer.alloc(0), size: 0 }),
    pdfFile({ size: EMPLOYEE_DOCUMENT_MAX_FILE_SIZE + 1 }),
    pdfFile({
      size: 1,
      buffer: Buffer.alloc(EMPLOYEE_DOCUMENT_MAX_FILE_SIZE + 1),
    }),
  ];

  for (const file of rejectedFiles) {
    assert.throws(
      () => validateEmployeeDocumentFile(file),
      EmployeeDocumentValidationError,
    );
  }
});

test("private document URLs are generated server-side with authenticated delivery and a short expiry", () => {
  let received;
  const before = Math.floor(Date.now() / 1000);
  const url = buildEmployeeDocumentDownloadUrl(
    {
      public_id: "private/opaque-id.pdf",
      filename: "bulletin.pdf",
      format: "pdf",
      resource_type: "raw",
      delivery_type: "authenticated",
      url: "https://attacker.invalid/should-not-be-used",
    },
    {
      utils: {
        private_download_url(publicId, format, options) {
          received = { publicId, format, options };
          return "https://api.cloudinary.test/private-download";
        },
      },
    },
  );

  assert.equal(url, "https://api.cloudinary.test/private-download");
  assert.equal(received.publicId, "private/opaque-id.pdf");
  assert.equal(received.format, "pdf");
  assert.equal(received.options.resource_type, "raw");
  assert.equal(received.options.type, "authenticated");
  assert.ok(
    received.options.expires_at >=
      before + EMPLOYEE_DOCUMENT_DOWNLOAD_URL_TTL_SECONDS,
  );
  assert.ok(
    received.options.expires_at <=
      before + EMPLOYEE_DOCUMENT_DOWNLOAD_URL_TTL_SECONDS + 1,
  );
});

test("download fails closed for non-authenticated storage metadata", () => {
  assert.throws(
    () =>
      buildEmployeeDocumentDownloadUrl(
        {
          public_id: "public/document.pdf",
          filename: "document.pdf",
          format: "pdf",
          resource_type: "raw",
          delivery_type: "upload",
          url: "https://res.cloudinary.com/demo/raw/upload/document.pdf",
        },
        { utils: { private_download_url: () => "unused" } },
      ),
    /Private document storage metadata is incomplete/,
  );
});

test("public or incomplete document metadata is rejected closed", () => {
  const cloudinaryClient = {
    utils: {
      private_download_url() {
        throw new Error("private URL generation must not be reached");
      },
    },
  };

  assert.throws(
    () =>
      buildEmployeeDocumentDownloadUrl(
        {
          public_id: "legacy.pdf",
          filename: "legacy.pdf",
          format: "pdf",
          delivery_type: "upload",
          url: "https://res.cloudinary.com/demo/raw/upload/legacy.pdf",
        },
        cloudinaryClient,
      ),
    /Private document storage metadata is incomplete/,
  );
});

test("document API serialization never returns a permanent storage URL", () => {
  const serialized = serializeEmployeeDocument({
    public_id: "opaque-id",
    filename: "bulletin.pdf",
    title: "Septembre",
    url: "https://res.cloudinary.com/demo/raw/upload/public.pdf",
    asset_id: "provider-asset-id",
    delivery_type: "upload",
  });

  assert.deepEqual(serialized, {
    public_id: "opaque-id",
    filename: "bulletin.pdf",
    title: "Septembre",
  });
  assert.equal("url" in serialized, false);
  assert.equal("asset_id" in serialized, false);
  assert.equal("delivery_type" in serialized, false);
});

test("employee model serialization strips documents from accidental responses", () => {
  const employee = new EmployeeModel({
    firstname: "Ada",
    lastname: "Lovelace",
    phone: "0102030405",
    restaurants: ["64b000000000000000000001"],
    restaurantProfiles: [
      {
        restaurant: "64b000000000000000000001",
        documents: [
          {
            url: "https://res.cloudinary.com/demo/raw/upload/public.pdf",
            public_id: "public-document",
            filename: "bulletin.pdf",
            title: "Bulletin",
          },
        ],
      },
    ],
  });

  assert.equal(
    employee.toObject({ transform: false }).restaurantProfiles[0].documents
      .length,
    1,
  );
  const serialized = employee.toJSON();
  assert.deepEqual(serialized.restaurantProfiles[0].documents, []);
  assert.equal(serialized.firstname, "Ada");
  assert.equal(serialized.phone, "0102030405");
});

test("general owner serialization filters documents and other restaurant profiles", () => {
  const employee = {
    _id: "employee-shared",
    restaurants: [{ _id: "restaurant-a" }, { _id: "restaurant-b" }],
    restaurantProfiles: [
      {
        restaurant: "restaurant-a",
        documents: [
          {
            public_id: "doc-a",
            filename: "a.pdf",
            title: "A",
            url: "https://res.cloudinary.com/demo/raw/upload/a.pdf",
          },
        ],
      },
      {
        restaurant: "restaurant-b",
        documents: [
          {
            public_id: "doc-b",
            filename: "b.pdf",
            title: "B",
            url: "https://res.cloudinary.com/demo/raw/upload/b.pdf",
          },
        ],
      },
    ],
  };

  const sanitized = sanitizeEmployeeForRestaurants(employee, ["restaurant-a"]);
  assert.equal(sanitized.restaurantProfiles.length, 1);
  assert.equal(sanitized.restaurantProfiles[0].restaurant, "restaurant-a");
  assert.deepEqual(sanitized.restaurantProfiles[0].documents, []);

  const decorated = decorateEmployeeForRestaurant(employee, "restaurant-a", {
    includeDocuments: true,
  });
  assert.equal(decorated.restaurantProfiles.length, 1);
  assert.equal(decorated.documents[0].public_id, "doc-a");
  assert.equal("url" in decorated.documents[0], false);
});

test("document-free payloads preserve same-restaurant business data", () => {
  const employee = {
    _id: "employee-shared",
    email: "employee@example.com",
    phone: "0102030405",
    restaurantProfiles: [
      {
        restaurant: "restaurant-a",
        options: { employees: true },
        employment: { contractType: "CDI" },
        shifts: [{ title: "Service", mealCount: 1 }],
        leaveRequests: [{ status: "pending" }],
        documents: [
          {
            public_id: "private-doc",
            filename: "bulletin.pdf",
            title: "Bulletin",
            asset_id: "provider-id",
            url: "https://res.cloudinary.com/demo/raw/upload/document.pdf",
          },
        ],
      },
      {
        restaurant: "restaurant-b",
        employment: { contractType: "Extra" },
      },
    ],
  };

  const serialized = decorateEmployeeForRestaurant(employee, "restaurant-a", {
    includeDocuments: false,
  });

  assert.equal(serialized.email, "employee@example.com");
  assert.equal(serialized.phone, "0102030405");
  assert.equal(serialized.employment.contractType, "CDI");
  assert.equal(serialized.shifts.length, 1);
  assert.equal(serialized.leaveRequests.length, 1);
  assert.equal(serialized.restaurantProfiles.length, 1);
  assert.deepEqual(serialized.documents, []);
  assert.deepEqual(serialized.restaurantProfiles[0].documents, []);
});

test("employee A can access employee A documents", async (t) => {
  mockDocumentAccessModels(t, {
    restaurant: accessRestaurant(),
    currentEmployee: employeeAccount("employee-a", "restaurant-a"),
  });

  const access = await getEmployeeDocumentRouteAccess(
    { user: { id: "employee-a", role: "employee" } },
    "restaurant-a",
    "employee-a",
  );
  assert.equal(access.error, undefined);
});

test("employee A cannot access employee B documents in the same restaurant", async (t) => {
  mockDocumentAccessModels(t, {
    restaurant: accessRestaurant({ employees: ["employee-a", "employee-b"] }),
    currentEmployee: employeeAccount("employee-a", "restaurant-a"),
  });

  const access = await getEmployeeDocumentRouteAccess(
    { user: { id: "employee-a", role: "employee" } },
    "restaurant-a",
    "employee-b",
  );
  assert.equal(access.error.status, 403);
});

test("employee A cannot access documents in restaurant B", async (t) => {
  mockDocumentAccessModels(t, {
    restaurant: accessRestaurant({
      _id: "restaurant-b",
      owner_id: "owner-b",
      employees: ["employee-b"],
    }),
    currentEmployee: employeeAccount("employee-a", "restaurant-a"),
  });

  const access = await getEmployeeDocumentRouteAccess(
    { user: { id: "employee-a", role: "employee" } },
    "restaurant-b",
    "employee-b",
  );
  assert.equal(access.error.status, 403);
});

test("restaurant A manager cannot target an employee only linked to restaurant B", async (t) => {
  mockDocumentAccessModels(t, {
    restaurant: accessRestaurant(),
    currentEmployee: employeeAccount("manager-a", "restaurant-a", {
      employees: true,
    }),
    targetExists: false,
  });

  const access = await getEmployeeDocumentRouteAccess(
    { user: { id: "manager-a", role: "employee" } },
    "restaurant-a",
    "employee-b",
    { managerOnly: true },
  );
  assert.equal(access.error.status, 404);
});

test("an employee without personnel permission cannot upload documents", async (t) => {
  mockDocumentAccessModels(t, {
    restaurant: accessRestaurant(),
    currentEmployee: employeeAccount("manager-a", "restaurant-a", {
      employees: false,
    }),
  });

  const access = await getEmployeeDocumentRouteAccess(
    { user: { id: "manager-a", role: "employee" } },
    "restaurant-a",
    "employee-a",
    { managerOnly: true },
  );
  assert.equal(access.error.status, 403);
});

test("owner access is tenant-bound", async (t) => {
  mockDocumentAccessModels(t, {
    restaurant: accessRestaurant({ owner_id: "owner-b" }),
  });

  const access = await getEmployeeDocumentRouteAccess(
    { user: { id: "owner-a", role: "owner" } },
    "restaurant-a",
    "employee-a",
  );
  assert.equal(access.error.status, 403);
});

test("a super-admin marker does not bypass document tenant ownership", async (t) => {
  mockDocumentAccessModels(t, {
    restaurant: accessRestaurant({ owner_id: "owner-b" }),
  });

  const access = await getEmployeeDocumentRouteAccess(
    {
      user: {
        id: "owner-a",
        role: "owner",
        superAdmin: true,
        authMethod: "super_admin",
      },
    },
    "restaurant-a",
    "employee-a",
  );
  assert.equal(access.error.status, 403);
});

test("restaurant A owner can access an employee linked to restaurant A", async (t) => {
  mockDocumentAccessModels(t, {
    restaurant: accessRestaurant(),
    targetExists: true,
  });

  const access = await getEmployeeDocumentRouteAccess(
    { user: { id: "owner-a", role: "owner" } },
    "restaurant-a",
    "employee-a",
  );
  assert.equal(access.error, undefined);
});

test("document access requires the target employee in the restaurant roster", async (t) => {
  mockDocumentAccessModels(t, {
    restaurant: accessRestaurant({ employees: [] }),
    targetExists: true,
  });

  const access = await getEmployeeDocumentRouteAccess(
    { user: { id: "owner-a", role: "owner" } },
    "restaurant-a",
    "employee-a",
  );
  assert.equal(access.error.status, 404);
});

test("unauthenticated document requests are rejected", async () => {
  const { response, result } = responseRecorder();

  await authenticateToken({ headers: {} }, response, () => {
    throw new Error("authentication unexpectedly succeeded");
  });

  assert.equal(result.status, 403);
  assert.equal(result.body.message, "Token not provided");
});

test("unknown document IDs are not resolved", () => {
  const profile = {
    documents: [{ public_id: "known-document" }],
  };

  assert.equal(
    findEmployeeDocument(profile, "known-document").public_id,
    "known-document",
  );
  assert.equal(findEmployeeDocument(profile, "forged-document"), null);
});

test("employee document routes are registered behind authentication and upload authorization", () => {
  const authenticationLayerIndex = employeesRouter.stack.findIndex(
    (layer) => layer.handle === authenticateToken,
  );
  const uploadLayerIndex = employeesRouter.stack.findIndex(
    (layer) =>
      layer.route?.path ===
        "/restaurants/:restaurantId/employees/:employeeId/documents" &&
      layer.route.methods.post,
  );
  const uploadRoute = employeesRouter.stack[uploadLayerIndex].route;

  assert.ok(authenticationLayerIndex >= 0);
  assert.ok(uploadLayerIndex > authenticationLayerIndex);
  assert.equal(
    uploadRoute.stack[0].handle,
    employeesRouter._employeeDocumentSecurity.authorizeEmployeeDocumentUpload,
  );
  assert.equal(
    uploadRoute.stack[1].handle,
    employeesRouter._employeeDocumentSecurity.handleEmployeeDocumentUpload,
  );
});

test("new uploads use authenticated Cloudinary storage with collision-resistant IDs", async (t) => {
  const employee = employeeAccount("employee-a", "restaurant-a");
  employee.save = async () => employee;
  const restaurant = {
    _id: "restaurant-a",
    owner_id: "owner-a",
    employees: [employee],
  };
  const originalEmployeeFindById = EmployeeModel.findById;
  const originalRestaurantFindById = RestaurantModel.findById;
  const originalUploadStream = cloudinary.uploader.upload_stream;
  let uploadOptions;

  EmployeeModel.findById = async () => employee;
  RestaurantModel.findById = () => ({
    populate() {
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve(restaurant).then(resolve, reject);
    },
  });
  cloudinary.uploader.upload_stream = (options, callback) => {
    uploadOptions = options;
    return new Writable({
      write(_chunk, _encoding, done) {
        done();
      },
      final(done) {
        callback(null, {
          public_id: `${options.folder}/${options.public_id}`,
          asset_id: "asset-private",
          resource_type: "raw",
          type: "authenticated",
        });
        done();
      },
    });
  };

  t.after(() => {
    EmployeeModel.findById = originalEmployeeFindById;
    RestaurantModel.findById = originalRestaurantFindById;
    cloudinary.uploader.upload_stream = originalUploadStream;
  });

  const uploadRoute = employeesRouter.stack.find(
    (layer) =>
      layer.route?.path ===
        "/restaurants/:restaurantId/employees/:employeeId/documents" &&
      layer.route.methods.post,
  ).route;
  const handler = uploadRoute.stack[uploadRoute.stack.length - 1].handle;
  const { response, result } = responseRecorder();

  await handler(
    {
      params: { restaurantId: "restaurant-a", employeeId: "employee-a" },
      user: { id: "owner-a", role: "owner" },
      files: [pdfFile()],
      body: { titles: "Septembre" },
    },
    response,
  );

  assert.equal(result.status, 200);
  assert.equal(uploadOptions.resource_type, "raw");
  assert.equal(uploadOptions.type, "authenticated");
  assert.equal(uploadOptions.overwrite, false);
  assert.match(
    uploadOptions.folder,
    /restaurant-a\/employees\/employee-a\/documents$/,
  );
  assert.match(uploadOptions.public_id, /^[0-9a-f-]{36}\.pdf$/);
  assert.notEqual(uploadOptions.public_id, "bulletin-septembre.pdf");
  assert.equal(employee.restaurantProfiles[0].documents[0].url, undefined);
  assert.equal(
    employee.restaurantProfiles[0].documents[0].delivery_type,
    "authenticated",
  );
  assert.deepEqual(result.body.restaurant.employees[0].documents, []);
  assert.equal("url" in result.body.documents[0], false);
});

test("delete does not call Cloudinary for a forged document ID", async (t) => {
  const employee = employeeAccount("employee-a", "restaurant-a");
  employee.save = async () => employee;
  const originalRestaurantFindById = RestaurantModel.findById;
  const originalEmployeeFindById = EmployeeModel.findById;
  const originalEmployeeExists = EmployeeModel.exists;
  const originalDestroy = cloudinary.uploader.destroy;
  let destroyCalls = 0;

  RestaurantModel.findById = () => ({
    select: async () => accessRestaurant(),
  });
  EmployeeModel.findById = async () => employee;
  EmployeeModel.exists = async () => true;
  cloudinary.uploader.destroy = async () => {
    destroyCalls += 1;
    return { result: "ok" };
  };

  t.after(() => {
    RestaurantModel.findById = originalRestaurantFindById;
    EmployeeModel.findById = originalEmployeeFindById;
    EmployeeModel.exists = originalEmployeeExists;
    cloudinary.uploader.destroy = originalDestroy;
  });

  const deleteRoute = employeesRouter.stack.find(
    (layer) =>
      layer.route?.path ===
        "/restaurants/:restaurantId/employees/:employeeId/documents/:public_id(*)" &&
      layer.route.methods.delete,
  ).route;
  const handler = deleteRoute.stack[deleteRoute.stack.length - 1].handle;
  const { response, result } = responseRecorder();

  await handler(
    {
      params: {
        restaurantId: "restaurant-a",
        employeeId: "employee-a",
        public_id: "restaurant-b/forged-document.pdf",
      },
      user: { id: "owner-a", role: "owner" },
    },
    response,
  );

  assert.equal(result.status, 404);
  assert.equal(result.body.message, "Document not found");
  assert.equal(destroyCalls, 0);
});

test("delete removes only the authorized private asset", async (t) => {
  const employee = employeeAccount("employee-a", "restaurant-a");
  employee.restaurantProfiles[0].documents.push({
    public_id: "restaurant-a/employee-a/private.pdf",
    filename: "private.pdf",
    title: "Private",
    resource_type: "raw",
    delivery_type: "authenticated",
  });
  employee.save = async () => employee;
  const restaurant = {
    ...accessRestaurant(),
    employees: [employee],
  };
  const originalRestaurantFindById = RestaurantModel.findById;
  const originalEmployeeFindById = EmployeeModel.findById;
  const originalEmployeeExists = EmployeeModel.exists;
  const originalDestroy = cloudinary.uploader.destroy;
  let destroyed;

  RestaurantModel.findById = () => {
    const query = {
      select: async () => accessRestaurant(),
      populate() {
        return query;
      },
      then(resolve, reject) {
        return Promise.resolve(restaurant).then(resolve, reject);
      },
    };
    return query;
  };
  EmployeeModel.findById = async () => employee;
  EmployeeModel.exists = async () => true;
  cloudinary.uploader.destroy = async (publicId, options) => {
    destroyed = { publicId, options };
    return { result: "ok" };
  };

  t.after(() => {
    RestaurantModel.findById = originalRestaurantFindById;
    EmployeeModel.findById = originalEmployeeFindById;
    EmployeeModel.exists = originalEmployeeExists;
    cloudinary.uploader.destroy = originalDestroy;
  });

  const deleteRoute = employeesRouter.stack.find(
    (layer) =>
      layer.route?.path ===
        "/restaurants/:restaurantId/employees/:employeeId/documents/:public_id(*)" &&
      layer.route.methods.delete,
  ).route;
  const handler = deleteRoute.stack[deleteRoute.stack.length - 1].handle;
  const { response, result } = responseRecorder();

  await handler(
    {
      params: {
        restaurantId: "restaurant-a",
        employeeId: "employee-a",
        public_id: "restaurant-a/employee-a/private.pdf",
      },
      user: { id: "owner-a", role: "owner" },
    },
    response,
  );

  assert.equal(result.status, 200);
  assert.equal(destroyed.publicId, "restaurant-a/employee-a/private.pdf");
  assert.equal(destroyed.options.resource_type, "raw");
  assert.equal(destroyed.options.type, "authenticated");
  assert.deepEqual(employee.restaurantProfiles[0].documents, []);
  assert.deepEqual(result.body.documents, []);
});

test("download filenames cannot inject response headers", () => {
  const disposition = getDocumentContentDisposition(
    'bulletin"; filename="attacker.html.pdf',
  );

  assert.doesNotMatch(disposition, /\r|\n/);
  assert.match(disposition, /^attachment;/);
  assert.match(disposition, /filename\*=UTF-8''/);
});

test("download responses force safe content types and disable caching", () => {
  const { response, result } = responseRecorder();

  setPrivateDocumentResponseHeaders(response);

  assert.equal(
    getDocumentContentType({
      filename: "bulletin.pdf",
      mimeType: "application/pdf",
    }),
    "application/pdf",
  );
  assert.equal(
    getDocumentContentType({
      filename: "bulletin.pdf",
      mimeType: "text/html",
    }),
    "application/octet-stream",
  );
  assert.equal(result.headers["cache-control"], "private, no-store, max-age=0");
  assert.equal(result.headers["x-content-type-options"], "nosniff");
});
