import { useEffect, useRef, useState } from "react";
import axios from "axios";

export default function CustomerSuggestions({ restaurantId, query, field, onSelect, disabled, children }) {
  const [customers, setCustomers] = useState([]);
  const [open, setOpen] = useState(false);
  const container = useRef(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event) => {
      if (!container.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  useEffect(() => {
    let active = true;
    setCustomers([]);
    const value = String(query || "").trim();
    const isPhonePrefix = /^[\d+().\s-]*\d[\d+().\s-]*$/.test(value);
    if (!open || disabled || !restaurantId || (value.length < 2 && !isPhonePrefix)) return;
    const timer = setTimeout(async () => {
      try {
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/reservation-customers`,
          { params: { query, field } },
        );
        if (active) setCustomers(response.data.customers || []);
      } catch (_) {
        if (active) setCustomers([]);
      }
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [restaurantId, query, field, open, disabled]);

  return (
    <div ref={container} className="relative w-full min-w-0 flex-initial self-start" onFocusCapture={() => setOpen(true)} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
      {children}
      {open && customers.length > 0 && (
        <ul className="absolute left-0 top-full z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-2xl border border-darkBlue/10 bg-white shadow-lg">
          {customers.map((customer) => (
            <li key={customer._id}>
              <button type="button" className="min-h-11 w-full px-4 py-2 text-left text-sm hover:bg-darkBlue/5" onClick={() => { setOpen(false); setCustomers([]); onSelect(customer); }}>
                {[customer.firstName, customer.lastName].filter(Boolean).join(" ") || "Client"}
                <span className="block break-words text-xs text-darkBlue/60">{[customer.phone, customer.email].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
