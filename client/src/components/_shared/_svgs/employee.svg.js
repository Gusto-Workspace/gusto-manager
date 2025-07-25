export function EmployeeSvg(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={props.width ?? 800}
      height={props.height ?? 800}
      viewBox="0 0 36 36"
    >
      <g data-name="Layer 3">
        <circle
          fill={props.fillColor ?? "black"}
          cx={16.86}
          cy={9.73}
          r={6.46}
        />
        <path fill={props.fillColor ?? "black"} d="M21 28h7v1.4h-7z" />
        <path
          fill={props.fillColor ?? "black"}
          d="M15 30v3a1 1 0 0 0 1 1h17a1 1 0 0 0 1-1V23a1 1 0 0 0-1-1h-7v-1.47a1 1 0 0 0-2 0V22h-2v-3.58a32.12 32.12 0 0 0-5.14-.42 26 26 0 0 0-11 2.39 3.28 3.28 0 0 0-1.88 3V30Zm17 2H17v-8h7v.42a1 1 0 0 0 2 0V24h6Z"
        />
      </g>
    </svg>
  );
}
