import { useMemo, useState } from "react";
import axios from "axios";
import { Download } from "lucide-react";
import ExportRangeModal from "../employees/export-range-modal.component";
import { secondary } from "./register-controls.time-clock.component";
import { getAuthConfig } from "./time-clock.utils";

function currentMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const monthIndex = now.getMonth();
  const prefix = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  return { from: `${prefix}-01`, to: `${prefix}-${new Date(year, monthIndex + 1, 0).getDate()}` };
}

async function exportError(error, format) {
  let data = error.response?.data;
  if (data instanceof Blob) {
    try { data = JSON.parse(await data.text()); } catch {}
  }
  return (typeof data?.message === "string" && data.message.trim()) ||
    `Impossible de générer l’export ${format === "excel" ? "Excel" : "PDF"} pour le moment.`;
}

export default function ClockExport({ restaurantId, root, employees }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [range] = useState(currentMonth);
  const roster = useMemo(() => (employees || [])
    .filter((employee) => employee.accountType !== "accountant")
    .map((employee) => {
      const snapshot = employee.restaurantProfiles?.find((profile) => String(profile.restaurant) === String(restaurantId))?.snapshot;
      const firstname = snapshot?.firstname ?? employee.firstname ?? "";
      const lastname = snapshot?.lastname ?? employee.lastname ?? "";
      const post = snapshot?.post ?? employee.post ?? "";
      return { id: employee._id, label: `${firstname} ${lastname}`.trim(), subtitle: post || "Poste non renseigné" };
    }), [employees, restaurantId]);

  async function submit(payload) {
    if (busy) return;
    setBusy(true);
    setError("");
    const format = payload.format === "excel" ? "excel" : "pdf";
    const extension = format === "excel" ? "xlsx" : "pdf";
    try {
      const response = await axios.post(`${root}/export/${format}`, payload, getAuthConfig({ responseType: "blob" }));
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `heures-salaries-${payload.from}-au-${payload.to}.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setOpen(false);
    } catch (failure) {
      setError(await exportError(failure, format));
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button type="button" className={secondary} onClick={() => { setError(""); setOpen(true); }}>
      <Download size={18} /> Télécharger les heures
    </button>
    <ExportRangeModal open={open} title="Télécharger les heures des salariés"
      description="Choisissez une période, les salariés à inclure et le format d’export."
      confirmLabel="Télécharger" employees={roster} initialFrom={range.from} initialTo={range.to}
      loading={busy} submitError={error} onClose={() => { if (!busy) setOpen(false); }} onConfirm={submit} />
  </>;
}
