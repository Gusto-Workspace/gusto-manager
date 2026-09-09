import { useEffect } from "react";
import { useRouter } from "next/router";
import { consumeGustoMenuPrintReturnPath } from "@/_assets/utils/restaurant-menu-print";
import DashboardPage, {
  getStaticProps as getDashboardStaticProps,
} from "./index.page";

export default function ManagerPage(props) {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;

    const returnPath = consumeGustoMenuPrintReturnPath();
    if (returnPath) void router.replace(returnPath);
  }, [router]);

  return <DashboardPage {...props} />;
}

export async function getStaticProps(context) {
  return getDashboardStaticProps(context);
}
