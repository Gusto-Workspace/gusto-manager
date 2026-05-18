import { useForm } from "react-hook-form";
import { useRouter } from "next/router";
import { useState } from "react";
import axios from "axios";
import { EmailSvg } from "@/components/_shared/_svgs/email.svg";
import { NoVisibleSvg, VisibleSvg } from "@/components/_shared/_svgs/_index";

export default function FormForgotPasswordAdminComponent() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  async function onSubmit(data) {
    setLoading(true);
    setErrorMessage("");

    if (step === "email") {
      try {
        await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/admin/send-reset-code`,
          { email: data.email },
        );
        setEmail(data.email);
        setStep("code");
      } catch (error) {
        setErrorMessage(
          error?.response?.data?.message ||
            "Impossible d'envoyer le code de vérification.",
        );
      } finally {
        setLoading(false);
      }
      return;
    }

    if (step === "code") {
      try {
        const response = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/admin/verify-reset-code`,
          { email, code },
        );
        if (response.status === 200) {
          setStep("password");
        }
      } catch (error) {
        setErrorMessage(
          error?.response?.data?.message || "Code invalide ou expiré.",
        );
      } finally {
        setLoading(false);
      }
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("Les mots de passe ne correspondent pas.");
      setLoading(false);
      return;
    }

    try {
      await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/admin/reset-password`, {
        email,
        code,
        newPassword,
      });
      router.push("/dashboard/admin/login");
    } catch (error) {
      setErrorMessage(
        error?.response?.data?.message ||
          "Impossible de réinitialiser le mot de passe.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="relative mx-4 flex w-[500px] max-w-full flex-col gap-6 rounded-xl bg-white p-8 shadow-lg midTablet:p-12">
      <div className="flex flex-col items-center gap-2 text-center text-darkBlue">
        <h1 className="text-3xl font-semibold midTablet:text-4xl">
          {step === "password"
            ? "Définir un nouveau mot de passe"
            : "Mot de passe oublié"}
        </h1>
        <h2 className="text-sm text-darkBlue/70 midTablet:text-base text-balance">
          {step === "email"
            ? "Entrez votre email administrateur pour recevoir un code de vérification."
            : step === "code"
              ? "Saisissez le code reçu par email."
              : "Choisissez votre nouveau mot de passe administrateur."}
        </h2>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex w-full flex-col gap-4 text-darkBlue"
      >
        {step === "email" ? (
          <div
            className={`flex items-center gap-2 rounded-lg border pl-2 ${
              errors.email ? "border-red" : "border-darkBlue/15"
            }`}
          >
            <EmailSvg width={22} height={22} strokeColor="#131E36" />
            <input
              id="email"
              type="email"
              placeholder="Email administrateur"
              className="w-full rounded-r-lg border-l border-darkBlue/10 py-2 pl-2 text-darkBlue outline-none"
              {...register("email", { required: true })}
            />
          </div>
        ) : null}

        {step === "code" ? (
          <input
            id="code"
            type="text"
            placeholder="Code de vérification"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="w-full rounded-lg border border-darkBlue/15 p-2 text-darkBlue outline-none"
          />
        ) : null}

        {step === "password" ? (
          <>
            <div className="relative">
              <input
                id="newPassword"
                type={showNewPassword ? "text" : "password"}
                placeholder="Nouveau mot de passe"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="w-full rounded-lg border border-darkBlue/15 p-2 pr-10 text-darkBlue outline-none"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((value) => !value)}
                className="absolute right-2 top-1/2 -translate-y-1/2"
              >
                {showNewPassword ? (
                  <VisibleSvg width={20} height={20} />
                ) : (
                  <NoVisibleSvg width={20} height={20} />
                )}
              </button>
            </div>

            <div className="relative">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirmer le nouveau mot de passe"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-lg border border-darkBlue/15 p-2 pr-10 text-darkBlue outline-none"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((value) => !value)}
                className="absolute right-2 top-1/2 -translate-y-1/2"
              >
                {showConfirmPassword ? (
                  <VisibleSvg width={20} height={20} />
                ) : (
                  <NoVisibleSvg width={20} height={20} />
                )}
              </button>
            </div>
          </>
        ) : null}

        {errorMessage ? (
          <p className="text-center text-sm italic text-red">{errorMessage}</p>
        ) : null}

        <button
          type="submit"
          className="mx-auto mt-2 w-fit rounded-full bg-darkBlue px-12 py-2 text-white transition-all duration-300 hover:bg-darkBlue/90 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={loading}
        >
          {loading
            ? "Chargement..."
            : step === "password"
              ? "Réinitialiser"
              : "Valider"}
        </button>

        <button
          type="button"
          onClick={() => router.push("/dashboard/admin/login")}
          className="mx-auto text-sm italic text-darkBlue/70 transition hover:text-darkBlue"
        >
          Retour à la connexion admin
        </button>
      </form>
    </section>
  );
}
