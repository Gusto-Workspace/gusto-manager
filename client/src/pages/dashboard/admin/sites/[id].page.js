import { useCallback, useContext, useEffect, useRef, useState } from "react";
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
import StyleFrameRefinement from "@/components/dashboard/admin/sites/style-frame-refinement.component";
import HomepageAttempt, { homepageStageLabel } from "@/components/dashboard/admin/sites/homepage-attempt.component";
import { GlobalContext } from "@/contexts/global.context";
import PageHeaderAdminComponent from "@/components/dashboard/admin/_shared/page-header.admin.component";
import {
  api,
  ASSET_ROLES,
  button,
  input,
  message,
  styleFrameErrorMessage,
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
const MOCKUP_REQUEST_TIMEOUT_MS = 30 * 60 * 1000;
const DIRECTIONS_REQUEST_TIMEOUT_MS = 17 * 60 * 1000;
const WEBSITE_PAGE_TYPES = {
  home: "Accueil",
  restaurant: "Le restaurant / Histoire",
  chef: "Chef / Équipe",
  menu: "Carte / Menus",
  catering: "Traiteur",
  events: "Événements",
  groups: "Groupes / Privatisation",
  contact: "Contact",
  practical: "Informations pratiques",
};
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
    brandContinuity: "reinvent",
    creativity: 50,
    styles: [],
    gustoSimilarity: 50,
    visualDensity: 50,
    compositionFreedom: 50,
  },
};

