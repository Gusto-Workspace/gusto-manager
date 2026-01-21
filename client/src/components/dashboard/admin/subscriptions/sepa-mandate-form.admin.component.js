import { useState } from "react";
import {
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Loader2, AlertTriangle } from "lucide-react";

export default function SepaMandateForm({
  clientSecret,
  handleSetupSuccess,
  paymentMethodId,
}) {
  const stripe = useStripe();
  const elements = useElements();

  const [errorMessage, setErrorMessage] = useState("");
  const [confirmLoading, setConfirmLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setConfirmLoading(true);
    setErrorMessage("");

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setErrorMessage(submitError.message || "Erreur lors du submit()");
      setConfirmLoading(false);
      return;
    }

    const { error, setupIntent } = await stripe.confirmSetup({
      clientSecret,
      elements,
      redirect: "if_required",
    });

    if (error) {
      setErrorMessage(
        error.message || "Erreur inattendue lors de la confirmation du SEPA",
      );
      setConfirmLoading(false);
      return;
    }

    handleSetupSuccess(setupIntent.payment_method);
    setConfirmLoading(false);
  }

  // Parent gère l’état “bandeau” après confirmation
  const isMandateConfirmed = !!paymentMethodId;

  return (
    <form
      onSubmit={handleSubmit}
      className={`
        rounded-2xl border border-darkBlue/10 bg-white/70 p-4 mt-3
        ${isMandateConfirmed ? "opacity-60 pointer-events-none" : ""}
      `}
    >
      <div className="mt-1">
        <PaymentElement />
      </div>

      {!isMandateConfirmed && (
        <button
          type="submit"
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-blue px-4 py-2 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 disabled:opacity-60"
          disabled={!stripe || !elements || confirmLoading}
        >
          {confirmLoading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              En cours...
            </>
          ) : (
            "Confirmer le mandat SEPA"
          )}
        </button>
      )}

      {errorMessage && (
        <div className="mt-3 rounded-xl border border-red/20 bg-red/10 p-3 text-sm text-red">
          <div className="flex items-start gap-2">
            <AlertTriangle className="size-4 mt-0.5" />
            <p className="min-w-0">{errorMessage}</p>
          </div>
        </div>
      )}
    </form>
  );
}
