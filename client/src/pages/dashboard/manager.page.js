import DashboardPage, {
  getStaticProps as getDashboardStaticProps,
} from "./index.page";

export default DashboardPage;

export async function getStaticProps(context) {
  return getDashboardStaticProps(context);
}
