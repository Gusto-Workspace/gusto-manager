import Head from "next/head";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import FormLoginComponent from "@/components/dashboard/login/form.login.component";

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) router.push("/dashboard");
  }, [router]);

  useEffect(() => {
    const y = window.pageYOffset || document.documentElement.scrollTop || 0;
    const html = document.documentElement;
    const body = document.body;

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

    return () => {
      html.style.overscrollBehaviorY = prev.htmlOverscroll;
      body.style.overflow = prev.bodyOverflow;
      body.style.position = prev.bodyPosition;
      body.style.top = prev.bodyTop;
      body.style.width = prev.bodyWidth;
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
        className="fixed inset-0 flex items-center justify-center bg-[url('/img/bg-1.webp')] bg-cover bg-center overscroll-none h-screen"
        style={{ height: "100lvh" }}
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
