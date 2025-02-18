export default function ConfirmationModalReservationComponent(props) {
  if (!props.isOpen) return null;

  const title =
    props.actionType === "delete"
      ? props.t("labels.deleteReservation.title")
      : props.actionType === "active"
        ? props.t("labels.activeReservation.title")
        : props.actionType === "confirm"
          ? props.t("labels.confirmReservation.title")
          : props.t("labels.finishedReservation.title");

  const content =
    props.actionType === "delete"
      ? props.t("labels.deleteReservation.content", {
          reservationTitle: props.reservation?.customerName,
        })
      : props.actionType === "active"
        ? props.t("labels.activeReservation.content", {
            reservationTitle: props.reservation?.customerName,
          })
        : props.actionType === "confirm"
          ? props.t("labels.confirmReservation.content", {
              reservationTitle: props.reservation?.customerName,
            })
          : props.t("labels.finishedReservation.content", {
              reservationTitle: props.reservation?.customerName,
            });

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[100]">
      <div
        onClick={!props.isProcessing ? props.onClose : undefined}
        className="fixed inset-0 bg-black bg-opacity-20"
      />
      <div className="bg-white p-6 flex flex-col gap-6 rounded-lg shadow-lg w-[500px] mx-6 z-10">
        <h2 className="text-xl flex flex-col gap-4 font-semibold text-center">
          {title}
          <span className="w-[200px] h-[1px] mx-auto bg-black" />
        </h2>
        <p className="text-center text-balance mb-2">{content}</p>
        <div className="flex gap-4 justify-center">
          <button
            className="px-4 py-2 rounded bg-blue text-white"
            onClick={props.onConfirm}
            disabled={props.isProcessing}
          >
            {props.isProcessing
              ? props.t("buttons.loading")
              : props.t("buttons.confirm")}
          </button>
          <button
            className="px-4 py-2 rounded bg-red text-white"
            onClick={props.onClose}
            disabled={props.isProcessing}
          >
            {props.t("buttons.cancel")}
          </button>
        </div>
        {props.error && (
          <p className="text-red text-center mt-4">{props.error}</p>
        )}
      </div>
    </div>
  );
}
