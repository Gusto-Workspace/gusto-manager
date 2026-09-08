import { useContext, useMemo, useState } from "react";
import axios from "axios";
import { useRouter } from "next/router";
import { ChevronLeft } from "lucide-react";

import { GlobalContext } from "@/contexts/global.context";
import ManualTakeAwayOrderComponent from "../../take-away/manual-order.take-away.component";
import { toDateKey } from "../../take-away/take-away.utils";

export default function AddTakeAwayWebapp() {
  const router = useRouter();
  const { restaurantContext } = useContext(GlobalContext);
  const restaurant = restaurantContext.restaurantData;
  const restaurantId = restaurant?._id;
  const initialDate =
    typeof router.query.day === "string" ? router.query.day : "";
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const catalog = useMemo(
    () =>
      Array.isArray(restaurant?.takeAwayCatalog)
        ? restaurant.takeAwayCatalog
        : [],
    [restaurant?.takeAwayCatalog],
  );
  const settings = restaurant?.takeAwaySettings || {};
  const deliveryZones = Array.isArray(settings.deliveryZones)
    ? settings.deliveryZones
    : [];

  async function createOrder(payload) {
    if (!restaurantId) return false;
    setLoading(true);
    setMessage("");
    try {
      const scheduledFor = new Date(
        `${payload.date}T${payload.time}:00`,
      ).toISOString();
      const token = localStorage.getItem("token");
      const { data } = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/take-away/orders`,
        {
          ...payload,
          scheduledFor,
          slotId: `${payload.date}-${payload.time}`,
          paymentMethod: "on_site",
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (data.order) {
        restaurantContext.applyTakeAwayOrderUpdate?.(data.order);
      }
      const day = toDateKey(data.order?.scheduledFor || scheduledFor);
      await router.push({
        pathname: "/dashboard/webapp/take-away",
        query: { day, orderId: data.order?._id },
      });
      return true;
    } catch (error) {
      setMessage(error?.response?.data?.message || "Création impossible.");
      return false;
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex h-[50px] items-center gap-3">
        <button
          type="button"
          onClick={() => router.push("/dashboard/webapp/take-away")}
          className="inline-flex shrink-0 items-center justify-center rounded-full border border-darkBlue/10 bg-white/70 p-3 transition active:scale-[0.98]"
          aria-label="Retour aux commandes"
        >
          <ChevronLeft className="size-5 text-darkBlue/70" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-darkBlue midTablet:text-xl">
            Nouvelle commande
          </h1>
          <p className="truncate text-sm text-darkBlue/50">Vente à emporter</p>
        </div>
      </div>

      {message ? (
        <p className="rounded-2xl border border-red/20 bg-red/10 px-4 py-3 text-sm font-semibold text-red">
          {message}
        </p>
      ) : null}

      <ManualTakeAwayOrderComponent
        catalog={catalog}
        deliveryZones={deliveryZones}
        blockedDates={settings.blockedDates || []}
        pickupEnabled={settings.pickupEnabled !== false}
        deliveryEnabled={settings.deliveryEnabled === true}
        restaurantId={restaurantId}
        loading={loading}
        onCreate={createOrder}
        title="Nouvelle commande"
        variant="page"
        initialDate={initialDate}
      />
    </section>
  );
}
