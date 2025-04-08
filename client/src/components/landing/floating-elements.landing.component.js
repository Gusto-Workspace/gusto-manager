// ICONS
import {
  Utensils,
  Bell,
  UtensilsCrossed,
  Coffee,
  Wine,
  Salad,
  Soup,
  Beef,
  Martini,
  ChefHat,
  Citrus,
  Shrimp,
  Carrot,
  IceCreamCone,
} from "lucide-react";

export default function FloatingElementsLandingComponent() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Éléments à gauche */}
      <div className="absolute left-[17%] top-[25%] opacity-0 animate-float-up">
        <Salad className="text-orange w-10 h-10" />
      </div>
      <div className="absolute left-[12%] top-[55%] opacity-0 animate-float-diagonal-delay-1">
        <Bell className="text-white w-12 h-12" />
      </div>
      <div className="absolute left-[4%] bottom-[5%] opacity-0 animate-float-up-delay-3">
        <Martini className="text-orange w-20 h-20 " />
      </div>
      <div className="absolute left-[25%] top-[70%] opacity-0 animate-float-up-delay-4">
        <Coffee className="text-orange w-8 h-8 " />
      </div>
      <div className="absolute left-[35%] bottom-[10%] opacity-0 animate-float-up-delay-5">
        <ChefHat className="text-orange w-8 h-8 " />
      </div>
      <div className="absolute left-[25%] bottom-[10%] opacity-0 animate-float-diagonal-reverse-delay-1">
        <Citrus className="text-white w-8 h-8 " />
      </div>
      <div className="absolute left-[25%] top-[10%] opacity-0 animate-float-up-delay-4">
        <Carrot className="text-white w-8 h-8 " />
      </div>

      {/* Éléments à droite */}
      <div className="absolute right-[6%] top-[20%] opacity-0 animate-float-up-delay-3">
        <Soup className="text-orange w-10 h-10" />
      </div>
      <div className="absolute right-[26%] top-[14%] opacity-0 animate-float-up-delay-1">
        <Beef className="text-white w-10 h-10" />
      </div>
      <div className="absolute right-[14%] top-[45%] opacity-0 animate-float-diagonal-reverse-delay-1">
        <Utensils className="text-orange w-16 h-16 " />
      </div>
      <div className="absolute right-[25%] bottom-[20%] opacity-0 animate-float-up-delay-4">
        <Wine className="text-white w-12 h-12" />
      </div>
      <div className="absolute right-[35%] bottom-[15%] opacity-0 animate-float-up-delay-2">
        <Shrimp className="text-orange w-12 h-12" />
      </div>

      {/* Éléments centraux */}
      <div className="absolute left-[48%] bottom-[20%] opacity-0 animate-float-up-delay-1">
        <IceCreamCone className="text-white w-8 h-8" />
      </div>
      <div className="absolute left-[46%] top-[10%] opacity-0 animate-float-diagonal-delay-2">
        <UtensilsCrossed className="text-orange w-10 h-10" />
      </div>
    </div>
  );
}
