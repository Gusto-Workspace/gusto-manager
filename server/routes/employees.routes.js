const express = require("express");
const router = express.Router();
const SibApiV3Sdk = require("sib-api-v3-sdk");
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const streamifier = require("streamifier");
const axios = require("axios");
const path = require("path");
const { broadcastToRestaurant } = require("../services/sse-bus.service");

// MIDDLEWARE
const authenticateToken = require("../middleware/authentificate-token");

// MODELS
const EmployeeModel = require("../models/employee.model");
const RestaurantModel = require("../models/restaurant.model");
const OwnerModel = require("../models/owner.model");
const TrainingSession = require("../models/logs/training-session.model");

// SERVICE NOTIFS
const {
  createAndBroadcastNotification,
} = require("../services/notifications.service");
const {
  buildPlanningExportPdf,
} = require("../services/pdf/render-planning-export.service");
const {
  diffMinutes,
  toLocalDateKey,
} = require("../services/time-clock.service");

// ---------- HELPERS MULTI-RESTAURANTS / PROFILES ----------

function normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}

function employeeWorksInRestaurant(employee, restaurantId) {
  const target = String(restaurantId);
  return Array.isArray(employee.restaurants)
    ? employee.restaurants.some((id) => String(id) === target)
    : false;
}

function ensureEmployeeRestaurantLink(employee, restaurantId) {
  if (!Array.isArray(employee.restaurants)) {
    employee.restaurants = [];
  }
  const target = String(restaurantId);
  if (!employee.restaurants.some((id) => String(id) === target)) {
    employee.restaurants.push(restaurantId);
  }
}

function findRestaurantProfile(employee, restaurantId) {
  if (!Array.isArray(employee.restaurantProfiles)) return null;
  const target = String(restaurantId);
  return employee.restaurantProfiles.find(
    (p) => String(p.restaurant) === target,
  );
}

function getOrCreateRestaurantProfile(employee, restaurantId) {
  let profile = findRestaurantProfile(employee, restaurantId);
  if (!profile) {
    employee.restaurantProfiles = employee.restaurantProfiles || [];
    employee.restaurantProfiles.push({
      restaurant: restaurantId,
      options: {},
      documents: [],
      shifts: [],
      leaveRequests: [],
      snapshot: {},
    });
    profile =
      employee.restaurantProfiles[employee.restaurantProfiles.length - 1];
  }
  return profile;
}

async function getEmployeesAccessContext(request, restaurantId) {
  const restaurant = await RestaurantModel.findById(restaurantId).select(
    "name owner_id employees",
  );

  if (!restaurant) {
    return { error: { status: 404, message: "Restaurant not found" } };
  }

  if (request.user?.role === "owner") {
    if (String(restaurant.owner_id) !== String(request.user.id)) {
      return { error: { status: 403, message: "Forbidden" } };
    }

    return { restaurant, isManager: true, currentEmployee: null };
  }

  if (request.user?.role === "employee") {
    const currentEmployee = await EmployeeModel.findById(request.user.id);
    if (
      !currentEmployee ||
      !employeeWorksInRestaurant(currentEmployee, restaurantId)
    ) {
      return { error: { status: 403, message: "Forbidden" } };
    }

    const profile = findRestaurantProfile(currentEmployee, restaurantId);
    return {
      restaurant,
      isManager: profile?.options?.employees === true,
      currentEmployee,
    };
  }

  return { error: { status: 403, message: "Forbidden" } };
}

function toFilenamePart(value) {
  return String(value || "restaurant")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function dateKeyToLocalStart(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key || ""))) return null;

  const [year, month, day] = String(key)
    .split("-")
    .map((part) => Number(part));

  const date = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function getDateRangeBounds(startDateKey, endDateKey) {
  const start = dateKeyToLocalStart(startDateKey);
  const end = dateKeyToLocalStart(endDateKey);

  if (!start || !end || start > end) return null;

  const endExclusive = new Date(end.getTime());
  endExclusive.setDate(endExclusive.getDate() + 1);

  return { start, end, endExclusive };
}

function normalizePlanningTitle(value) {
  return String(value || "").trim();
}

function normalizePlanningTitleKey(value) {
  return normalizePlanningTitle(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isLeaveShift(value) {
  return (
    value?.isLeave === true ||
    value?.leaveRequestId != null ||
    ["conges", "conge"].includes(normalizePlanningTitleKey(value?.title))
  );
}

function getPlanningShiftTitle(value) {
  if (isLeaveShift(value)) return "Congés";
  return normalizePlanningTitle(value?.title);
}

function parseShiftDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isStartOfDay(value) {
  return (
    value instanceof Date && value.getHours() === 0 && value.getMinutes() === 0
  );
}

function isEndOfDay(value) {
  return (
    value instanceof Date &&
    value.getHours() === 23 &&
    value.getMinutes() === 59
  );
}

function getInclusiveDaySpan(start, end) {
  const startKey = toLocalDateKey(start);
  const endKey = toLocalDateKey(end);
  const startDay = dateKeyToLocalStart(startKey);
  const endDay = dateKeyToLocalStart(endKey);

  if (!startDay || !endDay) return 1;

  return (
    Math.max(
      0,
      Math.round((endDay.getTime() - startDay.getTime()) / 86400000),
    ) + 1
  );
}

function isFullDayLeave(start, end, leaveShift) {
  return leaveShift && isStartOfDay(start) && isEndOfDay(end);
}

function getOrCreatePlanningDay(planningDays, dayKey) {
  const existing = planningDays.get(dayKey);
  if (existing) return existing;

  const next = {
    date: dayKey,
    shifts: [],
    shiftCount: 0,
    totalMinutes: 0,
  };

  planningDays.set(dayKey, next);
  return next;
}

function formatTimeLabel(value) {
  if (!value) return "-";

  try {
    return new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(value));
  } catch {
    return "-";
  }
}

function getShiftEndLabel(startValue, endValue) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "-";

  const endLabel = formatTimeLabel(end);
  const startDay = toLocalDateKey(start);
  const endDay = toLocalDateKey(end);

  if (startDay === endDay) return endLabel;

  const dayDelta = Math.max(
    1,
    Math.round(
      (dateKeyToLocalStart(endDay).getTime() -
        dateKeyToLocalStart(startDay).getTime()) /
        86400000,
    ),
  );

  return `${endLabel} (+${dayDelta}j)`;
}

