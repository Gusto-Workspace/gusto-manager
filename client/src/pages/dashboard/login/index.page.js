// pages/login.jsx
import Head from "next/head";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import FormLoginComponent from "@/components/dashboard/login/form.login.component";

export default function LoginPage() {
  const router = useRouter();

  // Redirection si déjà connecté
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) router.push("/dashboard");
  }, [router]);

  // 🔒 Lock du scroll + forcer top=0 (fixe la bande blanche sur Chrome iPad)
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    // on part en (0,0) et on empêche la restauration auto
    const hadSR = "scrollRestoration" in window.history;
    const prevSR = hadSR ? window.history.scrollRestoration : null;
    if (hadSR) window.history.scrollRestoration = "manual";
    window.scrollTo(0, 0);

    const prev = {
      overscroll: html.style.overscrollBehaviorY,
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    };

    html.style.overscrollBehaviorY = "none";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = "0";
    body.style.width = "100%";

    // si le viewport change (fermeture clavier/orientation), on reste en (0,0)
    const keepTop = () => window.scrollTo(0, 0);
    window.addEventListener("resize", keepTop, { passive: true });
    window.addEventListener("orientationchange", keepTop, { passive: true });

    return () => {
      window.removeEventListener("resize", keepTop);
      window.removeEventListener("orientationchange", keepTop);
      html.style.overscrollBehaviorY = prev.overscroll;
      body.style.overflow = prev.overflow;
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      if (hadSR && prevSR) window.history.scrollRestoration = prevSR;
    };
  }, []);

  const title = "Gusto Manager";

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>

      {/* Plein écran, pas de scroll derrière, hauteur dynamique fiable */}
      <div
        className="fixed inset-0 flex items-center justify-center overscroll-none bg-cover bg-center"
        style={{ height: "100dvh", backgroundImage: "url('/img/bg-1.webp')" }}
      >
        <FormLoginComponent />
      </div>
    </>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: { ...(await serverSideTranslations(locale, ["common", "login"])) },
  };
}
