import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/router";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import DesignLabShell from "@/components/dashboard/admin/sites/design-lab-shell.component";
import PageHeaderAdminComponent from "@/components/dashboard/admin/_shared/page-header.admin.component";
import { StructuralControls } from "@/components/dashboard/admin/sites/structural-reference.component";
import {
  api,
  button,
  input,
  message,
  panel,
  secondaryButton,
} from "@/components/dashboard/admin/sites/design-lab.shared";

export default function StructuralReferencesPage() {
  const router = useRouter();
  const [references, setReferences] = useState([]);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ sourceUrl: "", title: "", tags: "" });
  const lock = useRef(false);
  useEffect(() => {
    let disposed = false;
    const load = () =>
      api("get", "/structural-references")
        .then((result) => {
          if (!disposed) {
            setReferences(result.references);
            setEnabled(result.captureEnabled);
          }
        })
        .catch((err) => {
          if (!disposed) setError(message(err));
        });
    load();
    const timer = setInterval(load, 5000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, []);
  async function create(event) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const { reference } = await api(
        "post",
        "/structural-references",
        {
          sourceUrl: form.sourceUrl,
          title: form.title,
          manualTags: form.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        },
        { timeout: 600000 },
      );
      await router.push(
        `/dashboard/admin/sites/structural-references/${reference._id}`,
      );
    } catch (err) {
      setError(message(err));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const update = (reference) =>
    setReferences((items) =>
      items.map((item) => (item._id === reference._id ? reference : item)),
    );
  return (
    <DesignLabShell title="Références structurelles">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <PageHeaderAdminComponent
          title="Références structurelles"
          subtitle="Inspirations · composition spatiale et rythme des pages"
          action={
            <button
              className={button}
              disabled={!enabled || busy}
              onClick={() => setAdding(true)}
            >
              Ajouter une référence structurelle
            </button>
          }
        />
        <Link
          href="/dashboard/admin/sites"
          className="text-sm font-semibold text-blue"
        >
          ← Design Lab
        </Link>
        <p className="text-sm text-darkBlue/60">
          Une grammaire à réinterpréter, sans copier les sites sources. Cette
          bibliothèque n’est pas encore utilisée par le moteur de génération.
        </p>
        {!enabled && (
          <p className={`${panel} text-sm`}>
            L’ingestion URL nécessite l’activation du service de capture sur ce
            serveur.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red">
            {error}
          </p>
        )}
        {adding && (
          <form className={`${panel} space-y-4`} onSubmit={create}>
            <h2 className="font-semibold">Ajouter une URL</h2>
            <label className="block text-sm">
              URL du site
              <input
                className={`${input} mt-1`}
                required
                maxLength={2000}
                placeholder="https://…"
                value={form.sourceUrl}
                onChange={(e) =>
                  setForm({ ...form, sourceUrl: e.target.value })
                }
                disabled={busy}
              />
            </label>
            <label className="block text-sm">
              Titre (facultatif)
              <input
                className={`${input} mt-1`}
                maxLength={160}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                disabled={busy}
              />
            </label>
            <label className="block text-sm">
              Tags manuels
              <input
                className={`${input} mt-1`}
                placeholder="editorial, airy, architecture"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                disabled={busy}
              />
            </label>
            <div className="flex gap-2">
              <button className={button} disabled={busy}>
                Capturer et analyser
              </button>
              <button
                type="button"
                className={secondaryButton}
                disabled={busy}
                onClick={() => setAdding(false)}
              >
                Annuler
              </button>
            </div>
            {busy && (
              <p role="status" className="text-sm">
                Capture, préparation des vues et analyse structurelle en cours…
              </p>
            )}
          </form>
        )}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {references.map((reference) => (
            <article className={panel} key={reference._id}>
              <Link
                href={`/dashboard/admin/sites/structural-references/${reference._id}`}
              >
                <div className="relative mb-4 h-48 overflow-hidden rounded-xl bg-lightGrey">
                  {reference.captures?.[0]?.url ? (
                    <Image
                      src={reference.captures[0].url}
                      alt={`Capture de ${reference.title}`}
                      fill
                      unoptimized
                      className="object-cover object-top"
                    />
                  ) : (
                    <span className="p-4 text-sm">Capture en attente</span>
                  )}
                </div>
                <h2 className="text-lg font-semibold">{reference.title}</h2>
                <p className="text-sm text-darkBlue/55">
                  {reference.domain} ·{" "}
                  {reference.active ? "Active" : "Inactive"}
                </p>
              </Link>
              <div className="my-3 flex flex-wrap gap-1">
                {reference.manualTags.map((tag) => (
                  <span
                    className="rounded-full bg-blue/10 px-2 py-1 text-xs"
                    key={tag}
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <StructuralControls
                reference={reference}
                onChange={update}
                onDelete={() =>
                  setReferences((items) =>
                    items.filter((item) => item._id !== reference._id),
                  )
                }
              />
            </article>
          ))}
        </div>
        {!references.length && (
          <p className={`${panel} text-sm`}>
            Ajoutez votre première URL pour explorer sa composition et sa
            progression verticale.
          </p>
        )}
      </div>
    </DesignLabShell>
  );
}
export async function getServerSideProps({ locale }) {
  return {
    props: { ...(await serverSideTranslations(locale, ["common", "admin"])) },
  };
}
