import Link from "next/link";
import useDialogBackdrop from "../_shared/use-dialog-backdrop";
import Image from "next/image";
import { useContext, useEffect, useRef, useState } from "react";
import axios from "axios";
import { CalendarDays, ChevronRight, ClipboardList, Clock3, Plus, Search, Trash2, UsersRound } from "lucide-react";
import { EmployeesSvg } from "@/components/_shared/_svgs/employees.svg";
import { GlobalContext } from "@/contexts/global.context";
import CatalogHeaderDashboardComponent from "../_shared/catalog-header.dashboard.component";
import {
  applyRosterResponse, directoryPath, employeeDirectoryEntry, filterDirectory, normalizePersonnelSearch,
} from "./employee-directory.utils.mjs";

const emptyFilters = { search: "", post: "", account: "" };
const control = "h-12 max-w-full rounded-2xl border border-darkBlue/10 bg-white/70 px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue";
const action = "inline-flex min-h-10 items-center gap-2 rounded-lg border border-darkBlue/15 bg-white px-3 text-sm font-semibold hover:bg-lightGrey";
const headerAction = "inline-flex items-center gap-2 whitespace-nowrap rounded-2xl border px-3 py-2 text-sm font-semibold transition hover:bg-darkBlue/5 midTablet:px-4";
const secondaryHeaderAction = `${headerAction} border-darkBlue/10 bg-white/70`;
const headerIcon = "grid size-9 shrink-0 place-items-center rounded-full";
const rowAction = "inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-darkBlue/15 bg-white hover:bg-lightGrey focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue";
const headCell = "px-4 py-3 text-left text-xs font-semibold text-darkBlue/70 whitespace-nowrap";
const cell = "px-4 py-3 text-sm";

