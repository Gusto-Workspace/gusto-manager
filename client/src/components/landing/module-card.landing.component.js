import React, { useState } from "react";
import { ArrowRight } from "lucide-react";

export default function ModuleCardLandingComponent({
  title,
  icon,
  description,
  features,
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="relative overflow-hidden border border-darkBlue/5 rounded-xl shadow-lg transition-all duration-300 h-full bg-white hover:shadow-xl"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`p-6 transition-all duration-300 ${isHovered ? "opacity-0" : "opacity-100"}`}
      >
        <div className="text-orange text-3xl mb-4">{icon}</div>
        <h3 className="text-xl font-bold text-darkBlue mb-2">{title}</h3>
        <p className="text-gray-600 mb-4">{description}</p>
        <div className="text-orange flex items-center text-sm font-medium mt-4">
          <span>Voir les fonctionnalités</span>
          <ArrowRight className="ml-1 h-4 w-4" />
        </div>
      </div>

      <div
        className={`absolute inset-0 p-6 flex flex-col bg-darkBlue text-white transform transition-all duration-300 ${
          isHovered ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
        }`}
      >
        <h3 className="text-xl font-bold mb-4">{title}</h3>
        <ul className="space-y-3">
          {features.map((feature, index) => (
            <li
              key={index}
              className="flex items-start opacity-0 animate-feature-in"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <span className="mr-2 text-orange">•</span>
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
