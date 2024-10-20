export function NotificationSvg(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={props.width ?? 24}
      height={props.height ?? 24}
      viewBox="0 0 24 24"
      fill={props.fillColor ?? "black"}
    >
     <path d="M20 18H4l2-2v-6a6 6 0 0 1 5-5.91V3a1 1 0 0 1 2 0v1.09a5.9 5.9 0 0 1 1.3.4A3.992 3.992 0 0 0 18 10v6Zm-8 4a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2Zm6-18a2 2 0 1 0 2 2 2 2 0 0 0-2-2Z" />
    </svg>
  );
}
