// I18N
import { useTranslation } from "next-i18next";

// SVG
import {
  CheckSvg,
  DoubleCheckSvg,
  DeleteSvg,
  EditSvg,
  ActiveSvg,
} from "../_shared/_svgs/_index";

export default function ActionButtonsReservationComponent({
  reservation,
  onAction,
  onEdit,
}) {
  const { t } = useTranslation("reservations");

  if (reservation.status === "Pending") {
    return (
      <>
        <div className="w-1/3 flex justify-center">
          <button
            className="flex flex-col items-center gap-1 p-2"
            onClick={() => onAction("confirm")}
          >
            <div className="bg-green bg-opacity-75 hover:bg-green p-[6px] rounded-full transition-colors duration-300">
              <CheckSvg
                width={15}
                height={15}
                strokeColor="white"
                fillColor="white"
              />
            </div>
            <p className="text-xs text-center">{t("buttons.confirm")}</p>
          </button>
        </div>
        <div className="w-1/3 flex justify-center">
          <button
            className="flex flex-col items-center gap-1 p-2"
            onClick={() => onEdit(reservation)}
          >
            <div className="bg-blue bg-opacity-75 hover:bg-blue p-[6px] rounded-full transition-colors duration-300">
              <EditSvg
                width={15}
                height={15}
                strokeColor="white"
                fillColor="white"
              />
            </div>
            <p className="text-xs text-center">{t("buttons.edit")}</p>
          </button>
        </div>
        <div className="w-1/3 flex justify-center">
          <button
            className="flex flex-col items-center gap-1 p-2"
            onClick={() => onAction("delete")}
          >
            <div className="hover:bg-[#FF7664] bg-[#FF766499] p-[6px] rounded-full transition-colors duration-300">
              <DeleteSvg
                width={15}
                height={15}
                strokeColor="white"
                fillColor="white"
              />
            </div>
            <p className="text-xs text-center">{t("buttons.delete")}</p>
          </button>
        </div>
      </>
    );
  } else if (
    reservation.status === "Confirmed" ||
    reservation.status === "Late"
  ) {
    return (
      <>
        <div className="w-1/3 flex justify-center">
          <button
            className="flex flex-col items-center gap-1 p-2"
            onClick={() => onAction("active")}
          >
            <div className="bg-violet bg-opacity-75 hover:bg-violet p-[6px] rounded-full transition-colors duration-300">
              <ActiveSvg
                width={15}
                height={15}
                strokeColor="white"
                fillColor="white"
              />
            </div>
            <p className="text-xs text-center">{t("buttons.active")}</p>
          </button>
        </div>
        <div className="w-1/3 flex justify-center">
          <button
            className="flex flex-col items-center gap-1 p-2"
            onClick={() => onEdit(reservation)}
          >
            <div className="bg-blue bg-opacity-75 hover:bg-blue p-[6px] rounded-full transition-colors duration-300">
              <EditSvg
                width={15}
                height={15}
                strokeColor="white"
                fillColor="white"
              />
            </div>
            <p className="text-xs text-center">{t("buttons.edit")}</p>
          </button>
        </div>
        <div className="w-1/3 flex justify-center">
          <button
            className="flex flex-col items-center gap-1 p-2"
            onClick={() => onAction("delete")}
          >
            <div className="hover:bg-[#FF7664] bg-[#FF766499] p-[6px] rounded-full transition-colors duration-300">
              <DeleteSvg
                width={15}
                height={15}
                strokeColor="white"
                fillColor="white"
              />
            </div>
            <p className="text-xs text-center">{t("buttons.delete")}</p>
          </button>
        </div>
      </>
    );
  } else if (reservation.status === "Finished") {
    return (
      <div className="w-1/3 flex justify-center">
        <button
          className="flex flex-col items-center gap-1 p-2"
          onClick={() => onAction("delete")}
        >
          <div className="hover:bg-[#FF7664] bg-[#FF766499] p-[6px] rounded-full transition-colors duration-300">
            <DeleteSvg
              width={15}
              height={15}
              strokeColor="white"
              fillColor="white"
            />
          </div>
          <p className="text-xs text-center">{t("buttons.delete")}</p>
        </button>
      </div>
    );
  } else {
    // Pour les autres statuts (par exemple Active non traités), on affiche un bouton Finish
    return (
      <div className="w-1/3 flex justify-center">
        <button
          className="flex flex-col items-center gap-1 p-2"
          onClick={() => onAction("finish")}
        >
          <div className="bg-green bg-opacity-75 hover:bg-green p-[6px] rounded-full transition-colors duration-300">
            <DoubleCheckSvg
              width={15}
              height={15}
              strokeColor="white"
              fillColor="white"
            />
          </div>
          <p className="text-xs text-center">{t("buttons.finish")}</p>
        </button>
      </div>
    );
  }
}
