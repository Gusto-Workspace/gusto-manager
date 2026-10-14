import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Download, Loader2, X } from "lucide-react";
import axios from "axios";
import {
  FINANCIAL_MODULE_LABELS,
  validExportSelection,
} from "./financial-dashboard.utils";

function parisDate() {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type) => parts.find((part) => part.type === type).value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export default function ExportTransactionsModal({
  restaurantId,
  availableModules,
  modulesLoading,
  modulesError,
  onRetry,
  onClose,
}) {
  const today = parisDate();
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [selected, setSelected] = useState(availableModules);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef(null);
  const valid = validExportSelection(from, to, selected, availableModules);

  useEffect(() => {
    setSelected(availableModules);
  }, [availableModules]);
  useEffect(() => {
    const previousFocus = document.activeElement;
    dialog.current?.querySelector("input")?.focus();
    const handleKey = (event) => {
      if (event.key === "Escape" && !loading) onClose();
      if (event.key !== "Tab") return;
      const controls = dialog.current?.querySelectorAll(
        "button:not(:disabled), input:not(:disabled)",
      );
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      previousFocus?.focus();
    };
  }, [loading, onClose]);

  async function exportPdf(event) {
    event.preventDefault();
    if (!valid || loading || modulesLoading || modulesError) return;
    setLoading(true);
    setError("");
    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants/${restaurantId}/payments/export-pdf`,
        { from, to, modules: selected },
        { responseType: "blob" },
      );
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `transactions-${from}-${to}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      onClose();
    } catch (failure) {
      let message = failure.response?.data?.message;
      if (failure.response?.data instanceof Blob) {
        try {
          message = JSON.parse(await failure.response.data.text()).message;
        } catch {
          /* Keep the fallback for non-JSON errors. */
        }
      }
      setError(message || "Impossible de générer le PDF. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[140] flex items-end justify-center p-3 midTablet:items-center midTablet:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="transactions-export-title"
    >
      <button
        type="button"
        aria-label="Fermer"
        onClick={() => !loading && onClose()}
        className="absolute inset-0 bg-black/25 backdrop-blur-sm"
      />
      <div
        ref={dialog}
        className="relative flex max-h-[calc(100dvh-24px)] w-full max-w-[620px] flex-col overflow-hidden rounded-[28px] border border-darkBlue/10 bg-white shadow-[0_24px_80px_rgba(19,30,54,0.22)]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-darkBlue/10 px-5 py-5">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-blue/5 px-3 py-1 text-xs font-medium text-blue">
              <Download className="size-3.5" /> PDF
            </span>
            <h3
              id="transactions-export-title"
              className="mt-3 text-xl font-semibold text-darkBlue"
            >
              Exporter les transactions
            </h3>
            <p className="mt-2 text-sm text-darkBlue/60">
              Encaissements, remboursements et frais Stripe. Les dates sont
              inclusives, en Europe/Paris.
            </p>
          </div>
          <button
            type="button"
            disabled={loading}
            aria-label="Fermer"
            onClick={onClose}
            className="rounded-full border border-darkBlue/10 p-2 text-darkBlue/60"
          >
            <X className="size-5" />
          </button>
        </header>
        <form onSubmit={exportPdf} className="flex min-h-0 flex-col">
          <div className="flex flex-col gap-5 overflow-y-auto px-5 py-5">
            <div className="grid gap-4 midTablet:grid-cols-2">
              {[
                { label: "Date de début", value: from, setter: setFrom },
                { label: "Date de fin", value: to, setter: setTo },
              ].map((field) => (
                <label
                  key={field.label}
                  className="flex flex-col gap-2 text-sm font-medium text-darkBlue"
                >
                  <span className="inline-flex items-center gap-2">
                    <CalendarDays className="size-4 text-blue" />
                    {field.label}
                  </span>
                  <input
                    required
                    type="date"
                    value={field.value}
                    disabled={loading}
                    onChange={(event) => field.setter(event.target.value)}
                    className="h-12 rounded-2xl border border-darkBlue/10 bg-lightGrey/35 px-4 text-sm"
                  />
                </label>
              ))}
            </div>
            <fieldset
              disabled={loading}
              className="rounded-2xl border border-darkBlue/10 bg-lightGrey/35 p-4"
            >
              <legend className="px-1 text-sm font-medium text-darkBlue">
                Modules
              </legend>
              {modulesLoading ? (
                <p
                  role="status"
                  className="flex items-center gap-2 text-sm text-darkBlue/60"
                >
                  <Loader2 className="size-4 animate-spin" />
                  Chargement…
                </p>
              ) : null}
              {!modulesLoading && !availableModules.length && !modulesError ? (
                <p className="text-sm text-darkBlue/60">
                  Aucune transaction exportable pour ce restaurant.
                </p>
              ) : null}
              <div className="flex flex-col gap-3">
                {availableModules.map((module) => (
                  <label
                    key={module}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-darkBlue/10 bg-white px-4 py-3 text-sm text-darkBlue"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(module)}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, module]
                            : current.filter((value) => value !== module),
                        )
                      }
                      className="size-4 accent-blue"
                    />
                    {FINANCIAL_MODULE_LABELS[module]}
                  </label>
                ))}
              </div>
              <p className="mt-3 text-xs text-darkBlue/55">
                Les modules désactivés restent disponibles lorsqu’ils possèdent
                un historique. Période maximale : trois ans.
              </p>
            </fieldset>
            {!valid && !modulesLoading && availableModules.length > 0 ? (
              <p role="status" className="text-sm text-darkBlue/60">
                Choisissez des dates valides et au moins un module.
              </p>
            ) : null}
            {error || modulesError ? (
              <div
                role="alert"
                className="rounded-xl border border-red/15 bg-red/5 px-4 py-3 text-sm text-red"
              >
                {error || modulesError}
                {modulesError ? (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="ml-2 underline"
                  >
                    Réessayer
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          <footer className="flex justify-end gap-3 border-t border-darkBlue/10 px-5 py-4">
            <button
              type="button"
              disabled={loading}
              onClick={onClose}
              className="h-12 rounded-2xl border border-darkBlue/10 px-5 text-sm font-semibold text-darkBlue"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={
                !valid || loading || modulesLoading || Boolean(modulesError)
              }
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-blue px-5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              {loading ? "Génération…" : "Générer le PDF"}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
}
