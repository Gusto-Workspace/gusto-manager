import Link from "next/link";
import { useRouter } from "next/router";
import { useContext, useEffect, useId, useState } from "react";
import axios from "axios";
import { BriefcaseBusiness, CalendarDays, Files, ShieldCheck, UserRound } from "lucide-react";
import { GlobalContext } from "@/contexts/global.context";
import CatalogHeaderDashboardComponent from "../_shared/catalog-header.dashboard.component";
import ModaleEmployeesComponent from "./modale.employees.component";
import DocumentsEmployeeComponent from "./documents.employees.component";
import AccessRightsEmployeesComponent from "./access-rights.employees.component";
import DataEmployeesComponent from "./data.employees.component";
import EmployeePin from "./employee-pin.employees.component";
import { applyRosterResponse, directoryPath, employeeDirectoryEntry, employeeProfile } from "./employee-directory.utils.mjs";

const tabs = [
  { id: "personal", label: "Informations personnelles", Icon: UserRound },
  { id: "employment", label: "Emploi et contrat", Icon: BriefcaseBusiness },
  { id: "access", label: "Compte et accès", Icon: ShieldCheck },
  { id: "documents", label: "Documents", Icon: Files },
  { id: "activity", label: "Planning et absences", Icon: CalendarDays },
];
const action = "inline-flex min-h-10 items-center gap-2 rounded-lg border border-darkBlue/15 bg-white px-3 text-sm font-semibold hover:bg-lightGrey";

