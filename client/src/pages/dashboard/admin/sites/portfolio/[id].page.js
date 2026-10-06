import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/router";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { ArrowLeft, RefreshCw, Trash2 } from "lucide-react";
import DesignLabShell from "@/components/dashboard/admin/sites/design-lab-shell.component";
import DesignLabProgress from "@/components/dashboard/admin/sites/design-lab-progress.component";
import PageHeaderAdminComponent from "@/components/dashboard/admin/_shared/page-header.admin.component";
import {
  api,
  button,
  message,
  panel,
  secondaryButton,
} from "@/components/dashboard/admin/sites/design-lab.shared";

const PROFILE_FIELDS = [
  ["dominantPatterns", "Motifs dominants"],
  ["recurringPatterns", "Motifs récurrents"],
  ["occasionalPatterns", "Motifs ponctuels"],
  ["typographyProfile", "Typographie"],
  ["colorProfile", "Couleurs"],
  ["layoutProfile", "Composition"],
  ["photographyProfile", "Photographie"],
  ["rhythmProfile", "Rythme"],
  ["signaturePatterns", "Éléments signature"],
];
const ANALYSIS_FIELDS = [
  "structure",
  "hero",
  "composition",
  "rhythm",
  "typography",
  "photography",
  "colors",
  "originality",
  "identity",
  "usefulPatterns",
];

