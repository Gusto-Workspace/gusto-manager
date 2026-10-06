import { useEffect, useState } from "react";
import Link from "next/link";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { ArrowLeft, RefreshCw, Trash2 } from "lucide-react";
import DesignLabShell from "@/components/dashboard/admin/sites/design-lab-shell.component";
import DesignLabProgress from "@/components/dashboard/admin/sites/design-lab-progress.component";
import PageHeaderAdminComponent from "@/components/dashboard/admin/_shared/page-header.admin.component";
import {
  api,
  button,
  input,
  message,
  panel,
  secondaryButton,
} from "@/components/dashboard/admin/sites/design-lab.shared";

function TagList({ label, tags }) {
  return (
    <div>
      <p className="text-xs font-medium text-darkBlue/60">{label}</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {tags?.length ? (
          tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-lightGrey px-2 py-0.5 text-xs text-darkBlue/80"
            >
              {tag}
            </span>
          ))
        ) : (
          <span className="text-xs text-darkBlue/40">Aucun</span>
        )}
      </div>
    </div>
  );
}

export default function ReferencesPage() {
  const [references, setReferences] = useState([]);
  const [form, setForm] = useState({
    name: "",
    source: "",
    manualTags: "",
    image: null,
  });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [bulkProgress, setBulkProgress] = useState(null);
  const [operationId, setOperationId] = useState("");
  const [referenceProgress, setReferenceProgress] = useState(null);
  const hasAnalyzingReference = references.some((reference) => reference.analyzing);
  async function load() {
    try {
      setReferences((await api("get", "/references")).references);
    } catch (err) {
      setError(message(err));
    }
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!hasAnalyzingReference) return undefined;
    const timer = setInterval(() => {
      api("get", "/references")
        .then(({ references: items }) => setReferences(items))
        .catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
  }, [hasAnalyzingReference]);
  useEffect(() => {
    if (!operationId || referenceProgress?.status !== "running") return undefined;
    let active = true;
    const poll = () =>
      api("get", `/references/progress/${operationId}`)
        .then(({ progress }) => {
          if (active) setReferenceProgress((current) =>
            current?.operationId !== operationId ||
            current?.status !== "running" && progress.status === "running"
              ? current
              : { ...progress, operationId, name: current?.name },
          );
        })
        .catch(() => {});
    const timer = setInterval(poll, 1000);
    poll();
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [operationId, referenceProgress?.status]);
  function beginProgress(name, reanalysis = false) {
    const id = window.crypto.randomUUID();
    setOperationId(id);
    setReferenceProgress({
      status: "running",
      operationId: id,
      currentStep: reanalysis ? "analyzing" : "preparing",
      progress: 0,
      name,
      message: reanalysis ? "Demande d’analyse envoyée…" : "Envoi de l’image…",
    });
    return id;
  }
  async function finishProgress(id, reference, error) {
    try {
      const { progress } = await api("get", `/references/progress/${id}`);
      setReferenceProgress({ ...progress, operationId: id, name: reference?.name || "Référence" });
    } catch {
      if (error || reference?.lastError)
        setReferenceProgress((current) => ({
          ...current,
          status: "failed",
          message: `Échec pendant : ${current?.currentStep || "analyse"}`,
        }));
      else if (reference?.analyzedAt)
        setReferenceProgress((current) => ({
          ...current,
          status: "completed", progress: 100,
          currentStep: "completed", message: "Analyse terminée",
        }));
    }
  }
  async function add(event) {
    event.preventDefault();
    if (!form.image || busy) return;
    setBusy("upload");
    setError("");
    const data = new FormData();
    Object.entries(form).forEach(
      ([key, value]) => value && data.append(key, value),
    );
    const id = beginProgress(form.name || form.image.name);
    data.append("operationId", id);
    try {
      const { reference } = await api("post", "/references", data);
      await finishProgress(id, reference);
      setForm({ name: "", source: "", manualTags: "", image: null });
      event.target.reset();
      await load();
    } catch (err) {
      setError(message(err));
      await finishProgress(id, null, err);
    } finally {
      setBusy("");
    }
  }
  async function update(reference, payload) {
    if (busy) return;
    setBusy(reference._id);
    setError("");
    try {
      await api("patch", `/references/${reference._id}`, payload);
      await load();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy("");
    }
  }
  async function analyze(reference) {
    if (busy) return;
    setBusy(reference._id);
    setError("");
    const id = beginProgress(reference.name, true);
    try {
      const result = await api("post", `/references/${reference._id}/analyze`, { operationId: id });
      await finishProgress(id, result.reference);
      await load();
    } catch (err) {
      setError(message(err));
      await finishProgress(id, reference, err);
      await load();
    } finally {
      setBusy("");
    }
  }
  async function analyzeAll() {
    if (busy || hasAnalyzingReference || !references.length) return;
    setBusy("bulk");
    setError("");
    const failures = [];
    for (let index = 0; index < references.length; index += 1) {
      const reference = references[index];
      setBulkProgress({
        done: index,
        total: references.length,
        name: reference.name,
      });
      const id = beginProgress(reference.name, true);
      try {
        const result = await api(
          "post",
          `/references/${reference._id}/analyze`,
          { operationId: id },
        );
        await finishProgress(id, result.reference);
        setReferences((current) =>
          current.map((item) =>
            item._id === reference._id ? result.reference : item,
          ),
        );
      } catch (err) {
        failures.push(`${reference.name} : ${message(err)}`);
        await finishProgress(id, reference, err);
      }
      setBulkProgress({
        done: index + 1,
        total: references.length,
        name: reference.name,
      });
    }
    await load();
    if (failures.length)
      setError(
        `${failures.length} analyse(s) échouée(s) : ${failures.join(" ; ")}`,
      );
    setBusy("");
  }
  async function remove(reference) {
    if (busy || !window.confirm(`Supprimer « ${reference.name} » ?`)) return;
    setBusy(reference._id);
    try {
      await api("delete", `/references/${reference._id}`);
      await load();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy("");
    }
  }
  return (
    <DesignLabShell title="Bibliothèque d’inspiration">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <Link
          href="/dashboard/admin/sites"
          className="inline-flex items-center gap-2 text-sm text-blue"
        >
          <ArrowLeft size={16} /> Design Lab
        </Link>
        <PageHeaderAdminComponent
          title="Bibliothèque d’inspiration"
          subtitle="Références visuelles analysées et réutilisables"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={secondaryButton}
            disabled={!!busy || hasAnalyzingReference || !references.length}
            onClick={analyzeAll}
          >
            <RefreshCw size={15} /> Réanalyser les références
          </button>
          {bulkProgress && (
            <p className="text-sm text-darkBlue/70" role="status">
              {bulkProgress.done} / {bulkProgress.total} · {bulkProgress.name}
              {busy === "bulk" ? " — analyse en cours…" : " — terminé"}
            </p>
          )}
        </div>
        {error && (
          <p role="alert" className="rounded-xl bg-red/10 p-3 text-sm text-red">
            {error}
          </p>
        )}
        <DesignLabProgress title={`Analyse de la référence${referenceProgress?.name ? ` · ${referenceProgress.name}` : ""}`} progress={referenceProgress} />
        <form onSubmit={add} className={`${panel} grid gap-3 md:grid-cols-4`}>
          <input
            className={input}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Nom de la référence"
            required
          />
          <input
            className={input}
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
            placeholder="Source (facultatif)"
          />
          <input
            className={input}
            value={form.manualTags}
            onChange={(e) => setForm({ ...form, manualTags: e.target.value })}
            placeholder="Tags manuels séparés par des virgules"
          />
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className={input}
            onChange={(e) => setForm({ ...form, image: e.target.files?.[0] })}
            required
          />
          <button className={button} disabled={!!busy}>
            {busy === "upload" ? "Analyse de l’image…" : "Importer et analyser"}
          </button>
        </form>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {references.map((reference) => (
            <article key={reference._id} className={`${panel} overflow-hidden`}>
              <a href={reference.image.url} target="_blank" rel="noreferrer">
                <img
                  src={reference.image.url}
                  alt={reference.name}
                  className="h-72 w-full rounded-xl bg-lightGrey object-cover object-top"
                />
              </a>
              <div className="mt-4 flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold">{reference.name}</h2>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={reference.active}
                    onChange={(e) =>
                      update(reference, { active: e.target.checked })
                    }
                    disabled={!!busy}
                  />{" "}
                  Active
                </label>
              </div>
              <div className="mt-3 space-y-2">
                <TagList label="Tags visuels IA" tags={reference.visualTags} />
                <TagList label="Tags métier IA" tags={reference.businessTags} />
                <TagList label="Tags manuels" tags={reference.manualTags} />
              </div>
              <label className="mt-3 block text-xs text-darkBlue/60">
                Modifier les tags manuels
                <input
                  key={`${reference._id}-${(reference.manualTags || []).join(",")}`}
                  className={`${input} mt-1`}
                  defaultValue={(reference.manualTags || []).join(", ")}
                  onBlur={(event) => {
                    const tags = event.target.value
                      .split(",")
                      .map((tag) => tag.trim())
                      .filter(Boolean);
                    if (
                      tags.join(",") !== (reference.manualTags || []).join(",")
                    )
                      update(reference, { manualTags: tags });
                  }}
                  disabled={!!busy}
                />
              </label>
              <p className="mt-3 line-clamp-3 min-h-12 text-sm text-darkBlue/70">
                {reference.analyzing ? "Analyse visuelle en cours…" : reference.analysis?.identity ||
                  reference.lastError ||
                  "Analyse en attente"}
              </p>
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-blue">
                  Voir l’analyse
                </summary>
                <div className="mt-2 space-y-2 text-darkBlue/70">
                  {reference.analysis &&
                    Object.entries(reference.analysis).map(([key, value]) => (
                      <p key={key}>
                        <strong>{key}</strong> :{" "}
                        {Array.isArray(value) ? value.join(", ") : value}
                      </p>
                    ))}
                </div>
              </details>
              <div className="mt-4 flex gap-2">
                <button
                  className={secondaryButton}
                  disabled={!!busy || reference.analyzing}
                  onClick={() => analyze(reference)}
                >
                  <RefreshCw size={15} />{" "}
                  {busy === reference._id ? "Analyse…" : "Réanalyser"}
                </button>
                <button
                  className={secondaryButton}
                  disabled={!!busy}
                  onClick={() => remove(reference)}
                  aria-label="Supprimer"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </DesignLabShell>
  );
}
export async function getStaticProps({ locale }) {
  return {
    props: { ...(await serverSideTranslations(locale, ["common", "admin"])) },
  };
}
