import Head from "next/head";
import Image from "next/image";
import Link from "next/link";

// I18N
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

export default function Custom404Page() {
  const { t } = useTranslation("error");

  const checklistKeys = ["checklistOne", "checklistTwo", "checklistThree"];

  return (
    <>
      <Head>
        <title>{t("metaTitle")}</title>
        <meta name="description" content={t("metaDescription")} />
      </Head>

      <div className="relative isolate min-h-screen overflow-hidden bg-darkBlue text-white">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "linear-gradient(180deg, rgba(19,30,54,0.28), rgba(19,30,54,0.92)), url('/img/bg-1.webp')",
            backgroundPosition: "center",
            backgroundSize: "cover",
          }}
        />

        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(`
              <svg xmlns='http://www.w3.org/2000/svg' width='84' height='84' fill='none'>
                <circle cx='10' cy='10' r='1.5' fill='white' fill-opacity='.22'/>
                <circle cx='42' cy='42' r='1.5' fill='white' fill-opacity='.18'/>
                <circle cx='74' cy='10' r='1.5' fill='white' fill-opacity='.22'/>
                <circle cx='10' cy='74' r='1.5' fill='white' fill-opacity='.22'/>
                <circle cx='74' cy='74' r='1.5' fill='white' fill-opacity='.18'/>
              </svg>
            `)}")`,
            backgroundRepeat: "repeat",
          }}
        />

        <div
          className="pointer-events-none absolute -left-24 top-16 h-64 w-64 rounded-full bg-[#4583FF] blur-3xl"
          style={{ opacity: 0.28 }}
        />
        <div
          className="pointer-events-none absolute right-0 top-1/3 h-72 w-72 rounded-full bg-white blur-3xl"
          style={{ opacity: 0.08 }}
        />

        <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-6 tablet:px-10 tablet:py-8 desktop:px-16">
          <div className="flex flex-1 items-center justify-center py-10 tablet:py-16">
            <div className="w-full max-w-3xl text-center">
              <div className="barlow-semi-condensed-black text-[5.2rem] leading-none tracking-[-0.08em] text-white/12 mobile:text-[6.4rem] tablet:text-[8rem]">
                404
              </div>

              <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm uppercase tracking-[0.24em] text-white/70 backdrop-blur-md">
                <span className="h-2 w-2 rounded-full bg-white/75" />
                {t("eyebrow")}
              </p>

              <h1 className="barlow-semi-condensed-bold mt-6 text-5xl leading-[0.95] tracking-[-0.05em] text-white mobile:text-6xl tablet:text-7xl">
                {t("title")}
              </h1>

              <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/72 tablet:text-xl">
                {t("description")}
              </p>

              <div className="mt-8 flex flex-col justify-center gap-3 mobile:flex-row">
                <Link
                  href="/"
                  className="inline-flex min-h-[54px] items-center justify-center rounded-2xl bg-white px-6 text-base font-semibold text-darkBlue transition hover:bg-dirtyWhite shadow-[0_18px_50px_rgba(255,255,255,0.16)]"
                >
                  {t("primary")}
                </Link>

                <Link
                  href="/dashboard/login"
                  className="inline-flex min-h-[54px] items-center justify-center rounded-2xl border border-white/12 bg-white/8 px-6 text-base font-semibold text-white transition hover:bg-white/12"
                >
                  {t("secondary")}
                </Link>
              </div>

              <div className="mt-8 grid gap-3 tablet:grid-cols-3">
                {checklistKeys.map((key, index) => (
                  <div
                    key={key}
                    className="rounded-[24px] border border-white/10 bg-white/8 p-4 text-left backdrop-blur-md"
                  >
                    <div className="barlow-semi-condensed-extrabold text-sm uppercase tracking-[0.26em] text-white/45">
                      0{index + 1}
                    </div>
                    <p className="mt-3 text-base leading-relaxed text-white/75">
                      {t(key)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-4 text-center text-sm text-white/45">
            {t("footer")}
          </div>
        </div>
      </div>
    </>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["error"])),
    },
  };
}