function buildPlanningExportEmployee(employee, restaurantId, bounds) {
  const profile = findRestaurantProfile(employee, restaurantId);
  const snapshot = profile?.snapshot || {};
  const planningDays = new Map();
  let shiftCount = 0;
  let plannedMinutes = 0;

  const shifts = [...(profile?.shifts || [])].sort(
    (left, right) => new Date(left.start) - new Date(right.start),
  );

  for (const shift of shifts) {
    const shiftStart = new Date(shift.start);
    const shiftEnd = new Date(shift.end);
    const leaveShift = isLeaveShift(shift);

    if (
      Number.isNaN(shiftStart.getTime()) ||
      Number.isNaN(shiftEnd.getTime())
    ) {
      continue;
    }

    if (shiftStart >= bounds.endExclusive || shiftEnd < bounds.start) {
      continue;
    }

    const durationMinutes = diffMinutes(shiftStart, shiftEnd);
    const fullDayLeave = isFullDayLeave(shiftStart, shiftEnd, leaveShift);

    if (fullDayLeave) {
      const firstVisibleDay = new Date(
        Math.max(
          dateKeyToLocalStart(toLocalDateKey(shiftStart)).getTime(),
          bounds.start.getTime(),
        ),
      );
      const lastVisibleDay = new Date(
        Math.min(
          dateKeyToLocalStart(toLocalDateKey(shiftEnd)).getTime(),
          bounds.end.getTime(),
        ),
      );

      for (
        const cursor = new Date(firstVisibleDay.getTime());
        cursor <= lastVisibleDay;
        cursor.setDate(cursor.getDate() + 1)
      ) {
        const current = getOrCreatePlanningDay(
          planningDays,
          toLocalDateKey(cursor),
        );
        current.shifts.push({
          title: getPlanningShiftTitle(shift),
          textLabel: getPlanningShiftTitle(shift),
          isLeave: true,
        });
      }

      continue;
    }

    const dayKey = toLocalDateKey(shiftStart);
    const current = getOrCreatePlanningDay(planningDays, dayKey);

    current.shifts.push({
      title: getPlanningShiftTitle(shift),
      startLabel: formatTimeLabel(shiftStart),
      endLabel: getShiftEndLabel(shiftStart, shiftEnd),
      durationMinutes,
      isLeave: leaveShift,
    });
    if (!leaveShift) {
      current.shiftCount += 1;
      current.totalMinutes += durationMinutes;
      shiftCount += 1;
      plannedMinutes += durationMinutes;
    }
    planningDays.set(dayKey, current);
  }

  return {
    employee: {
      id: employee?._id ? String(employee._id) : "",
      firstname: snapshot.firstname || employee?.firstname || "",
      lastname: snapshot.lastname || employee?.lastname || "",
      post: snapshot.post || employee?.post || "",
    },
    totals: {
      shiftCount,
      plannedMinutes,
    },
    days: Array.from(planningDays.values()).sort((left, right) =>
      left.date.localeCompare(right.date),
    ),
  };
}

// ---------- CLOUDINARY / MULTER ----------

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = multer.memoryStorage();
const upload = multer({ storage });

const uploadFromBuffer = (buffer, folder) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, format: "webp" },
      (error, result) => {
        if (result) resolve(result);
        else reject(error);
      },
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
};

// ---------- BREVO ----------

function instantiateClient() {
  try {
    const defaultClient = SibApiV3Sdk.ApiClient.instance;
    const apiKey = defaultClient.authentications["api-key"];
    apiKey.apiKey = process.env.BREVO_API_KEY;
    return defaultClient;
  } catch (err) {
    console.error("Erreur d'instanciation du client Brevo:", err);
    throw err;
  }
}

function sendTransactionalEmail(params) {
  try {
    instantiateClient();

    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

    sendSmtpEmail.sender = {
      email: "no-reply@gusto-manager.com",
      name: "Gusto Manager",
    };
    sendSmtpEmail.to = params.to;
    sendSmtpEmail.subject = params.subject;
    sendSmtpEmail.htmlContent = params.htmlContent;

    return apiInstance.sendTransacEmail(sendSmtpEmail);
  } catch (err) {
    console.error("Erreur lors de l'envoi de l'email :", err);
    throw err;
  }
}

// Générateur de mot de passe 8 caractères
function generatePassword() {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";
  const specials = "!@#$%^&*()_+-=[]{}|;:,.<>?";
  const all = upper + upper.toLowerCase() + digits + specials;

  let pw = [
    upper[Math.floor(Math.random() * upper.length)],
    digits[Math.floor(Math.random() * digits.length)],
    specials[Math.floor(Math.random() * specials.length)],
  ];
  while (pw.length < 8) {
    pw.push(all[Math.floor(Math.random() * all.length)]);
  }
  return pw.sort(() => 0.5 - Math.random()).join("");
}

// ---------- ADD / IMPORT EMPLOYEE (SNAPSHOT + MULTI-RESTOS) ----------

