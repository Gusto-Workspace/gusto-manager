import { useRouter } from "next/router";
import { useTranslation } from "next-i18next";

import {
  AvatarSvg,
  DeleteSvg,
  RightArrowSvg,
} from "@/components/_shared/_svgs/_index";

export default function CardEmployeesComponent(props) {
  const { t } = useTranslation("employees");
  const router = useRouter();

  const restaurantId = props.restaurantId;

  const profile =
    (props.employee.restaurantProfiles || []).find(
      (p) => String(p.restaurant) === String(restaurantId),
    ) || null;

  const snap = profile?.snapshot || {};

  const displayFirstname = snap.firstname ?? props.employee.firstname ?? "";
  const displayLastname = snap.lastname ?? props.employee.lastname ?? "";
  const displayPost = snap.post ?? props.employee.post ?? "—";

  // ✅ nouveau: mode compact (style "chip") pour mobile planning
  const planningCompact = Boolean(props.planningCompact);

  // =========================
  // ✅ VERSION COMPACTE (mobile)
  // =========================
  if (planningCompact) {
    const initials =
      `${displayFirstname?.[0] ?? ""}${displayLastname?.[0] ?? ""}`.toUpperCase();

    return (
      <div className="bg-white/70 rounded-2xl px-3 py-2 flex items-center gap-3">
        {/* Avatar */}
        <div className="shrink-0 size-10 rounded-full bg-lightGrey border border-darkBlue/10 overflow-hidden grid place-items-center">
          {props.employee.profilePicture ? (
            <img
              src={props.employee.profilePicture.url}
              className="w-full h-full object-cover"
              alt="profile"
            />
          ) : (
            // fallback: initiales (plus lisible en compact) ou AvatarSvg si tu préfères
            <span className="text-xs font-semibold text-darkBlue/70">
              {initials || <AvatarSvg width={22} fillColor="#131E3690" />}
            </span>
          )}
        </div>

        {/* Texte */}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-darkBlue">
            {displayFirstname} {displayLastname?.[0] ? displayLastname[0] + "." : displayLastname}
          </div>
          <div className="truncate text-[11px] text-darkBlue/50">
            {displayPost}
          </div>
        </div>
      </div>
    );
  }

  // =========================
  // VERSION ACTUELLE (desktop / liste normale)
  // =========================
  return (
    <div className="relative bg-white rounded-lg drop-shadow-sm px-1 midTablet:px-6 pt-12 pb-2 flex flex-col items-center gap-2 h-fit z-[4]">
      <div className="absolute flex items-center justify-center -top-6 left-1/2 -translate-x-1/2 border border-darkBlue/5 w-14 h-14 rounded-full bg-lightGrey overflow-hidden">
        {props.employee.profilePicture ? (
          <img
            src={props.employee.profilePicture.url}
            className="w-full h-full object-cover"
            alt="profile"
          />
        ) : (
          <AvatarSvg width={30} fillColor="#131E3690" />
        )}
      </div>

      <h3 className="font-semibold">
        {displayFirstname} {displayLastname}
      </h3>

      <h4 className="text-sm opacity-70">{displayPost}</h4>

      {!props.planning && (
        <>
          <hr className="bg-darkBlue h-[1px] w-[90%] opacity-20 mx-auto" />

          <div className="flex w-full justify-center">
            <div className="w-1/2 flex justify-center">
              <button
                onClick={() =>
                  router.push(`/dashboard/employees/${props.employee._id}`)
                }
                className="flex flex-col items-center gap-1 p-2"
              >
                <div className="hover:bg-[#634FD2] bg-[#634FD299] p-[6px] rounded-full transition-colors duration-300">
                  <RightArrowSvg
                    width={15}
                    height={15}
                    strokeColor="white"
                    fillColor="white"
                  />
                </div>
                <p className="text-xs text-center">Voir</p>
              </button>
            </div>

            <div className="w-1/2 flex justify-center">
              <button
                onClick={(e) => {
                  props.handleDeleteClick(props.employee);
                  e.stopPropagation();
                }}
                className="flex flex-col items-center gap-1 p-2"
              >
                <div className="hover:bg-[#FF7664] bg-[#FF766499] p-[6px] rounded-full transition-colors duration-300">
                  <DeleteSvg
                    width={15}
                    height={15}
                    strokeColor="white"
                    fillColor="white"
                  />
                </div>
                <p className="text-xs text-center">Supprimer</p>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
