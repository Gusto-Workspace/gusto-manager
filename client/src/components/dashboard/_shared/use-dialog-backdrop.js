import { useRef } from "react";

function isOutside(event) {
  if (event.target !== event.currentTarget) return false;
  const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
  return event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom;
}

export default function useDialogBackdrop(onClose) {
  const startedOutside = useRef(false);
  return {
    onPointerDown(event) { startedOutside.current = isOutside(event); },
    onClick(event) {
      const dismiss = startedOutside.current && isOutside(event);
      startedOutside.current = false;
      if (dismiss) onClose();
    },
    onCancel(event) { event.preventDefault(); onClose(); },
  };
}
