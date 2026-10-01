import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { ArrowRight, Plus, Library } from "lucide-react";
import DesignLabShell from "@/components/dashboard/admin/sites/design-lab-shell.component";
import PageHeaderAdminComponent from "@/components/dashboard/admin/_shared/page-header.admin.component";
import {
  api,
  button,
  input,
  message,
  panel,
  STATUS,
} from "@/components/dashboard/admin/sites/design-lab.shared";

export default function SitesPage() {
  const router = useRouter();
  const [projects, setProjects] = useState([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api("get", "/projects")
      .then((data) => setProjects(data.projects))
      .catch((err) => setError(message(err)));
  }, []);
  async function create(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { project } = await api("post", "/projects", {
        name,
        slug:
          slug ||
          name
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, ""),
      });
      router.push(`/dashboard/admin/sites/${project._id}`);
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  }
  return (
    <DesignLabShell title="Design Lab">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <PageHeaderAdminComponent
          title="Gusto Design Lab"
          subtitle="Projets de sites et directions artistiques"
          action={
            <button className={button} onClick={() => setCreating(true)}>
              <Plus size={16} /> Nouveau projet
            </button>
          }
        />
        <div className="flex justify-end">
          <Link
            className="inline-flex items-center gap-2 text-sm font-semibold text-blue"
            href="/dashboard/admin/sites/references"
          >
            <Library size={17} /> Bibliothèque d’inspiration{" "}
            <ArrowRight size={15} />
          </Link>
        </div>
        {error && (
          <p role="alert" className="rounded-xl bg-red/10 p-3 text-sm text-red">
            {error}
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <Link
              href={`/dashboard/admin/sites/${project._id}`}
              key={project._id}
              className={`${panel} block transition hover:border-blue/40 hover:shadow-lg`}
            >
              <span className="text-xs font-semibold uppercase tracking-widest text-blue">
                {STATUS[project.status] || project.status}
              </span>
              <h2 className="mt-3 text-xl font-semibold">{project.name}</h2>
              <p className="mt-1 text-sm text-darkBlue/50">/{project.slug}</p>
              <div className="mt-8 flex items-center justify-between text-xs text-darkBlue/55">
                <time>
                  {new Date(project.updatedAt).toLocaleDateString("fr-FR")}
                </time>
                <ArrowRight size={18} />
              </div>
            </Link>
          ))}
        </div>
        {!projects.length && !error && (
          <div className={`${panel} py-16 text-center text-darkBlue/55`}>
            Aucun projet pour le moment.
          </div>
        )}
        {creating && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-darkBlue/50 p-4">
            <form onSubmit={create} className={`${panel} w-full max-w-md`}>
              <h2 className="text-xl font-semibold">Nouveau projet</h2>
              <label className="mt-5 block text-sm font-medium">
                Nom du restaurant
                <input
                  className={`${input} mt-2`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={120}
                />
              </label>
              <label className="mt-4 block text-sm font-medium">
                Slug
                <input
                  className={`${input} mt-2`}
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="Généré depuis le nom"
                />
              </label>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-xl px-4 py-2 text-sm"
                  onClick={() => setCreating(false)}
                >
                  Annuler
                </button>
                <button className={button} disabled={busy}>
                  Créer le projet
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