export default function PortfolioSitePage() {
  const router = useRouter();
  const { id } = router.query;
  const [site, setSite] = useState(null);
  const [captureEnabled, setCaptureEnabled] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const analyzing = Boolean(site?.analyzing);
  const previousAnalyzing = useRef(false);
  const [showCompletion, setShowCompletion] = useState(false);
  useEffect(() => {
    if (!id) return undefined;
    let live = true;
    const load = () =>
      api("get", `/portfolio/${id}`)
        .then(({ site: value, portfolioCaptureEnabled }) => {
          if (live) {
            setSite(value);
            setCaptureEnabled(portfolioCaptureEnabled === true);
          }
        })
        .catch((err) => {
          if (live) setError(message(err));
        });
    load();
    const timer = analyzing ? setInterval(load, 4000) : null;
    return () => {
      live = false;
      if (timer) clearInterval(timer);
    };
  }, [id, analyzing]);
  useEffect(() => {
    if (previousAnalyzing.current && !analyzing && site?.progress?.status === "completed") {
      setShowCompletion(true);
      const timer = setTimeout(() => setShowCompletion(false), 5000);
      previousAnalyzing.current = analyzing;
      return () => clearTimeout(timer);
    }
    previousAnalyzing.current = analyzing;
    return undefined;
  }, [analyzing, site?.progress?.status]);
  async function action(method, suffix = "", data) {
    setBusy(true);
    setError("");
    try {
      const result = await api(method, `/portfolio/${id}${suffix}`, data);
      if (method === "delete") router.push("/dashboard/admin/sites/portfolio");
      else setSite(result.site);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  const analysisStale =
    site?.analyzing &&
    site.analysisStartedAt &&
    Date.now() - new Date(site.analysisStartedAt).getTime() > 20 * 60 * 1000;
  return (
    <DesignLabShell title={site?.name || "Portfolio Gusto"}>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <PageHeaderAdminComponent
          title={site?.name || "Portfolio Gusto"}
          subtitle={site?.url || "Chargement…"}
        />
        <Link
          href="/dashboard/admin/sites/portfolio"
          className="inline-flex items-center gap-2 text-sm font-semibold text-blue"
        >
          <ArrowLeft size={16} /> Portfolio Gusto
        </Link>
        {error && (
          <p role="alert" className="rounded-xl bg-red/10 p-3 text-sm text-red">
            {error}
          </p>
        )}
        {site && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <button
                className={button}
                disabled={!captureEnabled || busy || (site.analyzing && !analysisStale)}
                onClick={() => action("post", "/analyze")}
              >
                <RefreshCw size={16} />{" "}
                {site.pages?.length
                  ? "Recapturer et réanalyser"
                  : "Capturer et analyser le site"}
              </button>
              <button
                className={secondaryButton}
                disabled={!site.pages?.length || busy || (site.analyzing && !analysisStale)}
                onClick={() => action("post", "/synthesize")}
                title="Un appel Luna textuel, sans capture ni analyse Vision"
              >
                Actualiser le profil visuel
              </button>
              {!captureEnabled && (
                <span className="text-sm text-darkBlue/55">
                  Les captures Portfolio sont désactivées dans cet environnement.
                </span>
              )}
              <button
                className={secondaryButton}
                disabled={busy || site.analyzing}
                onClick={() => action("patch", "", { active: !site.active })}
              >
                {site.active ? "Désactiver" : "Activer"}
              </button>
              <button
                className={secondaryButton}
                disabled={busy || site.analyzing}
                onClick={() => {
                  if (
                    window.confirm(`Supprimer ${site.name} et ses captures ?`)
                  )
                    action("delete");
                }}
              >
                <Trash2 size={16} /> Supprimer
              </button>
            </div>
            {(site.analyzing && !analysisStale || showCompletion) && (
              <DesignLabProgress
                title="Analyse du Portfolio"
                progress={site.progress || {
                  status: "running", progress: 0,
                  message: "Préparation de la capture…",
                }}
              >
                {site.progress?.totalPages > 0 && (
                  <p className="mt-2 text-darkBlue/65">
                    {site.progress.completedPages} / {site.progress.totalPages} pages terminées
                    {site.progress.failedPages > 0 && ` · ${site.progress.failedPages} échec(s)`}
                  </p>
                )}
                {site.progress?.currentPageIndex > 0 && site.progress.currentPageLabel && (
                  <p className="mt-1 text-darkBlue/65">
                    Page {site.progress.currentPageIndex}/{site.progress.totalPages || "?"} · {site.progress.currentPageLabel}
                  </p>
                )}
              </DesignLabProgress>
            )}
            {analysisStale && (
              <p
                role="alert"
                className="rounded-xl bg-red/10 p-3 text-sm text-red"
              >
                L’analyse a été interrompue. Vous pouvez la relancer.
              </p>
            )}
            {site.lastError && (
              <p
                role="alert"
                className="rounded-xl bg-red/10 p-3 text-sm text-red"
              >
                Dernière analyse : {site.lastError}
              </p>
            )}
            {site.progress?.status === "failed" && !site.analyzing && (
              <DesignLabProgress title="Analyse du Portfolio" progress={site.progress} />
            )}
            <p className="text-sm text-darkBlue/55">
              {site.analyzing ? "Dernière analyse enregistrée : " : ""}
              {site.pages?.length || 0} pages analysées
              {site.captureStats?.discovered
                ? ` sur ${site.captureStats.discovered} découvertes`
                : ""}
              {site.captureStats?.failed
                ? ` · ${site.captureStats.failed} erreur(s)`
                : ""}
              {site.analyzedAt
                ? ` · Dernière analyse : ${new Date(site.analyzedAt).toLocaleString("fr-FR")}`
                : ""}{" "}
              · {site.active ? "Actif" : "Inactif"}
            </p>
            {site.visualProfile && (
              <section className={panel}>
                <h2 className="text-xl font-semibold">Profil visuel global</h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  {site.visualProfile.visualTags?.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-blue/10 px-3 py-1 text-xs text-blue"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  {PROFILE_FIELDS.map(([key, label]) => {
                    const value = site.visualProfile[key];
                    const patterns = ["dominantPatterns", "recurringPatterns", "occasionalPatterns"].includes(key);
                    return value?.length ? (
                      <div key={key}>
                        <h3 className="text-sm font-semibold">{label}</h3>
                        <p className="mt-1 text-sm text-darkBlue/65">
                          {Array.isArray(value) ? value.map((item) => {
                            const support = patterns && site.visualProfile.patternSupport?.find(
                              (entry) => entry.label === item,
                            );
                            return support ? `${item} (${support.pageCount}/${support.totalPages} pages)` : item;
                          }).join(" · ") : value}
                        </p>
                      </div>
                    ) : null;
                  })}
                </div>
              </section>
            )}
            <h2 className="text-xl font-semibold">Pages analysées</h2>
            {site.pages?.map((page) => (
              <article key={page.url} className={panel}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-lg font-semibold">
                    {page.label || page.pageType}{" "}
                    <span className="text-sm font-normal text-darkBlue/50">
                      ({page.pageType})
                    </span>
                  </h3>
                  <a
                    href={page.url}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all text-xs text-blue"
                  >
                    {page.url}
                  </a>
                </div>
                <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <a
                    href={page.screenshot?.url}
                    target="_blank"
                    rel="noreferrer"
                    className="relative block h-[540px] overflow-hidden rounded-xl border border-darkBlue/10"
                  >
                    <Image
                      src={page.screenshot?.url}
                      alt={`Capture complète de ${page.label || page.pageType}`}
                      fill
                      unoptimized
                      className="object-cover object-top"
                    />
                  </a>
                  <div>
                    <div className="mb-4 flex flex-wrap gap-1">
                      {page.visualTags?.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-blue/10 px-2 py-1 text-xs text-blue"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    {ANALYSIS_FIELDS.map((key) => {
                      const value = page.analysis?.[key];
                      return value?.length ? (
                        <div key={key} className="mb-3">
                          <h4 className="text-sm font-semibold capitalize">
                            {key}
                          </h4>
                          <p className="text-sm text-darkBlue/65">
                            {Array.isArray(value) ? value.join(" · ") : value}
                          </p>
                        </div>
                      ) : null;
                    })}
                  </div>
                </div>
              </article>
            ))}
          </>
        )}
      </div>
    </DesignLabShell>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: { ...(await serverSideTranslations(locale, ["common", "admin"])) },
  };
}
export async function getStaticPaths() {
  return { paths: [], fallback: "blocking" };
}
