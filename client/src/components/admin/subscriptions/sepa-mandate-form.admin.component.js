import { useState } from "react";
import {
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

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

    // 1) On soumet d’abord le Payment Element
    const { error: submitError } = await elements.submit();
    if (submitError) {
      setErrorMessage(submitError.message || "Erreur lors du submit()");
      setConfirmLoading(false);
      return;
    }

    // 2) Puis on confirme la configuration du mandat SEPA
    const { error, setupIntent } = await stripe.confirmSetup({
      clientSecret,
      elements,
      redirect: "if_required",
    });

    if (error) {
      setErrorMessage(
        error.message || "Erreur inattendue lors de la confirmation du SEPA"
      );
      setConfirmLoading(false);
    } else {
      const pmId = setupIntent.payment_method;
      setErrorMessage("");
      handleSetupSuccess(pmId); // Callback de succès
    }
  }

  // Si paymentMethodId est déjà défini => on désactive les champs
  const isMandateConfirmed = !!paymentMethodId;
  const formStyle = isMandateConfirmed
    ? { pointerEvents: "none", opacity: 0.6 }
    : {};

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 p-4 border rounded"
      style={formStyle}
    >
      <PaymentElement />

      {/* N'affiche plus le bouton si le mandat est confirmé */}
      {!isMandateConfirmed && (
        <button
          type="submit"
          className="mt-2 bg-blue text-white px-4 py-2 rounded disabled:opacity-50"
          disabled={!stripe || !elements || confirmLoading}
        >
          {confirmLoading ? "En cours..." : "Confirmer le mandat SEPA"}
        </button>
      )}

      {errorMessage && <div className="mt-2 text-red-600">{errorMessage}</div>}
    </form>
  );
}
