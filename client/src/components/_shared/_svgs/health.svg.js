export function HealthSvg(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      xmlSpace="preserve"
      width={props.width ?? 800}
      height={props.height ?? 800}
      viewBox="0 0 32 32"
      style={{
        fillRule: "evenodd",
        clipRule: "evenodd",
        strokeLinejoin: "round",
        strokeMiterlimit: 2,
      }}
    >
      <path
        fill={props.fillColor ?? "black"}
        d="M25.994 9.026V4.988a3 3 0 0 0-3-3h-14a3.001 3.001 0 0 0-3 3V27a2.998 2.998 0 0 0 3 3h14a1 1 0 0 0 0-2h-14a1 1 0 0 1-1-1V4.988a1 1 0 0 1 1-1h14a.997.997 0 0 1 1 1v4.038a1 1 0 0 0 2 0Z"
      />
      <path
        fill={props.fillColor ?? "black"}
        d="M14.996 8.026h-.989a1 1 0 0 0 0 2h.986l-.002.985a1 1 0 1 0 2 .003l.002-.988h.989a1 1 0 0 0 0-2h-.986l.002-.986a1 1 0 0 0-2-.003l-.002.989ZM28.003 22.013v-7.018a3 3 0 0 0-3-3h-4.001a3 3 0 0 0-3 3v7.018a1 1 0 0 0 .402.802l4.024 3a1 1 0 0 0 1.2-.003l3.978-3c.25-.189.397-.485.397-.799Zm-2-7.018v6.52l-2.981 2.248-3.02-2.252v-6.516a1 1 0 0 1 1-1h4.001a1 1 0 0 1 1 1ZM10.993 16.988l4.004.003a1 1 0 0 0 .002-2l-4.004-.003a1 1 0 0 0-.002 2ZM11.002 20.988l4.004.003a1 1 0 1 0 .001-2l-4.003-.003a1 1 0 1 0-.002 2ZM10.993 24.988l4.004.003a1 1 0 0 0 .002-2l-4.004-.003a1 1 0 0 0-.002 2Z"
      />
    </svg>
  );
}
