import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { getAdminAuthConfig } from "../_shared/utils/admin-auth.utils";

const fieldClass = "w-full rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm";
const buttonClass = "rounded-xl bg-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";

function rejectionMessage(issue) {
  if (typeof issue === "string") return issue;
  const field = issue?.field || issue?.field_name || issue?.fieldName || issue?.attribute || issue?.requirement_name || issue?.requirementName;
  const detail = issue?.message || issue?.description || issue?.failure_reason || issue?.failureReason || issue?.error_code || issue?.errorCode || "Détail à vérifier";
  return [typeof field === "string" ? field : "", typeof detail === "string" || typeof detail === "number" ? detail : "Détail à vérifier"].filter(Boolean).join(" : ");
}

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

function RegulatoryFields({ fields, values, onChange, disabled, addresses = [], issues = [] }) {
  return fields.map(item => <label key={item.name} className="block text-sm">{item.label}{item.optional ? " (facultatif)" : " *"}
    {item.description && <span className="block text-xs text-darkBlue/60">{item.description}</span>}
    {issues.filter(issue => [issue?.field, issue?.field_name, issue?.fieldName, issue?.attribute].includes(item.name)).map((issue, index) => <span key={index} className="block text-xs text-red" role="alert">{rejectionMessage(issue)}</span>)}
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
  const [correctionDirty, setCorrectionDirty] = useState(false);
  const [correctionStatus, setCorrectionStatus] = useState("");
  const [addressEdits, setAddressEdits] = useState({});
  const running = useRef(false);
  const requirementsAttempted = useRef(false);
  const lastCorrection = useRef(null);
  const submission = draft?.regulatorySubmission;
  const rejected = complianceStatus === "twilio-rejected";
  const correction = draft?.regulatoryCorrection;
  const correctionLocked = ["pending", "uncertain"].includes(correction?.state) || ["pending", "uncertain"].includes(draft?.regulatoryAddress?.state);
  const locked = disabled || refreshFailed || result?.status === "pending-review" || ["running", "uncertain", "submitted"].includes(submission?.state);
  const existingBundle = Boolean(draft?.regulatoryBundleSid && !submission?.bundleSid);
  const blocked = locked || existingBundle || ["pending", "uncertain", "completed"].includes(draft?.bundleCloneOperation);
  const phase = submission?.phase || "";
  const stages = ["Utilisateur final", "Justificatifs", "Dossier et affectations", "Évaluation", "Soumission"];
  const phaseIndex = phase === "end_user" ? 0 : phase.startsWith("document_") ? 1 : phase === "bundle" || phase.startsWith("assignment_") ? 2 : ["evaluation", "noncompliant"].includes(phase) ? 3 : ["submission", "submitted"].includes(phase) ? 4 : -1;
  const completedIndex = submission?.state === "submitted" ? 5 : phaseIndex;
  const group = requirements?.groups[groupIndex] || [];
  const setDocument = (index, patch) => setDocuments(current => {
    const sid = current[index]?.sid;
    return current.map((item, position) => position === index || sid && item?.sid === sid ? { ...item, ...patch } : item);
  });
  const createAddress = async () => {
    if (running.current || loading) return;
    if (!rejected && draft?.regulatoryAddress?.state === "completed") { setError("Une adresse a déjà été créée. Actualisez son état avant toute autre tentative."); return; }
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
    if (running.current || disabled || correctionDirty || correctionLocked || refreshFailed) return;
    running.current = true; setLoading(true); setError("");
    let submitted = false;
    try { const response = await axios.post(`${base}/regulatory-resubmission`, { confirm: true }, getAdminAuthConfig()); setResult(response.data); submitted = ["pending-review", "in-review", "twilio-approved"].includes(response.data.status); if (submitted) { setRejection(null); setRequirements(null); setDocuments([]); setUserValues({}); setCorrectionStatus(""); } }
    catch (err) { setError(err?.response?.data?.message || "Resoumission non confirmée : vérifiez son état avant toute reprise."); }
    finally { try { await onRefresh(); if (submitted) setResult(null); } catch (_) { setRefreshFailed(true); } running.current = false; setLoading(false); }
  };
  const fetchRejection = async () => {
    const [response, requirementResponse] = await Promise.all([
      axios.get(`${base}/regulatory-rejection`, getAdminAuthConfig()),
      axios.get(`${base}/regulatory-requirements`, getAdminAuthConfig({ params: { endUserType } })),
    ]);
    const data = response.data;
    const parsed = parseRequirements(requirementResponse.data, endUserType);
    if (!data?.endUser?.sid || data.endUser.type !== endUserType || !Array.isArray(data.documents)) throw new Error("Données du dossier refusé incomplètes.");
    const selectedGroup = parsed.groups.findIndex(group => group.every(item => item.choices.some(choice => data.documents.some(doc => doc.type === choice.type))) && data.documents.every(doc => group.some(item => item.choices.some(choice => choice.type === doc.type))));
    if (selectedGroup < 0) throw new Error("Les justificatifs existants ne correspondent pas aux exigences actuelles ; vérification nécessaire.");
    const needsAddresses = parsed.groups[selectedGroup].some(item => item.choices.some(choice => choice.fields.some(field => field.name === "address_sids")));
    const addressRows = needsAddresses ? (await axios.get(`${base}/addresses`, getAdminAuthConfig())).data.addresses || [] : [];
    const normalized = values => Object.fromEntries(Object.entries(values || {}).map(([key, value]) => [key, key === "address_sids" && Array.isArray(value) ? value[0] || "" : value]));
    const existingDocuments = parsed.groups[selectedGroup].map(item => {
      const found = data.documents.find(doc => item.choices.some(choice => choice.type === doc.type));
      return { ...found, originalAttributes: normalized(found.attributes), attributes: normalized(found.attributes), file: null };
    });
    if (new Set(existingDocuments.map(doc => doc.sid)).size !== data.documents.length) throw new Error("Les justificatifs existants sont ambigus ; une vérification est nécessaire avant correction.");
    setRequirements(parsed); setGroupIndex(selectedGroup); setAddresses(addressRows); setUserValues(normalized(data.endUser.attributes));
    setDocuments(existingDocuments);
    setAddressEdits(Object.fromEntries(addressRows.map(row => [row.sid, { customerName: row.customerName || "", street: row.street || "", city: row.city || "", postalCode: row.postalCode || "", region: row.region || "" }])));
    setRejection(data); setCorrectionDirty(false); setConfirmed(false);
    return data;
  };
  const loadRejection = async () => {
    if (running.current) return;
    running.current = true; setLoading(true); setError("");
    try { await fetchRejection(); }
    catch (err) { setError(err?.response?.data?.message || err?.message || "Impossible de charger les motifs du refus."); }
    finally { running.current = false; setLoading(false); }
  };

  const saveCorrections = async event => {
    event.preventDefault();
    if (running.current || disabled || refreshFailed || correctionLocked || !rejection || !requirements) return;
    if (!confirmed) { setError("Confirmez les informations du véritable utilisateur final avant l’envoi."); return; }
    const clean = (fields, values) => Object.fromEntries(fields.filter(item => String(values?.[item.name] || "").trim()).map(item => [item.name, item.name === "address_sids" ? [String(values[item.name]).trim()] : String(values[item.name]).trim()]));
    const delta = (values, previous) => Object.fromEntries(Object.entries(values).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(previous?.[key])));
    const user = clean(requirements.userFields, userValues);
    if (requirements.userFields.some(item => !item.optional && !user[item.name])) { setError("Complétez les champs obligatoires de l’utilisateur final."); return; }
    const updates = [];
    const userChanges = delta(user, rejection.endUser.attributes || {});
    if (Object.keys(userChanges).length) updates.push({ kind: "end-user", sid: rejection.endUser.sid, values: userChanges });
    for (const [sid, values] of Object.entries(addressEdits)) {
      const existing = addresses.find(address => address.sid === sid);
      if (!existing) continue;
      const changes = delta(values, Object.fromEntries(Object.keys(values).map(key => [key, existing[key] || ""])));
      if (Object.values(changes).some(value => !String(value || "").trim())) { setError("Les champs d’adresse modifiés ne peuvent pas être vides."); return; }
      if (Object.keys(changes).length) updates.push({ kind: "address", sid, values: changes });
    }
    const seen = new Set();
    for (let i = 0; i < group.length; i++) {
      const doc = documents[i];
      if (!doc?.sid || seen.has(doc.sid)) continue;
      seen.add(doc.sid);
      const choices = group.flatMap((item, index) => documents[index]?.sid === doc.sid ? item.choices.filter(choice => choice.type === doc.type) : []);
      if (!choices.length) { setError("Le justificatif ne correspond plus aux exigences Twilio."); return; }
      const fields = [...new Map(choices.flatMap(choice => choice.fields).map(field => [field.name, field])).values()];
      const values = clean(fields, doc.attributes);
      if (fields.some(item => !item.optional && !values[item.name])) { setError(`Complétez les champs du justificatif : ${group[i].name}.`); return; }
      if (doc.file) {
        try { if (!(await validFile(doc.file))) { setError(`Fichier invalide pour ${group[i].name} : PDF, PNG ou JPEG de 5 Mo maximum requis.`); return; } }
        catch (_) { setError(`Impossible de lire le fichier pour ${group[i].name}.`); return; }
        updates.push({ kind: "replace-document", sid: doc.sid, values, file: doc.file });
      } else {
        const original = clean(fields, doc.originalAttributes);
        const changes = delta(values, original);
        if (Object.keys(changes).length) updates.push({ kind: "document", sid: doc.sid, values: changes });
      }
    }
    if (!updates.length) { setCorrectionDirty(false); setCorrectionStatus("Aucune modification à enregistrer."); return; }
    running.current = true; setLoading(true); setError(""); setCorrectionStatus("Enregistrement des corrections…");
    try {
      for (const update of updates) {
        lastCorrection.current = update;
        if (update.kind === "replace-document") {
          const form = new FormData(); form.append("payload", JSON.stringify({ confirm: true, sid: update.sid, attributes: update.values })); form.append("documents", update.file);
          const response = await axios.post(`${base}/regulatory-document-replacement`, form, getAdminAuthConfig());
          setDocuments(current => current.map(doc => doc.sid === update.sid ? { ...doc, sid: response.data.sid, file: null, originalAttributes: doc.attributes, status: "draft" } : doc));
        } else await axios.post(`${base}/regulatory-correction`, { confirm: true, kind: update.kind, sid: update.sid, values: update.values }, getAdminAuthConfig());
        lastCorrection.current = null;
      }
      await onRefresh(); await fetchRejection(); setRefreshFailed(false); setCorrectionStatus("Corrections enregistrées. Vous pouvez évaluer et resoumettre le dossier.");
    } catch (err) {
      setRefreshFailed(true); setCorrectionStatus("");
      setError(err?.response?.data?.message || "Enregistrement non confirmé. Vérifiez son état avant toute reprise.");
      try { await onRefresh(); } catch (_) { /* La reprise reste bloquée. */ }
    } finally { running.current = false; setLoading(false); }
  };

  const verifyCorrection = async () => {
    if (running.current || disabled) return;
    running.current = true; setLoading(true); setError("");
    try {
      if (correction?.state === "uncertain" && correction.kind === "replace-document") {
        const form = new FormData(); form.append("payload", JSON.stringify({ confirm: true, sid: correction.objectSid, verify: true }));
        await axios.post(`${base}/regulatory-document-replacement`, form, getAdminAuthConfig());
      } else if (correction?.state === "uncertain" && ["end-user", "document", "address"].includes(correction.kind)) {
        let values = lastCorrection.current?.kind === correction.kind && lastCorrection.current?.sid === correction.objectSid ? lastCorrection.current.values : null;
        if (!values && correction.attributeKeys?.length) {
          const source = correction.kind === "end-user" ? userValues : correction.kind === "address" ? addressEdits[correction.objectSid] : documents.find(doc => doc.sid === correction.objectSid)?.attributes;
          if (source) values = Object.fromEntries(correction.attributeKeys.filter(key => source[key] !== undefined).map(key => [key, key === "address_sids" ? [source[key]] : source[key]]));
        }
        if (!values || Object.keys(values).length !== correction.attributeKeys?.length) throw new Error("Rechargez les détails du dossier et ressaisissez les champs concernés pour vérifier la correction.");
        await axios.post(`${base}/regulatory-correction`, { confirm: true, kind: correction.kind, sid: correction.objectSid, values, verify: true }, getAdminAuthConfig());
      }
      await onRefresh();
      if (correction?.state !== "pending") await fetchRejection();
      setRefreshFailed(false); lastCorrection.current = null; setCorrectionStatus(correction?.state === "pending" ? "État actualisé : vérifiez si l’opération est toujours en cours." : "État vérifié. Contrôlez les informations avant de continuer.");
    } catch (err) { setRefreshFailed(true); setError(err?.response?.data?.message || err?.message || "Vérification impossible. Ne relancez pas l’opération."); try { await onRefresh(); } catch (_) {} }
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
    <p className="font-semibold">{rejected ? "Corriger le dossier de l’utilisateur final" : "Créer le dossier de l’utilisateur final"}</p>
    <p className="mt-1 text-darkBlue/60">Renseignez les informations du véritable titulaire du numéro. Les données saisies et fichiers restent dans ce formulaire jusqu’à l’envoi et ne sont pas mémorisés après rechargement.</p>
    {submission?.state && <ol className="mt-3 space-y-1" aria-label="Progression du dossier réglementaire">{stages.map((stage, index) => <li key={stage}>{index < completedIndex ? "✓" : index === phaseIndex ? "•" : "○"} {stage}{index === phaseIndex && submission.state !== "submitted" ? " — étape à vérifier" : ""}</li>)}</ol>}
    {(submission?.state === "submitted" || result?.status === "pending-review") && <p role="status" className="mt-2">{complianceStatus === "twilio-approved" ? "Dossier approuvé" : rejected ? "Dossier refusé par Twilio : une correction est nécessaire avant de poursuivre." : ["pending-review", "in-review"].includes(complianceStatus) || result?.status === "pending-review" ? "Votre dossier a été transmis à Twilio. Il est en cours de vérification. Vous n'avez aucune action à effectuer pour le moment." : "Dossier transmis ; statut Twilio actuellement indisponible."}</p>}
    {result?.automationWarning && <p role="alert" className="mt-2 text-orange-700">{result.automationWarning}</p>}
    {(rejected || draft?.regulatoryResubmission?.state === "uncertain") && <div className="mt-3">{rejected && !rejection && !correctionLocked && draft?.regulatoryResubmission?.state !== "uncertain" && <button type="button" className={`${buttonClass} mt-2`} disabled={loading || disabled} onClick={loadRejection}>Consulter les motifs du refus</button>}{rejection && <div className="mt-2">{(rejection.documents || []).map(doc => <div key={doc.sid} className="mt-2"><p className="font-semibold">{doc.type} : {doc.status}</p><p>{doc.failureReason || "Aucun motif détaillé fourni pour cette pièce."}</p>{(doc.errors || []).map((issue, index) => <p key={index}>{rejectionMessage(issue)}</p>)}</div>)}</div>}{(rejection || draft?.regulatoryResubmission?.state === "uncertain") && <button type="button" className={`${buttonClass} mt-2`} disabled={loading || disabled || refreshFailed || correctionDirty || correctionLocked || draft?.regulatoryResubmission?.state === "pending"} onClick={resubmit}>{draft?.regulatoryResubmission?.state === "uncertain" ? "Vérifier la resoumission" : "Évaluer et resoumettre le dossier"}</button>}{correctionDirty && <p>Enregistrez les corrections avant la resoumission.</p>}{["pending", "uncertain"].includes(draft?.regulatoryResubmission?.state) && <p role="alert">Resoumission en cours ou incertaine : vérifiez le dossier avant toute reprise.</p>}</div>}
    {(correctionLocked || refreshFailed) && <div className="mt-3 rounded-xl border border-orange-200 p-3" role="alert"><p>Une correction est en cours ou son résultat est incertain. Aucun nouvel envoi ne sera lancé avant vérification.</p>{correction?.state === "uncertain" && correction.kind !== "replace-document" && !rejection && <button type="button" className={`${buttonClass} mt-2 mr-2`} disabled={loading || disabled} onClick={loadRejection}>Charger les données à vérifier</button>}<button type="button" className={`${buttonClass} mt-2`} disabled={loading || disabled} onClick={verifyCorrection}>Vérifier l’état de la correction</button></div>}
    {correctionStatus && <p role="status" className="mt-2">{correctionStatus}</p>}
    {submission?.state === "running" && <p role="alert" className="mt-2 text-orange-700">Opération en cours ou interrompue. Vérifiez son état avant toute reprise ; ne relancez pas la création.</p>}
    {submission?.state === "uncertain" && <p role="alert" className="mt-2 text-orange-700">Résultat incertain : vérifiez les ressources dans Twilio. La reprise est bloquée pour éviter les doublons.</p>}
    {submission?.state === "waiting" && <p role="alert" className="mt-2 text-orange-700">Évaluation non conforme. La reprise exige exactement les mêmes informations et fichiers ; toute correction exige une vérification manuelle du dossier Twilio.</p>}
    {existingBundle && <p className="mt-2">Un dossier est déjà associé. La création d’un autre dossier est bloquée.</p>}
    {error && <p role="alert" className="mt-2 text-red">{error}</p>}
    {draft?.regulatoryAddress?.state === "uncertain" && <div className="mt-3 space-y-2 rounded-xl border border-orange-200 p-3"><p>Pour vérifier l’adresse sans en créer une nouvelle, ressaisissez exactement les informations envoyées.</p>{[["customerName", "Nom légal du titulaire"], ["street", "Rue et numéro"], ["postalCode", "Code postal"], ["city", "Ville"], ["region", "Région (facultatif)"], ["isoCountry", "Pays (code à deux lettres)"]].map(([name, label]) => <label key={name} className="block">{label}<input className={`${fieldClass} mt-1`} value={addressInput[name]} disabled={loading} onChange={event => setAddressInput(current => ({ ...current, [name]: event.target.value }))} /></label>)}<button type="button" className={buttonClass} disabled={loading} onClick={createAddress}>Vérifier l’adresse existante</button></div>}
    {result?.status === "noncompliant" && <div role="alert" className="mt-2"><p>Évaluation non conforme : le dossier n’a pas été soumis. Vérifiez les exigences auprès de Twilio.</p>{Array.isArray(result.results) && result.results.map((row, index) => <p key={index}>{row?.error_code || row?.errorCode || row?.requirement_name || row?.requirementName || `Exigence ${index + 1}`} : {row?.valid === true ? "conforme" : "à vérifier"}</p>)}</div>}
    {(!blocked || (rejected && rejection && requirements && !refreshFailed && !correctionLocked && !disabled)) && <form className="mt-3 space-y-3" onSubmit={rejected ? saveCorrections : submit} noValidate>
      {requirementsLoading && <p role="status">Chargement des exigences réglementaires…</p>}
      {requirementsError && <div role="alert"><p>{requirementsError}</p><button type="button" className={`${buttonClass} mt-2`} disabled={loading} onClick={loadRequirements}>Réessayer</button></div>}
      {requirements && <>
        {!rejected && <label className="block">E-mail de suivi du dossier *<span className="block text-xs text-darkBlue/60">Vérifiez l’adresse avant l’envoi : Twilio y transmettra le suivi du dossier.</span><input className={`${fieldClass} mt-1`} type="email" value={email} onChange={event => setEmail(event.target.value)} disabled={loading} autoComplete="off" /></label>}
        <RegulatoryFields fields={requirements.userFields} values={userValues} disabled={loading} issues={[...(rejection?.endUser?.errors || []), ...(rejection?.documents || []).flatMap(doc => doc.errors || [])]} onChange={(name, value) => { setUserValues(current => ({ ...current, [name]: value })); if (rejected) setCorrectionDirty(true); }} />
        {rejected && [...new Set(documents.map(doc => doc.attributes?.address_sids).filter(Boolean))].map(sid => addressEdits[sid] && <fieldset key={sid} className="space-y-2 rounded-xl border border-darkBlue/10 p-3"><legend className="font-semibold">Adresse associée</legend>{[["customerName", "Nom du titulaire"], ["street", "Rue et numéro"], ["postalCode", "Code postal"], ["city", "Ville"], ["region", "Région"]].map(([name, label]) => <label className="block" key={name}>{label}<input name={`address_${name}`} className={`${fieldClass} mt-1`} value={addressEdits[sid][name]} disabled={loading} onChange={event => { const value = event.target.value; setAddressEdits(current => ({ ...current, [sid]: { ...current[sid], [name]: value } })); setCorrectionDirty(true); }} /></label>)}</fieldset>)}
        {rejected && group.some(item => item.choices.some(choice => choice.fields.some(field => field.name === "address_sids"))) && <details className="rounded-xl border border-darkBlue/10 p-3"><summary className="cursor-pointer font-semibold">Utiliser une autre adresse</summary><p className="mt-2">Si l’adresse existante ne peut pas être modifiée, créez ou sélectionnez une adresse validée pour le titulaire.</p>{[["customerName", "Nom légal du titulaire"], ["street", "Rue et numéro"], ["postalCode", "Code postal"], ["city", "Ville"], ["region", "Région (facultatif)"], ["isoCountry", "Pays (code à deux lettres)"]].map(([name, label]) => <label key={name} className="block">{label}<input className={`${fieldClass} mt-1`} value={addressInput[name]} disabled={loading || correctionLocked} onChange={event => setAddressInput(current => ({ ...current, [name]: event.target.value }))} /></label>)}<button type="button" className={`${buttonClass} mt-2`} disabled={loading || correctionLocked} onClick={createAddress}>Créer ou retrouver l’adresse</button>{addressStatus && <p role="status">{addressStatus}</p>}</details>}
        {draft?.regulatoryAddress?.state === "completed" && <div><button type="button" className="text-blue underline" disabled={loading} onClick={refreshAddresses}>Actualiser les adresses</button>{addressStatus && <p role="status">{addressStatus}</p>}</div>}
        {!rejected && requirements.groups.length > 1 && <label className="block">Ensemble de justificatifs<select className={`${fieldClass} mt-1`} value={groupIndex} disabled={loading} onChange={event => { const index = Number(event.target.value); setGroupIndex(index); setDocuments(requirements.groups[index].map(() => ({ type: "", attributes: {}, file: null }))); }}>
          {requirements.groups.map((items, index) => <option value={index} key={index}>{items.map(item => item.name).join(" + ")}</option>)}
        </select></label>}
        {group.map((item, index) => { const doc = documents[index] || {}; const choice = item.choices.find(entry => entry.type === doc.type); return <fieldset key={`${groupIndex}-${index}`} className="space-y-2 rounded-xl border border-darkBlue/10 p-3"><legend className="font-semibold">{item.name} *</legend>{item.description && <p className="text-xs text-darkBlue/60">{item.description}</p>}
          <label className="block">Type de justificatif<select className={`${fieldClass} mt-1`} value={doc.type || ""} disabled={loading || rejected} onChange={event => setDocument(index, { type: event.target.value, attributes: {}, file: null })}><option value="">Choisir</option>{item.choices.map(option => <option key={option.type} value={option.type}>{option.label}</option>)}</select></label>
          {choice && <><RegulatoryFields fields={choice.fields} values={doc.attributes || {}} addresses={addresses} issues={doc.errors || []} disabled={loading || rejected && ["approved", "provisionally-approved"].includes(doc.status)} onChange={(name, value) => { setDocument(index, { attributes: { ...(doc.attributes || {}), [name]: value } }); if (rejected) setCorrectionDirty(true); }} />{!rejected && choice.fields.some(item => item.name === "address_sids") && !addresses.some(address => address.validated) && <div className="space-y-2"><p>Aucune adresse validée disponible. Renseignez l’adresse réelle du titulaire et vérifiez les informations proposées.</p>{[["customerName", "Nom légal du titulaire"], ["street", "Rue et numéro"], ["postalCode", "Code postal"], ["city", "Ville"], ["region", "Région (facultatif)"], ["isoCountry", "Pays (code à deux lettres)"]].map(([name, label]) => <label key={name} className="block">{label}<input className={`${fieldClass} mt-1`} value={addressInput[name]} disabled={loading || ["pending", "uncertain"].includes(draft?.regulatoryAddress?.state)} onChange={event => setAddressInput(current => ({ ...current, [name]: event.target.value }))} /></label>)}<button type="button" className={buttonClass} disabled={loading || ["pending", "uncertain"].includes(draft?.regulatoryAddress?.state)} onClick={createAddress}>Créer l’adresse du titulaire</button>{["pending", "uncertain"].includes(draft?.regulatoryAddress?.state) && <p role="alert">Création d’adresse en cours ou incertaine : une vérification est nécessaire avant reprise.</p>}{addressStatus && <p role="status">{addressStatus}</p>}</div>}{rejected && ["approved", "provisionally-approved"].includes(doc.status) ? <p>Justificatif validé conservé.</p> : <><label className="block">Fichier justificatif {rejected ? "(facultatif : remplacer le fichier refusé)" : choice.fields.some(item => item.name === "address_sids") ? "(si demandé)" : "*"}<input key={choice.type} className="mt-1 block w-full" type="file" accept="application/pdf,image/png,image/jpeg" disabled={loading} onChange={event => { setDocument(index, { file: event.target.files?.[0] || null }); if (rejected) setCorrectionDirty(true); }} /></label><p className="text-xs text-darkBlue/60">PDF, PNG ou JPEG, 5 Mo maximum.</p></>}</>}
        </fieldset>; })}
        <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} disabled={loading} onChange={event => setConfirmed(event.target.checked)} />Je confirme que ces informations et justificatifs concernent le véritable utilisateur final et autorise leur transmission à Twilio.</label>
        <button type="submit" className={buttonClass} disabled={loading}>{loading ? "Envoi en cours…" : rejected ? "Enregistrer les corrections" : submission?.state === "waiting" ? "Réévaluer et soumettre le même dossier" : "Créer et soumettre le dossier"}</button>
      </>}
    </form>}
  </div>;
}