export function EmployeeAvatar({ entry, large = false }) {
  const image = entry.employee.profilePicture?.url;
  return (
    <span aria-hidden="true" className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-blue/10 font-semibold text-blue ${large ? "size-14 text-lg" : "size-9 text-xs"}`}>
      {image ? <Image src={image} alt="" fill sizes={large ? "56px" : "36px"} className="object-cover" unoptimized />
        : entry.initials || <UsersRound size={18} />}
    </span>
  );
}

export default function ListEmployeesComponent() {
  const { restaurantContext } = useContext(GlobalContext);
  const { restaurantData: restaurant, setRestaurantData } = restaurantContext;
  const restaurantId = restaurant._id;
  const storageKey = `gusto:employee-directory:${restaurantContext.userConnected.id}:${restaurantId}`;
  const [filters, setFilters] = useState(emptyFilters);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const removalDialog = useRef(null);
  const backdrop = useDialogBackdrop(() => { if (!busy) setSelected(null); });

  useEffect(() => {
    const dialog = removalDialog.current;
    if (!selected) return undefined;
    dialog.showModal();
    return () => dialog.close();
  }, [selected]);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey));
      if (saved) {
        const { search = "", post = "", account = "" } = saved;
        setFilters({ search, post, account });
      }
    } catch {
      // Filters remain available for the current visit.
    }
  }, [storageKey]);

  function updateFilters(next) {
    setFilters(next);
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Keep filtering if browser storage is unavailable.
    }
  }

  const entries = [...(restaurant.employees || []), ...(restaurant.accountants || [])]
    .map((employee) => employeeDirectoryEntry(employee, restaurantId))
    .sort((a, b) => a.lastname.localeCompare(b.lastname, "fr", { sensitivity: "base" }) ||
      a.firstname.localeCompare(b.firstname, "fr", { sensitivity: "base" }));
  const posts = [...new Map(entries.filter((entry) => entry.post && entry.accountType === "employee")
    .map((entry) => [normalizePersonnelSearch(entry.post), entry.post]))]
    .sort(([, a], [, b]) => a.localeCompare(b, "fr"));
  const visible = filterDirectory(entries, filters);
  const filtered = Object.values(filters).some(Boolean);

  async function removeEmployee() {
    setBusy(true);
    setError("");
    try {
      const { data } = await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/${selected.id}`);
      setRestaurantData((previous) => applyRosterResponse(previous, restaurantId, data.restaurant));
      setSelected(null);
    } catch (failure) {
      setError(failure.response?.data?.message || "Impossible de retirer ce membre.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid min-w-0 gap-4">
      <header>
        <CatalogHeaderDashboardComponent
          icon={<span aria-hidden="true"><EmployeesSvg width={30} height={30} fillColor="#131E3690" /></span>}
          title="Gestion du personnel"
          subtitle={<span role="status">{visible.length}{filtered ? ` sur ${entries.length}` : ""} {entries.length === 1 ? "membre" : "membres"}</span>}
          actions={
            <nav aria-label="Gestion du personnel" className="flex flex-wrap gap-1">
              <Link href={`${directoryPath}/time-clock`} className={secondaryHeaderAction}>
                <span className={`${headerIcon} bg-blue/15 text-blue`}><Clock3 size={16} aria-hidden="true" /></span>
                Pointeuse
              </Link>
              <Link href={`${directoryPath}/planning`} className={secondaryHeaderAction}>
                <span className={`${headerIcon} bg-violet text-white`}><CalendarDays size={16} aria-hidden="true" /></span>
                Planning
              </Link>
              <Link href={`${directoryPath}/reports`} className={secondaryHeaderAction}>
                <span className={`${headerIcon} bg-blue/15 text-blue`}><ClipboardList size={16} aria-hidden="true" /></span>
                Rapport
              </Link>
              <Link href={`${directoryPath}/add`} className={`${headerAction} border-blue bg-white text-blue shadow-sm`}>
                <span className={`${headerIcon} bg-blue/15`}><Plus size={16} aria-hidden="true" /></span>
                Ajouter un employé
              </Link>
            </nav>
          }
        />
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[min(100%,15rem)] flex-1">
          <Search aria-hidden="true" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-darkBlue/40" />
          <input type="search" aria-label="Rechercher un membre" placeholder="Nom, e-mail ou téléphone" value={filters.search}
            onChange={(event) => updateFilters({ ...filters, search: event.target.value })} className={`${control} w-full pl-9`} />
        </label>
        <select className={control} aria-label="Filtrer par poste" value={filters.post} onChange={(event) => updateFilters({ ...filters, post: event.target.value })}>
          <option value="">Tous les postes</option>
          {posts.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <select className={control} aria-label="Filtrer par type de compte" value={filters.account} onChange={(event) => updateFilters({ ...filters, account: event.target.value })}>
          <option value="">Tous les types</option><option value="employee">Salariés</option><option value="accountant">Comptables</option>
        </select>
        {filtered && <button type="button" className={action} onClick={() => updateFilters(emptyFilters)}>Effacer les filtres</button>}
      </div>

      <div className="min-w-0 rounded-xl border border-darkBlue/10 bg-white">
        {visible.length ? (
          <div className="overflow-x-auto rounded-xl" tabIndex={0} role="region" aria-label="Liste des membres">
            <table className="w-full min-w-[720px] border-separate border-spacing-0">
              <thead className="bg-[#f4f6fb]">
                <tr>
                  <th scope="col" className={headCell}>Nom et prénom</th>
                  <th scope="col" className={headCell}>Poste</th>
                  <th scope="col" className={headCell}>Contrat</th>
                  <th scope="col" className={headCell}>Compte</th>
                  <th scope="col" className={`${headCell} w-[30%]`}>Contact</th>
                  <th scope="col" className={`${headCell} w-px`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((entry) => {
                  const href = `${directoryPath}/${entry.id}`;
                  return (
                    <tr key={entry.id} className="hover:bg-lightGrey/70 [&>td]:border-t [&>td]:border-darkBlue/10">
                      <td className={cell}>
                        <Link href={href} className="inline-flex min-h-10 items-center gap-2.5 rounded font-semibold hover:text-blue">
                          <EmployeeAvatar entry={entry} /><span className="min-w-24">{entry.name}</span>
                        </Link>
                      </td>
                      <td className={cell}>{entry.post || "—"}</td>
                      <td className={cell}>{entry.contract || "—"}</td>
                      <td className={cell}>
                        <span className="whitespace-nowrap rounded-md bg-blue/10 px-2 py-1 text-xs font-semibold text-blue">{entry.accountType === "accountant" ? "Comptable" : "Salarié"}</span>
                        {!entry.email && <span className="mt-1 block whitespace-nowrap text-xs text-darkBlue/60">Sans e-mail</span>}
                      </td>
                      <td className={`${cell} max-w-0`}>
                        <p className="truncate" title={entry.email || undefined}>{entry.email || "—"}</p>
                        {entry.phone && <p className="mt-0.5 whitespace-nowrap text-xs text-darkBlue/65">{entry.phone}</p>}
                      </td>
                      <td className={cell}>
                        <div className="inline-flex items-center gap-1">
                          <Link href={href} aria-label={`Ouvrir la fiche de ${entry.name}`} className={rowAction}><ChevronRight size={17} aria-hidden="true" /></Link>
                          <button type="button" aria-label={`Retirer ${entry.name} du restaurant`} className={`${rowAction} text-red`}
                            onClick={() => { setError(""); setSelected(entry); }}><Trash2 size={15} aria-hidden="true" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-darkBlue/70">
            {entries.length ? "Aucun membre ne correspond à ces filtres." : "Aucun membre n’est rattaché à ce restaurant."}
          </p>
        )}
      </div>

      <dialog ref={removalDialog}
        aria-labelledby="employee-remove-title"
        aria-describedby="employee-remove-description"
        {...backdrop}
        className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md rounded-xl bg-white p-5 text-darkBlue shadow-lg backdrop:bg-darkBlue/35"
      >
        {selected && <div className="grid gap-4">
          <h2 id="employee-remove-title" className="text-balance text-center font-semibold">Retirer {selected.name} de {restaurant.name} ?</h2>
          <p id="employee-remove-description" className="text-balance text-center text-sm text-darkBlue/70">Ce retrait supprime les données RH de ce restaurant pour ce membre.</p>
          {error && <p role="alert" className="text-sm text-red">{error}</p>}
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" disabled={busy} className={action} onClick={() => setSelected(null)}>Annuler</button>
            <button type="button" disabled={busy} className="min-h-10 rounded-lg bg-red px-3 text-sm font-semibold text-white disabled:opacity-60" onClick={removeEmployee}>
              {busy ? "Retrait en cours…" : "Retirer du restaurant"}
            </button>
          </div>
        </div>}
      </dialog>
    </section>
  );
}