router.post(
  "/restaurants/:id/employees",
  upload.single("profilePicture"),
  async (req, res) => {
    const restaurantId = req.params.id;

    const restaurant = await RestaurantModel.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    const {
      lastName,
      firstName,
      email,
      secuNumber,
      address,
      emergencyContact,
      phone,
      post,
      dateOnPost,
    } = req.body;

    const normalizedEmail = normalizeEmail(email);

    try {
      let profilePicture = null;
      if (req.file) {
        const cloudinaryResponse = await uploadFromBuffer(
          req.file.buffer,
          `Gusto_Workspace/restaurants/${restaurantId}/employees`,
        );
        profilePicture = {
          url: cloudinaryResponse.secure_url,
          public_id: cloudinaryResponse.public_id,
        };
      }

      // 1) Vérifier si un employé existe déjà avec cet email
      let existingEmployee = null;
      if (normalizedEmail) {
        existingEmployee = await EmployeeModel.findOne({
          email: normalizedEmail,
        });
      }

      // ---------- CAS 1 : NOUVEL EMPLOYÉ ----------
      if (!existingEmployee) {
        const temporaryPassword = generatePassword();
        const newEmployee = new EmployeeModel({
          lastname: lastName,
          firstname: firstName,
          email: normalizedEmail || undefined,
          phone: phone,
          secuNumber: secuNumber,
          address: address,
          emergencyContact: emergencyContact,
          password: temporaryPassword,
          post: post,
          dateOnPost: dateOnPost ? new Date(dateOnPost) : undefined,
          profilePicture,
          restaurants: [restaurantId],
          restaurantProfiles: [
            {
              restaurant: restaurantId,
              options: {},
              documents: [],
              shifts: [],
              leaveRequests: [],
              snapshot: {
                firstname: firstName,
                lastname: lastName,
                email: normalizedEmail || undefined,
                phone,
                secuNumber,
                address,
                emergencyContact,
                post,
                dateOnPost: dateOnPost ? new Date(dateOnPost) : undefined,
              },
            },
          ],
        });

        await newEmployee.save();

        restaurant.employees.push(newEmployee._id);
        await restaurant.save();

        if (newEmployee.email) {
          const emailParams = {
            to: [
              {
                email: newEmployee.email,
                name: newEmployee.firstname,
              },
            ],
            subject: "Votre accès employé Gusto Manager",
            htmlContent: `
              <p>Bonjour ${newEmployee.firstname},</p>
              <p>Votre compte employé a été créé avec succès.</p>
              <p>Connectez-vous ici : 
                <a href="https://gusto-manager.com/dashboard/login">
                  https://gusto-manager.com/dashboard/login
                </a>
              </p>
              <p><strong>Identifiant :</strong> ${newEmployee.email}<br/>
                 <strong>Mot de passe temporaire :</strong> ${temporaryPassword}
              </p>
              <p>Merci de modifier votre mot de passe lors de votre première connexion.</p>
              <p>— L’équipe Gusto Manager</p>
            `,
          };
          sendTransactionalEmail(emailParams)
            .then(() => console.log("Mail création employé envoyé"))
            .catch((err) =>
              console.error("Erreur mail création employé :", err),
            );
        }

        const updatedRestaurant = await RestaurantModel.findById(restaurantId)
          .populate("owner_id", "firstname")
          .populate("menus")
          .populate("employees");

        return res.status(201).json({ restaurant: updatedRestaurant });
      }

      // ---------- CAS 2 : EMPLOYÉ EXISTANT ----------
      ensureEmployeeRestaurantLink(existingEmployee, restaurantId);

      // 🔹 Photo globale (si upload)
      if (profilePicture) {
        existingEmployee.profilePicture = profilePicture;
      }

      // 🔹 Mettre à jour les infos "globales" de l'employé
      //    -> on prend ce qui vient du formulaire si ce n'est pas vide,
      //       sinon on garde ce qu'il y avait déjà.
      if (typeof lastName !== "undefined" && lastName !== "") {
        existingEmployee.lastname = lastName;
      }
      if (typeof firstName !== "undefined" && firstName !== "") {
        existingEmployee.firstname = firstName;
      }
      if (typeof phone !== "undefined" && phone !== "") {
        existingEmployee.phone = phone;
      }
      if (typeof secuNumber !== "undefined" && secuNumber !== "") {
        existingEmployee.secuNumber = secuNumber;
      }
      if (typeof address !== "undefined" && address !== "") {
        existingEmployee.address = address;
      }
      if (typeof emergencyContact !== "undefined" && emergencyContact !== "") {
        existingEmployee.emergencyContact = emergencyContact;
      }
      if (typeof post !== "undefined" && post !== "") {
        existingEmployee.post = post;
      }
      if (typeof dateOnPost !== "undefined" && dateOnPost !== "") {
        existingEmployee.dateOnPost = new Date(dateOnPost);
      }

      // 🔹 Email global normalisé
      if (typeof normalizedEmail !== "undefined" && normalizedEmail !== "") {
        existingEmployee.email = normalizedEmail;
      }

      // 🔹 Profil spécifique à CE restaurant
      const profile = getOrCreateRestaurantProfile(
        existingEmployee,
        restaurantId,
      );

      if (!profile.snapshot) {
        profile.snapshot = {};
      }

      // Snapshot = données figées pour CE restaurant
      profile.snapshot.firstname =
        typeof firstName !== "undefined" && firstName !== ""
          ? firstName
          : existingEmployee.firstname;

      profile.snapshot.lastname =
        typeof lastName !== "undefined" && lastName !== ""
          ? lastName
          : existingEmployee.lastname;

      profile.snapshot.email =
        typeof normalizedEmail !== "undefined" && normalizedEmail !== ""
          ? normalizedEmail
          : existingEmployee.email;

      profile.snapshot.phone =
        typeof phone !== "undefined" && phone !== ""
          ? phone
          : existingEmployee.phone;

      profile.snapshot.secuNumber =
        typeof secuNumber !== "undefined" && secuNumber !== ""
          ? secuNumber
          : existingEmployee.secuNumber;

      profile.snapshot.address =
        typeof address !== "undefined" && address !== ""
          ? address
          : existingEmployee.address;

      profile.snapshot.emergencyContact =
        typeof emergencyContact !== "undefined" && emergencyContact !== ""
          ? emergencyContact
          : existingEmployee.emergencyContact;

      profile.snapshot.post =
        typeof post !== "undefined" && post !== ""
          ? post
          : existingEmployee.post;

      profile.snapshot.dateOnPost =
        typeof dateOnPost !== "undefined" && dateOnPost !== ""
          ? new Date(dateOnPost)
          : existingEmployee.dateOnPost || profile.snapshot.dateOnPost;

      // ✅ Important : indiquer à Mongoose que restaurantProfiles a changé
      existingEmployee.markModified("restaurantProfiles");

      await existingEmployee.save();

      if (
        !restaurant.employees.some(
          (id) => String(id) === String(existingEmployee._id),
        )
      ) {
        restaurant.employees.push(existingEmployee._id);
        await restaurant.save();
      }

      const updatedRestaurant = await RestaurantModel.findById(restaurantId)
        .populate("owner_id", "firstname")
        .populate("menus")
        .populate("employees");

      return res.status(200).json({ restaurant: updatedRestaurant });
    } catch (error) {
      console.error("Error creating/importing employee:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  },
);

// ---------- UPDATE EMPLOYEE POUR UN RESTO DONNÉ (options par resto) ----------

router.patch(
  "/restaurants/:restaurantId/employees/:employeeId",
  upload.single("profilePicture"),
  async (req, res) => {
    try {
      const { restaurantId, employeeId } = req.params;
      const {
        firstname,
        lastname,
        email,
        phone,
        secuNumber,
        address,
        emergencyContact,
        post,
        dateOnPost,
        options,
      } = req.body;

      const employee = await EmployeeModel.findById(employeeId);
      if (!employee || !employeeWorksInRestaurant(employee, restaurantId)) {
        return res.status(404).json({ message: "Employee not found" });
      }

      // Photo globale
      if (req.file) {
        if (employee.profilePicture?.public_id) {
          await cloudinary.uploader.destroy(employee.profilePicture.public_id);
        }
        const result = await uploadFromBuffer(
          req.file.buffer,
          `Gusto_Workspace/restaurants/${restaurantId}/employees`,
        );
        employee.profilePicture = {
          url: result.secure_url,
          public_id: result.public_id,
        };
      }

      // Profil spécifique à CE resto
      const profile = getOrCreateRestaurantProfile(employee, restaurantId);

      if (!profile.snapshot) {
        profile.snapshot = {};
      }

      // 🔥 Log temporaire pour voir ce qui arrive
      // console.log("PATCH body ===>", req.body);

      if (firstname !== undefined) profile.snapshot.firstname = firstname;
      if (lastname !== undefined) profile.snapshot.lastname = lastname;
      if (phone !== undefined) profile.snapshot.phone = phone;
      if (secuNumber !== undefined) profile.snapshot.secuNumber = secuNumber;
      if (address !== undefined) profile.snapshot.address = address;
      if (emergencyContact !== undefined)
        profile.snapshot.emergencyContact = emergencyContact;
      if (post !== undefined) profile.snapshot.post = post;
      if (dateOnPost !== undefined) {
        profile.snapshot.dateOnPost = dateOnPost
          ? new Date(dateOnPost)
          : undefined;
      }

      const normalizedEmail = normalizeEmail(email);
      if (email !== undefined) {
        profile.snapshot.email = normalizedEmail;
      }

      if (options !== undefined) {
        profile.options = options;
      }

      // ✅ Important : forcer mongoose à considérer restaurantProfiles comme modifié
      employee.markModified("restaurantProfiles");

      await employee.save();

      const updatedRestaurant = await RestaurantModel.findById(restaurantId)
        .populate("owner_id", "firstname")
        .populate("menus")
        .populate("employees");

      res.status(200).json({ restaurant: updatedRestaurant });
    } catch (error) {
      console.error("Error updating employee:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  },
);

// ---------- DOCUMENTS (par restaurant) ----------

// UPLOAD DOCUMENTS
router.post(
  "/restaurants/:restaurantId/employees/:employeeId/documents",
  upload.array("documents"),
  async (req, res) => {
    try {
      const { restaurantId, employeeId } = req.params;

      const employee = await EmployeeModel.findById(employeeId);
      if (!employee || !employeeWorksInRestaurant(employee, restaurantId)) {
        return res.status(404).json({ message: "Employee not found" });
      }

      const profile = getOrCreateRestaurantProfile(employee, restaurantId);

      let titles = [];
      if (req.body.titles) {
        titles = Array.isArray(req.body.titles)
          ? req.body.titles
          : [req.body.titles];
      }

      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const title = titles[i] || "";

        const ext = path.extname(file.originalname);
        const basename = path.basename(file.originalname, ext);
        const safeName = basename
          .replace(/\s+/g, "_")
          .replace(/[^a-zA-Z0-9_\-]/g, "");

        const folder = `Gusto_Workspace/restaurants/${restaurantId}/employees/docs`;

        const result = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              resource_type: "raw",
              folder,
              public_id: safeName,
              overwrite: true,
            },
            (err, r) => {
              if (err) return reject(err);
              resolve(r);
            },
          );
          streamifier.createReadStream(file.buffer).pipe(uploadStream);
        });

        profile.documents.push({
          url: result.secure_url,
          public_id: result.public_id,
          filename: file.originalname,
          title: title,
        });
      }

      await employee.save();

      const updatedRestaurant =
        await RestaurantModel.findById(restaurantId).populate("employees");

      return res.json({ restaurant: updatedRestaurant });
    } catch (err) {
      console.error("Error uploading documents:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

// LIST DOCUMENTS
router.get(
  "/restaurants/:restaurantId/employees/:employeeId/documents",
  async (req, res) => {
    try {
      const { restaurantId, employeeId } = req.params;

      const employee = await EmployeeModel.findById(employeeId).lean();
      if (!employee || !employeeWorksInRestaurant(employee, restaurantId)) {
        return res.status(404).json({ message: "Employee not found" });
      }

      const profile = (employee.restaurantProfiles || []).find(
        (p) => String(p.restaurant) === String(restaurantId),
      );

      return res.json({ documents: profile?.documents || [] });
    } catch (err) {
      console.error("Error fetching employee documents:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

// DOWNLOAD DOCUMENT
router.get(
  "/restaurants/:restaurantId/employees/:employeeId/documents/:public_id(*)/download",
  async (req, res) => {
    try {
      const { restaurantId, employeeId, public_id } = req.params;
      const emp = await EmployeeModel.findById(employeeId);
      if (!emp || !employeeWorksInRestaurant(emp, restaurantId)) {
        return res.status(404).json({ message: "Employee not found" });
      }

      const profile = findRestaurantProfile(emp, restaurantId);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      const doc = (profile.documents || []).find(
        (d) => d.public_id === public_id,
      );
      if (!doc) {
        return res.status(404).json({ message: "Document not found" });
      }

      const response = await axios.get(doc.url, { responseType: "stream" });

      res.setHeader("Content-Type", response.headers["content-type"]);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${doc.filename}"`,
      );

      response.data.pipe(res);
    } catch (err) {
      console.error("Error in download route:", err);
      res.status(500).json({ message: "Server error" });
    }
  },
);

// DELETE DOCUMENT
router.delete(
  "/restaurants/:restaurantId/employees/:employeeId/documents/:public_id(*)",
  async (req, res) => {
    const { restaurantId, employeeId, public_id } = req.params;

    try {
      const employee = await EmployeeModel.findById(employeeId);
      if (!employee || !employeeWorksInRestaurant(employee, restaurantId)) {
        return res.status(404).json({ message: "Employee not found" });
      }

      const profile = findRestaurantProfile(employee, restaurantId);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      await cloudinary.uploader.destroy(public_id, {
        resource_type: "raw",
      });

      profile.documents = profile.documents.filter(
        (doc) => doc.public_id !== public_id,
      );

      await employee.save();

      const updatedRestaurant = await RestaurantModel.findById(restaurantId)
        .populate("owner_id", "firstname")
        .populate("menus")
        .populate("employees");

      return res.json({ restaurant: updatedRestaurant });
    } catch (err) {
      return res
        .status(500)
        .json({ message: "Internal server error", error: err.message });
    }
  },
);

// ---------- DELETE EMPLOYEE D'UN RESTO (multi-resto) ----------

router.delete(
  "/restaurants/:restaurantId/employees/:employeeId",
  async (req, res) => {
    try {
      const { restaurantId, employeeId } = req.params;

      const restaurant =
        await RestaurantModel.findById(restaurantId).populate("employees");
      if (!restaurant) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      const employee = await EmployeeModel.findById(employeeId);
      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }

      // 🔹 0) Récupérer le profil pour CE restaurant (pour supprimer ses docs)
      const profileForRestaurant =
        (employee.restaurantProfiles || []).find(
          (p) => String(p.restaurant) === String(restaurantId),
        ) || null;

      // 🔹 1) Supprimer les documents Cloudinary du profil de CE restaurant
      if (
        profileForRestaurant &&
        Array.isArray(profileForRestaurant.documents)
      ) {
        for (const doc of profileForRestaurant.documents) {
          if (!doc.public_id) continue;
          try {
            await cloudinary.uploader.destroy(doc.public_id, {
              resource_type: "raw",
            });
          } catch (err) {
            console.warn(
              `Erreur lors de la suppression du document employé ${employeeId} (resto ${restaurantId}) :`,
              err?.message || err,
            );
          }
        }
      }

      // 2) Détacher l'employé du restaurant
      restaurant.employees = restaurant.employees.filter(
        (e) => String(e._id || e) !== String(employeeId),
      );
      await restaurant.save();

      // 3) Retirer ce restaurant de la liste de l'employé
      employee.restaurants = (employee.restaurants || []).filter(
        (id) => String(id) !== String(restaurantId),
      );

      // 4) Supprimer le profil pour ce restaurant
      employee.restaurantProfiles =
        employee.restaurantProfiles?.filter(
          (p) => String(p.restaurant) !== String(restaurantId),
        ) || [];

      // 5) Si l'employé n'est plus rattaché à aucun resto → suppression totale
      if (!employee.restaurants || employee.restaurants.length === 0) {
        // 🔹 Photo de profil
        if (employee.profilePicture?.public_id) {
          try {
            await cloudinary.uploader.destroy(
              employee.profilePicture.public_id,
            );
          } catch (err) {
            console.warn(
              "Erreur lors de la suppression de la photo employé :",
              err?.message || err,
            );
          }
        }

        // 🔹 Supprimer aussi les documents des AUTRES profils restants (par sécurité)
        if (Array.isArray(employee.restaurantProfiles)) {
          for (const prof of employee.restaurantProfiles) {
            if (!Array.isArray(prof.documents)) continue;
            for (const doc of prof.documents) {
              if (!doc.public_id) continue;
              try {
                await cloudinary.uploader.destroy(doc.public_id, {
                  resource_type: "raw",
                });
              } catch (err) {
                console.warn(
                  `Erreur lors de la suppression d'un document (cleanup total employé ${employeeId}) :`,
                  err?.message || err,
                );
              }
            }
          }
        }

        try {
          await cloudinary.api.delete_folder(
            `Gusto_Workspace/employees/${employeeId}`,
          );
        } catch (err) {
          const httpCode = err?.http_code || err?.error?.http_code;

          if (httpCode === 404) {
          } else {
            console.warn(
              `Erreur lors de la suppression du dossier Cloudinary de l'employé ${employeeId} :`,
              err?.error?.message || err?.message || err,
            );
          }
        }

        await EmployeeModel.findByIdAndDelete(employeeId);
      } else {
        await employee.save();
      }

      const updatedRestaurant = await RestaurantModel.findById(restaurantId)
        .populate("owner_id", "firstname")
        .populate("menus")
        .populate("employees");

      if (!updatedRestaurant) {
        return res
          .status(404)
          .json({ message: "Restaurant not found after update" });
      }

      res.status(200).json({ restaurant: updatedRestaurant });
    } catch (error) {
      console.error("Error deleting employee:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  },
);

// ---------- SHIFTS (par restaurant) ----------

// GET SHIFTS
router.get(
  "/restaurants/:restaurantId/employees/:employeeId/shifts",
  async (req, res) => {
    try {
      const { restaurantId, employeeId } = req.params;
      const employee = await EmployeeModel.findById(employeeId).lean();
      if (!employee || !employeeWorksInRestaurant(employee, restaurantId)) {
        return res.status(404).json({ message: "Employé non trouvé" });
      }

      const profile = (employee.restaurantProfiles || []).find(
        (p) => String(p.restaurant) === String(restaurantId),
      );

      return res.json({ shifts: profile?.shifts || [] });
    } catch (err) {
      console.error("Erreur fetch shifts:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

// POST SHIFT
router.post(
  "/restaurants/:restaurantId/employees/:employeeId/shifts",
  async (req, res) => {
    const { restaurantId, employeeId } = req.params;
    const {
      title,
      start,
      end,
      isLeave = false,
      leaveRequestId = null,
    } = req.body;

    const emp = await EmployeeModel.findById(employeeId);
    if (!emp || !employeeWorksInRestaurant(emp, restaurantId)) {
      return res.status(404).json({ message: "Employé non trouvé" });
    }

    const parsedStart = parseShiftDate(start);
    const parsedEnd = parseShiftDate(end);

    if (!parsedStart || !parsedEnd || parsedEnd <= parsedStart) {
      return res.status(400).json({ message: "Dates de shift invalides" });
    }

    const profile = getOrCreateRestaurantProfile(emp, restaurantId);
    const leaveShift =
      isLeave === true || leaveRequestId != null || isLeaveShift({ title });

    profile.shifts.push({
      title: leaveShift ? "" : normalizePlanningTitle(title),
      start: parsedStart,
      end: parsedEnd,
      isLeave: leaveShift,
      leaveRequestId: leaveRequestId || null,
    });

    await emp.save();
    const created = profile.shifts[profile.shifts.length - 1];
    return res.status(201).json({ shift: created, shifts: profile.shifts });
  },
);

// PUT SHIFT
router.put(
  "/restaurants/:restaurantId/employees/:employeeId/shifts/:shiftId",
  async (req, res) => {
    const { restaurantId, employeeId, shiftId } = req.params;
    const { title, start, end, isLeave, leaveRequestId } = req.body;

    const emp = await EmployeeModel.findById(employeeId);
    if (!emp || !employeeWorksInRestaurant(emp, restaurantId)) {
      return res.status(404).json({ message: "Employé non trouvé" });
    }

    const profile = getOrCreateRestaurantProfile(emp, restaurantId);
    const shift = profile.shifts.id(shiftId);
    if (!shift) return res.status(404).json({ message: "Shift non trouvé" });

    if (title !== undefined) shift.title = normalizePlanningTitle(title);
    if (start !== undefined) {
      const parsedStart = parseShiftDate(start);
      if (!parsedStart) {
        return res.status(400).json({ message: "Date de début invalide" });
      }
      shift.start = parsedStart;
    }
    if (end !== undefined) {
      const parsedEnd = parseShiftDate(end);
      if (!parsedEnd) {
        return res.status(400).json({ message: "Date de fin invalide" });
      }
      shift.end = parsedEnd;
    }
    if (leaveRequestId !== undefined) {
      shift.leaveRequestId = leaveRequestId || null;
    }
    if (isLeave !== undefined) {
      shift.isLeave = isLeave === true;
    }

    if (shift.end <= shift.start) {
      return res.status(400).json({ message: "Dates de shift invalides" });
    }

    if (isLeaveShift(shift)) {
      shift.isLeave = true;
      shift.title = "";
    }

    await emp.save();
    return res.json({ shift, shifts: profile.shifts });
  },
);

// DELETE SHIFT
router.delete(
  "/restaurants/:restaurantId/employees/:employeeId/shifts/:shiftId",
  async (req, res) => {
    const { restaurantId, employeeId, shiftId } = req.params;

    const emp = await EmployeeModel.findById(employeeId);
    if (!emp || !employeeWorksInRestaurant(emp, restaurantId)) {
      return res.status(404).json({ message: "Employé non trouvé" });
    }

    const profile = getOrCreateRestaurantProfile(emp, restaurantId);
    const shift = profile.shifts.id(shiftId);
    if (!shift) return res.status(404).json({ message: "Shift non trouvé" });

    shift.deleteOne();
    await emp.save();
    return res.json({ shifts: profile.shifts });
  },
);

router.post(
  "/restaurants/:restaurantId/employees/planning/export/pdf",
  authenticateToken,
  async (req, res) => {
    try {
      const { restaurantId } = req.params;
      const from = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.from || ""))
        ? String(req.body.from)
        : null;
      const to = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.to || ""))
        ? String(req.body.to)
        : null;
      const bounds = from && to ? getDateRangeBounds(from, to) : null;

      if (!bounds) {
        return res.status(400).json({
          message: "Les dates de debut et de fin sont invalides.",
        });
      }

      const accessContext = await getEmployeesAccessContext(req, restaurantId);
      if (accessContext.error) {
        return res
          .status(accessContext.error.status)
          .json({ message: accessContext.error.message });
      }

      if (!accessContext.isManager) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const requestedEmployeeIds = Array.isArray(req.body?.employeeIds)
        ? req.body.employeeIds.map((value) => String(value))
        : [];
      const fallbackEmployeeIds = (
        accessContext.restaurant?.employees || []
      ).map((value) => String(value));
      const selectedEmployeeIds = Array.from(
        new Set(
          requestedEmployeeIds.length
            ? requestedEmployeeIds
            : fallbackEmployeeIds,
        ),
      );

      if (!selectedEmployeeIds.length) {
        return res.status(400).json({ message: "Aucun salarie selectionne." });
      }

      const employees = await EmployeeModel.find({
        _id: { $in: selectedEmployeeIds },
        restaurants: restaurantId,
      }).lean();

      if (!employees.length) {
        return res.status(404).json({ message: "Employees not found" });
      }

      const employeeOrder = new Map(
        selectedEmployeeIds.map((id, index) => [String(id), index]),
      );
      const orderedEmployees = [...employees].sort((left, right) => {
        const leftOrder = employeeOrder.get(String(left._id));
        const rightOrder = employeeOrder.get(String(right._id));

        if (Number.isFinite(leftOrder) && Number.isFinite(rightOrder)) {
          return leftOrder - rightOrder;
        }

        return String(left._id).localeCompare(String(right._id));
      });

      const payload = orderedEmployees.map((employee) =>
        buildPlanningExportEmployee(employee, restaurantId, bounds),
      );

      const pdfBuffer = await buildPlanningExportPdf({
        restaurantName: accessContext.restaurant?.name || "Restaurant",
        startDate: from,
        endDate: to,
        employees: payload,
      });

      const safeRestaurantName = toFilenamePart(accessContext.restaurant?.name);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="planning-${safeRestaurantName}-${from}-au-${to}.pdf"`,
      );

      return res.send(pdfBuffer);
    } catch (error) {
      console.error("Error exporting planning pdf:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

// ---------- DEMANDES DE CONGÉS (par restaurant) ----------

// CREATE LEAVE-REQUEST
router.post(
  "/restaurants/:restaurantId/employees/:employeeId/leave-requests",
  async (req, res) => {
    try {
      const { restaurantId, employeeId } = req.params;
      const { start, end, type } = req.body;
      if (!start || !end) {
        return res.status(400).json({ message: "start et end sont requis" });
      }

      const emp = await EmployeeModel.findById(employeeId);
      if (!emp || !employeeWorksInRestaurant(emp, restaurantId)) {
        return res.status(404).json({ message: "Employee not found" });
      }

      const profile = getOrCreateRestaurantProfile(emp, restaurantId);

      profile.leaveRequests.push({
        start: new Date(start),
        end: new Date(end),
        type: ["full", "morning", "afternoon"].includes(type) ? type : "full",
        createdAt: new Date(),
        status: "pending",
      });
      await emp.save();

      const last = profile.leaveRequests[profile.leaveRequests.length - 1];

      // Notifie le restaurant concerné
      broadcastToRestaurant(String(restaurantId), {
        type: "leave_request_created",
        employeeId: String(emp._id),
        restaurantId: String(restaurantId),
        leaveRequest: last,
      });

      await createAndBroadcastNotification({
        restaurantId: String(restaurantId),
        module: "employees",
        type: "leave_request_created",
        data: {
          employeeName: `${emp?.firstname || ""} ${emp?.lastname || ""}`.trim(),
          employeeId: String(emp._id),
          leaveRequestId: String(last._id),
          start: last?.start,
          end: last?.end,
          type: last?.type,
          status: last?.status,
        },
      });

      return res.status(201).json(profile.leaveRequests);
    } catch (err) {
      console.error("Erreur création leaveRequest:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

// LIST LEAVE-REQUESTS
router.get(
  "/restaurants/:restaurantId/employees/:employeeId/leave-requests",
  async (req, res) => {
    try {
      const { restaurantId, employeeId } = req.params;
      const emp = await EmployeeModel.findById(employeeId).lean();
      if (!emp || !employeeWorksInRestaurant(emp, restaurantId)) {
        return res.status(404).json({ message: "Employee not found" });
      }

      const profile = (emp.restaurantProfiles || []).find(
        (p) => String(p.restaurant) === String(restaurantId),
      );

      return res.json(profile?.leaveRequests || []);
    } catch (err) {
      console.error("Erreur list leaveRequests:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

// UPDATE LEAVE-REQUEST STATUS
router.put(
  "/restaurants/:restaurantId/employees/:employeeId/leave-requests/:reqId",
  async (req, res) => {
    const { restaurantId, employeeId, reqId } = req.params;
    const { status } = req.body;
    if (!["pending", "approved", "rejected", "canceled"].includes(status)) {
      return res.status(400).json({ message: "status invalide" });
    }

    const emp = await EmployeeModel.findById(employeeId);
    if (!emp || !employeeWorksInRestaurant(emp, restaurantId)) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const profile = getOrCreateRestaurantProfile(emp, restaurantId);
    const lr = profile.leaveRequests.id(reqId);
    if (!lr) return res.status(404).json({ message: "Request not found" });

    lr.status = status;

    if (status === "approved") {
      const already = profile.shifts.some(
        (s) => String(s.leaveRequestId) === String(lr._id),
      );
      if (!already) {
        profile.shifts.push({
          title: "",
          start: lr.start,
          end: lr.end,
          isLeave: true,
          leaveRequestId: lr._id,
        });
      }
    }

    if (status === "canceled") {
      profile.shifts = profile.shifts.filter(
        (s) => String(s.leaveRequestId) !== String(lr._id),
      );
    }

    await emp.save();
    return res.json({
      leaveRequest: lr,
      shifts: profile.shifts,
    });
  },
);

// DELETE LEAVE-REQUEST
router.delete(
  "/restaurants/:restaurantId/employees/:employeeId/leave-requests/:reqId",
  async (req, res) => {
    const { restaurantId, employeeId, reqId } = req.params;

    const emp = await EmployeeModel.findById(employeeId);
    if (!emp || !employeeWorksInRestaurant(emp, restaurantId)) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const profile = getOrCreateRestaurantProfile(emp, restaurantId);
    const lr = profile.leaveRequests.id(reqId);
    if (!lr) return res.status(404).json({ message: "Request not found" });

    profile.shifts = profile.shifts.filter(
      (s) => String(s.leaveRequestId) !== String(reqId),
    );

    lr.deleteOne();
    await emp.save();

    return res.json({
      leaveRequests: profile.leaveRequests,
      shifts: profile.shifts,
    });
  },
);

// ---------- EMPLOYEE ME / UPDATE DATA / PASSWORD ----------

router.get("/employees/me", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "employee") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const emp = await EmployeeModel.findById(req.user.id).select("-password");
    if (!emp) return res.status(404).json({ message: "Employee not found" });

    // 1) Tous les restos où il travaille
    const restaurantIds = Array.isArray(emp.restaurants) ? emp.restaurants : [];
    const restaurants = await RestaurantModel.find({
      _id: { $in: restaurantIds },
    })
      .select("name _id")
      .lean();

    // 2) Resto courant (via token) + profil courant
    const restaurantIdFromToken = req.user.restaurantId;
    let restaurant = null;
    let currentProfile = null;

    if (restaurantIdFromToken) {
      restaurant = await RestaurantModel.findById(restaurantIdFromToken)
        .populate("owner_id", "firstname")
        .populate("employees")
        .populate("menus");

      currentProfile = findRestaurantProfile(emp, restaurantIdFromToken);
    }

    // 3) Fallback : si token n’a pas de restaurantId, on prend le premier
    if (!restaurant && restaurants.length > 0) {
      const firstId = restaurants[0]._id;
      restaurant = await RestaurantModel.findById(firstId)
        .populate("owner_id", "firstname")
        .populate("employees")
        .populate("menus");

      currentProfile = findRestaurantProfile(emp, firstId);
    }

    return res.json({
      employee: emp,
      restaurant,
      currentProfile,
      restaurants,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
});

router.put(
  "/employees/update-data",
  authenticateToken,
  upload.single("profilePicture"),
  async (req, res) => {
    try {
      if (req.user.role !== "employee") {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { firstname, lastname, email, phone, removeProfilePicture } =
        req.body;

      const emp = await EmployeeModel.findById(req.user.id);
      if (!emp) return res.status(404).json({ message: "Employee not found" });

      const normalizedEmail = normalizeEmail(email);

      // 🔹 Vérif duplication email (si l'email change)
      if (normalizedEmail && normalizedEmail !== emp.email) {
        const [employeeDup, ownerDup] = await Promise.all([
          EmployeeModel.findOne({
            email: normalizedEmail,
            _id: { $ne: emp._id },
          }),
          OwnerModel.findOne({ email: normalizedEmail }),
        ]);
        if (employeeDup || ownerDup) {
          return res
            .status(409)
            .json({ message: "L'adresse mail est déjà utilisée" });
        }
      }

      // ---------- Mise à jour des infos de base + snapshots ----------

      const profiles = Array.isArray(emp.restaurantProfiles)
        ? emp.restaurantProfiles
        : [];

      // firstname
      if (firstname !== undefined) {
        emp.firstname = firstname;
        profiles.forEach((p) => {
          p.snapshot = p.snapshot || {};
          p.snapshot.firstname = firstname;
        });
      }

      // lastname
      if (lastname !== undefined) {
        emp.lastname = lastname;
        profiles.forEach((p) => {
          p.snapshot = p.snapshot || {};
          p.snapshot.lastname = lastname;
        });
      }

      // email
      if (normalizedEmail !== undefined) {
        emp.email = normalizedEmail;
        profiles.forEach((p) => {
          p.snapshot = p.snapshot || {};
          p.snapshot.email = normalizedEmail;
        });
      }

      // phone
      if (phone !== undefined) {
        emp.phone = phone;
        profiles.forEach((p) => {
          p.snapshot = p.snapshot || {};
          p.snapshot.phone = phone;
        });
      }

      // ---------- Photo de profil ----------

      if (req.file) {
        // suppression éventuelle de l'ancienne
        if (emp.profilePicture?.public_id) {
          try {
            await cloudinary.uploader.destroy(emp.profilePicture.public_id);
          } catch (err) {
            console.warn(
              "Erreur lors de la suppression de l'ancienne photo employé :",
              err?.message || err,
            );
          }
        }

        const result = await uploadFromBuffer(
          req.file.buffer,
          `Gusto_Workspace/employees/${emp._id}`,
        );

        emp.profilePicture = {
          url: result.secure_url,
          public_id: result.public_id,
        };
      } else if (removeProfilePicture === "true") {
        if (emp.profilePicture?.public_id) {
          try {
            await cloudinary.uploader.destroy(emp.profilePicture.public_id);
          } catch (err) {
            console.warn(
              "Erreur lors de la suppression de la photo employé :",
              err?.message || err,
            );
          }
        }
        emp.profilePicture = null;
      }

      emp.markModified("restaurantProfiles");

      await emp.save();

      const jwt = require("jsonwebtoken");
      const payload = {
        id: emp._id,
        role: "employee",
        firstname: emp.firstname,
        lastname: emp.lastname,
        email: emp.email,
        phone: emp.phone,
        restaurantId: req.user.restaurantId,
        options: req.user.options || {},
        profilePictureUrl: emp.profilePicture?.url || null,
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: "7d",
      });

      return res.json({ message: "Employee updated", token });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: "Server error" });
    }
  },
);

router.put(
  "/employees/update-password",
  authenticateToken,
  async (req, res) => {
    try {
      if (req.user.role !== "employee") {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { currentPassword, newPassword } = req.body;

      const emp = await EmployeeModel.findById(req.user.id);
      if (!emp) return res.status(404).json({ message: "Employee not found" });

      const ok = await emp.comparePassword(currentPassword, emp.password);
      if (!ok)
        return res.status(401).json({ message: "Incorrect current password" });

      emp.password = newPassword; // hash via pre('save')
      await emp.save();

      return res.json({ message: "Password updated successfully" });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: "Server error" });
    }
  },
);

// ---------- TRAINING SESSIONS (global, pas par resto) ----------

router.get("/employees/:employeeId/training-sessions", async (req, res) => {
  try {
    const { employeeId } = req.params;

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit || "50", 10), 1),
      100,
    );
    const skip = (page - 1) * limit;

    const emp = await EmployeeModel.findById(employeeId)
      .select("trainingSessions")
      .lean();

    if (!emp) return res.status(404).json({ message: "Employee not found" });

    const ids = Array.isArray(emp.trainingSessions) ? emp.trainingSessions : [];
    const total = ids.length;

    if (total === 0) {
      return res.json({ trainingSessions: [], total, page, limit });
    }

    const items = await TrainingSession.find({ _id: { $in: ids } })
      .sort({ date: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const trainingSessions = items.map((s) => {
      const me = (s.attendees || []).find(
        (a) => String(a.employeeId) === String(employeeId),
      );
      return {
        ...s,
        myStatus: me?.status || "attended",
        myNotes: me?.notes || "",
        mySignedAt: me?.signedAt || null,
        myCertificateUrl: me?.certificateUrl || null,
      };
    });

    return res.json({ trainingSessions, total, page, limit });
  } catch (e) {
    console.error("Error fetching training sessions:", e);
    return res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
