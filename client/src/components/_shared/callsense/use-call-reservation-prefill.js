import { useContext, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import { GlobalContext } from "@/contexts/global.context";

export default function useCallReservationPrefill(restaurantId, isEditing, setReservationData) {
  const router = useRouter();
  const { restaurantContext } = useContext(GlobalContext);
  const fetchCustomer = restaurantContext?.fetchCustomerDetailsCached;
  const applied = useRef("");
  const cancelledByUser = useRef("");
  const callId = typeof router.query.fromCall === "string" ? router.query.fromCall : "";
  const key = `${restaurantId}:${callId}`;
  useEffect(() => {
    if (
      isEditing ||
      !restaurantId ||
      !/^[a-f\d]{24}$/i.test(callId) ||
      applied.current === key ||
      cancelledByUser.current === key
    ) return;
    let cancelled = false;
    const isCancelled = () => cancelled || cancelledByUser.current === key;
    (async () => {
      try {
        const { data } = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/callsense/calls`, { params: { callId } });
        const call = data.calls?.[0];
        if (!call || isCancelled()) return;
        const identity = call.from ? (await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/callsense/customer-identities`, { phones: [call.from] })).data.identities?.[call.from] : null;
        let customer = null;
        if (identity?.customerId && fetchCustomer) {
          try { customer = (await fetchCustomer({ rid: restaurantId, customerId: identity.customerId }))?.customer; } catch (_) {}
        }
        if (isCancelled()) return;
        applied.current = key;
        setReservationData((previous) => isCancelled() ? previous : ({ ...previous,
          customerFirstName: previous.customerFirstName || customer?.firstName || identity?.customerFirstName || "",
          customerLastName: previous.customerLastName || customer?.lastName || identity?.customerLastName || "",
          customerPhone: previous.customerPhone || call.from || "",
        }));
      } catch (_) {}
    })();
    return () => { cancelled = true; };
  }, [restaurantId, callId, isEditing, setReservationData, fetchCustomer, key]);

  return () => { cancelledByUser.current = key; };
}
