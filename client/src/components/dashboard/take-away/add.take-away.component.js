import { useContext, useMemo, useState } from "react";
import axios from "axios";
import { useRouter } from "next/router";

import { GlobalContext } from "@/contexts/global.context";
import TakeAwayHeaderComponent from "./header.take-away.component";
import ManualTakeAwayOrderComponent from "./manual-order.take-away.component";
import { toDateKey } from "./take-away.utils";

export default function AddTakeAwayComponent() {
  const router = useRouter();
  const { restaurantContext } = useContext(GlobalContext);
  const restaurant = restaurantContext.restaurantData;
  const restaurantId = restaurant?._id;
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const catalog = useMemo(
    () =>
      Array.isArray(restaurant?.takeAwayCatalog)
        ? restaurant.takeAwayCatalog
        : [],
    [restaurant?.takeAwayCatalog],
  );

  const deliveryZones = useMemo(
    () =>
      Array.isArray(restaurant?.takeAwaySettings?.deliveryZones)
        ? restaurant.takeAwaySettings.deliveryZones
        : [],
    [restaurant?.takeAwaySettings?.deliveryZones],
  );

  async function createOrder(payload) {
    if (!restaurantId || !token) return false;
    setLoading(true);
    setMessage("");

    try {
      const scheduledFor = new Date(
        `${payload.date}T${payload.time}:00`,
      ).toISOString();
      const { data } = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/take-away/orders`,
        {
          ...payload,
          scheduledFor,
          slotId: `${payload.date}-${payload.time}`,
          paymentMethod: "on_site",
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      const day = toDateKey(data.order?.scheduledFor || scheduledFor);
      await router.push(`/dashboard/take-away?day=${day}`);
      return true;
    } catch (error) {
      console.error(error);
      setMessage(error?.response?.data?.message || "Création impossible.");
      return false;
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <TakeAwayHeaderComponent subtitle="Nouvelle commande" showBack />

      {message ? (
        <div className="rounded-2xl border border-red/20 bg-red/10 px-4 py-3 text-sm font-semibold text-red">
          {message}
        </div>
      ) : null}

      <ManualTakeAwayOrderComponent
        catalog={catalog}
        deliveryZones={deliveryZones}
        loading={loading}
        onCreate={createOrder}
        title="Nouvelle commande"
        variant="page"
      />
    </section>
  );
}
