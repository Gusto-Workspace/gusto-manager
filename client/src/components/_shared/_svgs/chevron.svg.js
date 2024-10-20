export function ChevronSvg(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 12 8"
      width={props.width ?? 12}
      height={props.height ?? 8}
      fill="none"
      className={props.className ?? ""}
    >
      <path
        stroke={props.strokeColor ?? "#000"}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="m1 1.5 5 5 5-5"
      />
    </svg>
  );
}
