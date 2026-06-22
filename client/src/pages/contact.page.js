import Head from "next/head";

// I18N
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

// COMPONENTS
import NavbarLanding from "@/components/landing/nav.landing.component";
import FooterLandingComponent from "@/components/landing/footer.landing.component";
import ContactLandingComponent from "@/components/landing/contact.landing.component";

const SITE_URL = "https://gusto-manager.com";
const SITE_NAME = "Gusto Manager";
const OG_IMAGE = `${SITE_URL}/img/open-graph.jpg`;

const contactSeo = {
  title: "Demander une démo Gusto Manager | Logiciel restaurant",
  description:
    "Contactez Gusto Manager pour découvrir la plateforme de gestion restaurant : réservations, site internet, personnel, cartes cadeaux, vente à emporter, HACCP et fichier client.",
  url: `${SITE_URL}/contact`,
  keywords:
    "démo logiciel restaurant, contact Gusto Manager, logiciel gestion restaurant, plateforme restaurant, outil réservations restaurant, logiciel personnel restaurant, logiciel HACCP restaurant",
};

const contactJsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/img/logo.png`,
    image: OG_IMAGE,
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "sales",
      url: contactSeo.url,
      availableLanguage: ["fr", "en"],
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    name: "Demander une démo Gusto Manager",
    url: contactSeo.url,
    description: contactSeo.description,
    mainEntity: {
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: SITE_URL,
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Accueil",
        item: `${SITE_URL}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Contact",
        item: contactSeo.url,
      },
    ],
  },
];

export default function ContactPage() {
  const title = contactSeo.title;
  const description = contactSeo.description;

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="keywords" content={contactSeo.keywords} />
        <meta name="robots" content="index,follow,max-image-preview:large" />
        <meta name="author" content={SITE_NAME} />
        <meta name="publisher" content={SITE_NAME} />
        <meta name="application-name" content={SITE_NAME} />
        <meta name="theme-color" content="#131E36" />
        <link rel="canonical" href={contactSeo.url} />
        <link rel="alternate" hrefLang="fr" href={`${SITE_URL}/contact`} />
        <link rel="alternate" hrefLang="x-default" href={`${SITE_URL}/contact`} />

        <meta property="og:site_name" content={SITE_NAME} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={contactSeo.url} />
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

        {contactJsonLd.map((schema, index) => (
          <script
            key={`contact-jsonld-${index}`}
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
        <NavbarLanding isContact={true} />

        <main>
          <h1 className="sr-only">
            Demander une démo Gusto Manager pour votre restaurant
          </h1>
          <ContactLandingComponent />
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