function EmployeeDocuments({ baseUrl }) {
  const [docs, setDocs] = useState([]);
  const [stored, setStored] = useState(null);
  const [duplicate, setDuplicate] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    axios.get(`${baseUrl}/documents`, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setStored(data.documents || []); })
      .catch(() => { if (!controller.signal.aborted) setError("Impossible de charger les documents."); });
    return () => controller.abort();
  }, [baseUrl]);

  function selectDocuments(event) {
    const names = new Set([...docs.map(({ file }) => file.name), ...(stored || []).map(({ filename }) => filename)]);
    const selected = [];
    for (const file of event.target.files) {
      if (names.has(file.name)) {
        setDuplicate(true);
        continue;
      }
      names.add(file.name);
      selected.push({ file, title: "" });
    }
    setDocs((current) => [...current, ...selected]);
    event.target.value = "";
  }

  async function uploadDocuments() {
    if (uploading || !docs.length) return;
    setUploading(true);
    setError("");
    const form = new FormData();
    docs.forEach(({ file, title }) => {
      form.append("documents", file);
      form.append("titles", title);
    });
    try {
      const { data } = await axios.post(`${baseUrl}/documents`, form);
      setStored(data.documents || []);
      setDocs([]);
    } catch (failure) {
      setError(failure.response?.data?.message || "Impossible d’ajouter les documents.");
    } finally {
      setUploading(false);
    }
  }

  async function deleteDocument() {
    if (!toDelete) return;
    setDeleting(true);
    setError("");
    try {
      const { data } = await axios.delete(`${baseUrl}/documents/${encodeURIComponent(toDelete.public_id)}`);
      setStored(data.documents || []);
      setToDelete(null);
    } catch (failure) {
      setError(failure.response?.data?.message || "Impossible de retirer le document.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="grid gap-3">
      {error && <p role="alert" className="rounded-lg bg-white p-3 text-sm text-red">{error}</p>}
      {stored === null && !error && <p role="status" className="text-sm text-darkBlue/70">Chargement des documents…</p>}
      {stored !== null && <>
        <DocumentsEmployeeComponent
          docs={docs}
          baseUrl={baseUrl}
          currentDocuments={stored}
          isUploadingDocs={uploading}
          isDeletingDocId={deleting ? toDelete?.public_id : null}
          onDocsChange={selectDocuments}
          onSaveDocs={uploadDocuments}
          confirmDeleteDoc={setToDelete}
          removeSelectedDoc={(index) => setDocs((current) => current.filter((_, item) => item !== index))}
          onDocTitleChange={(index, title) => setDocs((current) => current.map((doc, item) => item === index ? { ...doc, title } : doc))}
          showUploader
        />
        {!stored.length && !docs.length && <p className="text-sm text-darkBlue/70">Aucun document enregistré pour ce restaurant.</p>}
      </>}
      {duplicate && <ModaleEmployeesComponent type="duplicate" onCloseDuplicate={() => setDuplicate(false)} />}
      {toDelete && (
        <ModaleEmployeesComponent
          docToDelete={toDelete}
          setDocToDelete={setToDelete}
          onDeleteDoc={deleteDocument}
          isDeletingDocId={deleting ? toDelete.public_id : null}
        />
      )}
    </div>
  );
}

function EmployeeActivity({ employeeId, restaurantId, leaveRequests }) {
  const pending = (leaveRequests || []).filter((request) => request.status === "pending").length;
  const query = { employeeId, restaurantId };
  return (
    <section className="grid gap-4 overflow-hidden rounded-xl border border-darkBlue/10 bg-white p-4 midTablet:p-5">
      <header className="-mx-4 -mt-4 flex min-h-16 items-center border-b border-darkBlue/10 px-4 py-3 midTablet:-mx-5 midTablet:-mt-5 midTablet:px-5">
        <h2 className="flex min-h-10 items-center text-lg font-semibold">Planning et absences</h2>
      </header>
      <div className="grid gap-3">
        <p className="text-sm text-darkBlue/70">{pending ? `${pending} demande${pending > 1 ? "s" : ""} de congé en attente.` : "Aucune demande de congé en attente."}</p>
        <div className="flex flex-wrap gap-2">
          <Link href={{ pathname: `${directoryPath}/planning`, query }} className={action}>Voir son planning</Link>
          <Link href={{ pathname: `${directoryPath}/planning/days-off`, query }} className={action}>Voir ses demandes de congé</Link>
          <Link href={{ pathname: `${directoryPath}/time-clock`, query: { employeeId } }} className={action}>Voir le pointage</Link>
        </div>
      </div>
    </section>
  );
}

export default function DetailsEmployeesComponent({ employeeId }) {
  const { restaurantContext } = useContext(GlobalContext);
  const { restaurantData: restaurant, setRestaurantData } = restaurantContext;
  const restaurantId = restaurant._id;
  const router = useRouter();
  const tabsId = useId();
  const [visitedDocuments, setVisitedDocuments] = useState(false);
  const employee = [...(restaurant.employees || []), ...(restaurant.accountants || [])].find((item) => String(item._id) === String(employeeId));
  const baseUrl = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/${employeeId}`;
  const visibleTabs = employee?.accountType === "accountant" ? tabs.slice(0, 1) : tabs;
  const selected = visibleTabs.find(({ id }) => id === router.query.tab)?.id || "personal";

  useEffect(() => {
    if (selected === "documents") setVisitedDocuments(true);
  }, [selected]);

  const returnToDirectory = () => router.push(directoryPath);

  if (!employee) return (
    <CatalogHeaderDashboardComponent
      title="Fiche indisponible dans ce restaurant"
      onBack={returnToDirectory}
      backLabel="Retour à la liste des salariés"
    />
  );

  const entry = employeeDirectoryEntry(employee, restaurantId);
  const profile = employeeProfile(employee, restaurantId);
  const workforce = entry.accountType === "employee";
  const viewer = restaurantContext.userConnected;

  async function save(changes) {
    const { data } = await axios.patch(baseUrl, changes);
    setRestaurantData((previous) => applyRosterResponse(previous, restaurantId, data.restaurant));
  }

  function selectTab(id) {
    const query = { employeeId, ...(id !== "personal" && { tab: id }) };
    router.replace({ pathname: router.pathname, query }, undefined, { shallow: true, scroll: false });
  }

  function handleTabKey(event, index) {
    const last = visibleTabs.length - 1;
    const positions = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last };
    if (!Object.hasOwn(positions, event.key)) return;
    event.preventDefault();
    const { id } = visibleTabs[positions[event.key]];
    selectTab(id);
    document.getElementById(`${tabsId}-tab-${id}`)?.focus();
  }

  function panel(id) {
    return { id: `${tabsId}-panel-${id}`, role: "tabpanel", "aria-labelledby": `${tabsId}-tab-${id}`, hidden: selected !== id };
  }

  return (
    <section className="grid min-w-0 gap-4">
      <header>
        <CatalogHeaderDashboardComponent
          title={<span className="[overflow-wrap:anywhere]">{entry.name}</span>}
          subtitle={workforce ? entry.post || "Salarié" : "Comptable"}
          onBack={returnToDirectory}
          backLabel="Retour à la liste des salariés"
        />
      </header>

      <div role="tablist" aria-label="Fiche salarié" className="flex flex-wrap gap-x-2 border-b border-darkBlue/10">
        {visibleTabs.map(({ id, label, Icon }, index) => (
          <button key={id} type="button" role="tab" id={`${tabsId}-tab-${id}`} aria-selected={selected === id}
            aria-controls={`${tabsId}-panel-${id}`} tabIndex={selected === id ? 0 : -1}
            onClick={() => selectTab(id)} onKeyDown={(event) => handleTabKey(event, index)}
            className={`-mb-px inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-t border-b-2 px-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue midTablet:gap-2 midTablet:px-3 midTablet:text-sm ${selected === id ? "border-blue bg-blue/5 text-blue" : "border-transparent text-darkBlue/70 hover:bg-white"}`}>
            <Icon size={16} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      <div {...panel("personal")}><DataEmployeesComponent section="personal" employee={employee} profile={profile} onSave={save} /></div>
      {workforce && <>
        <div {...panel("employment")}><DataEmployeesComponent section="employment" employee={employee} profile={profile} onSave={save} /></div>
        <div {...panel("access")}>
          <div className="grid gap-4">
            <AccessRightsEmployeesComponent options={profile?.options} onSave={save} hasEmail={Boolean(entry.email)} />
            {selected === "access" && viewer?.superAdmin !== true && (
              <EmployeePin restaurantId={restaurantId} employeeId={employeeId} canReveal={viewer?.role === "owner"} />
            )}
          </div>
        </div>
        <div {...panel("documents")}>{(selected === "documents" || visitedDocuments) && <EmployeeDocuments baseUrl={baseUrl} />}</div>
        <div {...panel("activity")}>
          <EmployeeActivity employeeId={employeeId} restaurantId={restaurantId} leaveRequests={employee.leaveRequests ?? profile?.leaveRequests} />
        </div>
      </>}
    </section>
  );
}
