import Head from "next/head";

// I18N
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

// COMPONENTS
import NavbarLanding from "@/components/landing/nav.landing.component";
import FeatureItemLandingComponent from "@/components/landing/feature-item.landing.component";
import ModuleCardLandingComponent from "@/components/landing/module-card.landing.component";
import CallToActionLandingComponent from "@/components/landing/call-to-action.landing.component";
import FooterLandingComponent from "@/components/landing/footer.landing.component";
import FloatingElementsLandingComponent from "@/components/landing/floating-elements.landing.component";

import {
  LayoutDashboard,
  CalendarRange,
  GiftIcon,
  Clock,
  PanelLeft,
  Smartphone,
  Settings,
  BadgeCheck,
  ChevronRight,
  Users,
  Rocket,
  LineChart,
  Coffee,
  ThumbsUp,
  CheckCircle2,
  XCircle,
  Zap,
  BarChart3,
  Heart,
} from "lucide-react";
import HeroSectionLandingComponent from "@/components/landing/hero-section.landing.component";
import PlateformLandingComponent from "@/components/landing/plateform.landing.component";
import AdvantagesLandingComponent from "@/components/landing/advantages.landing.component";
import HelpingLandingComponent from "@/components/landing/helping.landing.component";
import FunctionalitiesLandingComponent from "@/components/landing/functionalities.landing.component";
import PluginsLandingComponent from "@/components/landing/plugins.landing.component";
import ForWhoLandingComponent from "@/components/landing/for-who.landing.component";

export default function HomePage(props) {
  let title;
  let description;

  switch (i18n.language) {
    case "en":
      title = "Gusto Manager";
      description = "Simplifiez vos opérations quotidiennes grâce à une plateforme intuitive qui centralise la gestion de votre restaurant.";
      break;
    default:
      title = "Gusto Manager";
      description = "Simplifiez vos opérations quotidiennes grâce à une plateforme intuitive qui centralise la gestion de votre restaurant.";
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
        <NavbarLanding />

        <HeroSectionLandingComponent />

        <PlateformLandingComponent />

        <AdvantagesLandingComponent />

        <HelpingLandingComponent />

        <FunctionalitiesLandingComponent />

        <PluginsLandingComponent />

        <ForWhoLandingComponent />

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
