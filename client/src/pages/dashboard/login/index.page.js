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

  // 🔒 Empêche tout scroll "derrière" (fix Chrome iPad bande blanche)
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const y = window.pageYOffset || 0;

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
    body.style.top = `-${y}px`;
    body.style.width = "100%";

    return () => {
      html.style.overscrollBehaviorY = prev.overscroll;
      body.style.overflow = prev.overflow;
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      window.scrollTo(0, y);
    };
  }, []);

  const title = "Gusto Manager";

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
      </Head>

      <div
        className="
          fixed inset-0 h-[100svh] overscroll-none
          bg-[url('/img/bg-1.webp')] bg-cover bg-center
          flex items-center justify-center
        "
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
