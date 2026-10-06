import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/router";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import DesignLabShell from "@/components/dashboard/admin/sites/design-lab-shell.component";
import PageHeaderAdminComponent from "@/components/dashboard/admin/_shared/page-header.admin.component";
import { structuralCaptureDisplay } from "@/components/dashboard/admin/sites/structural-capture-display";
import {
  StructuralAnalysis,
  StructuralControls,
  StructuralEdit,
  CaptureSanitizationStatus,
} from "@/components/dashboard/admin/sites/structural-reference.component";
import {
  api,
  message,
  panel,
} from "@/components/dashboard/admin/sites/design-lab.shared";
const viewLabels = {
  desktop_full: "Capture desktop complète",
  overview: "Storyboard structurel",
  top: "Haut",
  upper: "Premier intérieur",
  middle: "Milieu",
  lower: "Dernier intérieur",
  bottom: "Bas",
  ...Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`observation${i + 1}`, `Observation locale ${i + 1}`])),
};
export default function StructuralReferencePage() {
  const router = useRouter();
  const { id } = router.query;
  const [reference, setReference] = useState(null);
  const [error, setError] = useState("");
  const { visibleCaptures, visionOverview } =
    structuralCaptureDisplay(reference);
  useEffect(() => {
    if (!id) return;
    let disposed = false;
    const load = () =>
      api("get", `/structural-references/${id}`)
        .then((result) => {
          if (!disposed) setReference(result.reference);
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
  }, [id]);
  return (
    <DesignLabShell title="Référence structurelle">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <Link
          href="/dashboard/admin/sites/structural-references"
          className="text-sm font-semibold text-blue"
        >
          ← Références structurelles
        </Link>
        {error && (
          <p role="alert" className="text-sm text-red">
            {error}
          </p>
        )}
        {reference ? (
          <>
            <PageHeaderAdminComponent
              title={reference.title}
              subtitle={`${reference.domain} · ${reference.active ? "Active" : "Inactive"}`}
            />
            <a
              href={reference.originalSiteUrl || reference.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue"
            >
              Ouvrir le site source ↗
            </a>
            <StructuralControls
              reference={reference}
              onChange={setReference}
              onDelete={() =>
                router.push("/dashboard/admin/sites/structural-references")
              }
            />
            <CaptureSanitizationStatus reference={reference} />
            {reference.analyzedAt && (
              <p className="text-xs text-darkBlue/55">
                Analyse :{" "}
                {new Date(reference.analyzedAt).toLocaleString("fr-FR")}
              </p>
            )}
            <StructuralEdit
              key={reference._id}
              reference={reference}
              onChange={setReference}
            />
            <section className={panel}>
              <h2 className="mb-4 text-lg font-semibold">
                Captures et vues de lecture
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visibleCaptures.map((view) => (
                  <a
                    className={`space-y-2 ${view.type === "desktop_full" ? "sm:col-span-2 lg:col-span-3" : ""}`}
                    href={view.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    key={view.type}
                  >
                    <div
                      className={`relative overflow-hidden rounded-xl bg-lightGrey ${view.type === "desktop_full" ? "h-96" : "h-64"}`}
                    >
                      <Image
                        src={view.url}
                        fill
                        unoptimized
                        alt={
                          view.type === "overview" &&
                          reference.captureCoverage?.captureStrategy ===
                            "sampled"
                            ? "Storyboard structurel segmenté"
                            : viewLabels[view.type]
                        }
                        className="object-contain object-top"
                      />
                    </div>
                    <h3 className="text-sm font-semibold">
                      {view.type === "overview" &&
                      reference.captureCoverage?.captureStrategy === "sampled"
                        ? "Storyboard structurel"
                        : viewLabels[view.type]}{" "}
                      ↗
                    </h3>
                    <p className="text-xs text-darkBlue/55">
                      {view.width} × {view.height} px
                      {Number.isFinite(view.progressPercent)
                        ? ` · ${view.progressPercent} % · ${view.sourceRect?.top} px`
                        : ""}
                    </p>
                    {view.type === "desktop_full" && visionOverview && (
                      <p className="text-xs text-darkBlue/55">
                        Version Vision optimisée : {visionOverview.width} ×{" "}
                        {visionOverview.height} px
                        {" · Dérivée de cette capture"}
                      </p>
                    )}
                  </a>
                ))}
              </div>
              <p className="mt-3 text-xs text-darkBlue/55">
                Ouvrir une vue pour la consulter dans sa définition complète.
              </p>
            </section>
            <StructuralAnalysis analysis={reference.analysis} />
          </>
        ) : (
          <p role="status">Chargement…</p>
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
