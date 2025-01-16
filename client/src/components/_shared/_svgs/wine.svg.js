export function WineSvg(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={props.width ?? 800}
      height={props.height ?? 800}
      baseProfile="tiny"
      viewBox="-63 65 128 128"
      className={props.className ?? ""}
    >
      <path
        stroke={props.strokeColor ?? "black"}
        fill={props.fillColor ?? "black"}
        d="m-9.9 184.1-15.8-2V155c30.2-9.2 13.4-43.1 10.1-52.1h-27.9c-3.3 9-20.1 42.9 10.1 52.1v27.1l-15.8 2c-1.1.1-1.8 1.1-1.7 2.2.1 1.1 1 1.7 2.2 1.7h38.3c1.2 0 2.1-.6 2.2-1.7.1-1.1-.7-2.1-1.7-2.2m49.4-84.7V69.5H24v29.9c-8.1 2-14.2 9.3-14.2 18v66.9c0 2.1 1.7 3.7 3.7 3.7h36.4c2 0 3.7-1.7 3.7-3.7v-66.9c0-8.7-6-16-14.1-18zm9.5 64.2H14.4V129H49v34.6z"
      />
    </svg>
  );
}
