import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { getAdminAuthConfig } from "../_shared/utils/admin-auth.utils";

const fieldClass = "w-full rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm";
const buttonClass = "rounded-xl bg-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";

function fieldsFor(spec, catalog) {
  if (!Array.isArray(spec?.fields)) throw new Error("Champs réglementaires indisponibles.");
  return spec.fields.map(item => {
    const name = typeof item === "string" ? item : item?.machine_name || item?.machineName;
    if (!name || !/^[a-z0-9_]+$/i.test(name)) throw new Error("Champ réglementaire non reconnu.");
    const detail = (spec.detailed_fields || []).find(row => row.machine_name === name) || (typeof item === "object" ? item : {});
    const typeField = (catalog?.fields || []).find(row => (row.machine_name || row.machineName) === name) || {};
    const label = detail.friendly_name || detail.friendlyName || typeField.friendly_name || typeField.friendlyName || name;
    return { name, label, description: detail.description || "", optional: /\boptional\b|\bfacultatif\b/i.test(`${label} ${detail.description || ""}`) };
  });
}

function parseRequirements(response, endUserType) {
  const req = response?.requirements;
  const user = Array.isArray(req?.end_user) && req.end_user.find(item => item.type === endUserType);
  const userCatalog = response?.endUserTypes?.find(item => item.machineName === endUserType);
  if (!user || !userCatalog || !Array.isArray(req.supporting_document) || !Array.isArray(response.supportingDocumentTypes)) throw new Error("Exigences Twilio incomplètes ou non reconnues.");
  const groups = req.supporting_document.map(group => {
    if (!Array.isArray(group) || !group.length) throw new Error("Groupe de justificatifs non reconnu.");
    return group.map(requirement => {
      if (!Array.isArray(requirement.accepted_documents) || !requirement.accepted_documents.length) throw new Error("Types de justificatifs indisponibles.");
      const choices = requirement.accepted_documents.map(option => {
        const catalog = response.supportingDocumentTypes.find(item => item.machineName === option.type);
        if (!catalog) return null;
        return { type: option.type, label: option.name || catalog.friendlyName || option.type, fields: fieldsFor(option, catalog) };
      }).filter(Boolean);
      if (!choices.length) throw new Error("Aucun type de justificatif compatible avec ce parcours.");
      return { name: requirement.name || requirement.requirement_name || "Justificatif", description: requirement.description || "", choices };
    });
  });
  if (!groups.length || groups.some(group => group.length > 10)) throw new Error("Ces exigences ne sont pas prises en charge par le parcours de soumission.");
  return { userFields: fieldsFor(user, userCatalog), groups };
}

