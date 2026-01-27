import { useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useContext } from "react";
import { GlobalContext } from "@/contexts/global.context";

export default function AddDocumentAdminPage() {
  const { adminContext } = useContext(GlobalContext);

  const router = useRouter();

  const [type, setType] = useState("QUOTE");
  const [restaurantName, setRestaurantName] = useState("");
  const [email, setEmail] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleCreate(e) {
    e.preventDefault();
    setErrorMsg("");

    if (!restaurantName.trim() || !email.trim()) {
      setErrorMsg("Nom du restaurant et email requis.");
      return;
    }

    const token = localStorage.getItem("admin-token");

    if (!token) {
      setErrorMsg("Tu n'es pas connecté (token manquant).");
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/documents`,
        {
          type,
          party: { restaurantName: restaurantName.trim(), email: email.trim() },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const id = data?.document?._id;
      if (!id) throw new Error("Document id missing");

      adminContext?.setDocumentsList?.((prev) => {
        const list = prev || [];
        const exists = list.some((d) => d._id === data.document._id);
        if (exists) return list;
        return [data.document, ...list];
      });

      router.push(`/dashboard/admin/documents/add/${id}`);
      setSubmitting(false);
    } catch (err) {
      console.error(err);
      setErrorMsg("Erreur lors de la création du document.");
    } finally {
      
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="ml-16 mobile:ml-12 tablet:ml-0 px-4 pt-4">
        <button
          onClick={() => router.push("/dashboard/admin/documents")}
          className="inline-flex items-center gap-2 text-sm font-semibold text-darkBlue hover:underline"
        >
          <ArrowLeft className="size-4" />
          Retour
        </button>
      </div>

      <div className="tablet:ml-0">
        <div className="rounded-2xl bg-white/50 border border-darkBlue/10 shadow-sm p-5">
          <h1 className="text-lg font-semibold text-darkBlue">
            Créer un document
          </h1>
          <p className="text-sm text-darkBlue/60 mt-1">
            Choisis le type et renseigne les infos minimum (le reste sur la page
            suivante).
          </p>

          <form onSubmit={handleCreate} className="mt-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-semibold text-darkBlue">
                Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm text-darkBlue outline-none focus:ring-2 focus:ring-blue/30"
              >
                <option value="QUOTE">Devis</option>
                <option value="INVOICE">Facture</option>
                <option value="CONTRACT">Contrat</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-semibold text-darkBlue">
                Nom du restaurant
              </label>
              <input
                value={restaurantName}
                onChange={(e) => setRestaurantName(e.target.value)}
                className="rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm text-darkBlue outline-none focus:ring-2 focus:ring-blue/30"
                placeholder="Ex: La Coquille"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-semibold text-darkBlue">
                Email
              </label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm text-darkBlue outline-none focus:ring-2 focus:ring-blue/30"
                placeholder="client@restaurant.com"
              />
            </div>

            {errorMsg ? (
              <div className="rounded-xl border border-red/20 bg-red/10 px-3 py-2 text-sm text-red">
                {errorMsg}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center max-w-[200px] mx-auto w-full gap-2 rounded-xl bg-blue px-4 py-2 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Création…
                </>
              ) : (
                "Créer"
              )}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
