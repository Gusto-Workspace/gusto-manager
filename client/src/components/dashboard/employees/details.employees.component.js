// components/dashboard/employees/details.employees.component.js

import { useRouter } from "next/router";
import { useContext, useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { GlobalContext } from "@/contexts/global.context";

export default function DetailsEmployeesComponent({ employeeId }) {
  const { restaurantContext } = useContext(GlobalContext);
  const [employee, setEmployee] = useState(null);
  const [docs, setDocs] = useState([]);

  const { register, handleSubmit, reset } = useForm();

  // À chaque changement de restaurantData ou d’ID, hydrate l’état employee
  useEffect(() => {
    const list = restaurantContext.restaurantData?.employees || [];
    const found = list.find((e) => e._id === employeeId);
    if (found) {
      setEmployee(found);
      // initialise les checkbox avec les droits courants
      reset({ options: found.options });
    }
  }, [restaurantContext.restaurantData, employeeId, reset]);

  // Soumission des droits
  const onSaveOptions = (data) => {
    console.log("Options à sauvegarder :", data.options);
    // TODO : API PATCH /restaurants/:rid/employees/:eid/options avec data.options
  };

  // Chargement des fichiers
  const onDocsChange = (e) => {
    const files = Array.from(e.target.files);
    setDocs(files);
    console.log("Documents sélectionnés :", files);
  };

  if (!employee) return <p>Chargement de l’employé…</p>;

  return (
    <div className="space-y-6">
      {/* Fiche générale */}
      <section className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-2xl font-semibold mb-4">
          {employee.firstname} {employee.lastname}
        </h2>
        <p><strong>Poste :</strong> {employee.post}</p>
        <p>
          <strong>Arrivé le :</strong>{" "}
          {new Date(employee.dateOnPost).toLocaleDateString("fr-FR")}
        </p>
        <p><strong>Email :</strong> {employee.email}</p>
        <p><strong>Téléphone :</strong> {employee.phoneNumber}</p>
      </section>

      {/* Formulaire des droits */}
      <form
        onSubmit={handleSubmit(onSaveOptions)}
        className="bg-white p-6 rounded-lg shadow"
      >
        <h3 className="text-xl mb-4">Attribuer des droits</h3>
        <div className="grid grid-cols-2 gap-4">
          {Object.keys(employee.options).map((key) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                {...register(`options.${key}`)}
              />
              {key.replace(/_/g, " ").toUpperCase()}
            </label>
          ))}
        </div>
        <button
          type="submit"
          className="mt-4 px-4 py-2 bg-blue text-white rounded-lg"
        >
          Sauvegarder les droits
        </button>
      </form>

      {/* Zone d’upload */}
      <section className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-xl mb-4">Documents</h3>
        <input
          type="file"
          multiple
          onChange={onDocsChange}
          className="mb-4"
        />
        {docs.length > 0 && (
          <ul className="list-disc pl-5">
            {docs.map((f, i) => (
              <li key={i}>{f.name}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
