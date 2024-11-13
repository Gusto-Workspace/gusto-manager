import { useContext, useState } from "react";
import Head from "next/head";

// I18N
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// COMPONENTS
import NavAdminComponent from "@/components/admin/_shared/nav/nav.admin.component";
import ListOwnersAdminComponent from "@/components/admin/owners/list-owners.admin.component";
import AddOwnerModalComponent from "@/components/admin/owners/add-owner-modal.admin.component";

export default function OwnersPage(props) {
  const { adminContext } = useContext(GlobalContext);

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

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState(null);

  if (!adminContext.isAuth) return null;

  function handleAddOwner(newOwner) {
    adminContext.setOwnersList((prevOwners) => [...prevOwners, newOwner]);
  }

  function handleEditOwner(updatedOwner) {
    adminContext.setOwnersList((prevOwners) =>
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

      <div className="flex">
        <NavAdminComponent />

        <div
           
          className="bg-lightGrey text-darkBlue overflow-y-auto flex-1 p-6 h-screen flex flex-col gap-6"
        >
          <ListOwnersAdminComponent
            handleAddClick={handleAddClick}
            handleEditClick={handleEditClick}
            owners={adminContext.ownersList}
            setOwners={adminContext.setOwnersList}
            loading={adminContext.ownersLoading}
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
