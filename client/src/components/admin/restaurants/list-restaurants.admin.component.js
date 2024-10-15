import { useState } from "react";

export default function ListRestaurantsAdminComponent(props) {
  return (
    <section>
      <div className="flex justify-between">
        <h1 className="text-4xl">Restaurants</h1>

        <button
          className="bg-blue text-white px-4 py-2 rounded-lg"
          onClick={props.handleAddClick}
        >
          Ajouter un restaurant
        </button>
      </div>
    </section>
  );
}
