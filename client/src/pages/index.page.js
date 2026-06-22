import Head from "next/head";

// I18N
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
import TestimonialLandingComponent from "@/components/landing/testimonial.landing.component";

const SITE_URL = "https://gusto-manager.com";
const SITE_NAME = "Gusto Manager";
const OG_IMAGE = `${SITE_URL}/img/open-graph.jpg`;

const homeSeo = {
  title:
    "Gusto Manager | Logiciel de gestion restaurant tout-en-un",
  description:
    "Gusto Manager centralise la gestion de votre restaurant : réservations, site internet, carte, personnel, pointeuse, fichier client, cartes cadeaux, vente à emporter et HACCP.",
  url: `${SITE_URL}/`,
  keywords:
    "logiciel restaurant, logiciel de gestion restaurant, gestion réservations restaurant, logiciel HACCP restaurant, gestion personnel restaurant, site internet restaurant, carte cadeau restaurant, vente à emporter restaurant, CRM restaurant, Gusto Manager",
};

const faqItems = [
  {
    question:
      "Est-ce que Gusto Manager prend une commission sur mes réservations ou ventes ?",
    answer:
      "Non. Gusto Manager ne prend aucune commission. Vous gardez 100% de vos revenus sur les réservations, les cartes cadeaux et les ventes réalisées via votre site.",
  },
  {
    question: "Est-ce compliqué à mettre en place dans mon restaurant ?",
    answer:
      "Non. Gusto Manager est conçu pour être simple à prendre en main. La mise en place est rapide et vous êtes accompagné à chaque étape si nécessaire.",
  },
  {
    question: "Puis-je choisir uniquement les fonctionnalités dont j’ai besoin ?",
    answer:
      "Oui. La plateforme est modulaire : vous activez uniquement les fonctionnalités utiles à votre activité, comme les réservations, l’équipe, le HACCP ou les cartes cadeaux.",
  },
  {
    question: "Est-ce que Gusto Manager peut remplacer plusieurs outils ?",
    answer:
      "Oui. Gusto Manager regroupe plusieurs outils en une seule plateforme : réservations, gestion d’équipe, fichier client, HACCP, site internet et plus encore.",
  },
  {
    question: "Est-ce adapté à mon type de restaurant ?",
    answer:
      "Oui. Gusto Manager s’adapte aux restaurants indépendants, aux établissements en développement et aux structures avec plusieurs restaurants.",
  },
  {
    question: "Est-ce que la plateforme fonctionne sur mobile et tablette ?",
    answer:
      "Oui. Gusto Manager est accessible sur ordinateur, tablette et mobile pour gérer votre restaurant en temps réel.",
  },
];

const homeJsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/img/logo.png`,
    image: OG_IMAGE,
    description: homeSeo.description,
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "sales",
      url: `${SITE_URL}/contact`,
      availableLanguage: ["fr", "en"],
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: "fr-FR",
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: SITE_URL,
    image: OG_IMAGE,
    description: homeSeo.description,
    audience: {
      "@type": "Audience",
      audienceType: "Restaurateurs et professionnels de la restauration",
    },
    featureList: [
      "Gestion des réservations",
      "Site internet restaurant synchronisé",
      "Gestion de carte, plats, menus, boissons et vins",
      "Cartes cadeaux en ligne",
      "Gestion du personnel, planning et pointeuse",
      "Fichier client CRM",
      "Vente à emporter",
      "Suivi HACCP",
      "Notifications en temps réel",
    ],
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  },
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Accueil",
        item: homeSeo.url,
      },
    ],
  },
];

export default function HomePage() {
  const title = homeSeo.title;
  const description = homeSeo.description;

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="keywords" content={homeSeo.keywords} />
        <meta name="robots" content="index,follow,max-image-preview:large" />
        <meta name="author" content={SITE_NAME} />
        <meta name="publisher" content={SITE_NAME} />
        <meta name="application-name" content={SITE_NAME} />
        <meta name="theme-color" content="#131E36" />
        <link rel="canonical" href={homeSeo.url} />
        <link rel="alternate" hrefLang="fr" href={`${SITE_URL}/`} />
        <link rel="alternate" hrefLang="x-default" href={`${SITE_URL}/`} />

        <meta property="og:site_name" content={SITE_NAME} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={homeSeo.url} />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="fr_FR" />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:image:secure_url" content={OG_IMAGE} />
        <meta property="og:image:width" content="1024" />
        <meta property="og:image:height" content="678" />
        <meta
          property="og:image:alt"
          content="Interface de gestion Gusto Manager pour restaurants"
        />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={OG_IMAGE} />
        <meta
          name="twitter:image:alt"
          content="Interface de gestion Gusto Manager pour restaurants"
        />

        {homeJsonLd.map((schema, index) => (
          <script
            key={`home-jsonld-${index}`}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
          />
        ))}
      </Head>

      <div className="relative isolate min-h-screen bg-white barlow-semi-condensed-regular text-lg text-pretty">
        <div
          className="pointer-events-none fixed inset-0 -z-10 bg-dirtyWhite/40"
          style={{
            backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(`
        <svg xmlns='http://www.w3.org/2000/svg' width='95' height='95' fill='none'>
          <g fill='#BDBDBD' fill-opacity='.6' clip-path='url(#a)' opacity='.5'>
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
        <main>
          <HeroSectionLandingComponent />
          <HelpingLandingComponent />
          <AdvantagesLandingComponent />
          <FunctionalitiesLandingComponent />
          <StrongPointsLandingComponent />
          <TestimonialLandingComponent />
          <FaqLandingComponent />
          <CallToActionLandingComponent />
        </main>
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
