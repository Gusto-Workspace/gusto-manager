import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Trash2, X } from "lucide-react";

const CLOSE_MS = 220;

export default function ConfirmationModalReservationComponent(props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!props.isOpen) return;
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [props.isOpen]);

  useEffect(() => {
    if (!props.isOpen) setVisible(false);
  }, [props.isOpen]);

  if (!props.isOpen) return null;

  const isDelete = props.actionType === "delete";
  const isActive = props.actionType === "active";
  const isConfirm = props.actionType === "confirm";
  const isFinish =
    props.actionType === "finish" || props.actionType === "finished";

  const title = isDelete
    ? props.t("labels.deleteReservation.title")
    : isActive
      ? props.t("labels.activeReservation.title")
      : isConfirm
        ? props.t("labels.confirmReservation.title")
        : props.t("labels.finishedReservation.title");

  const content = isDelete
    ? props.t("labels.deleteReservation.content", {
        reservationTitle: props.reservation?.customerName,
      })
    : isActive
      ? props.t("labels.activeReservation.content", {
          reservationTitle: props.reservation?.customerName,
        })
      : isConfirm
        ? props.t("labels.confirmReservation.content", {
            reservationTitle: props.reservation?.customerName,
          })
        : props.t("labels.finishedReservation.content", {
            reservationTitle: props.reservation?.customerName,
          });

  const Icon = isDelete
    ? Trash2
    : isConfirm || isActive || isFinish
      ? CheckCircle2
      : AlertTriangle;

  const closeIfAllowed = () => {
    if (props.isProcessing) return;
    setVisible(false);
    setTimeout(() => props.onClose?.(), CLOSE_MS);
  };

  return (
    <div className="fixed inset-0 z-[140]" role="dialog" aria-modal="true">
      {/* Overlay */}
      <div
        onClick={closeIfAllowed}
        className={`
          absolute inset-0 bg-darkBlue/35 
          transition-opacity duration-200
          ${visible ? "opacity-100" : "opacity-0"}
        `}
      />

      {/* Modal */}
      <div
        className={`
          absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
          w-[92vw] max-w-[520px]
          rounded-3xl border border-darkBlue/10 bg-lightGrey
          shadow-[0_25px_80px_rgba(19,30,54,0.25)]
          transform transition-all duration-200
          ${visible ? "scale-100 opacity-100" : "scale-[0.98] opacity-0"}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`
                mt-0.5 size-11 min-w-11 rounded-2xl border border-darkBlue/10
                flex items-center justify-center
                ${isDelete ? "bg-red/10" : "bg-darkBlue/5"}
              `}
            >
              <Icon
                className={`size-5 ${isDelete ? "text-red" : "text-darkBlue/70"}`}
              />
            </div>

            <div className="min-w-0">
              <h2 className="text-base font-semibold text-darkBlue leading-tight">
                {title}
              </h2>
              <p className="mt-1 text-sm text-darkBlue/70">{content}</p>
            </div>
          </div>
        </div>

        {/* Error */}
        {props.error ? (
          <div className="px-5 mt-4">
            <div className="rounded-2xl border border-red/20 bg-red/10 px-4 py-3 text-sm text-red">
              {props.error}
            </div>
          </div>
        ) : null}

        {/* Footer buttons */}
        <div className="px-5 pb-5 pt-5">
          <div className="flex-row-reverse flex gap-3">
            <button
              className="w-full inline-flex items-center justify-center rounded-2xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition px-4 py-3 text-sm font-semibold text-darkBlue"
              onClick={closeIfAllowed}
              disabled={props.isProcessing}
            >
              {props.t("buttons.cancel")}
            </button>

            <button
              className={`
                w-full inline-flex items-center justify-center rounded-2xl
                px-4 py-3 text-sm font-semibold text-white shadow-sm
                active:scale-[0.99] transition
                ${isDelete ? "bg-red hover:bg-red/90" : "bg-blue hover:bg-blue/90"}
                ${props.isProcessing ? "opacity-70 cursor-not-allowed" : ""}
              `}
              onClick={props.onConfirm}
              disabled={props.isProcessing}
            >
              {props.isProcessing
                ? props.t("buttons.loading")
                : props.t("buttons.confirm")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
