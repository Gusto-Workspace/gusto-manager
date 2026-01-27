import { useMemo, useState } from "react";
import axios from "axios";
import { useTranslation } from "next-i18next";

// COMPONENTS
import DoubleSkeletonComponent from "@/components/_shared/skeleton/double-skeleton.component";
import SimpleSkeletonComponent from "@/components/_shared/skeleton/simple-skeleton.component";

// ICONS (lucide)
import {
  Plus,
  Pencil,
  Trash2,
  User,
  Mail,
  Phone,
  Calendar,
  Store,
  Loader2,
  AlertTriangle,
} from "lucide-react";

export default function ListOwnersAdminComponent(props) {
  const { t } = useTranslation("admin");

  const [ownerToDelete, setOwnerToDelete] = useState(null);
  const [loadingDeleteId, setLoadingDeleteId] = useState(null);

  const owners = useMemo(() => props.owners || [], [props.owners]);

  async function confirmDelete(ownerId) {
    setLoadingDeleteId(ownerId);

    try {
      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/owners/${ownerId}`,
      );

      props.setOwners((prev) => (prev || []).filter((o) => o._id !== ownerId));
      setOwnerToDelete(null);
    } catch (error) {
      console.error("Erreur lors de la suppression du propriétaire:", error);
    } finally {
      setLoadingDeleteId(null);
    }
  }

  const fmtDate = (d) => {
    if (!d) return "-";
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("fr-FR");
  };

  return (
    <section className="flex flex-col gap-4">
      {/* Header sticky */}
      <div className="sticky top-6 z-20 ml-16 mobile:ml-12 tablet:ml-0 px-4 pt-4 pb-3 bg-white/70 backdrop-blur border-b rounded-xl border-darkBlue/10">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-darkBlue truncate">
              {t("nav.owners")}
            </h1>
            <p className="text-xs text-darkBlue/50">
              {owners.length}{" "}
              {owners.length > 1 ? "propriétaires" : "propriétaire"}
            </p>
          </div>

          <button
            onClick={props.handleAddClick}
            className="inline-flex items-center gap-2 rounded-xl bg-blue px-3 py-2 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 active:scale-[0.98] transition"
          >
            <Plus className="size-4" />
            <span className="hidden mobile:inline">{t("owner.form.add")}</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div>
        {props?.loading ? (
          <div className="rounded-2xl bg-white/60 border border-darkBlue/10 shadow-sm p-5 flex flex-col gap-3">
            <DoubleSkeletonComponent justify="justify-start" />
            <SimpleSkeletonComponent />
            <SimpleSkeletonComponent />
          </div>
        ) : owners.length === 0 ? (
          <div className="rounded-xl bg-white/60 border border-darkBlue/10 shadow-sm p-6 text-center">
            <div className="mx-auto mb-3 size-11 rounded-2xl bg-darkBlue/5 flex items-center justify-center">
              <AlertTriangle className="size-5 text-darkBlue/60" />
            </div>
            <p className="text-sm text-darkBlue/70">
              {t("owners.list.emptyList", "Aucun propriétaire pour le moment.")}
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 midTablet:grid-cols-2 desktop:grid-cols-3">
            {owners.map((owner) => {
              const isConfirming = ownerToDelete === owner._id;
              const isDeleting = loadingDeleteId === owner._id;

              const restaurantsLabel =
                owner?.restaurants?.length > 0
                  ? owner.restaurants.map((r) => r.name).join(", ")
                  : null;

              return (
                <li
                  key={owner?._id}
                  className="relative group rounded-xl bg-white/60 border border-darkBlue/10 shadow-sm hover:shadow-md transition-shadow p-4 flex flex-col gap-3 overflow-hidden"
                >
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-darkBlue truncate">
                        {owner?.firstname || "—"} {owner?.lastname || ""}
                      </h2>

                      <p className="mt-1 inline-flex items-center gap-2 text-xs text-darkBlue/50">
                        <Calendar className="size-3" />
                        <span className="truncate">
                          {t("owner.list.createdAt", "Créé le")}{" "}
                          {fmtDate(owner?.created_at)}
                        </span>
                      </p>
                    </div>

                    {/* Quick actions */}
                    {!isConfirming && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => props.handleEditClick(owner)}
                          className="inline-flex items-center justify-center rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition p-2 disabled:opacity-25"
                          aria-label={t("owner.list.buttons.edit")}
                          disabled={!props?.isAdmin}
                        >
                          <Pencil className="size-4 text-darkBlue/70" />
                        </button>

                        <button
                          onClick={() => setOwnerToDelete(owner._id)}
                          className="inline-flex items-center justify-center rounded-xl border border-red/20 bg-red/10 hover:bg-red/15 transition p-2 disabled:opacity-25"
                          aria-label={t("buttons.delete")}
                          disabled={!props?.isAdmin}
                        >
                          <Trash2 className="size-4 text-red" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Infos */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start gap-2 text-sm text-darkBlue/80">
                      <Mail className="size-4 mt-0.5 text-darkBlue/40" />
                      {owner?.email ? (
                        <p className="min-w-0 truncate">{owner.email}</p>
                      ) : (
                        <p className="italic text-darkBlue/40">-</p>
                      )}
                    </div>

                    <div className="flex items-start gap-2 text-sm text-darkBlue/80">
                      <Phone className="size-4 mt-0.5 text-darkBlue/40" />
                      {owner?.phoneNumber ? (
                        <p className="min-w-0 truncate">{owner.phoneNumber}</p>
                      ) : (
                        <p className="italic text-darkBlue/40">
                          {t("owner.list.noPhone", "Aucun téléphone")}
                        </p>
                      )}
                    </div>

                    <div className="flex items-start gap-2 text-sm text-darkBlue/80">
                      <Store className="size-4 mt-0.5 text-darkBlue/40" />
                      {restaurantsLabel ? (
                        <p className="min-w-0">
                          <span className="line-clamp-2">
                            {restaurantsLabel}
                          </span>
                        </p>
                      ) : (
                        <p className="italic text-darkBlue/40">
                          {t("owner.list.noRestaurant")}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* ✅ OVERLAY confirmation (inset) */}
                  <div
                    className={`
                      absolute inset-0 z-10
                      transition-opacity duration-200
                      ${isConfirming ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}
                    `}
                    onClick={() => {
                      if (!isDeleting) setOwnerToDelete(null);
                    }}
                  >
                    {/* background blur */}
                    <div className="absolute inset-0 bg-white/70 backdrop-blur-sm" />

                    {/* panel */}
                    <div
                      className="
                        absolute left-3 right-3 bottom-3
                        rounded-xl border border-red/20 bg-white/90
                        shadow-[0_18px_45px_rgba(19,30,54,0.12)]
                        p-3
                      "
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5 inline-flex size-8 items-center justify-center rounded-xl bg-red/10 border border-red/15">
                          <Trash2 className="size-4 text-red" />
                        </div>

                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-darkBlue">
                            {t(
                              "owners.list.confirmDeleteTitle",
                              "Supprimer ce propriétaire ?",
                            )}
                          </p>
                          <p className="text-xs text-darkBlue/60 mt-0.5">
                            {t(
                              "owners.list.confirmDelete",
                              "Cette action est irréversible.",
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => confirmDelete(owner._id)}
                          disabled={isDeleting}
                          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-red text-white text-sm font-semibold py-2 shadow-sm hover:bg-red/90 disabled:opacity-60"
                        >
                          {isDeleting ? (
                            <>
                              <Loader2 className="size-4 animate-spin" />
                              {t("buttons.loading")}
                            </>
                          ) : (
                            t("buttons.confirm")
                          )}
                        </button>

                        <button
                          onClick={() => setOwnerToDelete(null)}
                          disabled={isDeleting}
                          className="flex-1 inline-flex items-center justify-center rounded-xl bg-white border border-darkBlue/10 text-darkBlue text-sm font-semibold py-2 hover:bg-darkBlue/5 disabled:opacity-60"
                        >
                          {t("owner.list.buttons.cancel")}
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
