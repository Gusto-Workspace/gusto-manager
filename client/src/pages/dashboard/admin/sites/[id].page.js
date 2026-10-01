import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import {
  ArrowLeft,
  Check,
  ImagePlus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import DesignLabShell from "@/components/dashboard/admin/sites/design-lab-shell.component";
import PageHeaderAdminComponent from "@/components/dashboard/admin/_shared/page-header.admin.component";
import {
  api,
  ASSET_ROLES,
  button,
  input,
  message,
  panel,
  secondaryButton,
  STATUS,
  STYLES,
} from "@/components/dashboard/admin/sites/design-lab.shared";

const FIELDS = [
  ["city", "Ville"],
  ["restaurantType", "Type de restaurant"],
  ["description", "Description"],
  ["story", "Histoire"],
  ["positioning", "Positionnement"],
  ["target", "Clientèle recherchée"],
  ["particularities", "Particularités"],
  ["existingWebsite", "Site existant"],
  ["notes", "Notes / brief libre"],
];
const SLIDERS = [
  ["creativity", "Créativité", "Classique", "Expérimental"],
  ["gustoSimilarity", "Similarité Gusto", "Très différent", "Proche"],
  ["visualDensity", "Densité visuelle", "Épuré", "Riche"],
  ["compositionFreedom", "Composition", "Structuré", "Libre"],
];
const INITIAL = {
  name: "",
  slug: "",
  brief: {},
  creativeSettings: {
    creativity: 50,
    styles: [],
    gustoSimilarity: 50,
    visualDensity: 50,
    compositionFreedom: 50,
  },
};

function FormField({ label, value, onChange, multiline = false }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      {multiline ? (
        <textarea
          className={`${input} mt-2 min-h-24`}
          value={value || ""}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className={`${input} mt-2`}
          value={value || ""}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

export default function SiteProjectPage() {
  const router = useRouter();
  const { id } = router.query;
  const [project, setProject] = useState(null);
  const [form, setForm] = useState(INITIAL);
  const [references, setReferences] = useState([]);
  const [tab, setTab] = useState("brief");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [assetFile, setAssetFile] = useState(null);
  const [assetRole, setAssetRole] = useState("other");
  const [assetSignature, setAssetSignature] = useState(false);
  const [variation, setVariation] = useState("");

  const load = useCallback(
    async (syncForm = false) => {
      if (!id) return;
      const [projectData, referenceData] = await Promise.all([
        api("get", `/projects/${id}`),
        api("get", "/references"),
      ]);
      setProject(projectData.project);
      setReferences(referenceData.references);
      if (syncForm)
        setForm({
          name: projectData.project.name,
          slug: projectData.project.slug,
          restaurantId: projectData.project.restaurantId || "",
          brief: projectData.project.brief || {},
          creativeSettings:
            projectData.project.creativeSettings || INITIAL.creativeSettings,
        });
    },
    [id],
  );
  useEffect(() => {
    load(true).catch((err) => setError(message(err)));
  }, [load]);
  useEffect(() => {
    if (!project?.operation) return;
    const timer = setInterval(() => load().catch(() => {}), 5000);
    return () => clearInterval(timer);
  }, [project?.operation, load]);

  async function run(label, method, path, data, nextTab) {
    if (busy || project?.operation) return;
    setBusy(label);
    setError("");
    setNotice("");
    try {
      const result = await api(method, path, data);
      if (result.project) setProject(result.project);
      else await load();
      if (nextTab) setTab(nextTab);
      setNotice(`${label} terminé.`);
      return true;
    } catch (err) {
      setError(message(err));
      await load().catch(() => {});
      return false;
    } finally {
      setBusy("");
    }
  }
  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy("Enregistrement");
    setError("");
    try {
      const { project: updated } = await api("put", `/projects/${id}`, form);
      setProject(updated);
      setNotice("Brief enregistré.");
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy("");
    }
  }
  async function uploadAsset(event) {
    event.preventDefault();
    if (!assetFile || busy) return;
    const data = new FormData();
    data.append("image", assetFile);
    data.append("role", assetRole);
    data.append("signature", String(assetSignature));
    data.append("name", assetFile.name);
    await run("Upload asset", "post", `/projects/${id}/assets`, data, "assets");
    setAssetFile(null);
    event.target.reset();
  }
  async function generateAll() {
    if (busy || project.operation) return;
    const directions = project.directions.slice(-3).filter(
      (direction) =>
        !project.generations.some(
          (generation) => generation.directionId === direction._id,
        ),
    );
    if (!directions.length) {
      setTab("generations");
      return;
    }
    setError("");
    setBusy(`Génération de ${directions.length} maquette(s)`);
    try {
      for (const direction of directions) {
        setNotice(`Génération : ${direction.name}`);
        const result = await api(
          "post",
          `/projects/${id}/directions/${direction._id}/generations`,
        );
        setProject(result.project);
      }
      setTab("generations");
      setNotice("Les maquettes sont prêtes.");
    } catch (err) {
      setError(message(err));
      await load().catch(() => {});
    } finally {
      setBusy("");
    }
  }
  async function deleteProject() {
    if (!window.confirm("Supprimer ce projet et son historique ?")) return;
    try {
      await api("delete", `/projects/${id}`);
      router.push("/dashboard/admin/sites");
    } catch (err) {
      setError(message(err));
    }
  }
  const selected = project?.generations?.find(
    (generation) => generation._id === project.selectedGeneration,
  );
  const approved = project?.generations?.find(
    (generation) => generation._id === project.approvedGeneration,
  );
  const selectedRefs = references.filter((reference) =>
    project?.selectedReferences?.includes(reference._id),
  );
  const phase =
    project?.operation?.startsWith("directions") ||
    project?.operation?.startsWith("direction")
      ? "Création des directions…"
      : project?.operation
        ? "Génération de la maquette…"
        : busy === "Directions"
          ? "Sélection des inspirations et création des directions…"
          : busy === "Upload asset"
            ? "Upload des images…"
            : busy === "Sélection"
              ? "Sélection des inspirations…"
              : busy;

  return (
    <DesignLabShell title={project?.name || "Projet"}>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <Link
          href="/dashboard/admin/sites"
          className="inline-flex items-center gap-2 text-sm text-blue"
        >
          <ArrowLeft size={16} /> Design Lab
        </Link>
        <PageHeaderAdminComponent
          title={project?.name || "Chargement…"}
          subtitle={
            project
              ? `${STATUS[project.status] || project.status} · /${project.slug}`
              : ""
          }
          action={
            <button
              onClick={deleteProject}
              className={secondaryButton}
              disabled={!project || !!busy}
            >
              <Trash2 size={15} /> Supprimer
            </button>
          }
        />
        {phase && (
          <div className="flex items-center gap-3 rounded-xl border border-blue/20 bg-blue/10 px-4 py-3 text-sm font-medium text-blue">
            <RefreshCw className="animate-spin" size={17} />
            {phase}
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-red/10 p-3 text-sm text-red">
            {error}
          </p>
        )}
        {project?.lastError && (
          <p className="rounded-xl bg-red/10 p-3 text-sm text-red">
            Dernière erreur : {project.lastError}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="rounded-xl bg-green/10 p-3 text-sm text-green"
          >
            {notice}
          </p>
        )}
        {project && (
          <>
            <nav className="flex flex-wrap gap-2">
              {[
                ["brief", "Brief"],
                ["assets", "Assets"],
                ["references", "Inspirations"],
                ["directions", "Directions"],
                ["generations", "Maquettes"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === key ? "bg-blue text-white" : "bg-white text-darkBlue/70"}`}
                >
                  {label}
                </button>
              ))}
            </nav>
            {tab === "brief" && (
              <form
                className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]"
                onSubmit={save}
              >
                <section className={`${panel} space-y-4`}>
                  <h2 className="text-lg font-semibold">Restaurant et brief</h2>
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      label="Nom"
                      value={form.name}
                      onChange={(value) => setForm({ ...form, name: value })}
                    />
                    <FormField
                      label="Slug"
                      value={form.slug}
                      onChange={(value) => setForm({ ...form, slug: value })}
                    />
                  </div>
                  {FIELDS.map(([key, label]) => (
                    <FormField
                      key={key}
                      label={label}
                      value={form.brief?.[key]}
                      multiline={["description", "story", "notes"].includes(
                        key,
                      )}
                      onChange={(value) =>
                        setForm({
                          ...form,
                          brief: { ...form.brief, [key]: value },
                        })
                      }
                    />
                  ))}
                  <div className="rounded-xl border border-darkBlue/10 p-4">
                    <h3 className="text-sm font-semibold">
                      Contenu du site existant
                    </h3>
                    <p className="mt-1 text-xs text-darkBlue/60">
                      Analyse uniquement le texte de la page enregistrée pour
                      documenter le restaurant. Son design ne sert pas
                      d’inspiration.
                    </p>
                    <button
                      type="button"
                      className={`${secondaryButton} mt-3`}
                      disabled={
                        !!busy ||
                        !!project?.operation ||
                        !project?.brief?.existingWebsite ||
                        form.brief?.existingWebsite?.trim() !==
                          project.brief.existingWebsite?.trim()
                      }
                      onClick={() =>
                        run(
                          "Analyse du contenu",
                          "post",
                          `/projects/${id}/existing-website-context`,
                        )
                      }
                    >
                      <Sparkles size={16} /> Analyser le contenu du site
                    </button>
                    {project?.existingWebsiteContext?.analyzedAt && (
                      <div className="mt-4 space-y-2 text-sm text-darkBlue/75">
                        <p className="font-medium">Contexte documentaire</p>
                        <p>{project.existingWebsiteContext.summary}</p>
                        {[
                          ["Offre", project.existingWebsiteContext.offerings],
                          [
                            "Particularités",
                            project.existingWebsiteContext.distinctiveFacts,
                          ],
                          [
                            "Informations pratiques",
                            project.existingWebsiteContext.practicalInformation,
                          ],
                        ].map(([label, items]) =>
                          items?.length ? (
                            <p key={label}>
                              <strong>{label} :</strong> {items.join(" · ")}
                            </p>
                          ) : null,
                        )}
                      </div>
                    )}
                  </div>
                  <FormField
                    label="Services (séparés par des virgules)"
                    value={(form.brief?.services || []).join(", ")}
                    onChange={(value) =>
                      setForm({
                        ...form,
                        brief: {
                          ...form.brief,
                          services: value.split(",").map((item) => item.trim()),
                        },
                      })
                    }
                  />
                </section>
                <section className={`${panel} self-start space-y-5`}>
                  <h2 className="text-lg font-semibold">
                    Direction artistique
                  </h2>
                  {SLIDERS.map(([key, label, left, right]) => (
                    <div key={key}>
                      <div className="flex justify-between text-sm font-medium">
                        <label htmlFor={key}>{label}</label>
                        <span>{form.creativeSettings?.[key] ?? 50}</span>
                      </div>
                      <input
                        id={key}
                        type="range"
                        min="0"
                        max="100"
                        value={form.creativeSettings?.[key] ?? 50}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            creativeSettings: {
                              ...form.creativeSettings,
                              [key]: Number(event.target.value),
                            },
                          })
                        }
                        className="mt-3 w-full accent-blue"
                      />
                      <div className="flex justify-between text-xs text-darkBlue/50">
                        <span>{left}</span>
                        <span>{right}</span>
                      </div>
                    </div>
                  ))}
                  <div>
                    <h3 className="mb-3 text-sm font-medium">
                      Univers visuels
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {STYLES.map((style) => {
                        const on =
                          form.creativeSettings?.styles?.includes(style);
                        return (
                          <button
                            type="button"
                            key={style}
                            onClick={() =>
                              setForm({
                                ...form,
                                creativeSettings: {
                                  ...form.creativeSettings,
                                  styles: on
                                    ? form.creativeSettings.styles.filter(
                                        (item) => item !== style,
                                      )
                                    : [
                                        ...(form.creativeSettings.styles || []),
                                        style,
                                      ],
                                },
                              })
                            }
                            className={`rounded-full border px-3 py-1.5 text-xs ${on ? "border-blue bg-blue text-white" : "border-darkBlue/15"}`}
                          >
                            {style}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="rounded-xl bg-lightGrey p-4 text-sm">
                    <h3 className="font-semibold">Direction recherchée</h3>
                    <p className="mt-2 text-darkBlue/65">
                      Créativité{" "}
                      {form.creativeSettings.creativity > 66
                        ? "élevée"
                        : form.creativeSettings.creativity < 34
                          ? "classique"
                          : "modérée"}{" "}
                      ·{" "}
                      {form.creativeSettings.styles.join(" / ") ||
                        "univers libre"}{" "}
                      · similarité Gusto{" "}
                      {form.creativeSettings.gustoSimilarity < 34
                        ? "faible"
                        : form.creativeSettings.gustoSimilarity > 66
                          ? "forte"
                          : "moyenne"}{" "}
                      · densité{" "}
                      {form.creativeSettings.visualDensity < 34
                        ? "épurée"
                        : form.creativeSettings.visualDensity > 66
                          ? "riche"
                          : "moyenne"}{" "}
                      · composition{" "}
                      {form.creativeSettings.compositionFreedom > 66
                        ? "libre"
                        : "structurée"}
                    </p>
                  </div>
                  <button
                    className={button}
                    disabled={!!busy || !!project.operation}
                  >
                    Enregistrer le brief
                  </button>
                </section>
              </form>
            )}
            {tab === "assets" && (
              <div className="space-y-5">
                <form
                  onSubmit={uploadAsset}
                  className={`${panel} flex flex-wrap items-end gap-3`}
                >
                  <label className="text-sm">
                    Image
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className={`${input} mt-2`}
                      onChange={(event) =>
                        setAssetFile(event.target.files?.[0])
                      }
                      required
                    />
                  </label>
                  <label className="text-sm">
                    Rôle
                    <select
                      className={`${input} mt-2`}
                      value={assetRole}
                      onChange={(event) => setAssetRole(event.target.value)}
                    >
                      {ASSET_ROLES.map((role) => (
                        <option key={role}>{role}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 pb-2 text-sm">
                    <input
                      type="checkbox"
                      checked={assetSignature}
                      onChange={(event) =>
                        setAssetSignature(event.target.checked)
                      }
                    />{" "}
                    Élément signature
                  </label>
                  <button className={button} disabled={!!busy}>
                    <ImagePlus size={16} /> Ajouter
                  </button>
                </form>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {project.assets.map((asset) => (
                    <div key={asset._id} className={panel}>
                      <img
                        src={asset.url}
                        alt={asset.name}
                        className="h-48 w-full rounded-xl bg-lightGrey object-cover"
                      />
                      <p className="mt-3 truncate text-sm font-semibold">
                        {asset.name}
                      </p>
                      <select
                        className={`${input} mt-2`}
                        value={asset.role}
                        onChange={(event) =>
                          run(
                            "Mise à jour",
                            "patch",
                            `/projects/${id}/assets/${asset._id}`,
                            { role: event.target.value },
                          )
                        }
                      >
                        {ASSET_ROLES.map((role) => (
                          <option key={role}>{role}</option>
                        ))}
                      </select>
                      <div className="mt-3 flex items-center justify-between">
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={asset.signature}
                            onChange={(event) =>
                              run(
                                "Mise à jour",
                                "patch",
                                `/projects/${id}/assets/${asset._id}`,
                                { signature: event.target.checked },
                              )
                            }
                          />{" "}
                          Signature
                        </label>
                        <button
                          aria-label="Supprimer l’asset"
                          onClick={() =>
                            run(
                              "Suppression",
                              "delete",
                              `/projects/${id}/assets/${asset._id}`,
                            )
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {tab === "references" && (
              <div className="space-y-5">
                <section className={panel}>
                  <h2 className="text-lg font-semibold">
                    Inspirations sélectionnées
                  </h2>
                  <p className="mt-1 text-sm text-darkBlue/55">
                    Le moteur présélectionne au plus huit références analysées.
                    Les images ne sont pas renvoyées au modèle pour chaque
                    projet.
                  </p>
                  <button
                    className={`${button} mt-4`}
                    disabled={!!busy || !!project.operation}
                    onClick={() =>
                      run(
                        "Sélection",
                        "post",
                        `/projects/${id}/select-references`,
                      )
                    }
                  >
                    <Sparkles size={16} /> Sélectionner les inspirations
                  </button>
                  <Link
                    href="/dashboard/admin/sites/references"
                    className="ml-4 text-sm text-blue"
                  >
                    Ouvrir la bibliothèque
                  </Link>
                </section>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {selectedRefs.map((ref) => (
                    <article className={panel} key={ref._id}>
                      <img
                        src={ref.image.url}
                        alt={ref.name}
                        className="h-44 w-full rounded-xl object-cover object-top"
                      />
                      <h3 className="mt-3 font-semibold">{ref.name}</h3>
                      <p className="mt-1 line-clamp-3 text-xs text-darkBlue/60">
                        {ref.analysis?.identity}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            )}
            {tab === "directions" && (
              <div className="space-y-5">
                <section className={panel}>
                  <p className="text-sm text-darkBlue/60">
                    Trois pistes distinctes construites à partir du brief, des
                    réglages et des analyses d’inspiration.
                  </p>
                  <button
                    className={`${button} mt-4`}
                    disabled={!!busy || !!project.operation}
                    onClick={() =>
                      run(
                        "Directions",
                        "post",
                        `/projects/${id}/directions`,
                        null,
                        "directions",
                      )
                    }
                  >
                    <Sparkles size={16} /> Générer les directions
                  </button>{" "}
                  {project.directions.length > 0 && (
                    <button
                      className={`${secondaryButton} mt-4 ml-2`}
                      disabled={!!busy || !!project.operation}
                      onClick={generateAll}
                    >
                      Générer jusqu’à 3 maquettes
                    </button>
                  )}
                </section>
                <div className="grid gap-5 lg:grid-cols-3">
                  {project.directions.map((direction, index) => (
                    <article key={direction._id} className={panel}>
                      <span className="text-xs font-semibold uppercase tracking-widest text-blue">
                        Direction {index + 1}
                      </span>
                      <h2 className="mt-2 text-xl font-semibold">
                        {direction.name}
                      </h2>
                      <p className="mt-3 text-sm text-darkBlue/75">
                        {direction.concept}
                      </p>
                      <div className="mt-4 space-y-2 text-sm text-darkBlue/65">
                        <p>
                          <strong>Intention :</strong>{" "}
                          {direction.artisticIntent}
                        </p>
                        <p>
                          <strong>Composition :</strong>{" "}
                          {direction.layoutPrinciples}
                        </p>
                        <p>
                          <strong>Typographie :</strong>{" "}
                          {direction.typographyDirection}
                        </p>
                        <p>
                          <strong>Couleurs :</strong> {direction.colorDirection}
                        </p>
                        <p>
                          <strong>Signature :</strong>{" "}
                          {direction.signatureElements.join(", ")}
                        </p>
                        <p>
                          <strong>Pourquoi :</strong>{" "}
                          {direction.whyItFitsRestaurant}
                        </p>
                        <p>
                          <strong>Différence :</strong>{" "}
                          {direction.differenceFromOtherDirections}
                        </p>
                      </div>
                      <div className="mt-5 flex flex-wrap gap-2">
                        <button
                          className={secondaryButton}
                          disabled={!!busy || !!project.operation}
                          onClick={() =>
                            run(
                              "Sélection",
                              "patch",
                              `/projects/${id}/directions/${direction._id}/select`,
                            )
                          }
                        >
                          {project.selectedDirection === direction._id
                            ? "Sélectionnée"
                            : "Sélectionner"}
                        </button>
                        <button
                          className={button}
                          disabled={!!busy || !!project.operation}
                          onClick={() =>
                            run(
                              "Maquette",
                              "post",
                              `/projects/${id}/directions/${direction._id}/generations`,
                              null,
                              "generations",
                            )
                          }
                        >
                          Générer la maquette
                        </button>
                        <button
                          className={secondaryButton}
                          disabled={!!busy || !!project.operation}
                          onClick={() =>
                            run(
                              "Direction",
                              "post",
                              `/projects/${id}/directions/${direction._id}/regenerate`,
                            )
                          }
                        >
                          <RefreshCw size={15} /> Régénérer
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
            {tab === "generations" && (
              <div className="space-y-5">
                {selected && (
                  <section
                    className={`${panel} grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]`}
                  >
                    <a
                      href={selected.image.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        src={selected.image.url}
                        alt="Maquette sélectionnée"
                        className="w-full rounded-xl border border-darkBlue/10"
                      />
                    </a>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-blue">
                        Version sélectionnée
                      </p>
                      <h2 className="mt-2 text-xl font-semibold">
                        {
                          project.directions.find(
                            (d) => d._id === selected.directionId,
                          )?.name
                        }
                      </h2>
                      <p className="mt-2 text-sm text-darkBlue/55">
                        {selected.parentGenerationId
                          ? `Variation : ${selected.userPrompt}`
                          : "Maquette initiale"}
                      </p>
                      {approved?._id === selected._id && (
                        <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-green">
                          <Check size={16} /> Maquette approuvée
                        </p>
                      )}
                      <textarea
                        className={`${input} mt-6 min-h-28`}
                        placeholder="Ex. Conserve cette direction mais rends le hero plus radical."
                        value={variation}
                        onChange={(event) => setVariation(event.target.value)}
                      />
                      <button
                        className={`${button} mt-3 w-full`}
                        disabled={
                          !!busy || !!project.operation || !variation.trim()
                        }
                        onClick={() => {
                          run(
                            "Variation",
                            "post",
                            `/projects/${id}/generations/${selected._id}/variations`,
                            { instruction: variation },
                          ).then((ok) => {
                            if (ok) setVariation("");
                          });
                        }}
                      >
                        Créer une variation
                      </button>
                      <button
                        className={`${secondaryButton} mt-2 w-full`}
                        disabled={
                          !!busy ||
                          !!project.operation ||
                          approved?._id === selected._id
                        }
                        onClick={() =>
                          run(
                            "Approbation",
                            "post",
                            `/projects/${id}/generations/${selected._id}/approve`,
                          )
                        }
                      >
                        Approuver cette maquette
                      </button>
                    </div>
                  </section>
                )}
                {!selected && (
                  <p className={`${panel} text-sm text-darkBlue/60`}>
                    Générez une maquette depuis l’onglet Directions.
                  </p>
                )}
                <h2 className="text-lg font-semibold">Historique visuel</h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {[...project.generations].reverse().map((generation) => (
                    <article key={generation._id} className={panel}>
                      <img
                        src={generation.image.url}
                        alt="Version de maquette"
                        className="h-56 w-full rounded-xl bg-lightGrey object-cover object-top"
                      />
                      <p className="mt-3 text-sm font-semibold">
                        {
                          project.directions.find(
                            (d) => d._id === generation.directionId,
                          )?.name
                        }
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-darkBlue/55">
                        {generation.parentGenerationId
                          ? `Variation de ${String(generation.parentGenerationId).slice(-6)} · ${generation.userPrompt}`
                          : "Génération initiale"}
                      </p>
                      <p className="mt-1 text-xs text-darkBlue/40">
                        {new Date(generation.createdAt).toLocaleString("fr-FR")}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          className={secondaryButton}
                          disabled={!!busy}
                          onClick={() =>
                            run(
                              "Sélection",
                              "patch",
                              `/projects/${id}/selection`,
                              { generationId: generation._id },
                            )
                          }
                        >
                          Sélectionner
                        </button>
                        {approved?._id === generation._id && (
                          <span className="self-center text-xs font-semibold text-green">
                            Approuvée
                          </span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DesignLabShell>
  );
}

export async function getStaticPaths() {
  return { paths: [], fallback: "blocking" };
}
export async function getStaticProps({ locale }) {
  return {
    props: { ...(await serverSideTranslations(locale, ["common", "admin"])) },
  };
}
