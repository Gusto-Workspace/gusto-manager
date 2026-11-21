"use client";

import { useState, useContext, useEffect, useRef } from "react";
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
import CatalogHeaderDashboardComponent from "../_shared/catalog-header.dashboard.component";
import { contractTypes, contractUnits } from "./data.employees.component";
import { applyRosterResponse, directoryPath, normalizePersonnelSearch } from "./employee-directory.utils.mjs";

// ICONS LUCIDE
import {
  User,
  Search,
  X,
  Loader2,
} from "lucide-react";

const initialValues = { accountType: "employee" };

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test((email || "").trim());
}

export default function AddEmployeesComponent() {
  const { t } = useTranslation("employees");
  const { restaurantContext } = useContext(GlobalContext);

  const [isSaving, setIsSaving] = useState(false);
  const [step, setStep] = useState(1);
  const [linkedEmployee, setLinkedEmployee] = useState(null);
  const live = useRef(false);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    reset,
    trigger,
    watch,
    formState: { errors },
  } = useForm({ defaultValues: initialValues });

  const accountType = watch("accountType") || "employee";

  // ---------- IMPORT EMPLOYÉ EXISTANT (modale) ----------

  const [showImportModal, setShowImportModal] = useState(false);
  const [existingEmployees, setExistingEmployees] = useState([]);
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);
  const [importError, setImportError] = useState("");
  const [createErrorModal, setCreateErrorModal] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isBrowser, setIsBrowser] = useState(false);

  useEffect(() => {
    live.current = true;
    setIsBrowser(true);
    return () => { live.current = false; };
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

      const url = `${process.env.NEXT_PUBLIC_API_URL}/owner/employees`;
      const { data } = await axios.get(url);

      setExistingEmployees(data.employees || []);
    } catch (err) {
      console.error("Error fetching existing employees:", err);
      setImportError(
        t("errors.fetchExistingEmployees", {
          defaultValue:
            "Impossible de récupérer la liste des employés existants.",
        }),
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

  useEffect(() => {
    if (!showImportModal) return;
    function escape(event) { if (event.key === "Escape") setShowImportModal(false); }
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [showImportModal]);

  function handleCloseImportModal() {
    setShowImportModal(false);
  }

  const currentRestaurantId = restaurantContext?.restaurantData?._id;

  const filteredEmployees = existingEmployees.filter((emp) => {
    if (emp.accountType === "accountant") return false;
    if (!searchTerm.trim()) return true;
    return normalizePersonnelSearch(`${emp.firstname || ""} ${emp.lastname || ""} ${emp.email || ""}`)
      .includes(normalizePersonnelSearch(searchTerm));
  });

  // ---------- IMPORT EMPLOYÉ ----------
  function handleImportEmployee(employeeId) {
    if (!employeeId) return;

    const selected = existingEmployees.find((e) => e._id === employeeId);
    if (!selected) return;

    setImportError("");
    setLinkedEmployee(selected);
    setStep(1);
    reset({
      ...initialValues,
      lastName: selected.lastname || "",
      firstName: selected.firstname || "",
      email: selected.email || "",
      phone: selected.phone || "",
    });

    setShowImportModal(false);
  }

  // ---------- SUBMIT FORMULAIRE AJOUT / IMPORT ----------

  async function onSubmit(data) {
    setCreateErrorModal(null);
    const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${currentRestaurantId}/employees`;
    const formData = new FormData();
    formData.append("lastName", data.lastName);
    formData.append("firstName", data.firstName);
    formData.append("email", data.email);
    formData.append("phone", data.phone);
    formData.append("accountType", data.accountType || "employee");
    formData.append("post", data.post || "");
    formData.append("dateOnPost", data.dateOnPost || "");
    formData.append("secuNumber", data.secuNumber || "");
    formData.append("address", data.address || "");
    formData.append("emergencyContact", data.emergencyContact || "");
    formData.append("contractType", data.contractType || "");
    formData.append("contractualValue", data.contractualValue || "");
    formData.append("contractualUnit", data.contractualUnit || "");
    if (linkedEmployee) formData.append("existingEmployeeId", linkedEmployee._id);

    setIsSaving(true);
    try {
      const response = await axios.post(url, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      restaurantContext.setRestaurantData((previous) => applyRosterResponse(previous, currentRestaurantId, response.data.restaurant));
      if (!live.current) return;
      router.replace(response.data.employeeId ? {
        pathname: `${directoryPath}/[employeeId]`,
        query: { employeeId: response.data.employeeId, ...(data.accountType !== "accountant" && { tab: "access" }) },
      } : directoryPath);
    } catch (err) {
      console.error("Error creating employee:", err);
      const code = err?.response?.data?.code || "";
      const message =
        err?.response?.data?.message ||
        "Impossible de créer l’employé pour le moment.";

      setCreateErrorModal({
        code,
        title:
          code === "OWNER_EMAIL_CONFLICT"
            ? "Adresse mail du restaurateur"
            : code === "EMPLOYEE_EMAIL_EXISTS"
              ? "Adresse mail déjà utilisée"
              : "Création impossible",
        message,
      });
    } finally {
      setIsSaving(false);
    }
  }

  // ---------- Styles communs ----------

  const inputClass = "min-h-10 w-full rounded-lg border bg-white px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue";

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
              role="dialog"
              aria-modal="true"
              aria-labelledby="employee-import-title"
              className="relative w-full max-w-2xl mx-4 rounded-2xl bg-white p-6 shadow-xl flex flex-col gap-4"
            >
              <button
                type="button"
                onClick={handleCloseImportModal}
                aria-label="Fermer"
                className="absolute right-3 top-3 p-1 rounded-full hover:bg-black/5"
              >
                <X className="w-5 h-5 text-darkBlue/70" />
              </button>

              <div className="flex flex-col gap-1 pr-8">
                <h2 id="employee-import-title" className="text-lg font-semibold text-darkBlue">
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
                  aria-label="Rechercher un compte à rattacher"
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
                          (r) => String(r._id || r) === String(currentRestaurantId),
                        );

                      const hasValidEmail = isValidEmail(emp.email);
                      const disabled = alreadyInCurrent || !hasValidEmail;

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
                            {!hasValidEmail && !alreadyInCurrent && (
                              <span className="text-xs text-darkBlue/70">
                                Renseignez un e-mail valide dans sa fiche avant de rattacher ce salarié.
                              </span>
                            )}
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
                            onClick={() => handleImportEmployee(emp._id)}
                            disabled={disabled}
                            className={`inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-medium shadow-sm ${
                              disabled
                                ? "bg-darkBlue/10 text-darkBlue/50 cursor-not-allowed"
                                : "bg-blue text-white disabled:opacity-60"
                            }`}
                          >
                            {alreadyInCurrent
                              ? t("labels.existingEmployee", {
                                  defaultValue: "Existant",
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
          document.body,
        )
      : null;

  const createEmployeeErrorModal =
    isBrowser && createErrorModal
      ? createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <button
              type="button"
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setCreateErrorModal(null)}
              aria-label="Fermer"
            />
            <section className="relative z-10 w-full max-w-lg rounded-3xl border border-darkBlue/10 bg-white p-6 shadow-2xl">
              <button
                type="button"
                onClick={() => setCreateErrorModal(null)}
                className="absolute right-4 top-4 inline-flex size-9 items-center justify-center rounded-xl border border-darkBlue/10 bg-white text-darkBlue/60 transition hover:bg-darkBlue/5"
                aria-label="Fermer"
              >
                <X className="size-4" />
              </button>

              <p className="text-xs font-semibold uppercase tracking-wide text-red">
                Erreur
              </p>
              <h3 className="mt-1 pr-10 text-xl font-semibold text-darkBlue">
                {createErrorModal.title}
              </h3>
              <p className="mt-4 text-sm leading-relaxed text-darkBlue/70">
                {createErrorModal.message}
              </p>

              {createErrorModal.code === "OWNER_EMAIL_CONFLICT" ? (
                <div className="mt-4 rounded-2xl border border-blue/15 bg-blue/10 p-4 text-sm leading-relaxed text-darkBlue/75">
                  Si le propriétaire veut aussi apparaître comme employé, il
                  doit utiliser une autre adresse mail pour le compte employé.
                  Sinon, il peut d’abord modifier son adresse mail de connexion
                  : cliquez en haut à droite sur son nom, puis{" "}
                  <strong>Paramètres</strong>, puis changez l’adresse mail du
                  compte.
                </div>
              ) : null}

              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => setCreateErrorModal(null)}
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-darkBlue px-5 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  Compris
                </button>
              </div>
            </section>
          </div>,
          document.body,
        )
      : null;

  const employeeAccount = accountType !== "accountant";
  const accountFields = [
    { key: "firstName", label: t("labels.firstname"), required: true, readOnly: Boolean(linkedEmployee) },
    { key: "lastName", label: t("labels.lastname"), required: true, readOnly: Boolean(linkedEmployee) },
    { key: "email", label: t("labels.email"), type: "email", required: true, readOnly: Boolean(linkedEmployee) },
    { key: "phone", label: t("labels.phone"), type: "tel", required: true },
  ];
  const employmentFields = [
    { key: "post", label: t("labels.post"), required: true },
    { key: "dateOnPost", label: t("labels.dateOnPost"), type: "date" },
    { key: "contractType", label: "Type de contrat", choices: contractTypes },
    { key: "contractualValue", label: "Volume horaire", type: "number" },
    { key: "contractualUnit", label: "Unité", choices: Object.keys(contractUnits) },
  ];
  const personalFields = [
    { key: "secuNumber", label: t("labels.secuNumber") },
    { key: "address", label: t("labels.address") },
    { key: "emergencyContact", label: t("labels.emergencyContact") },
  ];

  function renderFields(fields, columns = "midTablet:grid-cols-2") {
    return (
      <div className={`grid gap-4 ${columns}`}>
        {fields.map(({ key, label, type, choices, required, readOnly }) => {
          const binding = register(key, {
            required: required ? "Ce champ est requis." : false,
            setValueAs: type === "email" ? (value) => value.trim() : undefined,
            validate: type === "email" ? (value) => isValidEmail(value) || "Saisissez une adresse e-mail valide." : undefined,
            min: type === "number" ? { value: 0, message: "Le volume horaire doit être positif." } : undefined,
          });
          const className = `${inputClass} ${errors[key] ? "border-red" : "border-darkBlue/20"} ${readOnly ? "bg-lightGrey text-darkBlue/65" : ""}`;
          return (
            <label key={key} className="grid content-start gap-1.5 text-sm font-medium">
              <span>{label}{required && " *"}</span>
              {choices ? (
                <select {...binding} className={className}>
                  <option value="">Non renseigné</option>
                  {choices.map((choice) => <option key={choice} value={choice}>{contractUnits[choice] || choice}</option>)}
                </select>
              ) : (
                <input {...binding} type={type || "text"} readOnly={readOnly} required={required}
                  {...(type === "number" && { min: 0, step: "any" })}
                  className={className} aria-invalid={Boolean(errors[key])} />
              )}
              {errors[key] && <span role="alert" className="text-xs text-red">{errors[key].message}</span>}
            </label>
          );
        })}
      </div>
    );
  }

  function submit(event) {
    if (step === 1 && employeeAccount) {
      event.preventDefault();
      trigger(accountFields.map(({ key }) => key), { shouldFocus: true }).then((valid) => {
        if (valid) setStep(2);
      });
      return;
    }
    handleSubmit(onSubmit, (invalid) => {
      if (accountFields.some(({ key }) => invalid[key])) setStep(1);
    })(event);
  }

  return (
    <>
      {importModal}
      {createEmployeeErrorModal}
      <section className="grid min-w-0 gap-5">
        <CatalogHeaderDashboardComponent
          icon={<EmployeesSvg width={30} height={30} fillColor="#131E3690" />}
          title={t("employees:titles.main")}
          onTitleClick={() => router.push(directoryPath)}
          onBack={() => router.push(directoryPath)}
          subtitle={linkedEmployee ? "Rattacher un salarié" : "Ajouter un employé"}
          actions={step === 1 && employeeAccount && restaurantContext.userConnected?.role === "owner" ? (
            <button type="button" onClick={handleOpenImportModal}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-blue/30 bg-white px-3 text-sm font-semibold text-blue hover:bg-blue/5">
              <User size={16} aria-hidden="true" /> Rattacher un salarié existant
            </button>
          ) : null}
        />

        <form onSubmit={submit} noValidate className="grid gap-4">
          <div hidden={step !== 1}>
            <section className="grid gap-4 rounded-xl border border-darkBlue/10 bg-white p-4 midTablet:p-5">
              {linkedEmployee ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-blue/5 p-3 text-sm">
                  <span>Compte à rattacher · <strong>{linkedEmployee.firstname} {linkedEmployee.lastname}</strong></span>
                  <button type="button" onClick={() => { setLinkedEmployee(null); reset(initialValues); }}
                    className="min-h-9 font-semibold text-blue underline">Choisir un nouveau compte</button>
                  <input type="hidden" value="employee" {...register("accountType")} />
                </div>
              ) : (
                <fieldset className="grid gap-2 midTablet:grid-cols-2">
                  <legend className="mb-2 text-sm font-medium">Type de compte</legend>
                  {[
                    { value: "employee", label: "Salarié", description: "Planning, Pointeuse et accès selon les droits attribués." },
                    { value: "accountant", label: "Comptable", description: "Exports d’heures et dépôt de documents." },
                  ].map(({ value, label, description }) => (
                    <label key={value} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${accountType === value ? "border-blue/35 bg-blue/5" : "border-darkBlue/10"}`}>
                      <input type="radio" value={value} {...register("accountType")} className="mt-1 text-blue focus:ring-blue" />
                      <span><strong>{label}</strong><span className="mt-1 block text-xs text-darkBlue/70">{description}</span></span>
                    </label>
                  ))}
                </fieldset>
              )}
              {renderFields(accountFields)}
              <p className="text-sm text-darkBlue/70">{linkedEmployee ? "Le salarié utilise son compte Gusto existant." :
                "Le mot de passe temporaire est envoyé à cette adresse lors de la création du compte."}</p>
            </section>
          </div>
          {employeeAccount && <div hidden={step !== 2}>
            <section className="grid gap-4 rounded-xl border border-darkBlue/10 bg-white p-4 midTablet:p-5">
              <div>
                <h2 className="text-lg font-semibold">Emploi et contrat</h2>
                <p className="mt-1 text-sm text-darkBlue/70">{[watch("firstName"), watch("lastName")].filter(Boolean).join(" ")}</p>
              </div>
                  {renderFields(employmentFields.slice(0, 3))}
                  {renderFields(employmentFields.slice(3), "grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]")}
              <h3 className="border-t border-darkBlue/10 pt-4 text-base font-semibold">Informations personnelles</h3>
              {renderFields(personalFields)}
            </section>
          </div>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" disabled={isSaving} onClick={() => step === 2 ? setStep(1) : router.replace(directoryPath)}
              className="min-h-10 rounded-lg border border-darkBlue/15 bg-white px-3 text-sm font-semibold hover:bg-lightGrey">
              {step === 2 ? "Retour au profil" : t("buttons.cancel")}
            </button>
            <button type="submit" disabled={isSaving} className="min-h-10 rounded-lg bg-blue px-3 text-sm font-semibold text-white disabled:opacity-60">
              {isSaving ? t("buttons.loading") : step === 1 && employeeAccount ? "Suivant" : linkedEmployee ? "Rattacher le salarié" : "Créer le compte"}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
