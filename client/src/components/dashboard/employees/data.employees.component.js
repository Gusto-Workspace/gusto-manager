import { useState } from "react";
import { useForm } from "react-hook-form";
import { Pencil } from "lucide-react";
import { useTranslation } from "next-i18next";

export const contractTypes = ["CDI", "CDD", "Extra", "Intérim", "Alternance", "Stage"];
export const contractUnits = { week: "h / semaine", month: "h / mois" };

const input = "min-h-10 w-full rounded-lg border border-darkBlue/20 bg-white px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue";

export default function DataEmployeesComponent({ section, employee, profile, onSave }) {
  const { t } = useTranslation("employees");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const { register, handleSubmit, reset, formState: { dirtyFields, errors, isDirty, isSubmitting } } = useForm();
  const isEmployment = section === "employment";
  const isAccountant = employee.accountType === "accountant";
  const snapshot = profile?.snapshot || {};
  const employment = profile?.employment || {};
  const title = isEmployment ? "Emploi et contrat" : t("labels.personalInformation", "Informations personnelles");
  const value = (key) => snapshot[key] ?? employee[key] ?? "";
  const date = snapshot.dateOnPost === null ? null : value("dateOnPost");

  const fields = isEmployment ? [
    { key: "post", label: t("labels.post"), value: value("post"), required: true },
    { key: "dateOnPost", label: t("labels.dateOnPost"), value: date ? String(date).slice(0, 10) : "", type: "date" },
    { key: "contractType", label: "Type de contrat", value: employment.contractType ?? "", options: contractTypes },
    { key: "payrollCode", label: "Matricule de paie", value: employment.payrollCode ?? "", maxLength: 64 },
    { key: "contractualValue", label: "Volume horaire", value: employment.contractualUnit || employment.contractualValue ? employment.contractualValue ?? "" : "", type: "number" },
    { key: "contractualUnit", label: "Unité", value: employment.contractualUnit ?? "", options: Object.keys(contractUnits) },
  ] : [
    { key: "firstname", label: t("labels.firstname"), value: value("firstname"), required: true },
    { key: "lastname", label: t("labels.lastname"), value: value("lastname"), required: true },
    { key: "email", label: t("labels.email"), value: value("email"), type: "email", required: isAccountant },
    { key: "phone", label: t("labels.phone"), value: value("phone"), type: "tel", required: true },
    ...(!isAccountant ? [
      { key: "secuNumber", label: t("labels.secuNumber"), value: value("secuNumber") },
      { key: "address", label: t("labels.address"), value: value("address") },
      { key: "emergencyContact", label: t("labels.emergencyContact"), value: value("emergencyContact") },
    ] : []),
  ];

  function startEditing() {
    reset(Object.fromEntries(fields.map((field) => [field.key, String(field.value)])));
    setError("");
    setEditing(true);
  }

  async function save(values) {
    setError("");
    try {
      const changed = Object.fromEntries(fields.filter(({ key }) => dirtyFields[key]).map(({ key }) => [key, values[key]]));
      await onSave(changed);
      setEditing(false);
    } catch (failure) {
      setError(failure.response?.data?.message || "Impossible d’enregistrer les modifications.");
    }
  }

  function display(field) {
    if (field.value === "") return "—";
    if (field.type === "date") return new Date(`${field.value}T12:00:00Z`).toLocaleDateString("fr-FR");
    if (field.key === "contractualValue") return `${field.value} ${contractUnits[employment.contractualUnit] || employment.contractualUnit || "h"}`;
    return field.value;
  }

  function renderField(field) {
    const binding = register(field.key, {
      required: field.required ? "Ce champ est requis." : false,
      validate: field.type === "email" ? (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || "Saisissez une adresse e-mail valide." : undefined,
      min: field.type === "number" ? { value: 0, message: "Le volume horaire doit être positif." } : undefined,
    });
    return (
      <label key={field.key} className="grid min-w-0 content-start gap-1.5 text-sm font-medium">
        <span>{field.label}</span>
        {field.options ? (
          <select {...binding} disabled={isSubmitting} className={input}>
            <option value="">Non renseigné</option>
            {field.value && !field.options.includes(field.value) && <option value={field.value}>{field.value}</option>}
            {field.options.map((option) => <option key={option} value={option}>{contractUnits[option] || option}</option>)}
          </select>
        ) : (
          <input {...binding} type={field.type || "text"} aria-invalid={Boolean(errors[field.key])} disabled={isSubmitting}
            maxLength={field.maxLength} {...(field.type === "number" && { min: 0, step: "any" })} className={input} />
        )}
        {errors[field.key] && <span role="alert" className="text-xs text-red">{errors[field.key].message}</span>}
      </label>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-darkBlue/10 bg-white">
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-darkBlue/10 px-4 py-3 midTablet:px-5">
        <h2 className="flex min-h-10 items-center text-lg font-semibold">{title}</h2>
        {!editing && <button type="button" onClick={startEditing} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-darkBlue/15 px-3 text-sm font-semibold hover:bg-lightGrey">
          <Pencil size={15} aria-hidden="true" /> Modifier
        </button>}
      </header>
      {editing ? (
        <form onSubmit={handleSubmit(save)} noValidate className="grid gap-4 p-4 midTablet:p-5">
          <div className="grid gap-4 midTablet:grid-cols-2">
            {isEmployment ? <>
              {fields.slice(0, 4).map(renderField)}
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2">
                {fields.slice(4).map(renderField)}
              </div>
            </> : fields.map(renderField)}
          </div>
          {error && <p role="alert" className="text-sm text-red">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" disabled={isSubmitting} onClick={() => setEditing(false)} className="min-h-10 rounded-lg border border-darkBlue/15 px-3 text-sm font-semibold">{t("buttons.cancel")}</button>
            <button type="submit" disabled={!isDirty || isSubmitting} className="min-h-10 rounded-lg bg-blue px-3 text-sm font-semibold text-white disabled:opacity-45">
              {isSubmitting ? t("buttons.loading") : t("buttons.save")}
            </button>
          </div>
        </form>
      ) : (
        <dl className="grid gap-x-8 gap-y-4 p-4 midTablet:grid-cols-2 midTablet:p-5 [&>div:last-child]:border-b-0 midTablet:[&>div:nth-last-child(2):nth-child(odd)]:border-b-0">
          {fields.filter(({ key }) => key !== "contractualUnit").map((field) => (
            <div className="min-w-0 border-b border-darkBlue/10 pb-3" key={field.key}>
              <dt className="text-xs font-medium text-darkBlue/65">{field.label}</dt>
              <dd className={`mt-1 text-sm font-medium ${field.key === "contractualValue" ? "whitespace-nowrap" : "break-words"}`}>{display(field)}</dd>
            </div>
          ))}
          {isEmployment && [
            ["Établissement principal", employment.primaryEstablishment],
          ].filter(([, field]) => field).map(([label, field]) => (
            <div className="border-b border-darkBlue/10 pb-3" key={label}>
              <dt className="text-xs font-medium text-darkBlue/65">{label}</dt>
              <dd className="mt-1 break-words text-sm font-medium">{field}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
