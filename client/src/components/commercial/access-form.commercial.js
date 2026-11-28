import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { commercialApi, sellerLogin, sellerPath, setCommercialSession } from "./commercial-api";

const labels = { login: "Espace commercial", recover: "Mot de passe oublié", activate: "Choisir un mot de passe" };

export default function AccessFormCommercial({ mode }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (mode === "activate") {
      setToken(window.location.hash.slice(1));
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
  }, [mode]);

  async function submit(event) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    setError("");
    try {
      if (mode === "activate") {
        if (values.get("password") !== values.get("confirmation")) throw new Error("Les mots de passe ne correspondent pas.");
        await commercialApi("/auth/activate", { method: "POST", body: { token, password: values.get("password") } });
        await router.replace(sellerLogin);
      } else if (mode === "recover") {
        const data = await commercialApi("/auth/recover", { method: "POST", body: { email: values.get("email") } });
        setMessage(data.message);
      } else {
        const data = await commercialApi("/auth/login", { method: "POST", body: {
          email: values.get("email"), password: values.get("password"),
        } });
        setCommercialSession(data.token);
        await router.replace(sellerPath);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="fixed inset-0 flex min-h-[100svh] items-center justify-center overflow-y-auto bg-[url('/img/bg-2.webp')] bg-cover bg-center p-4 text-darkBlue">
      <Head><title>{labels[mode]} · Gusto Manager</title><meta name="robots" content="noindex,nofollow" /><meta name="referrer" content="no-referrer" /></Head>
      <section className="commercial-access-card flex w-full max-w-[470px] flex-col items-center gap-5 rounded-[26px] border border-white/60 p-5 shadow-xl midTablet:p-9">
        <Image src="/img/logo-3.png" width={52} height={78} alt="Gusto Manager" className="h-auto w-[52px]" priority />
        <h1 className="text-center text-[clamp(1.55rem,4vw,2rem)] font-bold tracking-tight">{labels[mode]}</h1>
        {mode === "login" && router.query.logout === "local" &&
          <p role="status" className="text-center text-sm">Déconnexion sur cet appareil. La révocation sur les autres appareils n’a pas pu être confirmée.</p>}
        {mode === "recover" && <p className="text-center text-sm text-darkBlue/65">Saisissez l’adresse email associée à votre compte commercial.</p>}
        {mode === "activate" && <p className="text-center text-sm text-darkBlue/65">Choisissez un mot de passe d’au moins 12 caractères.</p>}
        <form onSubmit={submit} className="flex w-full flex-col gap-4">
          {mode !== "activate" && <label className="grid gap-1 text-sm">Adresse email
            <input name="email" type="email" autoComplete="username" required maxLength={254} className="input-commercial w-full" />
          </label>}
          {mode !== "recover" && <label className="grid gap-1 text-sm">Mot de passe
            <input name="password" type="password" autoComplete={mode === "activate" ? "new-password" : "current-password"} required minLength={mode === "activate" ? 12 : undefined} className="input-commercial w-full" />
          </label>}
          {mode === "activate" && <label className="grid gap-1 text-sm">Confirmer le mot de passe
            <input name="confirmation" type="password" autoComplete="new-password" required minLength={12} className="input-commercial w-full" />
          </label>}
          {error && <p role="alert" className="rounded-xl bg-red/10 p-3 text-sm text-red">{error}</p>}
          {message && <p role="status" className="rounded-xl bg-blue/10 p-3 text-sm text-darkBlue">{message}</p>}
          <button type="submit" disabled={busy || (mode === "activate" && !token)} className="button-commercial mt-1">
            {mode === "login" ? "Se connecter" : mode === "activate" ? "Enregistrer le mot de passe" : "Demander un lien"}
          </button>
        </form>
        <Link className="self-start py-2 text-sm font-semibold text-[#4d399e] hover:underline" href={mode === "login" ? `${sellerLogin}/forgot-password` : sellerLogin}>
          {mode === "login" ? "Mot de passe oublié" : "Retour à la connexion"}
        </Link>
      </section>
    </main>
  );
}
