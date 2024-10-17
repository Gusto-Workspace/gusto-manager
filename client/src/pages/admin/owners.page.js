import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import axios from "axios";
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import NavAdminComponent from "@/components/admin/_shared/nav/nav.admin.component";
import ListOwnersAdminComponent from "@/components/admin/owners/list-owners.admin.component";
import AddOwnerModalComponent from "@/components/admin/owners/add-owner-modal.admin.component";

export default function OwnersPage(props) {
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
  const [owners, setOwners] = useState([]);
  const [selectedOwner, setSelectedOwner] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("admin-token");

    if (!token) {
      router.push("/admin/login");
    } else {
      setLoading(true);
    }
  }, [router]);

  useEffect(() => {
    const token = localStorage.getItem("admin-token");

    if (!token) {
      router.push("/admin/login");
    } else {
      axios
        .get(`${process.env.NEXT_PUBLIC_API_URL}/admin/owners`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
        .then((response) => {
          setOwners(response.data.owners);
          setLoading(false);
        })
        .catch((error) => {
          if (error.response && error.response.status === 403) {
            localStorage.removeItem("admin-token");
            router.push("/admin/login");
          } else {
            console.error(
              "Erreur lors de la récupération des propriétaires:",
              error
            );
            setLoading(false);
          }
        });
    }
  }, [router]);

  function handleAddOwner(newOwner) {
    setOwners((prevOwners) => [...prevOwners, newOwner]);
  }

  function handleEditOwner(updatedOwner) {
    setOwners((prevOwners) =>
      prevOwners.map((owner) =>
        owner._id === updatedOwner._id ? updatedOwner : owner
      )
    );
    setSelectedOwner(null);
  }

  function handleEditClick(owner) {
    setSelectedOwner(owner);
    setIsModalOpen(true);
  }

  function handleAddClick() {
    setSelectedOwner(null);
    setIsModalOpen(true);
  }

  function closeModal() {
    setSelectedOwner(null);
    setIsModalOpen(false);
  }

  return (
    <>
      <Head>
        <title>{title}</title>
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
              <ListOwnersAdminComponent
                handleAddClick={handleAddClick}
                handleEditClick={handleEditClick}
                owners={owners}
                loading={loading}
                setOwners={setOwners}
              />
            </div>

            {isModalOpen && (
              <AddOwnerModalComponent
                closeModal={closeModal}
                handleAddOwner={handleAddOwner}
                handleEditOwner={handleEditOwner}
                owner={selectedOwner}
              />
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
