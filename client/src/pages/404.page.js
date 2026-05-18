import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { useMemo } from "react";

// I18N
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

// UTILS
import { normalizeDashboardPath } from "@/_assets/utils/dashboard-access";

function resolveNotFoundVariant(pathname = "") {
  const normalizedPath = normalizeDashboardPath(pathname);

  if (normalizedPath.startsWith("/dashboard/admin")) {
    return {
      accent: "admin",
      badgeKey: "badgeAdmin",
      titleKey: "titleAdmin",
      descriptionKey: "descriptionAdmin",
      primaryHref: "/dashboard/admin/login",
      primaryLabelKey: "primaryAdmin",
      secondaryHref: "/",
      secondaryLabelKey: "secondaryHome",
      backgroundImage: "/img/bg-2.webp",
    };
  }

  if (normalizedPath.startsWith("/dashboard")) {
    return {
      accent: "dashboard",
      badgeKey: "badgeDashboard",
      titleKey: "titleDashboard",
      descriptionKey: "descriptionDashboard",
      primaryHref: "/dashboard",
      primaryLabelKey: "primaryDashboard",
      secondaryHref: "/contact",
      secondaryLabelKey: "secondarySupport",
      backgroundImage: "/img/bg-1.webp",
    };
  }

  return {
    accent: "public",
    badgeKey: "badgePublic",
    titleKey: "titlePublic",
    descriptionKey: "descriptionPublic",
    primaryHref: "/",
    primaryLabelKey: "primaryPublic",
    secondaryHref: "/dashboard/login",
    secondaryLabelKey: "secondaryDashboard",
    backgroundImage: "/img/bg-hero.webp",
  };
}

