// STYLES
import "@/styles/style.scss";
import "@/styles/tailwind.css";
import '@/styles/custom/_index.scss';

// I18N
import { appWithTranslation } from "next-i18next";

function App({ Component, pageProps }) {
  return <Component {...pageProps} />;
}

export default appWithTranslation(App);
