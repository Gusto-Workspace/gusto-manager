export function NewsSvg(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={props.width ?? 800}
      height={props.height ?? 800}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      color={props.fillColor ?? "#131E36"}
      stroke={props.strokeColor ?? "#131E36"}
      className={props.className ?? ""}
    >
      <path d="M22 5v12c0 1.333-.667 2-2 2s-2-.667-2-2V5H2v11c0 2 1 3 3 3h15M6 14h1m4 0h3m-8-4h8" />
    </svg>
  );
}
