import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { ExternalLink } from "lucide-react";
import { listClockRecoveryItems } from "./time-clock.device";
import { control, primary, secondary } from "./register-controls.time-clock.component";
import {
  getFailedPunchesForRestaurant, getPendingPunchCountForRestaurant, replayPendingTimeClockPunches,
} from "./time-clock.offline";
import { emitTimeClockRefresh, getAuthConfig, getDashboardToken } from "./time-clock.utils";

const tabletPath = "/dashboard/webapp/time-clock";
const dateTime = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });

export default function ClockManagement({ restaurantId, root, onBusyChange }) {
  const [info, setInfo] = useState(null);
  const [deviceName, setDeviceName] = useState("");
  const [pairingLink, setPairingLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [legacy, setLegacy] = useState(0);
  const [recoveryCount, setRecoveryCount] = useState(0);
  const [pendingRevoke, setPendingRevoke] = useState(null);

  const load = useCallback(async (signal) => {
    const { data } = await axios.get(`${root}/devices`, getAuthConfig({ signal }));
    setInfo(data);
  }, [root]);

  const readLocal = useCallback(async () => {
    setLegacy(getPendingPunchCountForRestaurant(restaurantId));
    const items = await listClockRecoveryItems(restaurantId);
    setRecoveryCount(items.length + getFailedPunchesForRestaurant(restaurantId).length);
  }, [restaurantId]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.response?.data?.message || "Impossible de charger les accès de la Pointeuse.");
    });
    readLocal().catch(() => setRecoveryCount(getFailedPunchesForRestaurant(restaurantId).length));
    return () => controller.abort();
  }, [load, readLocal, restaurantId]);

  async function run(operation, success) {
    if (busy) return;
    setBusy(true);
    onBusyChange(true);
    setError("");
    setNotice("");
    try {
      await operation();
      setNotice(success);
    } catch (failure) {
      setError(failure.response?.data?.message || failure.message || "Enregistrement impossible.");
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  function createDevice(event) {
    event.preventDefault();
    if (!deviceName.trim()) return;
    run(async () => {
      const { data } = await axios.post(`${root}/devices`, { name: deviceName.trim() }, getAuthConfig());
      const url = new URL(tabletPath, window.location.origin);
      url.hash = new URLSearchParams({ association: data.code }).toString();
      setPairingLink(url.href);
      setDeviceName("");
      await load();
    }, "Lien d’association valable 10 minutes.");
  }

  function exportRecovery() {
    run(async () => {
      const entries = await listClockRecoveryItems(restaurantId);
      const old = getFailedPunchesForRestaurant(restaurantId).map(({ punch, message }) => ({
        employeeId: punch.employeeId, occurredAt: punch.occurredAt, action: punch.action,
        clientMutationId: punch.clientMutationId, status: "À régulariser", reason: message,
      }));
      const blob = new Blob([JSON.stringify([...entries, ...old], null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "pointages-a-verifier.json";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }, "Export préparé.");
  }

  function syncLegacy() {
    run(async () => {
      const result = await replayPendingTimeClockPunches({
        restaurantId, token: getDashboardToken(), apiUrl: process.env.NEXT_PUBLIC_API_URL,
      });
      await readLocal().catch(() => {});
      if (result.synced) emitTimeClockRefresh();
      if (result.stopped) throw new Error("La synchronisation a été interrompue. Les pointages restants sont conservés.");
    }, "Anciens pointages traités. Les refus éventuels restent disponibles pour export.");
  }

  return <div className="grid gap-6">
    {error && <p role="alert" className="rounded-xl bg-red/5 p-3 text-sm text-red">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    <section className="grid gap-3">
      <form className="flex flex-wrap items-end gap-2" onSubmit={createDevice}>
        <label className="grid min-w-0 flex-1 gap-1 text-sm font-semibold">Nom de la tablette
          <input className={control} value={deviceName} maxLength={60} required placeholder="Ex. Tablette de la salle"
            onChange={(event) => setDeviceName(event.target.value)} />
        </label>
        <button className={primary} disabled={busy || !deviceName.trim()}>Créer un lien d’association</button>
      </form>
      {pairingLink && <div className="flex flex-wrap gap-2 rounded-xl bg-lightGrey p-3">
        <a href={pairingLink} target="_blank" rel="noreferrer" className={secondary}>Associer cet appareil</a>
        <button type="button" className={secondary} onClick={() => run(() => navigator.clipboard.writeText(pairingLink), "Lien copié.")}>Copier le lien</button>
        <input className={`${control} w-full`} aria-label="Lien d’association" readOnly value={pairingLink} onFocus={(event) => event.target.select()} />
      </div>}
      {info?.devices?.length ? <ul className="divide-y divide-darkBlue/10 rounded-xl border border-darkBlue/10">
        {info.devices.map((device) => <li key={device._id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
          <div>
            <p className="font-semibold">{device.name}</p>
            <p className="text-xs text-darkBlue/65">{device.lastContactAt ? `Dernier contact · ${dateTime.format(new Date(device.lastContactAt))}`
              : device.activatedAt ? "Associée" : "Association en attente"}</p>
            {device.lastLimitedAt && <p className="text-xs text-amber-900">Dernière limitation PIN · {dateTime.format(new Date(device.lastLimitedAt))}</p>}
          </div>
          {pendingRevoke === device._id ? <div className="flex gap-2">
            <button className={secondary} disabled={busy} onClick={() => setPendingRevoke(null)}>Annuler</button>
            <button className={primary} disabled={busy} onClick={() => run(async () => {
              await axios.delete(`${root}/devices/${device._id}`, getAuthConfig());
              setPendingRevoke(null);
              setPairingLink("");
              await load();
            }, "Accès de la tablette révoqué.")}>Confirmer la révocation</button>
          </div> : <button className={secondary} disabled={busy} onClick={() => setPendingRevoke(device._id)}>Révoquer</button>}
        </li>)}
      </ul> : <p className="text-sm text-darkBlue/65">{info ? "Aucune tablette associée." : "Chargement des tablettes…"}</p>}
    </section>

    {(legacy > 0 || recoveryCount > 0) && <section className="grid gap-3 border-t border-darkBlue/10 pt-5">
      <h3 className="font-bold">Pointages conservés sur cet appareil</h3>
      {legacy > 0 && <button className={secondary} disabled={busy} onClick={syncLegacy}>Synchroniser les anciens pointages ({legacy})</button>}
      {recoveryCount > 0 && <button className={secondary} disabled={busy} onClick={exportRecovery}>Exporter pour régularisation ({recoveryCount})</button>}
    </section>}
    <footer className="flex justify-end border-t border-darkBlue/10 pt-4">
      <a href={tabletPath} target="_blank" rel="noreferrer" className={secondary}>
        <ExternalLink size={15} /> Ouvrir l’application
      </a>
    </footer>
  </div>;
}
