import { useState } from "react";
import axios from "axios";
import { useTranslation } from "next-i18next";
import DoubleSkeletonComonent from "@/components/_shared/skeleton/double-skeleton.component";
import SimpleSkeletonComponent from "@/components/_shared/skeleton/simple-skeleton.component";

export default function ListOwnersAdminComponent(props) {
  const { t } = useTranslation("admin");
  const [ownerToDelete, setOwnerToDelete] = useState(null);
  const [loadingDelete, setLoadingDelete] = useState(false);

  async function confirmDelete(ownerId) {
    setLoadingDelete(true);

    try {
      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/owners/${ownerId}`
      );

      props.setOwners((prevOwners) =>
        prevOwners.filter((owner) => owner._id !== ownerId)
      );

      setOwnerToDelete(null);
      setLoadingDelete(false);
    } catch (error) {
      console.error("Erreur lors de la suppression du propriétaire:", error);
      setLoadingDelete(false);
    }
  }

  return (
    <section>
      <div className="flex justify-between">
        <h1 className="text-4xl">{t("nav.owners")}</h1>

        <button
          className="bg-blue text-white px-4 py-2 rounded-lg"
          onClick={props.handleAddClick}
        >
          {t("owner.form.add")}
        </button>
      </div>

      <div className="mt-4">
        {props?.loading ? (
          <div className="bg-white p-6 drop-shadow-sm flex flex-col gap-2 rounded-lg">
            <DoubleSkeletonComonent justify="justify-start" />
            <SimpleSkeletonComponent />
            <SimpleSkeletonComponent />
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {props?.owners?.length > 0 ? (
              props?.owners?.map((owner) => (
                <li
                  key={owner?._id}
                  className="bg-white p-6 rounded-lg drop-shadow-sm"
                >
                  <div className="flex justify-between">
                    <h2 className="text-2xl">
                      {owner?.firstname} {owner?.lastname}
                    </h2>

                    <p>
                      {new Date(owner?.created_at).toLocaleDateString("fr-FR")}
                    </p>
                  </div>

                  <p>
                    {t("owner.form.email")} : {owner?.email}
                  </p>
                  <p>
                    {t("owner.form.phoneNumber")} : {owner?.phoneNumber}
                  </p>
                  <p>
                    {t("owner.list.listRestaurants")} :{" "}
                    {owner?.restaurants?.length > 0 ? (
                      owner.restaurants
                        .map((restaurant) => restaurant.name)
                        .join(", ")
                    ) : (
                      <span className="text-sm opacity-40 italic">
                        {t("owner.list.noRestaurant")}
                      </span>
                    )}
                  </p>

                  {ownerToDelete === owner._id ? (
                    <div className="flex gap-2 mt-2">
                      <button
                        className="bg-red text-white px-4 py-2 rounded-lg"
                        onClick={() => confirmDelete(owner._id)}
                        disabled={loadingDelete}
                      >
                        {loadingDelete
                          ? t("buttons.loading")
                          : t("buttons.confirm")}
                      </button>
                      <button
                        className="bg-blue text-white px-4 py-2 rounded-lg"
                        onClick={() => setOwnerToDelete(null)}
                      >
                        {t("owner.list.buttons.cancel")}
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2 mt-2">
                      <button
                        className="bg-darkBlue text-white px-4 py-2 rounded-lg"
                        onClick={() => props.handleEditClick(owner)}
                      >
                        {t("owner.list.buttons.edit")}
                      </button>
                      <button
                        className="bg-red text-white px-4 py-2 rounded-lg"
                        onClick={() => setOwnerToDelete(owner._id)}
                      >
                        {t("buttons.delete")}
                      </button>
                    </div>
                  )}
                </li>
              ))
            ) : (
              <p>{t("owners.list.emptyList")}</p>
            )}
          </ul>
        )}
      </div>
    </section>
  );
}
