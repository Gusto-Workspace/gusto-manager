import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/router";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { ArrowLeft, ArrowRight, Plus } from "lucide-react";
import DesignLabShell from "@/components/dashboard/admin/sites/design-lab-shell.component";
import PageHeaderAdminComponent from "@/components/dashboard/admin/_shared/page-header.admin.component";
import {
  api,
  button,
  input,
  message,
  panel,
  secondaryButton,
} from "@/components/dashboard/admin/sites/design-lab.shared";

export default function PortfolioPage() {
  const router = useRouter();
  const [sites, setSites] = useState([]);
  const [form, setForm] = useState({
    name: "",
    url: "",
    slug: "",
    restaurantId: "",
  });
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api("get", "/portfolio")
      .then(({ sites: items }) => setSites(items))
      .catch((err) => setError(message(err)));
  }, []);
  async function create(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { site } = await api("post", "/portfolio", form);
      router.push(`/dashboard/admin/sites/portfolio/${site._id}`);
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  }
  return (
    <DesignLabShell title="Portfolio Gusto">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <PageHeaderAdminComponent
          title="Portfolio Gusto"
          subtitle="Langage visuel des sites déjà réalisés par Gusto"
          action={
            <button className={button} onClick={() => setAdding(true)}>
              <Plus size={16} /> Ajouter un site Gusto
            </button>
          }
        />
        <Link
          href="/dashboard/admin/sites"
          className="inline-flex items-center gap-2 text-sm font-semibold text-blue"
        >
          <ArrowLeft size={16} /> Design Lab
        </Link>
        <p className="text-sm text-darkBlue/60">
          Ce portfolio sert à comparer les nouvelles directions avec les
          créations Gusto. La bibliothèque d’inspiration reste séparée.
        </p>
        {error && (
          <p role="alert" className="rounded-xl bg-red/10 p-3 text-sm text-red">
            {error}
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sites.map((site) => (
            <Link
              key={site._id}
              href={`/dashboard/admin/sites/portfolio/${site._id}`}
              className={`${panel} overflow-hidden transition hover:border-blue/40 hover:shadow-lg`}
            >
              {site.pages?.[0]?.screenshot?.url ? (
                <div className="relative mb-4 h-44 w-full overflow-hidden rounded-xl bg-lightGrey">
                  <Image
                    src={site.pages[0].screenshot.url}
                    alt={`Capture de ${site.name}`}
                    fill
                    unoptimized
                    className="object-cover object-top"
                  />
                </div>
              ) : (
                <div className="mb-4 flex h-44 items-center justify-center rounded-xl bg-lightGrey text-sm text-darkBlue/40">
                  Aucune capture
                </div>
              )}
              <span
                className={`text-xs font-semibold ${site.active ? "text-blue" : "text-darkBlue/40"}`}
              >
                {site.active ? "Actif" : "Inactif"}
                {site.analyzing ? " · Analyse en cours" : ""}
              </span>
              <h2 className="mt-2 text-xl font-semibold">{site.name}</h2>
              <p className="mt-1 text-sm text-darkBlue/55">
                {site.pages?.length || 0} pages analysées
              </p>
              <div className="mt-3 flex flex-wrap gap-1">
                {site.visualProfile?.visualTags?.slice(0, 5).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-blue/10 px-2 py-1 text-xs text-blue"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <div className="mt-5 flex items-center justify-between text-xs text-darkBlue/55">
                <span>
                  {site.analyzedAt
                    ? `Dernière analyse : ${new Date(site.analyzedAt).toLocaleDateString("fr-FR")}`
                    : "À analyser"}
                </span>
                <ArrowRight size={18} />
              </div>
            </Link>
          ))}
        </div>
        {!sites.length && !error && (
          <div className={`${panel} py-14 text-center text-darkBlue/55`}>
            Ajoutez des sites au Portfolio Gusto pour activer la comparaison
            avec vos créations existantes.
          </div>
        )}
        {adding && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-darkBlue/50 p-4">
            <form onSubmit={create} className={`${panel} w-full max-w-lg`}>
              <h2 className="text-xl font-semibold">Ajouter un site Gusto</h2>
              {[
                ["name", "Nom", true],
                ["url", "URL publique", true],
                ["slug", "Slug (optionnel)", false],
                ["restaurantId", "Restaurant ID (optionnel)", false],
              ].map(([key, label, required]) => (
                <label key={key} className="mt-4 block text-sm font-medium">
                  {label}
                  <input
                    className={`${input} mt-2`}
                    value={form[key]}
                    onChange={(event) =>
                      setForm({ ...form, [key]: event.target.value })
                    }
                    required={required}
                    maxLength={key === "url" ? 2000 : 120}
                  />
                </label>
              ))}
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() => setAdding(false)}
                >
                  Annuler
                </button>
                <button className={button} disabled={busy}>
                  Ajouter
                </button>
              </div>
            </form>
          </div>
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