async function validFile(file) {
  const signatures = { "application/pdf": [0x25, 0x50, 0x44, 0x46, 0x2d], "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "image/jpeg": [0xff, 0xd8, 0xff] };
  const signature = signatures[file?.type];
  if (!signature || !file.size || file.size > 5 * 1024 * 1024) return false;
  const bytes = new Uint8Array(await file.slice(0, signature.length).arrayBuffer());
  return signature.every((byte, index) => bytes[index] === byte);
}

function RegulatoryFields({ fields, values, onChange, disabled, addresses = [] }) {
  return fields.map(item => <label key={item.name} className="block text-sm">{item.label}{item.optional ? " (facultatif)" : " *"}
    {item.description && <span className="block text-xs text-darkBlue/60">{item.description}</span>}
    {item.name === "address_sids" ? <select className={`${fieldClass} mt-1`} name={item.name} value={values[item.name] || ""} disabled={disabled} onChange={event => onChange(item.name, event.target.value)}><option value="">Choisir une adresse validée</option>{addresses.filter(address => address.validated).map(address => <option key={address.sid} value={address.sid}>{[address.customerName, address.street, address.postalCode, address.city].filter(Boolean).join(" · ")}</option>)}</select> : <input className={`${fieldClass} mt-1`} name={item.name} value={values[item.name] || ""} disabled={disabled} onChange={event => onChange(item.name, event.target.value)} autoComplete="off" />}
  </label>);
}

export default function CallSenseRegulatoryForm({ base, draft, restaurant, complianceStatus, active, disabled, onRefresh }) {
  const endUserType = "business";
  const [requirements, setRequirements] = useState(null);
  const [requirementsLoading, setRequirementsLoading] = useState(false);
  const [requirementsError, setRequirementsError] = useState("");
  const [addresses, setAddresses] = useState([]);
  const [addressInput, setAddressInput] = useState({ customerName: "", street: restaurant?.address?.line1 || "", city: restaurant?.address?.city || "", postalCode: restaurant?.address?.zipCode || "", region: "", isoCountry: "FR" });
  const [addressStatus, setAddressStatus] = useState("");
  const [groupIndex, setGroupIndex] = useState(0);
  const [userValues, setUserValues] = useState({});
  const [email, setEmail] = useState(restaurant?.email || "");
  const [documents, setDocuments] = useState([]);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [rejection, setRejection] = useState(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const running = useRef(false);
  const requirementsAttempted = useRef(false);
  const submission = draft?.regulatorySubmission;
  const locked = disabled || refreshFailed || result?.status === "pending-review" || ["running", "uncertain", "submitted"].includes(submission?.state);
  const existingBundle = Boolean(draft?.regulatoryBundleSid && !submission?.bundleSid);
  const blocked = locked || existingBundle || ["pending", "uncertain", "completed"].includes(draft?.bundleCloneOperation);
  const phase = submission?.phase || "";
  const stages = ["Utilisateur final", "Justificatifs", "Dossier et affectations", "Évaluation", "Soumission"];
  const phaseIndex = phase === "end_user" ? 0 : phase.startsWith("document_") ? 1 : phase === "bundle" || phase.startsWith("assignment_") ? 2 : ["evaluation", "noncompliant"].includes(phase) ? 3 : ["submission", "submitted"].includes(phase) ? 4 : -1;
  const completedIndex = submission?.state === "submitted" ? 5 : phaseIndex;
  const group = requirements?.groups[groupIndex] || [];
  const setDocument = (index, patch) => setDocuments(current => { const next = [...current]; next[index] = { ...next[index], ...patch }; return next; });
  const createAddress = async () => {
    if (running.current || loading) return;
    if (draft?.regulatoryAddress?.state === "completed") { setError("Une adresse a déjà été créée. Actualisez son état avant toute autre tentative."); return; }
    if (![addressInput.customerName, addressInput.street, addressInput.city, addressInput.postalCode].every(value => value.trim())) { setError("Complétez le titulaire et l’adresse avant création."); return; }
    running.current = true; setLoading(true); setError("");
    try {
      const response = await axios.post(`${base}/addresses`, { ...addressInput, confirm: true, reconcile: draft?.regulatoryAddress?.state === "uncertain" }, getAdminAuthConfig());
      const listing = await axios.get(`${base}/addresses`, getAdminAuthConfig()); setAddresses(listing.data.addresses || []);
      setAddressStatus(response.data.validated ? "Adresse validée : sélectionnez-la ci-dessous." : "Adresse créée, mais pas encore validée par Twilio. Vérifiez son état avant de continuer.");
      await onRefresh();
    } catch (err) { setError(err?.response?.data?.message || "Création d’adresse non confirmée : vérifiez son état avant de recommencer."); try { await onRefresh(); } catch (_) { setRefreshFailed(true); } }
    finally { running.current = false; setLoading(false); }
  };
  const refreshAddresses = async () => {
    if (running.current) return;
    running.current = true; setLoading(true); setError("");
    try { const response = await axios.get(`${base}/addresses`, getAdminAuthConfig()); setAddresses(response.data.addresses || []); setAddressStatus("Liste des adresses actualisée."); }
    catch (_) { setError("Impossible de vérifier les adresses ; réessayez plus tard."); }
    finally { running.current = false; setLoading(false); }
  };
  const resubmit = async () => {
    if (running.current || disabled) return;
    running.current = true; setLoading(true); setError("");
    try { const response = await axios.post(`${base}/regulatory-resubmission`, { confirm: true }, getAdminAuthConfig()); setResult(response.data); }
    catch (err) { setError(err?.response?.data?.message || "Resoumission non confirmée : vérifiez son état avant toute reprise."); }
    finally { try { await onRefresh(); } catch (_) { setRefreshFailed(true); } running.current = false; setLoading(false); }
  };
  const loadRejection = async () => {
    if (running.current) return;
    running.current = true; setLoading(true); setError("");
    try { const response = await axios.get(`${base}/regulatory-rejection`, getAdminAuthConfig()); setRejection(response.data); }
    catch (err) { setError(err?.response?.data?.message || "Impossible de charger les motifs du refus."); }
    finally { running.current = false; setLoading(false); }
  };

  const loadRequirements = useCallback(async () => {
    if (running.current || blocked) return;
    running.current = true; setLoading(true); setRequirementsLoading(true); setRequirementsError(""); setError(""); setRequirements(null); setResult(null);
    try {
      const response = await axios.get(`${base}/regulatory-requirements`, getAdminAuthConfig({ params: { endUserType } }));
      const parsed = parseRequirements(response.data, endUserType);
      if (parsed.groups.some(group => group.some(item => item.choices.some(choice => choice.fields.some(field => field.name === "address_sids"))))) {
        const addressResponse = await axios.get(`${base}/addresses`, getAdminAuthConfig());
        setAddresses(addressResponse.data.addresses || []);
      } else setAddresses([]);
      setRequirements(parsed); setGroupIndex(0); setUserValues({}); setDocuments(parsed.groups[0].map(() => ({ type: "", attributes: {}, file: null }))); setConfirmed(false);
    } catch (err) { setRequirementsError(err?.response?.data?.message || "Impossible de charger les exigences Twilio."); }
    finally { running.current = false; setLoading(false); setRequirementsLoading(false); }
  }, [base, blocked]);
  useEffect(() => {
    if (!active || blocked || requirementsAttempted.current) return;
    requirementsAttempted.current = true;
    loadRequirements();
  }, [active, blocked, loadRequirements]);
  const submit = async event => {
    event.preventDefault();
    if (running.current || blocked || !requirements) return;
    setError(""); setResult(null);
    const missingUser = requirements.userFields.some(item => !item.optional && !String(userValues[item.name] || "").trim());
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.trim().length > 254 || missingUser) { setError("Renseignez l’adresse e-mail et tous les champs obligatoires de l’utilisateur final."); return; }
    if (!confirmed) { setError("Confirmez que les informations concernent le véritable utilisateur final."); return; }
    for (let i = 0; i < group.length; i++) {
      const doc = documents[i];
      const choice = group[i].choices.find(item => item.type === doc?.type);
      const metadataOnly = choice?.fields.some(item => item.name === "address_sids");
      if (!choice || choice.fields.some(item => !item.optional && !String(doc.attributes?.[item.name] || "").trim()) || (!doc.file && !metadataOnly)) { setError(`Complétez les champs et choisissez le fichier : ${group[i].name}.`); return; }
      try { if (doc.file && !(await validFile(doc.file))) { setError(`Fichier invalide pour ${group[i].name} : PDF, PNG ou JPEG de 5 Mo maximum requis.`); return; } }
      catch (_) { setError(`Impossible de lire le fichier pour ${group[i].name}.`); return; }
    }
    if (running.current) return;
    running.current = true; setLoading(true);
    try {
      const cleanValues = (fields, values) => Object.fromEntries(fields.filter(item => String(values[item.name] || "").trim()).map(item => [item.name, item.name === "address_sids" ? [String(values[item.name]).trim()] : String(values[item.name]).trim()]));
      const selected = group.map((item, index) => ({ choice: item.choices.find(choice => choice.type === documents[index].type), file: documents[index].file, values: documents[index].attributes }));
      let fileIndex = 0;
      const payload = { confirm: true, endUserType, endUserAttributes: cleanValues(requirements.userFields, userValues), email: email.trim(), documents: selected.map(item => ({ type: item.choice.type, attributes: cleanValues(item.choice.fields, item.values), fileIndex: item.file ? fileIndex++ : null })) };
      const form = new FormData(); form.append("payload", JSON.stringify(payload)); selected.forEach(item => { if (item.file) form.append("documents", item.file); });
      const response = await axios.post(`${base}/regulatory-submission`, form, getAdminAuthConfig());
      setResult(response.data);
      if (response.data.status === "pending-review") { setUserValues({}); setEmail(""); setDocuments([]); setRequirements(null); setConfirmed(false); }
    } catch (err) { setError(err?.response?.data?.message || "Envoi non confirmé : vérifiez l’état du dossier avant toute reprise."); }
    finally { try { await onRefresh(); setRefreshFailed(false); } catch (_) { setRefreshFailed(true); setError("Impossible d’actualiser l’état : rechargez l’assistant et vérifiez le dossier avant toute reprise."); } running.current = false; setLoading(false); }
  };

  return <div className="rounded-xl border border-darkBlue/10 bg-white p-4 text-sm">
    <p className="font-semibold">Créer le dossier de l’utilisateur final</p>
    <p className="mt-1 text-darkBlue/60">Renseignez les informations du véritable titulaire du numéro. Les données saisies et fichiers restent dans ce formulaire jusqu’à l’envoi et ne sont pas mémorisés après rechargement.</p>
    {submission?.state && <ol className="mt-3 space-y-1" aria-label="Progression du dossier réglementaire">{stages.map((stage, index) => <li key={stage}>{index < completedIndex ? "✓" : index === phaseIndex ? "•" : "○"} {stage}{index === phaseIndex && submission.state !== "submitted" ? " — étape à vérifier" : ""}</li>)}</ol>}
    {(submission?.state === "submitted" || result?.status === "pending-review") && <p role="status" className="mt-2">{complianceStatus === "twilio-approved" ? "Dossier approuvé" : complianceStatus === "twilio-rejected" ? "Dossier refusé par Twilio : une correction est nécessaire avant de poursuivre." : ["pending-review", "in-review"].includes(complianceStatus) || result?.status === "pending-review" ? "Votre dossier a été transmis à Twilio. Il est en cours de vérification. Vous n'avez aucune action à effectuer pour le moment." : "Dossier transmis ; statut Twilio actuellement indisponible."}</p>}
    {result?.automationWarning && <p role="alert" className="mt-2 text-orange-700">{result.automationWarning}</p>}
    {(complianceStatus === "twilio-rejected" || draft?.regulatoryResubmission?.state === "uncertain") && <div className="mt-3">{complianceStatus === "twilio-rejected" && !rejection && draft?.regulatoryResubmission?.state !== "uncertain" && <button type="button" className={`${buttonClass} mt-2`} disabled={loading || disabled} onClick={loadRejection}>Consulter les motifs du refus</button>}{rejection && <div className="mt-2">{rejection.documents.map(doc => <div key={doc.sid} className="mt-2"><p className="font-semibold">{doc.type} : {doc.status}</p><p>{doc.failureReason || "Aucun motif détaillé fourni pour cette pièce."}</p>{doc.errors.map((issue, index) => <p key={index}>{typeof issue === "string" ? issue : issue?.message || issue?.description || issue?.error_code || "Détail à vérifier"}</p>)}</div>)}</div>}{(rejection || draft?.regulatoryResubmission?.state === "uncertain") && <><p className="mt-2">Après correction des informations dans le dossier Twilio, relancez son évaluation et sa soumission.</p><button type="button" className={`${buttonClass} mt-2`} disabled={loading || disabled || refreshFailed || draft?.regulatoryResubmission?.state === "pending"} onClick={resubmit}>{draft?.regulatoryResubmission?.state === "uncertain" ? "Vérifier la resoumission" : "Évaluer et resoumettre le dossier"}</button></>}{["pending", "uncertain"].includes(draft?.regulatoryResubmission?.state) && <p role="alert">Resoumission en cours ou incertaine : vérifiez le dossier avant toute reprise.</p>}</div>}
    {submission?.state === "running" && <p role="alert" className="mt-2 text-orange-700">Opération en cours ou interrompue. Vérifiez son état avant toute reprise ; ne relancez pas la création.</p>}
    {submission?.state === "uncertain" && <p role="alert" className="mt-2 text-orange-700">Résultat incertain : vérifiez les ressources dans Twilio. La reprise est bloquée pour éviter les doublons.</p>}
    {submission?.state === "waiting" && <p role="alert" className="mt-2 text-orange-700">Évaluation non conforme. La reprise exige exactement les mêmes informations et fichiers ; toute correction exige une vérification manuelle du dossier Twilio.</p>}
    {existingBundle && <p className="mt-2">Un dossier est déjà associé. La création d’un autre dossier est bloquée.</p>}
    {error && <p role="alert" className="mt-2 text-red">{error}</p>}
    {draft?.regulatoryAddress?.state === "uncertain" && <div className="mt-3 space-y-2 rounded-xl border border-orange-200 p-3"><p>Pour vérifier l’adresse sans en créer une nouvelle, ressaisissez exactement les informations envoyées.</p>{[["customerName", "Nom légal du titulaire"], ["street", "Rue et numéro"], ["postalCode", "Code postal"], ["city", "Ville"], ["region", "Région (facultatif)"], ["isoCountry", "Pays (code à deux lettres)"]].map(([name, label]) => <label key={name} className="block">{label}<input className={`${fieldClass} mt-1`} value={addressInput[name]} disabled={loading} onChange={event => setAddressInput(current => ({ ...current, [name]: event.target.value }))} /></label>)}<button type="button" className={buttonClass} disabled={loading} onClick={createAddress}>Vérifier l’adresse existante</button></div>}
    {result?.status === "noncompliant" && <div role="alert" className="mt-2"><p>Évaluation non conforme : le dossier n’a pas été soumis. Vérifiez les exigences auprès de Twilio.</p>{Array.isArray(result.results) && result.results.map((row, index) => <p key={index}>{row?.error_code || row?.errorCode || row?.requirement_name || row?.requirementName || `Exigence ${index + 1}`} : {row?.valid === true ? "conforme" : "à vérifier"}</p>)}</div>}
    {!blocked && <form className="mt-3 space-y-3" onSubmit={submit} noValidate>
      {requirementsLoading && <p role="status">Chargement des exigences réglementaires…</p>}
      {requirementsError && <div role="alert"><p>{requirementsError}</p><button type="button" className={`${buttonClass} mt-2`} disabled={loading} onClick={loadRequirements}>Réessayer</button></div>}
      {requirements && <>
        <label className="block">E-mail de suivi du dossier *<span className="block text-xs text-darkBlue/60">Vérifiez l’adresse avant l’envoi : Twilio y transmettra le suivi du dossier.</span><input className={`${fieldClass} mt-1`} type="email" value={email} onChange={event => setEmail(event.target.value)} disabled={loading} autoComplete="off" /></label>
        <RegulatoryFields fields={requirements.userFields} values={userValues} disabled={loading} onChange={(name, value) => setUserValues(current => ({ ...current, [name]: value }))} />
        {draft?.regulatoryAddress?.state === "completed" && <div><button type="button" className="text-blue underline" disabled={loading} onClick={refreshAddresses}>Actualiser les adresses</button>{addressStatus && <p role="status">{addressStatus}</p>}</div>}
        {requirements.groups.length > 1 && <label className="block">Ensemble de justificatifs<select className={`${fieldClass} mt-1`} value={groupIndex} disabled={loading} onChange={event => { const index = Number(event.target.value); setGroupIndex(index); setDocuments(requirements.groups[index].map(() => ({ type: "", attributes: {}, file: null }))); }}>
          {requirements.groups.map((items, index) => <option value={index} key={index}>{items.map(item => item.name).join(" + ")}</option>)}
        </select></label>}
        {group.map((item, index) => { const doc = documents[index] || {}; const choice = item.choices.find(entry => entry.type === doc.type); return <fieldset key={`${groupIndex}-${index}`} className="space-y-2 rounded-xl border border-darkBlue/10 p-3"><legend className="font-semibold">{item.name} *</legend>{item.description && <p className="text-xs text-darkBlue/60">{item.description}</p>}
          <label className="block">Type de justificatif<select className={`${fieldClass} mt-1`} value={doc.type || ""} disabled={loading} onChange={event => setDocument(index, { type: event.target.value, attributes: {}, file: null })}><option value="">Choisir</option>{item.choices.map(option => <option key={option.type} value={option.type}>{option.label}</option>)}</select></label>
          {choice && <><RegulatoryFields fields={choice.fields} values={doc.attributes || {}} addresses={addresses} disabled={loading} onChange={(name, value) => setDocument(index, { attributes: { ...(doc.attributes || {}), [name]: value } })} />{choice.fields.some(item => item.name === "address_sids") && !addresses.some(address => address.validated) && <div className="space-y-2"><p>Aucune adresse validée disponible. Renseignez l’adresse réelle du titulaire et vérifiez les informations proposées.</p>{[["customerName", "Nom légal du titulaire"], ["street", "Rue et numéro"], ["postalCode", "Code postal"], ["city", "Ville"], ["region", "Région (facultatif)"], ["isoCountry", "Pays (code à deux lettres)"]].map(([name, label]) => <label key={name} className="block">{label}<input className={`${fieldClass} mt-1`} value={addressInput[name]} disabled={loading || ["pending", "uncertain"].includes(draft?.regulatoryAddress?.state)} onChange={event => setAddressInput(current => ({ ...current, [name]: event.target.value }))} /></label>)}<button type="button" className={buttonClass} disabled={loading || ["pending", "uncertain"].includes(draft?.regulatoryAddress?.state)} onClick={createAddress}>Créer l’adresse du titulaire</button>{["pending", "uncertain"].includes(draft?.regulatoryAddress?.state) && <p role="alert">Création d’adresse en cours ou incertaine : une vérification est nécessaire avant reprise.</p>}{addressStatus && <p role="status">{addressStatus}</p>}</div>}<label className="block">Fichier justificatif {choice.fields.some(item => item.name === "address_sids") ? "(si demandé)" : "*"}<input key={choice.type} className="mt-1 block w-full" type="file" accept="application/pdf,image/png,image/jpeg" disabled={loading} onChange={event => setDocument(index, { file: event.target.files?.[0] || null })} /></label><p className="text-xs text-darkBlue/60">PDF, PNG ou JPEG, 5 Mo maximum.</p></>}
        </fieldset>; })}
        <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} disabled={loading} onChange={event => setConfirmed(event.target.checked)} />Je confirme que ces informations et justificatifs concernent le véritable utilisateur final et autorise leur transmission à Twilio.</label>
        <button type="submit" className={buttonClass} disabled={loading}>{loading ? "Envoi en cours…" : submission?.state === "waiting" ? "Réévaluer et soumettre le même dossier" : "Créer et soumettre le dossier"}</button>
      </>}
    </form>}
  </div>;
}
