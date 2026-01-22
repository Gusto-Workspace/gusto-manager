import { useMemo, useState } from "react";
import axios from "axios";
import { useTranslation } from "next-i18next";

// COMPONENTS
import SimpleSkeletonComponent from "@/components/_shared/skeleton/simple-skeleton.component";
import DoubleSkeletonComonent from "@/components/_shared/skeleton/double-skeleton.component";

// ICONS (lucide)
import {
  Plus,
  Pencil,
  Trash2,
  MapPin,
  Phone,
  Globe,
  User,
  Mail,
  Loader2,
  AlertTriangle,
} from "lucide-react";

function normalizeWebsiteUrl(input) {
  if (!input) return "";
  const raw = String(input).trim();
  if (!raw) return "";

  if (/^https?:\/\//i.test(raw)) return raw;

  return `https://${raw}`;
}

function displayWebsite(input) {
  if (!input) return "";
  let s = String(input).trim();
  if (!s) return "";

  s = s.replace(/^https?:\/\//i, "");
  s = s.replace(/^www\./i, "");
  s = s.replace(/\/+$/, "");
  return s;
}

export default function ListRestaurantsAdminComponent(props) {
  console.log(props.isAdmin);

  const { t } = useTranslation("admin");

  const [restaurantToDelete, setRestaurantToDelete] = useState(null);
  const [loadingDeleteId, setLoadingDeleteId] = useState(null);

  const restaurants = useMemo(
    () => props.restaurants || [],
    [props.restaurants],
  );

  async function confirmDelete(restaurantId) {
    setLoadingDeleteId(restaurantId);
    try {
      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/restaurants/${restaurantId}`,
      );

      props.setRestaurants((prev) =>
        (prev || []).filter((r) => r._id !== restaurantId),
      );

      setRestaurantToDelete(null);
    } catch (error) {
      console.error("Erreur lors de la suppression du restaurant:", error);
    } finally {
      setLoadingDeleteId(null);
    }
  }

  const formatAddress = (address) => {
    if (!address) return null;
    const parts = [
      address.line1,
      [address.zipCode, address.city].filter(Boolean).join(" "),
      address.country,
    ].filter(Boolean);
    return parts.join(", ");
  };

  return (
    <section className="flex flex-col gap-4">
      {/* Header sticky */}
      <div className="sticky top-6 z-20 ml-16 mobile:ml-12 tablet:ml-0 px-4 pt-4 pb-3 bg-white/70 backdrop-blur border-b rounded-xl border-darkBlue/10">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-darkBlue truncate">
              {t("nav.restaurants")}
            </h1>
            <p className="text-xs text-darkBlue/50">
              {restaurants.length}{" "}
              {restaurants.length > 1 ? "restaurants" : "restaurant"}
            </p>
          </div>

          <button
            onClick={props.handleAddClick}
            className="inline-flex items-center gap-2 rounded-xl bg-blue px-3 py-2 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 active:scale-[0.98] transition"
          >
            <Plus className="size-4" />
            <span className="hidden mobile:inline">
              {t("restaurants.form.add")}
            </span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div>
        {props.loading ? (
          <div className="rounded-2xl bg-white/60 border border-darkBlue/10 shadow-sm p-5 flex flex-col gap-3">
            <DoubleSkeletonComonent justify="justify-start" />
            <SimpleSkeletonComponent />
            <SimpleSkeletonComponent />
          </div>
        ) : restaurants.length === 0 ? (
          <div className="rounded-xl bg-white/60 border border-darkBlue/10 shadow-sm p-6 text-center">
            <div className="mx-auto mb-3 size-11 rounded-2xl bg-darkBlue/5 flex items-center justify-center">
              <AlertTriangle className="size-5 text-darkBlue/60" />
            </div>
            <p className="text-sm text-darkBlue/70">
              {t("restaurants.list.empty", "Aucun restaurant pour le moment.")}
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 midTablet:grid-cols-2 desktop:grid-cols-3">
            {restaurants.map((restaurant) => {
              const addr = formatAddress(restaurant.address);
              const owner = restaurant.owner_id || null;

              const isConfirming = restaurantToDelete === restaurant._id;
              const isDeleting = loadingDeleteId === restaurant._id;

              const websiteHref = restaurant.website
                ? normalizeWebsiteUrl(restaurant.website)
                : "";
              const websiteLabel = restaurant.website
                ? displayWebsite(restaurant.website)
                : "";

              return (
                <li
                  key={restaurant._id}
                  className="relative group rounded-xl bg-white/60 border border-darkBlue/10 shadow-sm hover:shadow-md transition-shadow p-4 flex flex-col gap-3 overflow-hidden"
                >
                  {/* Title row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-darkBlue truncate">
                        {restaurant.name || "—"}
                      </h2>

                      {restaurant.website ? (
                        <a
                          href={websiteHref}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-0.5 inline-flex items-center gap-1 text-xs text-blue hover:underline"
                          title={websiteHref}
                        >
                          <Globe className="size-3" />
                          <span className="truncate max-w-[220px]">
                            {websiteLabel}
                          </span>
                        </a>
                      ) : (
                        <p className="mt-0.5 text-xs text-darkBlue/40 italic">
                          {t(
                            "restaurants.list.noWebsite",
                            "Aucun site renseigné",
                          )}
                        </p>
                      )}
                    </div>

                    {/* Quick actions */}
                    {!isConfirming && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => props.handleEditClick(restaurant)}
                          className="inline-flex items-center justify-center rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition p-2 disabled:opacity-25"
                          aria-label={t("restaurants.form.buttons.edit")}
                          disabled={!props?.isAdmin}
                        >
                          <Pencil className="size-4 text-darkBlue/70" />
                        </button>

                        <button
                          onClick={() => setRestaurantToDelete(restaurant._id)}
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
                      <MapPin className="size-4 mt-0.5 text-darkBlue/40" />
                      {addr ? (
                        <p className="leading-snug">{addr}</p>
                      ) : (
                        <p className="italic text-darkBlue/40">
                          {t("restaurants.list.noAddress")}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-sm text-darkBlue/80">
                      <Phone className="size-4 text-darkBlue/40" />
                      <p className="truncate">
                        {restaurant.phone || (
                          <span className="italic text-darkBlue/40">
                            {t("restaurants.list.noPhone", "Aucun téléphone")}
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="flex items-start gap-2 text-sm text-darkBlue/80">
                      <User className="size-4 mt-0.5 text-darkBlue/40" />
                      {owner ? (
                        <div className="min-w-0">
                          <p className="truncate">
                            {owner.firstname} {owner.lastname}
                          </p>
                        </div>
                      ) : (
                        <p className="italic text-darkBlue/40">
                          {t("restaurants.list.noOwner")}
                        </p>
                      )}
                    </div>

                    <div className="flex items-start gap-2 text-sm text-darkBlue/80">
                      <Mail className="size-4 mt-0.5 text-darkBlue/40" />
                      {owner?.email ? (
                        <p className="min-w-0 truncate">{owner.email}</p>
                      ) : (
                        <p className="italic text-darkBlue/40">-</p>
                      )}
                    </div>
                  </div>

                  {/* ✅ OVERLAY confirmation (inset) */}
                  <div
                    className={`
                      absolute inset-0 z-10
                      transition-opacity duration-200
                      ${
                        isConfirming
                          ? "opacity-100 pointer-events-auto"
                          : "opacity-0 pointer-events-none"
                      }
                    `}
                    onClick={() => {
                      if (!isDeleting) setRestaurantToDelete(null);
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
                              "restaurants.list.confirmDeleteTitle",
                              "Supprimer ce restaurant ?",
                            )}
                          </p>
                          <p className="text-xs text-darkBlue/60 mt-0.5">
                            {t(
                              "restaurants.list.confirmDelete",
                              "Cette action est irréversible.",
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => confirmDelete(restaurant._id)}
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
                          onClick={() => setRestaurantToDelete(null)}
                          disabled={isDeleting}
                          className="flex-1 inline-flex items-center justify-center rounded-xl bg-white border border-darkBlue/10 text-darkBlue text-sm font-semibold py-2 hover:bg-darkBlue/5 disabled:opacity-60"
                        >
                          {t("restaurants.form.buttons.cancel")}
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