function formFromProject(project) {
  return {
    name: project.name,
    slug: project.slug,
    restaurantId: project.restaurantId || "",
    brief: project.brief || {},
    creativeSettings: project.creativeSettings || INITIAL.creativeSettings,
  };
}

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
  const { adminContext } = useContext(GlobalContext);
  const router = useRouter();
  const { id } = router.query;
  const [project, setProject] = useState(null);
  const [form, setForm] = useState(INITIAL);
  const [references, setReferences] = useState([]);
  const [tab, setTab] = useState("brief");
  const [busy, setBusy] = useState("");
  const runningAction = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [assetFile, setAssetFile] = useState(null);
  const [assetRole, setAssetRole] = useState("other");
  const [assetSignature, setAssetSignature] = useState(false);
  const [variation, setVariation] = useState("");
  const [styleFrameAttempts, setStyleFrameAttempts] = useState([]);
  const [homepageAttempts, setHomepageAttempts] = useState([]);
  const [homepageOperationStale, setHomepageOperationStale] = useState(false);
  const [styleFrameError, setStyleFrameError] = useState(null);
  const [refiningFrame, setRefiningFrame] = useState(null);
  const [refinementFeedback, setRefinementFeedback] = useState("");
  const latestFrameAttempt = (direction) => styleFrameAttempts.find((attempt) => String(attempt.directionId) === String(direction._id));
  const frameRecoveryPending = (direction) => styleFrameAttempts.some((attempt) => String(attempt.directionId) === String(direction._id)
    && (attempt.status === "uploaded" || (attempt.status === "running" && attempt.stage === "openai") || (attempt.status === "failed" && ["STYLE_FRAME_CLOUDINARY_ERROR", "STYLE_FRAME_PERSISTENCE_ERROR"].includes(attempt.errorCategory))));

  const load = useCallback(
    async (syncForm = false) => {
      if (!id) return;
      const [projectData, referenceData, homepageData] = await Promise.all([
        api("get", `/projects/${id}`),
        api("get", "/references"),
        api("get", `/projects/${id}/homepage-attempts`),
      ]);
      setProject(projectData.project);
      setStyleFrameAttempts(projectData.styleFrameAttempts || []);
      setHomepageAttempts(homepageData.attempts || []);
      setHomepageOperationStale(projectData.homepageOperationStale === true);
      setReferences(referenceData.references);
      if (syncForm) setForm(formFromProject(projectData.project));
    },
    [id],
  );
  useEffect(() => {
    load(true).catch((err) => setError(message(err)));
  }, [load]);
  useEffect(() => {
    if (!project?.operation && !["Directions", "Direction", "Homepage", "Reprise homepage", "Finalisation homepage"].includes(busy)) return;
    const timer = setInterval(() => load().catch(() => {}), 5000);
    return () => clearInterval(timer);
  }, [project?.operation, busy, load]);

  async function run(label, method, path, data, nextTab, options) {
    const attemptPath = pendingHomepage && `/projects/${id}/directions/${pendingHomepage.directionId}/homepage-attempts/${pendingHomepage.generationId}`;
    const staleHomepageAction = homepageOperationStale && pendingHomepage && (
      (method === "post" && [`${attemptPath}/resume`, `${attemptPath}/recover`].includes(path))
      || (method === "delete" && path === `/projects/${id}/homepage-attempts/${pendingHomepage.generationId}`)
    );
    if (runningAction.current || busy || (project?.operation && !staleHomepageAction) || frozen) return;
    runningAction.current = true;
    setBusy(label);
    setError("");
    setStyleFrameError(null);
    setNotice("");
    try {
      const result = await api(method, path, data, options);
      if (result.project) {
        setProject(result.project);
        setHomepageOperationStale(false);
        if (result.project.status === "approved")
          setForm(formFromProject(result.project));
      }
      else await load();
      if (nextTab) setTab(nextTab);
      setNotice(`${label} terminé.`);
      if (label.includes("Style Frame") || /homepage/i.test(label)) await load().catch(() => {});
      return true;
    } catch (err) {
      setError(message(err));
      setStyleFrameError(err?.response?.data?.styleFrameError || null);
      await load().catch(() => {});
      return false;
    } finally {
      runningAction.current = false;
      setBusy("");
    }
  }
  async function save(event) {
    event.preventDefault();
    if (busy || frozen) return;
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
    if (!assetFile || busy || frozen) return;
    const data = new FormData();
    data.append("image", assetFile);
    data.append("role", assetRole);
    data.append("signature", String(assetSignature));
    data.append("name", assetFile.name);
    await run("Upload asset", "post", `/projects/${id}/assets`, data, "assets");
    setAssetFile(null);
    event.target.reset();
  }
  async function deleteProject() {
    if (frozen) return;
    if (!window.confirm("Supprimer ce projet et son historique ?")) return;
    try {
      await api("delete", `/projects/${id}`);
      router.push("/dashboard/admin/sites");
    } catch (err) {
      setError(message(err));
    }
  }
  async function reopen() {
    if (
      !project ||
      !(
        project.status === "approved" ||
        project.approvedGeneration ||
        project.approvedAt ||
        project.approvedSnapshot
      ) ||
      busy ||
      !window.confirm(
        "Réouvrir ce projet ? La maquette approuvée restera dans l’historique, mais il n’y aura plus de version finale active avant une nouvelle approbation.",
      )
    )
      return;
    setBusy("Réouverture");
    setError("");
    try {
      const { project: reopened } = await api(
        "post",
        `/projects/${id}/reopen`,
      );
      setProject(reopened);
      setForm(formFromProject(reopened));
      setNotice("Projet réouvert. L’ancienne approbation reste dans l’historique.");
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy("");
    }
  }
  const frozen = Boolean(
    project &&
      (project.status === "approved" ||
        project.approvedGeneration ||
        project.approvedAt ||
        project.approvedSnapshot),
  );
  const restaurants = adminContext?.restaurantsList || [];
  const mainDirections = (project?.directions || []).filter((direction) => direction.status === "active" && ["A", "B", "C"].includes(direction.slot))
    .sort((a, b) => a.slot.localeCompare(b.slot));
  const pendingHomepage = homepageAttempts.find((attempt) => attempt.blocking && !["completed", "abandoned"].includes(attempt.status));
  const selectedRestaurantIsMissing =
    form.restaurantId &&
    !restaurants.some((restaurant) => restaurant._id === form.restaurantId);
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
      ? project.operationStage === "territories"
        ? "Création des territoires artistiques…"
        : project.operationStage === "expanding"
          ? project.operation.startsWith("directions:")
            ? "Développement des trois directions…"
            : "Développement de la direction…"
          : project.operationStage === "saving"
            ? "Enregistrement des directions…"
            : "Génération des directions en cours…"
      : project?.operation?.startsWith("style-frame-recovery")
        ? "Récupération du Style Frame en cours (sans OpenAI)…"
      : project?.operation?.startsWith("style-frame-refine")
        ? "Affinage du Style Frame en cours…"
      : project?.operation?.startsWith("style-frame")
        ? "Génération du Style Frame en cours…"
      : project?.operation?.startsWith("homepage:")
        ? homepageStageLabel(pendingHomepage)
      : project?.operation
        ? "Génération de la maquette…"
        : busy === "Directions" || busy === "Direction"
          ? "Préparation de la génération des directions…"
          : busy === "Style Frame"
            ? "Génération du Style Frame en cours…"
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
              disabled={!project || !!busy || frozen}
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
        {(error || project?.lastError) && (
          <p role="alert" className="rounded-xl bg-red/10 p-3 text-sm text-red">
            {styleFrameErrorMessage(error || project.lastError)}
          </p>
        )}
        {styleFrameError && (
          <details className="text-xs text-darkBlue/60"><summary>Détails de la tentative</summary>
            <p>Request ID : {styleFrameError.requestId || "—"} · HTTP : {styleFrameError.httpStatus || "—"}</p>
            <p>Generation ID : {styleFrameError.generationId || "—"} · Étape : {styleFrameError.stage}</p>
          </details>
        )}
        {notice && (
          <p
            role="status"
            className="rounded-xl bg-green/10 p-3 text-sm text-green"
          >
            {notice}
          </p>
        )}
        {frozen && (
          <section className={`${panel} border-green/30 bg-green/5`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-green">
                  Maquette approuvée · projet gelé
                </p>
                <p className="mt-1 text-sm text-darkBlue/75">
                  Approuvée le{" "}
                  {project.approvedAt
                    ? new Date(project.approvedAt).toLocaleString("fr-FR")
                    : "date indisponible"}
                  {approved && ` · ${approved._id.slice(-6)}`}
                </p>
                <p className="mt-1 text-xs text-darkBlue/55">
                  Le brief, les assets et les générations sont protégés. L’historique reste consultable.
                </p>
              </div>
              <button
                className={secondaryButton}
                disabled={!!busy || !!project.operation}
                onClick={reopen}
              >
                <RefreshCw size={15} /> Réouvrir le projet
              </button>
            </div>
          </section>
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
                <fieldset disabled={frozen} className="contents">
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
                  <label className="block text-sm font-medium">
                    Restaurant Gusto associé
                    <select
                      className={`${input} mt-2`}
                      value={form.restaurantId || ""}
                      onChange={(event) =>
                        setForm({ ...form, restaurantId: event.target.value })
                      }
                    >
                      <option value="">Aucun restaurant associé</option>
                      {selectedRestaurantIsMissing && (
                        <option value={form.restaurantId}>
                          Restaurant associé indisponible dans la liste
                        </option>
                      )}
                      {restaurants.map((restaurant) => (
                        <option key={restaurant._id} value={restaurant._id}>
                          {restaurant.name}
                        </option>
                      ))}
                    </select>
                  </label>
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
                      <Sparkles size={16} />{" "}
                      {project?.existingWebsiteContext?.analyzedAt
                        ? "Réanalyser"
                        : "Analyser le contenu du site"}
                    </button>
                    {project?.existingWebsiteContext?.analyzedAt && (
                      <div className="mt-4 space-y-2 text-sm text-darkBlue/75">
                        <p className="font-medium">Site analysé ✓</p>
                        <p>
                          {project.existingWebsiteContext.pagesDiscovered ||
                            project.existingWebsiteContext.sourcePages
                              ?.length ||
                            0}{" "}
                          page(s) découverte(s) ·{" "}
                          {project.existingWebsiteContext.sourcePages?.length ||
                            0}{" "}
                          analysée(s)
                          {project.existingWebsiteContext.pagesFailed
                            ? ` · ${project.existingWebsiteContext.pagesFailed} erreur(s)`
                            : ""}
                        </p>
                        <div>
                          <p className="font-medium">Pages utilisées :</p>
                          <ul className="mt-1 list-inside list-disc">
                            {(
                              project.existingWebsiteContext.sourcePages || []
                            ).map((page) => (
                              <li key={page.url}>
                                <a
                                  href={page.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-blue hover:underline"
                                >
                                  {WEBSITE_PAGE_TYPES[page.pageType] ||
                                    page.pageType}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <p className="font-medium">Contexte documentaire</p>
                        <p>
                          {project.existingWebsiteContext.restaurantSummary}
                        </p>
                        {[
                          ["Histoire", project.existingWebsiteContext.story],
                          [
                            "Positionnement",
                            project.existingWebsiteContext.positioning,
                          ],
                          ["Cuisine", project.existingWebsiteContext.cuisine],
                          ["Chef", project.existingWebsiteContext.chef],
                          ["Équipe", project.existingWebsiteContext.team],
                          ["Services", project.existingWebsiteContext.services],
                          [
                            "Spécialités",
                            project.existingWebsiteContext.specialties,
                          ],
                          ["Valeurs", project.existingWebsiteContext.values],
                          [
                            "Faits notables",
                            project.existingWebsiteContext.notableFacts,
                          ],
                          ["Lieu", project.existingWebsiteContext.location],
                          [
                            "Horaires",
                            project.existingWebsiteContext.openingHours,
                          ],
                          [
                            "Contenu utile",
                            project.existingWebsiteContext.usefulContent,
                          ],
                        ].map(([label, items]) =>
                          items?.length ? (
                            <p key={label}>
                              <strong>{label} :</strong>{" "}
                              {Array.isArray(items) ? items.join(" · ") : items}
                            </p>
                          ) : null,
                        )}
                        {Object.values(
                          project.existingWebsiteContext.contact || {},
                        ).some(Boolean) && (
                          <p>
                            <strong>Contact :</strong>{" "}
                            {[
                              project.existingWebsiteContext.contact.address,
                              project.existingWebsiteContext.contact.phone,
                              project.existingWebsiteContext.contact.email,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
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
                      {key === "gustoSimilarity" && (
                        <p className="mt-2 text-xs text-darkBlue/55">
                          Comparé aux sites actifs du Portfolio Gusto : 0
                          explore un langage distinct, 50 garde une continuité
                          mesurée, 100 autorise une forte continuité sans copier
                          un site.
                        </p>
                      )}
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
                  <label className="block text-sm font-medium">
                    Continuité de marque
                    <select
                      className={`${input} mt-2`}
                      value={form.creativeSettings?.brandContinuity || "reinvent"}
                      onChange={(event) => setForm({ ...form, creativeSettings: { ...form.creativeSettings, brandContinuity: event.target.value } })}
                    >
                      <option value="reinvent">Réinventer — nouvelle palette possible</option>
                      <option value="evolve">Faire évoluer — conserver certains codes</option>
                      <option value="preserve">Préserver — identité existante contraignante</option>
                    </select>
                  </label>
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
                </fieldset>
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
                      disabled={frozen}
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
                      disabled={frozen}
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
                      disabled={frozen}
                      onChange={(event) =>
                        setAssetSignature(event.target.checked)
                      }
                    />{" "}
                    Élément signature
                  </label>
                  <button className={button} disabled={!!busy || frozen}>
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
                        disabled={!!busy || frozen}
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
                            disabled={!!busy || frozen}
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
                          disabled={!!busy || frozen}
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
                      <label className="mt-3 flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={!!asset.benchmarkExcluded}
                          disabled={!!busy || frozen}
                          onChange={(event) =>
                            run(
                              "Mise à jour",
                              "patch",
                              `/projects/${id}/assets/${asset._id}`,
                              { benchmarkExcluded: event.target.checked },
                            )
                          }
                        />{" "}
                        Exclure des maquettes (benchmark)
                      </label>
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
                    disabled={!!busy || !!project.operation || frozen}
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
                    disabled={!!busy || !!project.operation || frozen}
                    onClick={() =>
                      run(
                        "Directions",
                        "post",
                        `/projects/${id}/directions`,
                        null,
                        "directions",
                        { timeout: DIRECTIONS_REQUEST_TIMEOUT_MS },
                      )
                    }
                  >
                    <Sparkles size={16} /> Générer les directions
                  </button>
                </section>
                {pendingHomepage && <HomepageAttempt attempt={pendingHomepage} disabled={!!busy || (!!project.operation && !homepageOperationStale) || frozen}
                  operationBlocked={!!project.operation && !homepageOperationStale} operationStale={homepageOperationStale}
                  compatibleDirection={mainDirections.some((direction) => direction._id === pendingHomepage.directionId)}
                  onResume={() => {
                    const confirmed = pendingHomepage.needsUncertainConfirmation
                      ? window.confirm("Un appel précédent peut avoir été facturé sans résultat récupéré. La reprise vérifiera d’abord les images sauvegardées. Si aucune n’est retrouvée, autorisez-vous explicitement un nouvel appel pour ce chapitre ?") : false;
                    if (pendingHomepage.needsUncertainConfirmation && !confirmed) return;
                    run("Reprise homepage", "post", `/projects/${id}/directions/${pendingHomepage.directionId}/homepage-attempts/${pendingHomepage.generationId}/resume`,
                      { confirmUncertainRetry: confirmed }, "generations", { timeout: MOCKUP_REQUEST_TIMEOUT_MS });
                  }}
                  onRecover={() => run("Finalisation homepage", "post", `/projects/${id}/directions/${pendingHomepage.directionId}/homepage-attempts/${pendingHomepage.generationId}/recover`, null, "generations", { timeout: MOCKUP_REQUEST_TIMEOUT_MS })}
                  onAbandon={() => {
                    if (window.confirm("Abandonner cette tentative ? Les images conservées et les homepages officielles ne seront pas supprimées. Une prochaine génération commencera une nouvelle tentative payante."))
                      run("Abandon homepage", "delete", `/projects/${id}/homepage-attempts/${pendingHomepage.generationId}`, null, "directions");
                  }} />}
                <div className="grid gap-5 lg:grid-cols-3">
                  {mainDirections.map((direction) => (
                    <article key={direction._id} className={panel}>
                      <span className="text-xs font-semibold uppercase tracking-widest text-blue">
                        Direction {direction.slot} · v{direction.version}
                      </span>
                      <h2 className="mt-2 text-xl font-semibold">
                        {direction.name}
                      </h2>
                      <p className="mt-3 text-sm text-darkBlue/75">
                        {direction.concept}
                      </p>
                      <div className="mt-4 space-y-3 text-sm text-darkBlue/70">
                          <p><strong>Idée de marque :</strong> {direction.brandSystem?.brandIdea}</p>
                          <p><strong>Personnalité :</strong> {direction.brandSystem?.brandPersonality?.join(" · ")}</p>
                          <p><strong>Voix typographique :</strong> {direction.brandSystem?.typographicVoice}</p>
                          <p><strong>Langage spatial :</strong> {direction.brandSystem?.spatialLanguage}</p>
                          <p><strong>Thèse web :</strong> {direction.visualSystem?.designThesis}</p>
                          <p><strong>Palette et provenance :</strong></p>
                          <ul className="space-y-1 pl-4 list-disc">
                            {Object.entries(direction.brandSystem?.colorSystem || {}).filter(([, value]) => value && typeof value === "object").map(([role, color]) => (
                              <li key={role}>{role} : {color.name} {color.hex} — {color.sourceType} : {color.sourceExplanation}</li>
                            ))}
                          </ul>
                          <p><strong>Références visuelles :</strong> {(direction.visualSystem?.referenceAnchors || []).map((anchor) => references.find((reference) => reference._id === anchor.referenceId)?.name || String(anchor.referenceId).slice(-6)).join(" · ")}</p>
                          <p><strong>Pages :</strong> {(direction.siteInformationArchitecture?.primaryPages || []).map((page) => page.label).join(" · ")}</p>
                          <p><strong>Rythme :</strong> {(direction.siteInformationArchitecture?.homepageMoments || []).map((section) => `${section.purpose} (${section.climate}, ${section.layoutMode})`).join(" → ")}</p>
                          <p><strong>À éviter :</strong> {direction.visualSystem?.antiPatterns?.join(" · ")}</p>
                      </div>
                      <div className="mt-4 space-y-3">
                          <button
                            className={button}
                            disabled={!!busy || !!project.operation || frozen || project.selectedDirection !== direction._id || frameRecoveryPending(direction)}
                            onClick={() => run("Style Frame", "post", `/projects/${id}/directions/${direction._id}/style-frames`,
                              !direction.styleFrames?.length && latestFrameAttempt(direction)?.status === "failed" && latestFrameAttempt(direction)?.mode === "new_proposal"
                                ? { retryGenerationId: latestFrameAttempt(direction).generationId } : null,
                              "directions", { timeout: MOCKUP_REQUEST_TIMEOUT_MS })}
                          >
                            <ImagePlus size={16} /> {direction.styleFrames?.length ? "Nouvelle proposition" : latestFrameAttempt(direction)?.status === "failed" || (project.lastError && project.selectedDirection === direction._id) ? "Relancer la génération" : "Générer le Style Frame"}
                          </button>
                          {styleFrameAttempts.filter((attempt) => String(attempt.directionId) === String(direction._id) && attempt.status !== "completed").map((attempt) => (
                            <div key={attempt.generationId} className="text-xs text-darkBlue/60">
                              <details><summary>Tentative {attempt.generationId.slice(0, 8)} — {attempt.status}</summary>
                                <p>Generation ID : {attempt.generationId} · Request ID : {attempt.openaiRequestId || "—"} · HTTP : {attempt.httpStatus || "—"}</p>
                                <p>Étape : {attempt.stage} · {attempt.errorCategory}</p>
                              </details>
                              {(attempt.status === "uploaded" || (attempt.status === "running" && attempt.stage === "openai") || ["STYLE_FRAME_CLOUDINARY_ERROR", "STYLE_FRAME_PERSISTENCE_ERROR"].includes(attempt.errorCategory)) && (
                                <button className={`${secondaryButton} mt-2`} disabled={!!busy || !!project.operation || frozen || project.selectedDirection !== direction._id}
                                  onClick={() => run("Récupération du Style Frame", "post", `/projects/${id}/directions/${direction._id}/style-frame-attempts/${attempt.generationId}/recover`, null, "directions", { timeout: MOCKUP_REQUEST_TIMEOUT_MS })}>Récupérer la tentative (sans OpenAI)</button>
                              )}
                            </div>
                          ))}
                          {[...(direction.styleFrames || [])].reverse().map((frame) => (
                            <div key={frame._id} className="rounded-xl border border-darkBlue/10 p-3">
                              <a href={frame.image.url} target="_blank" rel="noreferrer"><img src={frame.image.url} alt={`Style Frame ${direction.name}`} className="w-full rounded-lg" /></a>
                              <p className="mt-2 text-xs text-darkBlue/60">{frame.inputs?.filter((item) => item.kind === "CLIENT_ASSET").map((item) => item.name).join(" · ")}</p>
                              <p className="text-xs text-darkBlue/60">Références : {frame.inputs?.filter((item) => item.kind === "VISUAL_REFERENCE").map((item) => item.name).join(" · ")}</p>
                              {String(direction.approvedStyleFrameId || "") === frame._id ? (
                                <p className="mt-2 text-sm font-medium text-green-700">Style Frame validé</p>
                              ) : (
                                <button className={`${secondaryButton} mt-3`} disabled={!!busy || !!project.operation || frozen} onClick={() => run("Validation du Style Frame", "patch", `/projects/${id}/directions/${direction._id}/style-frames/${frame._id}/approve`, null, "directions")}><Check size={15} /> Valider ce Style Frame</button>
                              )}
                              <button className={`${secondaryButton} mt-3 ml-2`} disabled={!!busy || !!project.operation || frozen || project.selectedDirection !== direction._id || frameRecoveryPending(direction)}
                                onClick={() => { setRefiningFrame({ directionId: direction._id, frameId: frame._id }); setRefinementFeedback(""); }}>Affiner ce Style Frame</button>
                            </div>
                          ))}
                      </div>
                      <div className="mt-5 flex flex-wrap gap-2">
                        <button
                          className={secondaryButton}
                          disabled={!!busy || !!project.operation || frozen}
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
                          disabled={!!busy || !!project.operation || frozen || !!pendingHomepage || !direction.approvedStyleFrameId}
                          onClick={() =>
                            run(
                              "Homepage",
                              "post",
                              `/projects/${id}/directions/${direction._id}/generations`,
                              null,
                              "generations",
                              { timeout: MOCKUP_REQUEST_TIMEOUT_MS },
                            )
                          }
                        >
                          Générer la homepage
                        </button>
                        <button
                          className={secondaryButton}
                          disabled={!!busy || !!project.operation || frozen}
                          onClick={() =>
                            run(
                              "Direction",
                              "post",
                              `/projects/${id}/directions/${direction._id}/regenerate`,
                              null,
                              "directions",
                              { timeout: DIRECTIONS_REQUEST_TIMEOUT_MS },
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
                          !!busy || !!project.operation || frozen || !variation.trim()
                        }
                        onClick={() => {
                          run(
                            "Variation",
                            "post",
                            `/projects/${id}/generations/${selected._id}/variations`,
                            { instruction: variation },
                            undefined,
                            { timeout: MOCKUP_REQUEST_TIMEOUT_MS },
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
                          frozen ||
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
                      <a href={generation.image.url} target="_blank" rel="noreferrer">
                        <img
                          src={generation.image.url}
                          alt="Voir la version de maquette"
                          className="h-56 w-full rounded-xl bg-lightGrey object-cover object-top"
                        />
                      </a>
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
                          disabled={!!busy || frozen}
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
                        {project.approvalHistory?.some(
                          (snapshot) =>
                            snapshot.generation?._id === generation._id,
                        ) && (
                          <span className="self-center text-xs font-semibold text-darkBlue/55">
                            Anciennement approuvée
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
      {refiningFrame && <StyleFrameRefinement feedback={refinementFeedback} onChange={setRefinementFeedback} busy={!!busy || !!project?.operation}
        onClose={() => setRefiningFrame(null)} onSubmit={async (event) => {
          event.preventDefault();
          const success = await run("Affinage du Style Frame", "post", `/projects/${id}/directions/${refiningFrame.directionId}/style-frames/${refiningFrame.frameId}/refine`, { feedback: refinementFeedback }, "directions", { timeout: MOCKUP_REQUEST_TIMEOUT_MS });
          if (success) setRefiningFrame(null);
        }} />}
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
