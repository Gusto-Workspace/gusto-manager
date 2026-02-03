"use client";

import { useState, useContext, useEffect } from "react";
import { useRouter } from "next/router";
import { createPortal } from "react-dom";

// REACT HOOK FORM
import { useForm } from "react-hook-form";

// AXIOS
import axios from "axios";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import { EmployeesSvg } from "../../_shared/_svgs/_index";

// ICONS LUCIDE
import {
  User,
  Mail,
  Phone,
  Briefcase,
  CalendarDays,
  Shield,
  Home,
  PhoneCall,
  Search,
  X,
  Loader2,
} from "lucide-react";

/* ---------- Utils ---------- */

function toDateInputValue(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function AddEmployeesComponent() {
  const { t } = useTranslation("employees");
  const { restaurantContext } = useContext(GlobalContext);

  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitted },
  } = useForm();

  // ---------- IMPORT EMPLOYÉ EXISTANT (modale) ----------

  const [showImportModal, setShowImportModal] = useState(false);
  const [existingEmployees, setExistingEmployees] = useState([]);
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);
  const [importError, setImportError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isBrowser, setIsBrowser] = useState(false);

  const [importLoadingId, setImportLoadingId] = useState(null);

  useEffect(() => {
    setIsBrowser(true);
  }, []);

  useEffect(() => {
    if (!isBrowser) return;

    if (showImportModal) {
      document.body.classList.add("overflow-hidden");
    } else {
      document.body.classList.remove("overflow-hidden");
    }

    return () => {
      document.body.classList.remove("overflow-hidden");
    };
  }, [showImportModal, isBrowser]);

  async function fetchExistingEmployees() {
    try {
      setIsLoadingExisting(true);
      setImportError("");

      const ownerId =
        restaurantContext?.restaurantData?.owner_id?._id ||
        restaurantContext?.restaurantData?.owner_id;

      const url = `${process.env.NEXT_PUBLIC_API_URL}/owner/employees?ownerId=${ownerId}`;
      const { data } = await axios.get(url);

      setExistingEmployees(data.employees || []);
    } catch (err) {
      console.error("Error fetching existing employees:", err);
      setImportError(
        t("errors.fetchExistingEmployees", {
          defaultValue:
            "Impossible de récupérer la liste des employés existants.",
        })
      );
    } finally {
      setIsLoadingExisting(false);
    }
  }

  async function handleOpenImportModal() {
    setShowImportModal(true);
    setImportError("");
    setSearchTerm("");

    if (existingEmployees.length === 0) {
      await fetchExistingEmployees();
    }
  }

  function handleCloseImportModal() {
    setShowImportModal(false);
  }

  const currentRestaurantId = restaurantContext?.restaurantData?._id;

  const filteredEmployees = existingEmployees.filter((emp) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    const fullName =
      `${emp.firstname || ""} ${emp.lastname || ""}`.toLowerCase();
    const email = (emp.email || "").toLowerCase();
    return fullName.includes(q) || email.includes(q);
  });

  // ---------- IMPORT EMPLOYÉ ----------
  function handleImportEmployee(employeeId) {
    if (!employeeId) return;

    const selected = existingEmployees.find((e) => e._id === employeeId);
    if (!selected) return;

    setImportError("");
    setImportLoadingId(employeeId);

    reset({
      lastName: selected.lastname || "",
      firstName: selected.firstname || "",
      email: selected.email || "",
      phone: selected.phone || "",
      post: selected.post || "",
      dateOnPost: "",
      secuNumber: selected.secuNumber || "",
      address: selected.address || "",
      emergencyContact: selected.emergencyContact || "",
    });

    setShowImportModal(false);
    setImportLoadingId(null);
  }

  // ---------- SUBMIT FORMULAIRE AJOUT / IMPORT ----------

  async function onSubmit(data) {
    const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext.restaurantData._id}/employees`;
    const formData = new FormData();
    formData.append("lastName", data.lastName);
    formData.append("firstName", data.firstName);
    formData.append("email", data.email);
    formData.append("phone", data.phone);
    formData.append("post", data.post);
    formData.append("dateOnPost", data.dateOnPost);
    formData.append("secuNumber", data.secuNumber || "");
    formData.append("address", data.address || "");
    formData.append("emergencyContact", data.emergencyContact || "");

    setIsSaving(true);
    try {
      const response = await axios.post(url, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      restaurantContext.setRestaurantData((prev) => ({
        ...prev,
        employees: response.data.restaurant.employees,
      }));
      reset();
      router.replace("/dashboard/employees");
    } catch (err) {
      console.error("Error creating employee:", err);
    } finally {
      setIsSaving(false);
    }
  }

  // ---------- Styles communs ----------

  const fieldWrap =
    "group relative rounded-xl bg-white/50 px-3 py-2 h-[80px] transition-shadow";
  const labelCls =
    "flex items-center gap-2 text-xs font-medium text-darkBlue/60 mb-1";
  const inputBaseCls =
    "h-11 w-full rounded-lg border bg-white px-3 text-[15px] outline-none transition placeholder:text-darkBlue/40";
  const inputNormalCls = `${inputBaseCls} border-darkBlue/20`;
  const inputErrorCls = `${inputBaseCls} border-red`;

  // ---------- Modale d'import (portal) ----------

  const importModal =
    isBrowser && showImportModal
      ? createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={handleCloseImportModal}
            />
            <section
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-2xl mx-4 rounded-2xl bg-white p-6 shadow-xl flex flex-col gap-4"
            >
              <button
                type="button"
                onClick={handleCloseImportModal}
                className="absolute right-3 top-3 p-1 rounded-full hover:bg-black/5"
              >
                <X className="w-5 h-5 text-darkBlue/70" />
              </button>

              <div className="flex flex-col gap-1 pr-8">
                <h2 className="text-lg font-semibold text-darkBlue">
                  {t("titles.importExistingEmployee", {
                    defaultValue: "Importer un employé existant",
                  })}
                </h2>
                <p className="text-sm text-darkBlue/70">
                  {t("descriptions.importExistingEmployee", {
                    defaultValue:
                      "Sélectionnez un employé déjà présent dans l’un de vos restaurants pour pré-remplir le formulaire.",
                  })}
                </p>
              </div>

              {/* Barre de recherche */}
              <div className="flex items-center gap-2 rounded-lg border border-darkBlue/15 bg-white px-3 py-2">
                <Search className="w-4 h-4 text-darkBlue/50" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={t("placeholders.searchEmployee", {
                    defaultValue: "Rechercher par nom ou email…",
                  })}
                  className="flex-1 text-sm outline-none"
                />
              </div>

              {/* Liste */}
              <div className="flex-1 min-h-[200px] max-h-[250px] overflow-y-auto rounded-xl border border-darkBlue/10 bg-[#f7f8fc] p-3">
                {isLoadingExisting ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-darkBlue/70 py-20">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>
                      {t("labels.loadingEmployees", {
                        defaultValue: "Chargement des employés…",
                      })}
                    </span>
                  </div>
                ) : filteredEmployees.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center gap-2 py-10 text-sm text-darkBlue/70">
                    <p>
                      {t("labels.noExistingEmployees", {
                        defaultValue:
                          "Aucun employé disponible à importer pour vos restaurants.",
                      })}
                    </p>
                    <p className="text-xs text-darkBlue/50">
                      {t("labels.addNewEmployeeInstead", {
                        defaultValue:
                          "Vous pouvez saisir un nouvel employé via le formulaire d’ajout.",
                      })}
                    </p>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {filteredEmployees.map((emp) => {
                      const alreadyInCurrent =
                        currentRestaurantId &&
                        Array.isArray(emp.restaurants) &&
                        emp.restaurants.some(
                          (r) => String(r._id) === String(currentRestaurantId)
                        );

                      const disabled =
                        importLoadingId !== null || alreadyInCurrent;

                      return (
                        <li
                          key={emp._id}
                          className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 shadow-sm border border-darkBlue/5"
                        >
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-darkBlue">
                              {emp.firstname} {emp.lastname}
                            </span>
                            <span className="text-xs text-darkBlue/60">
                              {emp.email ||
                                t("labels.noEmail", {
                                  defaultValue: "Email non renseigné",
                                })}
                            </span>
                            {Array.isArray(emp.restaurants) &&
                              emp.restaurants.length > 0 && (
                                <span className="mt-1 text-[11px] text-darkBlue/50">
                                  {t("labels.alreadyInRestaurants", {
                                    defaultValue: "Restaurants actuels :",
                                  })}{" "}
                                  {emp.restaurants
                                    .map((r) => r.name)
                                    .join(", ")}
                                </span>
                              )}
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              !alreadyInCurrent &&
                              !importLoadingId &&
                              handleImportEmployee(emp._id)
                            }
                            disabled={disabled}
                            className={`inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-medium shadow-sm ${
                              alreadyInCurrent
                                ? "bg-darkBlue/10 text-darkBlue/50 cursor-not-allowed"
                                : "bg-blue text-white disabled:opacity-60"
                            }`}
                          >
                            {alreadyInCurrent
                              ? t("labels.existingEmployee", {
                                  defaultValue: "Existant",
                                })
                              : importLoadingId === emp._id
                                ? t("buttons.loading", {
                                    defaultValue: "En cours...",
                                  })
                                : t("buttons.importExistingEmployee", {
                                    defaultValue: "Importer",
                                  })}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {importError && (
                <p className="text-xs text-red mt-1">{importError}</p>
              )}

              <p className="text-[11px] text-darkBlue/50">
                {t("labels.importModalHint", {
                  defaultValue:
                    "Si l’employé n’apparaît pas dans cette liste, saisissez ses informations dans le formulaire d’ajout.",
                })}
              </p>
            </section>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      {importModal}

      <section className="flex flex-col gap-6">
        <hr className="opacity-20" />

        <div className="flex justify-between flex-wrap gap-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 min-h-[40px]">
              <EmployeesSvg width={30} height={30} fillColor="#131E3690" />

              <h1 className="pl-2 text-xl tablet:text-2xl flex items-center gap-2 flex-wrap">
                <span
                  className="cursor-pointer hover:underline"
                  onClick={() => router.push("/dashboard/employees")}
                >
                  {t("employees:titles.main")}
                </span>
                <span>/</span>
                <span>Ajouter</span>
              </h1>
            </div>
          </div>

          <div className="flex items-center">
            <button
              type="button"
              onClick={handleOpenImportModal}
              className="inline-flex items-center gap-2 rounded-lg border border-blue/40 bg-white/70 px-4 py-2 text-sm font-medium text-blue shadow-sm hover:bg-blue/5 transition"
            >
              <User className="w-4 h-4" />
              {t("buttons.importExistingEmployeeFull", {
                defaultValue: "Importer un employé existant",
              })}
            </button>
          </div>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="relative flex flex-col gap-3"
        >
          <div className="grid grid-cols-1 midTablet:grid-cols-3 gap-2">
            {/* Nom */}
            <div className="w-full">
              <div className={fieldWrap}>
                <label htmlFor="lastName" className={labelCls}>
                  <User className="size-4" />
                  {t("labels.lastname")}
                </label>
                <input
                  id="lastName"
                  type="text"
                  {...register("lastName", { required: true })}
                  className={
                    errors.lastName && isSubmitted
                      ? inputErrorCls
                      : inputNormalCls
                  }
                />
              </div>
            </div>

            {/* Prénom */}
            <div className="w-full">
              <div className={fieldWrap}>
                <label htmlFor="firstName" className={labelCls}>
                  <User className="size-4" />
                  {t("labels.firstname")}
                </label>
                <input
                  id="firstName"
                  type="text"
                  {...register("firstName", { required: true })}
                  className={
                    errors.firstName && isSubmitted
                      ? inputErrorCls
                      : inputNormalCls
                  }
                />
              </div>
            </div>

            {/* Email */}
            <div className="w-full">
              <div className={fieldWrap}>
                <label htmlFor="email" className={labelCls}>
                  <Mail className="size-4" />
                  {t("labels.email")}
                </label>
                <input
                  id="email"
                  type="email"
                  {...register("email", { required: true })}
                  className={
                    errors.email && isSubmitted ? inputErrorCls : inputNormalCls
                  }
                />
              </div>
            </div>

            {/* Téléphone */}
            <div className="w-full">
              <div className={fieldWrap}>
                <label htmlFor="phone" className={labelCls}>
                  <Phone className="size-4" />
                  {t("labels.phone")}
                </label>
                <input
                  id="phone"
                  type="text"
                  {...register("phone", { required: true })}
                  className={
                    errors.phone && isSubmitted ? inputErrorCls : inputNormalCls
                  }
                />
              </div>
            </div>

            {/* Poste */}
            <div className="w-full">
              <div className={fieldWrap}>
                <label htmlFor="post" className={labelCls}>
                  <Briefcase className="size-4" />
                  {t("labels.post")}
                </label>
                <input
                  id="post"
                  type="text"
                  {...register("post", { required: true })}
                  className={
                    errors.post && isSubmitted ? inputErrorCls : inputNormalCls
                  }
                />
              </div>
            </div>

            {/* Date de prise de poste */}
            <div className="w-full">
              <div className={fieldWrap}>
                <label htmlFor="dateOnPost" className={labelCls}>
                  <CalendarDays className="size-4" />
                  {t("labels.dateOnPost")}
                </label>
                <input
                  id="dateOnPost"
                  type="date"
                  {...register("dateOnPost", { required: true })}
                  className={
                    errors.dateOnPost && isSubmitted
                      ? inputErrorCls
                      : inputNormalCls
                  }
                />
              </div>
            </div>

            {/* Numéro de SS */}
            <div className="w-full">
              <div className={fieldWrap}>
                <label htmlFor="secuNumber" className={labelCls}>
                  <Shield className="size-4" />
                  {t("labels.secuNumber")}
                </label>
                <input
                  id="secuNumber"
                  type="text"
                  {...register("secuNumber")}
                  className={
                    errors.secuNumber && isSubmitted
                      ? inputErrorCls
                      : inputNormalCls
                  }
                />
              </div>
            </div>

            {/* Adresse */}
            <div className="w-full">
              <div className={fieldWrap}>
                <label htmlFor="address" className={labelCls}>
                  <Home className="size-4" />
                  {t("labels.address")}
                </label>
                <input
                  id="address"
                  type="text"
                  {...register("address")}
                  className={
                    errors.address && isSubmitted
                      ? inputErrorCls
                      : inputNormalCls
                  }
                />
              </div>
            </div>

            {/* Contact urgence */}
            <div className="w-full">
              <div className={fieldWrap}>
                <label htmlFor="emergencyContact" className={labelCls}>
                  <PhoneCall className="size-4" />
                  {t("labels.emergencyContact")}
                </label>
                <input
                  id="emergencyContact"
                  type="text"
                  {...register("emergencyContact")}
                  className={
                    errors.emergencyContact && isSubmitted
                      ? inputErrorCls
                      : inputNormalCls
                  }
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-2 flex flex-col mobile:flex-row gap-2">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-60"
            >
              {isSaving ? t("buttons.loading") : t("buttons.save")}
            </button>

            <button
              type="button"
              onClick={() => router.replace("/dashboard/employees")}
              disabled={isSaving}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-red bg-red px-4 py-2 text-sm font-medium text-white"
            >
              {t("buttons.cancel")}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
