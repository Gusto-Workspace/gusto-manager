import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export default function ModuleCardLandingComponent({
  title,
  icon,
  description,
  features,
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border border-darkBlue/5 rounded-xl shadow-lg transition-all duration-300 bg-white hover:shadow-xl flex flex-col pb-6">
      <div className="p-6 pb-0">
        <div className="text-orange text-3xl mb-4">{icon}</div>
        <h3 className="text-xl font-bold text-darkBlue mb-2">{title}</h3>
        <p className="text-gray-600 mb-4">{description}</p>

        <button
          onClick={() => setIsExpanded((prev) => !prev)}
          className="text-orange flex items-center text-sm font-medium mt-4 hover:underline"
        >
          <span>
            {isExpanded
              ? "Masquer les fonctionnalités"
              : "Voir les fonctionnalités"}
          </span>
          {isExpanded ? (
            <ChevronUp className="ml-1 h-4 w-4" />
          ) : (
            <ChevronDown className="ml-1 h-4 w-4" />
          )}
        </button>
      </div>

      {/* Panneau des détails */}
      <div
        className={`px-6 overflow-hidden transition-all duration-300 ease-in-out ${
          isExpanded ? "max-h-96" : "max-h-0"
        }`}
      >
        <ul className="space-y-3 mt-4">
          {features.map((feature, index) => (
            <li key={index} className="flex items-start">
              <span className="mr-2 text-orange">•</span>
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
