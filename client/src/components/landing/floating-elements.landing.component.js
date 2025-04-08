import React from "react";
import {
  Utensils,
  Bell,
  Clock,
  ShoppingCart,
  UtensilsCrossed,
  Coffee,
  Wine,
} from "lucide-react";

export default function FloatingElementsLandingComponent() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Éléments à gauche */}
      <div className="absolute left-[6%] top-[25%] opacity-0 animate-float-up">
        <Utensils className="text-orange w-10 h-10" />
      </div>
      <div className="absolute left-[12%] top-[55%] opacity-0 animate-float-diagonal-delay-1">
        <Bell className="text-white w-8 h-8" />
      </div>
      <div className="absolute left-[8%] bottom-[15%] opacity-0 animate-float-up-delay-3">
        <Clock className="text-orange w-12 h-12" />
      </div>
      <div className="absolute left-[20%] top-[70%] opacity-0 animate-float-up-delay-2">
        <Coffee className="text-white w-10 h-10" />
      </div>

      {/* Éléments à droite */}
      <div className="absolute right-[6%] top-[20%] opacity-0 animate-float-up-delay-1">
        <ShoppingCart className="text-orange w-10 h-10" />
      </div>
      <div className="absolute right-[14%] top-[45%] opacity-0 animate-float-diagonal-reverse-delay-1">
        <UtensilsCrossed className="text-white w-8 h-8" />
      </div>
      <div className="absolute right-[10%] bottom-[20%] opacity-0 animate-float-up-delay-4">
        <Wine className="text-orange w-12 h-12" />
      </div>

      {/* Éléments centraux */}
      <div className="absolute left-[48%] bottom-[20%] opacity-0 animate-float-up-delay-5">
        <Utensils className="text-white w-8 h-8" />
      </div>
      <div className="absolute left-[46%] top-[10%] opacity-0 animate-float-diagonal-delay-2">
        <Bell className="text-orange w-10 h-10" />
      </div>
    </div>
  );
}
