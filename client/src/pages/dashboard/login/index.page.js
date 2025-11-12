// pages/login.jsx
import Head from "next/head";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import FormLoginComponent from "@/components/dashboard/login/form.login.component";

export default function LoginPage() {
  const router = useRouter();

  // Redirection si déjà loggé
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) router.push("/dashboard");
  }, [router]);

  // Lock scroll + gérer la hauteur via visualViewport (corrige la zone blanche Chrome iPad)
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const y = window.pageYOffset || 0;

    const setVH = () => {
      const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      html.style.setProperty("--vh", `${h * 0.01}px`);
    };
    setVH();

    // lock du body pour éviter le “lift”
    const prev = {
      htmlOverscroll: html.style.overscrollBehaviorY,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
    };
    html.style.overscrollBehaviorY = "none";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${y}px`;
    body.style.width = "100%";

    const onVVChange = () => {
      setVH();
      // quand le clavier se ferme, on force le repositionnement en haut
      if (!document.activeElement || document.activeElement.tagName !== "INPUT") {
        setTimeout(() => window.scrollTo(0, 0), 0);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", onVVChange);
      window.visualViewport.addEventListener("geometrychange", onVVChange);
    } else {
      window.addEventListener("resize", onVVChange);
    }

    // sécurité : si un input perd le focus, on remonte
    const onFocusOut = () => setTimeout(() => window.scrollTo(0, 0), 0);
    window.addEventListener("focusout", onFocusOut);

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", onVVChange);
        window.visualViewport.removeEventListener("geometrychange", onVVChange);
      } else {
        window.removeEventListener("resize", onVVChange);
      }
      window.removeEventListener("focusout", onFocusOut);

      html.style.overscrollBehaviorY = prev.htmlOverscroll;
      body.style.overflow = prev.bodyOverflow;
      body.style.position = prev.bodyPosition;
      body.style.top = prev.bodyTop;
      body.style.width = prev.bodyWidth;
      html.style.removeProperty("--vh");
      window.scrollTo(0, y);
    };
  }, []);

  const title = "Gusto Manager";

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>

      {/* plein viewport, stable sur iOS/Chrome iOS et desktop */}
      <div
        className="
          fixed inset-0 flex items-center justify-center overscroll-none
          bg-[url('/img/bg-1.webp')] bg-cover bg-center
          h-screen
        "
        style={{ height: "calc(var(--vh, 1vh) * 100)" }}
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
