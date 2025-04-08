// SVG
import {
  CalendarSvg,
  CheckSvg,
  DoubleCheckSvg,
  ClockSvg,
  CommentarySvg,
  CommunitySvg,
  DeleteSvg,
  EditSvg,
  EmailSvg,
  PhoneSvg,
  TableSvg,
  UserSvg,
  ActiveSvg,
} from "../../_shared/_svgs/_index";

// I18N
import { useTranslation } from "next-i18next";

export default function CardReservationComponent(props) {
  const { t } = useTranslation("reservations");

  return (
    <li
      key={props.reservation._id}
      className="relative bg-white p-6 pb-2 rounded-lg drop-shadow-sm flex flex-col justify-between gap-2"
    >
      <div className="flex flex-col gap-2">
        <p className="flex gap-3">
          <UserSvg width={20} height={20} className="opacity-50" />

          <span>{props.reservation.customerName}</span>
        </p>

        <p className="flex gap-3">
          <PhoneSvg width={20} height={20} className="opacity-50" />

          <span>{props.reservation.customerPhone}</span>
        </p>

        <p className="flex gap-3">
          <EmailSvg width={20} height={20} className="opacity-50" />

          <span>
            {props.reservation.customerEmail || (
              <span className="opacity-30">-</span>
            )}
          </span>
        </p>

        <p className="flex gap-3">
          <CommunitySvg width={20} height={20} className="opacity-50" />

          <span>{props.reservation.numberOfGuests} personnes</span>
        </p>

        <p className="flex gap-3">
          <CalendarSvg width={21} height={21} className="opacity-50" />

          <span>
            {new Date(props.reservation.reservationDate).toLocaleDateString(
              "fr-FR"
            )}
          </span>
        </p>

        <p className="flex gap-3">
          <ClockSvg width={20} height={20} className="opacity-50" />

          <span>{props.reservation.reservationTime.replace(":", "h")}</span>
        </p>

        <p className="flex gap-3">
          <TableSvg width={20} height={23} className="opacity-50" />

          <span>
            {props.reservation.table?.name || (
              <span className="opacity-30">-</span>
            )}
          </span>
        </p>

        <p className="flex gap-3">
          <CommentarySvg width={20} height={20} className="opacity-50" />

          <span>
            {props.reservation.commentary || (
              <span className="opacity-30">-</span>
            )}
          </span>
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <hr className="bg-darkBlue h-[1px] w-[90%] opacity-20 mx-auto" />

        <div className="flex w-full justify-center">
          {props.reservation.status === "Pending" ? (
            <>
              {/* Bouton Confirm pour passer de Pending à Confirmed */}
              <div className="w-1/3 flex justify-center">
                <button
                  className="flex flex-col items-center gap-1 p-2"
                  onClick={() =>
                    props.openModalForAction(props.reservation, "confirm")
                  }
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

              {/* Bouton Edit pour Pending */}
              <div className="w-1/3 flex justify-center">
                <button
                  className="flex flex-col items-center gap-1 p-2"
                  onClick={() => props.handleEditClick(props.reservation)}
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

              {/* Bouton Delete pour Pending */}
              <div className="w-1/3 flex justify-center">
                <button
                  className="flex flex-col items-center gap-1 p-2"
                  onClick={() =>
                    props.openModalForAction(props.reservation, "delete")
                  }
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
          ) : props.reservation.status === "Confirmed" ||
            props.reservation.status === "Late" ? (
            <>
              {/* Bouton Active pour Confirmed ou Late */}
              <div className="w-1/3 flex justify-center">
                <button
                  className="flex flex-col items-center gap-1 p-2"
                  onClick={() =>
                    props.openModalForAction(props.reservation, "active")
                  }
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

              {/* Bouton Edit pour Confirmed ou Late */}
              <div className="w-1/3 flex justify-center">
                <button
                  className="flex flex-col items-center gap-1 p-2"
                  onClick={() => props.handleEditClick(props.reservation)}
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

              {/* Bouton Delete pour Confirmed ou Late */}
              <div className="w-1/3 flex justify-center">
                <button
                  className="flex flex-col items-center gap-1 p-2"
                  onClick={() =>
                    props.openModalForAction(props.reservation, "delete")
                  }
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
          ) : props.reservation.status === "Finished" ? (
            <>
              {/* Pour Finished, seul le bouton Delete */}
              <div className="w-1/3 flex justify-center">
                <button
                  className="flex flex-col items-center gap-1 p-2"
                  onClick={() =>
                    props.openModalForAction(props.reservation, "delete")
                  }
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
          ) : (
            // Pour les autres statuts (par exemple Active, Late si non traités précédemment)
            <div className="w-1/3 flex justify-center">
              <button
                className="flex flex-col items-center gap-1 p-2"
                onClick={() =>
                  props.openModalForAction(props.reservation, "finish")
                }
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
          )}
        </div>
      </div>
    </li>
  );
}
