export function DoubleCheckSvg(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={props.width ?? 800}
      height={props.height ?? 800}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        stroke={props.strokeColor ?? "#000"}
        strokeLinecap="round"
        strokeWidth={1.5}
        d="m1.5 12.5 4.076 4.076a.6.6 0 0 0 .848 0L9 14M16 7l-4 4"
      />
      <path
        stroke={props.strokeColor ?? "#000"}
        strokeLinecap="round"
        strokeWidth={1.5}
        d="m7 12 4.576 4.576a.6.6 0 0 0 .848 0L22 7"
      />
    </svg>
  );
}
