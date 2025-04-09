import Head from "next/head";

// I18N
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

// COMPONENTS
import NavbarLanding from "@/components/landing/nav.landing.component";
import FooterLandingComponent from "@/components/landing/footer.landing.component";
import ContactLandingComponent from "@/components/landing/contact.landing.component";

export default function ContactPage(props) {
  let title;
  let description;

  switch (i18n.language) {
    case "en":
      title = "Gusto Manager";
      description =
        "Simplifiez vos opérations quotidiennes grâce à une plateforme intuitive qui centralise la gestion de votre restaurant.";
      break;
    default:
      title = "Gusto Manager";
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

      <div className="min-h-screen">
        <NavbarLanding isContact={true} />

        <ContactLandingComponent />

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
