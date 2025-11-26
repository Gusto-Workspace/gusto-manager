import { useEffect, useState } from "react";
import axios from "axios";
import { useTranslation } from "next-i18next";

// SVG
import { DocumentSvg, DownloadSvg } from "@/components/_shared/_svgs/_index";

export default function DocumentsMySpaceComponent({
  employeeId,
  restaurantId,
}) {
  const [docs, setDocs] = useState([]);
  const { t } = useTranslation("myspace");

  useEffect(() => {
    async function fetchDocs() {
      if (!employeeId || !restaurantId) return;

      try {
        const { data } = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/${employeeId}/documents`
        );
        setDocs(data.documents || []);
      } catch (err) {
        console.error("Erreur récupération documents :", err);
      }
    }

    fetchDocs();
  }, [employeeId, restaurantId]);

  const truncate = (name) =>
    name.length > 30 ? `${name.slice(0, 27)}…` : name;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex justify-between">
        <div className="flex gap-2 items-center">
          <DocumentSvg width={30} height={30} fillColor="#131E3690" />
          <h1 className="pl-2 py-1 text-xl tablet:text-2xl">
            {t("titles.second")}
          </h1>
        </div>
      </div>

      <div>
        {docs.length === 0 ? (
          <p className="text-sm italic text-darkBlue/60 text-center">
            {t("noDocuments", "Aucun document disponible pour ce restaurant.")}
          </p>
        ) : (
          <ul className="grid grid-cols-1 mobile:grid-cols-2 midTablet:grid-cols-4 tablet:grid-cols-4 desktop:grid-cols-5 gap-4">
            {docs.map((doc, i) => (
              <li
                key={i}
                className="flex flex-col gap-4 items-center justify-between text-center p-4 bg-white rounded-lg shadow-lg"
              >
                <p className="text-sm">
                  <strong>{doc.title || truncate(doc.filename)}</strong>
                </p>

                <div className="flex w-full justify-between">
                  <div className="w-full flex flex-col items-center">
                    <a
                      href={`${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/${employeeId}/documents/${encodeURIComponent(
                        doc.public_id
                      )}/download`}
                      className="inline-flex items-center justify-center bg-[#4ead7a99] hover:bg-[#4ead7a] p-2 rounded-full transition-colors duration-300"
                    >
                      <DownloadSvg
                        width={15}
                        height={15}
                        strokeColor="white"
                        fillColor="white"
                      />
                    </a>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
