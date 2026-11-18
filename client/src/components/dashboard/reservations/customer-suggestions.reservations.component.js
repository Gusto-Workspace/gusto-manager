import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";

export default function CustomerSuggestions({ restaurantId, query, field, onSelect, disabled, children }) {
  const [result, setResult] = useState(null);
  const [open, setOpen] = useState(false);
  const container = useRef(null);
  const pendingSearch = useRef(null);
  const value = String(query || "").trim();
  const isPhonePrefix = /^[\d+().\s-]*\d[\d+().\s-]*$/.test(value);
  const canSearch = open && !disabled && Boolean(restaurantId) && (value.length >= 2 || isPhonePrefix);
  const customers =
    canSearch &&
    result?.restaurantId === restaurantId &&
    result?.field === field &&
    result?.query === query
      ? result.customers
      : [];

  const clearResults = useCallback(() => {
    pendingSearch.current?.abort();
    setResult(null);
  }, []);

  const close = useCallback(() => {
    clearResults();
    setOpen(false);
  }, [clearResults]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event) => {
      if (!container.current?.contains(event.target)) close();
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open, close]);

  useEffect(() => {
    if (!canSearch) return;
    const controller = new AbortController();
    pendingSearch.current = controller;
    const timer = setTimeout(async () => {
      if (controller.signal.aborted) return;
      try {
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/reservation-customers`,
          { params: { query, field }, signal: controller.signal },
        );
        if (!controller.signal.aborted) {
          setResult({ restaurantId, field, query, customers: response.data.customers || [] });
        }
      } catch {
        if (!controller.signal.aborted) setResult(null);
      }
    }, 350);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [restaurantId, query, field, canSearch]);

  function selectCustomer(customer) {
    close();
    onSelect({
      customerFirstName: customer.firstName ?? "",
      customerLastName: customer.lastName ?? "",
      customerEmail: customer.email ?? "",
      customerPhone: customer.phone ?? "",
    });
  }

  return (
    <div
      ref={container}
      className="relative w-full min-w-0 flex-initial self-start"
      onFocusCapture={() => setOpen(true)}
      onChangeCapture={() => {
        clearResults();
        setOpen(true);
      }}
      onBlurCapture={(event) => {
        if (event.relatedTarget && !container.current?.contains(event.relatedTarget)) close();
      }}
      onKeyDown={(event) => { if (event.key === "Escape") close(); }}
    >
      {children}
      {customers.length > 0 && (
        <ul className="absolute left-0 top-full z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-2xl border border-darkBlue/10 bg-white shadow-lg">
          {customers.map((customer) => (
            <li key={customer._id}>
              <button
                type="button"
                className="min-h-11 w-full px-4 py-2 text-left text-sm hover:bg-darkBlue/5"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectCustomer(customer)}
              >
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
