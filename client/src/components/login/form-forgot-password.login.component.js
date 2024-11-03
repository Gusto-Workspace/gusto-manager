import { useForm } from "react-hook-form";
import { useRouter } from "next/router";
import { useState } from "react";
import axios from "axios";
import { useTranslation } from "next-i18next";
import { EmailSvg } from "../_shared/_svgs/email.svg";
import { NoVisibleSvg, VisibleSvg } from "../_shared/_svgs/_index";

export default function FormForgotPasswordComponent() {
  const { t } = useTranslation("login");
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
          `${process.env.NEXT_PUBLIC_API_URL}/owner/send-reset-code`,
          { email: data.email }
        );
        setEmail(data.email);
        setStep("code");
      } catch (error) {
        setErrorMessage(t("form.errors.code"));
      } finally {
        setLoading(false);
      }
    } else if (step === "code") {
      try {
        const response = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/owner/verify-reset-code`,
          { email, code }
        );
        if (response.status === 200) {
          setStep("password");
        }
      } catch (error) {
        setErrorMessage(t("form.errors.invalid"));
      } finally {
        setLoading(false);
      }
    } else if (step === "password") {
      if (newPassword !== confirmPassword) {
        setErrorMessage(t("form.errors.passwords"));
        setLoading(false);
        return;
      }
      try {
        await axios.put(
          `${process.env.NEXT_PUBLIC_API_URL}/owner/reset-password`,
          { email, code, newPassword }
        );
        router.push("/login");
      } catch (error) {
        setErrorMessage(t("form.errors.reset"));
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <section className="relative bg-white flex flex-col gap-6 rounded-lg p-12 drop-shadow-sm w-[500px]">
      <div className="flex flex-col gap-2 items-center">
        <h1 className="text-4xl font-semibold">
          {step === "email"
            ? t("titles.second")
            : step === "code"
              ? t("titles.second")
              : t("titles.third")}
        </h1>
        <h2>
          {step === "email"
            ? t("descriptions.second")
            : step === "code"
              ? t("descriptions.code")
              : t("descriptions.password")}
        </h2>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full flex flex-col gap-4 mt-auto"
      >
        {step === "email" && (
          <div
            className={`flex gap-2 pl-2 items-center border w-full rounded-lg ${errors.email ? "border-red" : ""}`}
          >
            <EmailSvg width={22} height={22} />
            <input
              id="email"
              type="email"
              placeholder={t("form.labels.email")}
              className="py-2 w-full rounded-r-lg border-l pl-2"
              {...register("email", { required: "Email is required" })}
            />
          </div>
        )}

        {step === "code" && (
          <input
            id="code"
            type="text"
            placeholder="Code de vérification"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="border rounded-lg p-2 w-full"
          />
        )}

        {step === "password" && (
          <>
            <div className="relative">
              <input
                id="newPassword"
                type={showNewPassword ? "text" : "password"}
                placeholder="Nouveau mot de passe"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="border rounded-lg p-2 w-full pr-8"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-1 bg-white"
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
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="border rounded-lg p-2 w-full pr-8"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-1 bg-white"
              >
                {showConfirmPassword ? (
                  <VisibleSvg width={20} height={20} />
                ) : (
                  <NoVisibleSvg width={20} height={20} />
                )}
              </button>
            </div>
          </>
        )}

        {errorMessage && (
          <p className="absolute bottom-5 italic text-xs w-full text-center left-1/2 -translate-x-1/2 text-red">
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          className="bg-black mx-auto text-white rounded-lg py-2 px-12 hover:bg-opacity-70 transition-all duration-300 w-fit"
          disabled={loading}
        >
          {loading
            ? t("buttons.loading-2")
            : step === "email"
              ? t("buttons.valid")
              : step === "code"
                ? t("buttons.valid")
                : t("buttons.reset")}
        </button>
      </form>
    </section>
  );
}
