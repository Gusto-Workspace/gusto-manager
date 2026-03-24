import { useEffect, useRef } from "react";

import {
  cloneSignatureStrokes,
  drawSignatureOnCanvas,
} from "./time-clock.utils";

export default function SignaturePreviewTimeClockComponent({
  signature,
  height = 220,
  className = "",
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const strokes = cloneSignatureStrokes(signature?.strokes || []);

    const redraw = () =>
      drawSignatureOnCanvas(canvasRef.current, strokes, {
        backgroundColor: "#FFFFFF",
      });

    redraw();

    if (typeof ResizeObserver === "undefined" || !containerRef.current) return;

    const observer = new ResizeObserver(() => {
      redraw();
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [signature]);

  return (
    <div
      ref={containerRef}
      className={[
        "overflow-hidden rounded-[28px] border border-darkBlue/10 bg-white shadow-sm",
        className,
      ].join(" ")}
      style={{ height }}
    >
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}
