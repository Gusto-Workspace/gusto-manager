import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import {
  cloneSignatureStrokes,
  drawSignatureOnCanvas,
} from "./time-clock.utils";

function clamp(value) {
  return Math.min(Math.max(value, 0), 1);
}

const SignaturePadTimeClockComponent = forwardRef(function SignaturePadTimeClockComponent(
  {
    onChange,
    height = 190,
    disabled = false,
    className = "",
    placeholder = "Signez ici",
  },
  ref,
) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const strokesRef = useRef([]);
  const currentStrokeRef = useRef(null);
  const drawingRef = useRef(false);

  const [hasSignature, setHasSignature] = useState(false);

  function redraw() {
    drawSignatureOnCanvas(canvasRef.current, strokesRef.current, {
      backgroundColor: "#FFFFFF",
    });
  }

  function notifyChange() {
    const cloned = cloneSignatureStrokes(strokesRef.current);
    setHasSignature(cloned.length > 0);
    onChange?.(cloned);
    redraw();
  }

  function clear() {
    strokesRef.current = [];
    currentStrokeRef.current = null;
    drawingRef.current = false;
    notifyChange();
  }

  useImperativeHandle(ref, () => ({
    clear,
    hasSignature: () => strokesRef.current.length > 0,
  }));

  useEffect(() => {
    redraw();

    if (typeof ResizeObserver === "undefined" || !containerRef.current) return;

    const observer = new ResizeObserver(() => {
      redraw();
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  function getPointFromEvent(event) {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 1;
    const heightPx = rect.height || 1;

    return {
      x: clamp((event.clientX - rect.left) / width),
      y: clamp((event.clientY - rect.top) / heightPx),
    };
  }

  function handlePointerDown(event) {
    if (disabled) return;

    const point = getPointFromEvent(event);
    if (!point) return;

    event.preventDefault();
    canvasRef.current?.setPointerCapture?.(event.pointerId);

    const stroke = { points: [point] };
    strokesRef.current = [...strokesRef.current, stroke];
    currentStrokeRef.current = stroke;
    drawingRef.current = true;
    setHasSignature(true);
    redraw();
  }

  function handlePointerMove(event) {
    if (!drawingRef.current || disabled) return;

    const point = getPointFromEvent(event);
    if (!point || !currentStrokeRef.current) return;

    event.preventDefault();
    currentStrokeRef.current.points.push(point);
    redraw();
  }

  function handlePointerUp(event) {
    if (!drawingRef.current) return;

    event.preventDefault();
    canvasRef.current?.releasePointerCapture?.(event.pointerId);

    drawingRef.current = false;
    currentStrokeRef.current = null;
    notifyChange();
  }

  return (
    <div
      ref={containerRef}
      className={[
        "relative overflow-hidden rounded-[28px] border border-darkBlue/10 bg-white shadow-sm",
        disabled ? "opacity-60" : "",
        className,
      ].join(" ")}
      style={{ height }}
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />

      {!hasSignature && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-darkBlue/35">
          {placeholder}
        </div>
      )}
    </div>
  );
});

export default SignaturePadTimeClockComponent;
