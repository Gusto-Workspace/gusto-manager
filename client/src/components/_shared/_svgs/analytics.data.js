export function AnalyticsSvg(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={props.width ?? 800}
      height={props.height ?? 800}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        stroke={props.strokeColor ?? "#131E36"}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 3v18M21 21H3M7 16l5.25-5.25 3.5 3.5L21 9"
      />
    </svg>
  );
}