export default function Custom404Page() {
  const { t } = useTranslation("error");
  const router = useRouter();

  const currentPath = useMemo(() => {
    const rawPath = String(router.asPath || "/")
      .split("?")[0]
      .split("#")[0]
      .trim();

    if (!rawPath || rawPath === "/404") return "/";
    return rawPath;
  }, [router.asPath]);

  const variant = useMemo(
    () => resolveNotFoundVariant(currentPath),
    [currentPath],
  );

  const toneStyles = {
    public: {
      halo: "bg-[#4583FF]",
      chip:
        "border-white/15 bg-white/10 text-white/90 shadow-[0_14px_45px_rgba(19,30,54,0.18)]",
      primary:
        "bg-white text-darkBlue hover:bg-dirtyWhite shadow-[0_18px_50px_rgba(255,255,255,0.16)]",
    },
    dashboard: {
      halo: "bg-[#4583FF]",
      chip:
        "border-[#4583FF]/30 bg-[#4583FF]/12 text-white shadow-[0_14px_45px_rgba(69,131,255,0.18)]",
      primary:
        "bg-[#4583FF] text-white hover:bg-[#5b92ff] shadow-[0_18px_50px_rgba(69,131,255,0.28)]",
    },
    admin: {
      halo: "bg-[#FF7664]",
      chip:
        "border-[#FF7664]/30 bg-[#FF7664]/12 text-white shadow-[0_14px_45px_rgba(255,118,100,0.2)]",
      primary:
        "bg-[#FF7664] text-white hover:bg-[#ff8879] shadow-[0_18px_50px_rgba(255,118,100,0.3)]",
    },
  };

  const tone = toneStyles[variant.accent];

  const checklistKeys = [
    "checklistOne",
    "checklistTwo",
    "checklistThree",
  ];

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
            backgroundImage: `linear-gradient(180deg, rgba(19,30,54,0.3), rgba(19,30,54,0.92)), url('${variant.backgroundImage}')`,
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
          className={`pointer-events-none absolute -left-24 top-16 h-64 w-64 rounded-full blur-3xl ${tone.halo}`}
          style={{ opacity: 0.28 }}
        />
        <div
          className="pointer-events-none absolute right-0 top-1/3 h-72 w-72 rounded-full bg-white blur-3xl"
          style={{ opacity: 0.08 }}
        />

        <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-6 tablet:px-10 tablet:py-8 desktop:px-16">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/8 px-3 py-2 backdrop-blur-md transition hover:bg-white/12"
            >
              <Image
                src="/img/logo-blanc.png"
                alt="Gusto Manager"
                width={34}
                height={34}
                priority
              />
              <span className="barlow-semi-condensed-semibold text-lg tracking-[0.16em] text-white/90 uppercase">
                Gusto Manager
              </span>
            </Link>

            <div
              className={`rounded-full border px-4 py-2 text-xs uppercase tracking-[0.28em] backdrop-blur-md ${tone.chip}`}
            >
              {t(variant.badgeKey)}
            </div>
          </div>

          <div className="flex flex-1 items-center py-10 tablet:py-16">
            <div className="grid w-full gap-8 desktop:grid-cols-[minmax(0,1.1fr)_420px] desktop:gap-10">
              <div className="max-w-3xl">
                <div className="barlow-semi-condensed-black text-[5.2rem] leading-none tracking-[-0.08em] text-white/12 mobile:text-[6.4rem] tablet:text-[8rem]">
                  404
                </div>

                <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm uppercase tracking-[0.24em] text-white/70 backdrop-blur-md">
                  <span className="h-2 w-2 rounded-full bg-white/75" />
                  {t("eyebrow")}
                </p>

                <h1 className="barlow-semi-condensed-medium mt-6 max-w-2xl text-5xl leading-[0.95] tracking-[-0.05em] text-white mobile:text-6xl tablet:text-7xl">
                  {t(variant.titleKey)}
                </h1>

                <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/72 tablet:text-xl">
                  {t(variant.descriptionKey)}
                </p>

                <div className="mt-8 flex flex-col gap-3 mobile:flex-row">
                  <Link
                    href={variant.primaryHref}
                    className={`inline-flex min-h-[54px] items-center justify-center rounded-2xl px-6 text-base font-semibold transition ${tone.primary}`}
                  >
                    {t(variant.primaryLabelKey)}
                  </Link>

                  <Link
                    href={variant.secondaryHref}
                    className="inline-flex min-h-[54px] items-center justify-center rounded-2xl border border-white/12 bg-white/8 px-6 text-base font-semibold text-white transition hover:bg-white/12"
                  >
                    {t(variant.secondaryLabelKey)}
                  </Link>
                </div>

                <div className="mt-8 grid gap-3 tablet:max-w-2xl tablet:grid-cols-3">
                  {checklistKeys.map((key, index) => (
                    <div
                      key={key}
                      className="rounded-[24px] border border-white/10 bg-white/8 p-4 backdrop-blur-md"
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

              <div className="relative">
                <div className="absolute -left-3 -top-3 h-full w-full rounded-[32px] border border-white/6 bg-white/5" />

                <div className="relative overflow-hidden rounded-[32px] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0.06))] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.24)] backdrop-blur-xl">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.26em] text-white/45">
                        {t("panelLabel")}
                      </p>
                      <p className="barlow-semi-condensed-bold mt-2 text-2xl tracking-[-0.04em] text-white">
                        {t("panelTitle")}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-right">
                      <div className="barlow-semi-condensed-black text-4xl leading-none tracking-[-0.08em] text-white/90">
                        404
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 rounded-[26px] border border-white/10 bg-darkBlue/40 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.24em] text-white/45">
                          {t("requestedPath")}
                        </p>
                        <p className="mt-2 break-all text-sm leading-relaxed text-white/72">
                          {currentPath}
                        </p>
                      </div>

                      <div className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs uppercase tracking-[0.24em] text-white/65">
                        {t(variant.badgeKey)}
                      </div>
                    </div>

                    <div className="mt-6 space-y-3">
                      {[1, 2, 3].map((row) => (
                        <div
                          key={row}
                          className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3"
                        >
                          <span className="h-2.5 w-2.5 rounded-full bg-white/70" />
                          <span className="h-[1px] flex-1 bg-white/14" />
                          <span className="barlow-semi-condensed-semibold text-sm uppercase tracking-[0.22em] text-white/50">
                            0{row}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6 rounded-[26px] border border-white/10 bg-white/[0.05] p-5">
                    <p className="text-xs uppercase tracking-[0.24em] text-white/45">
                      {t("quickLinks")}
                    </p>

                    <div className="mt-4 grid gap-3 mobile:grid-cols-2">
                      <Link
                        href="/"
                        className="rounded-2xl border border-white/10 bg-white/8 px-4 py-4 text-sm font-semibold text-white/80 transition hover:bg-white/12"
                      >
                        {t("linkHome")}
                      </Link>

                      <Link
                        href="/dashboard/login"
                        className="rounded-2xl border border-white/10 bg-white/8 px-4 py-4 text-sm font-semibold text-white/80 transition hover:bg-white/12"
                      >
                        {t("linkDashboard")}
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 text-sm text-white/45">
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
