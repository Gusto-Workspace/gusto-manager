import CommercialLayout from "@/components/commercial/commercial-layout";
import CommercialCalendar from "@/components/commercial/commercial-calendar";

export default function CommercialCalendarPage() {
  return <CommercialLayout title="Calendrier">{() => <CommercialCalendar />}</CommercialLayout>;
}

export { getCommercialStaticProps as getStaticProps } from "@/components/commercial/commercial-translations.server";
