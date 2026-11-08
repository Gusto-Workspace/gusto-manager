import { useContext, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import { GlobalContext } from "@/contexts/global.context";

export default function useCallReservationPrefill(restaurantId, isEditing, setReservationData) {
  const router = useRouter();
  const { restaurantContext } = useContext(GlobalContext);
  const fetchCustomer = restaurantContext?.fetchCustomerDetailsCached;
  const applied = useRef("");
  const callId = typeof router.query.fromCall === "string" ? router.query.fromCall : "";
  useEffect(() => {
    if (isEditing || !restaurantId || !/^[a-f\d]{24}$/i.test(callId)) return;
    const key = `${restaurantId}:${callId}`;
    if (applied.current === key) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/callsense/calls`, { params: { callId } });
        const call = data.calls?.[0];
        if (!call || cancelled) return;
        let customer = null;
        if (call.customerId && fetchCustomer) {
          try { customer = (await fetchCustomer({ rid: restaurantId, customerId: call.customerId }))?.customer; } catch (_) {}
        }
        if (cancelled) return;
        applied.current = key;
        setReservationData((previous) => ({ ...previous,
          customerFirstName: previous.customerFirstName || customer?.firstName || call.customerFirstName || "",
          customerLastName: previous.customerLastName || customer?.lastName || call.customerLastName || "",
          customerPhone: previous.customerPhone || call.from || "",
        }));
      } catch (_) {}
    })();
    return () => { cancelled = true; };
  }, [restaurantId, callId, isEditing, setReservationData, fetchCustomer]);
}
