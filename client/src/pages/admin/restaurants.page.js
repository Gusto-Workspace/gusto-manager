import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

// I18N
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

// COMPONENTS
import NavAdminComponent from "@/components/admin/_shared/nav/nav.admin.component";
import ListRestaurantsAdminComponent from "@/components/admin/restaurants/list-restaurants.admin.component";
import AddRestaurantModal from "@/components/admin/restaurants/add-restaurant-modal.admin";

export default function RestaurantsPage(props) {
  let title;
  let description;

  switch (i18n.language) {
    case "en":
      title = "Gusto Manager";
      description = "";
      break;
    default:
      title = "Gusto Manager";
      description = "";
  }

  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("admin-token");

    if (!token) {
      router.push("/admin/login");
    } else {
      setLoading(false);
    }
  }, [router]);

  return (
    <>
      <Head>
        <title>{title}</title>

        {/* <>
          {description && <meta name="description" content={description} />}
          {title && <meta property="og:title" content={title} />}
          {description && (
            <meta property="og:description" content={description} />
          )}
          <meta
            property="og:url"
            content="https://lespetitsbilingues-newham.com/"
          />
          <meta property="og:type" content="website" />
          <meta property="og:image" content="/img/open-graph.jpg" />
          <meta property="og:image:width" content="1200" />
          <meta property="og:image:height" content="630" />
        </> */}
      </Head>

      <div className="w-[100vw]">
        {loading ? (
          <div className="flex justify-center items-center ">
            <div className="loader">Loading...</div>
          </div>
        ) : (
          <div className="flex">
            <NavAdminComponent />

            <div className="border h-screen overflow-y-auto flex-1 p-12">
              <ListRestaurantsAdminComponent
                handleAddClick={() => setIsModalOpen(true)}
              />
            </div>

            {isModalOpen && (
              <AddRestaurantModal closeModal={() => setIsModalOpen(false)} />
            )}
          </div>
        )}
      </div>
    </>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common", "admin"])),
    },
  };
}
