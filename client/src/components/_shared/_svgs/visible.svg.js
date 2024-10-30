export function VisibleSvg(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={props.width ?? 800}
      height={props.height ?? 800}
      fill="none"
      viewBox="0 0 24 24"
      className={props.className ?? ""}
    >
      <path
        stroke={props.strokeColor ?? "black"}
        strokeWidth={2}
        d="M12 7c-4.393 0-7.51 3.508-8.587 4.92-.259.34-.234.801.057 1.115C4.666 14.325 8.015 17.5 12 17.5c3.985 0 7.334-3.176 8.53-4.465a.856.856 0 0 0 .056-1.114C19.51 10.508 16.394 7 12 7Z"
      />
      <path
        fill={props.fillColor ?? "black"}
        d="M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z"
      />
    </svg>
  );
}
