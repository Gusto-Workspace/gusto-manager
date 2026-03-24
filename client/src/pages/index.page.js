import Head from "next/head";

// I18N
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

// COMPONENTS
import NavbarLanding from "@/components/landing/nav.landing.component";
import CallToActionLandingComponent from "@/components/landing/call-to-action.landing.component";
import FooterLandingComponent from "@/components/landing/footer.landing.component";
import HeroSectionLandingComponent from "@/components/landing/hero-section.landing.component";
import StrongPointsLandingComponent from "@/components/landing/strong-points.landing.component";
import AdvantagesLandingComponent from "@/components/landing/advantages.landing.component";
import HelpingLandingComponent from "@/components/landing/helping.landing.component";
import FunctionalitiesLandingComponent from "@/components/landing/functionalities.landing.component";
import FaqLandingComponent from "@/components/landing/faq.landing.component";

export default function HomePage(props) {
  let title;
  let description;

  switch (i18n.language) {
    case "en":
      title =
        "Gusto Manager | Logiciel de gestion tout-en-un pour les restaurateurs";
      description =
        "Simplifiez vos opérations quotidiennes grâce à une plateforme intuitive qui centralise la gestion de votre restaurant.";
      break;
    default:
      title =
        "Gusto Manager | Logiciel de gestion tout-en-un pour les restaurateurs";
      description =
        "Simplifiez vos opérations quotidiennes grâce à une plateforme intuitive qui centralise la gestion de votre restaurant.";
  }

  return (
    <>
      <Head>
        <title>{title}</title>

        <>
          {description && <meta name="description" content={description} />}
          {title && <meta property="og:title" content={title} />}
          {description && (
            <meta property="og:description" content={description} />
          )}
          <meta property="og:url" content="https://gusto-manager.com/" />
          <meta property="og:type" content="website" />
          <meta property="og:image" content="/img/open-graph.jpg" />
          <meta property="og:image:width" content="1024" />
          <meta property="og:image:height" content="678" />
        </>
      </Head>

      <div className="relative isolate min-h-screen bg-dirtyWhite font-mono text-pretty">
        <div
          className="pointer-events-none fixed inset-0 -z-10"
          style={{
            backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(`
        <svg xmlns='http://www.w3.org/2000/svg' width='95' height='95' fill='none'>
          <g fill='#BDBDBD' fill-opacity='.6' clip-path='url(#a)' opacity='.8'>
            <path d='M11.5 13a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm24 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm48 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm-24 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm-48 24a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm24 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm48 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm-24 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM13 59.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm24 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm48 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm-24 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM11.5 85a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm24 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm48 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm-24 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z'/>
          </g>
          <defs>
            <clipPath id='a'>
              <path fill='#fff' d='M0 0h95v95H0z'/>
            </clipPath>
          </defs>
        </svg>
      `)}")`,
            backgroundRepeat: "repeat",
            backgroundPosition: "top left",
          }}
        />
        <NavbarLanding />
        <HeroSectionLandingComponent />
        <HelpingLandingComponent />
        <AdvantagesLandingComponent />
        <FunctionalitiesLandingComponent />
        <StrongPointsLandingComponent />
        <FaqLandingComponent />
        <CallToActionLandingComponent />
        <FooterLandingComponent />
      </div>
    </>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, [
        "common",
        "index",
        "transactions",
      ])),
    },
  };
}
