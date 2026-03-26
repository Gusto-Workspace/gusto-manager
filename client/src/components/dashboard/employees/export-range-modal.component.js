import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Download, Users } from "lucide-react";

export default function ExportRangeModalComponent({
  open = false,
  title = "Exporter",
  description = "",
  confirmLabel = "Exporter le PDF",
  employees = [],
  initialFrom = "",
  initialTo = "",
  loading = false,
  submitError = "",
  onClose,
  onConfirm,
}) {
  const employeeIds = useMemo(
    () => employees.map((employee) => String(employee.id)),
    [employees],
  );

  const [from, setFrom] = useState(initialFrom || "");
  const [to, setTo] = useState(initialTo || "");
  const [selectedIds, setSelectedIds] = useState(employeeIds);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;

    setFrom(initialFrom || "");
    setTo(initialTo || "");
    setSelectedIds(employeeIds);
    setError("");
  }, [employeeIds, initialFrom, initialTo, open]);

  const allSelected =
    employeeIds.length > 0 && selectedIds.length === employeeIds.length;

  function toggleEmployee(employeeId) {
    setSelectedIds((current) =>
      current.includes(employeeId)
        ? current.filter((value) => value !== employeeId)
        : [...current, employeeId],
    );
  }

  function toggleAll() {
    setSelectedIds(allSelected ? [] : employeeIds);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!from || !to || from > to) {
      setError("Choisissez une période valide.");
      return;
    }

    if (!selectedIds.length) {
      setError("Sélectionnez au moins un salarié.");
      return;
    }

    setError("");
    await onConfirm?.({
      from,
      to,
      employeeIds: selectedIds,
    });
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[140] flex items-end justify-center p-3 midTablet:items-center midTablet:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-range-title"
    >
      <button
        type="button"
        onClick={() => {
          if (loading) return;
          onClose?.();
        }}
        className="absolute inset-0 bg-black/25 backdrop-blur-[2px]"
        aria-label="Fermer"
      />

      <div className="relative w-full max-w-[760px] overflow-hidden rounded-[32px] border border-darkBlue/10 bg-white shadow-[0_24px_80px_rgba(19,30,54,0.22)]">
        <div className="flex items-start justify-between gap-4 border-b border-darkBlue/10 px-5 py-5">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue/10 bg-blue/5 px-3 py-1 text-xs font-medium uppercase tracking-[0.14em] text-blue">
              <Download className="size-3.5" />
              PDF
            </div>

            <h3
              id="export-range-title"
              className="mt-3 text-xl font-semibold text-darkBlue"
            >
              {title}
            </h3>
            {description ? (
              <p className="mt-2 text-sm text-darkBlue/60">{description}</p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => {
              if (loading) return;
              onClose?.();
            }}
            className="inline-flex size-10 items-center justify-center rounded-2xl border border-darkBlue/10 bg-white text-darkBlue/60 transition hover:bg-darkBlue/5"
            disabled={loading}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-5 py-5">
          <div className="grid gap-4 midTablet:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-darkBlue">
                <CalendarDays className="size-4 text-blue" />
                Du
              </span>
              <input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="h-12 rounded-2xl border border-darkBlue/10 bg-lightGrey/35 px-4 text-sm text-darkBlue outline-none"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-darkBlue">
                <CalendarDays className="size-4 text-blue" />
                Au
              </span>
              <input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="h-12 rounded-2xl border border-darkBlue/10 bg-lightGrey/35 px-4 text-sm text-darkBlue outline-none"
              />
            </label>
          </div>

          <section className="rounded-[28px] border border-darkBlue/10 bg-lightGrey/35 p-4">
            <div className="flex flex-col gap-3 midTablet:flex-row midTablet:items-center midTablet:justify-between">
              <div>
                <p className="inline-flex items-center gap-2 text-sm font-medium text-darkBlue">
                  <Users className="size-4 text-blue" />
                  Salariés
                </p>
                <p className="mt-1 text-xs text-darkBlue/55">
                  {selectedIds.length} sélectionné
                  {selectedIds.length > 1 ? "s" : ""} sur {employees.length}
                </p>
              </div>

              <button
                type="button"
                onClick={toggleAll}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-darkBlue/10 bg-white px-4 text-sm font-medium text-darkBlue transition hover:bg-darkBlue/5"
              >
                {allSelected ? "Tout désélectionner" : "Tout sélectionner"}
              </button>
            </div>

            <div className="mt-4 max-h-[280px] overflow-y-auto pr-1">
              <div className="grid gap-3">
                {employees.map((employee) => {
                  const checked = selectedIds.includes(String(employee.id));

                  return (
                    <label
                      key={employee.id}
                      className={[
                        "flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition",
                        checked
                          ? "border-blue/20 bg-blue/5"
                          : "border-darkBlue/10 bg-white hover:bg-darkBlue/5",
                      ].join(" ")}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleEmployee(String(employee.id))}
                        className="mt-1 h-4 w-4 rounded border-darkBlue/20 text-blue focus:ring-blue"
                      />

                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-darkBlue">
                          {employee.label}
                        </span>
                        {employee.subtitle ? (
                          <span className="mt-1 block text-xs text-darkBlue/55">
                            {employee.subtitle}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </section>

          {error || submitError ? (
            <div className="rounded-2xl border border-red/15 bg-red/5 px-4 py-3 text-sm text-red">
              {error || submitError}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 midTablet:flex-row midTablet:justify-end">
            <button
              type="button"
              onClick={() => {
                if (loading) return;
                onClose?.();
              }}
              className="h-12 rounded-2xl border border-darkBlue/10 bg-white px-5 text-sm font-semibold text-darkBlue transition hover:bg-darkBlue/5"
              disabled={loading}
            >
              Annuler
            </button>

            <button
              type="submit"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-blue px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue/90 disabled:opacity-60"
              disabled={loading}
            >
              {loading ? (
                <span className="size-4 rounded-full border-2 border-white/35 border-t-white animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
