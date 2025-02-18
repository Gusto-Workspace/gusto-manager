export function UserSvg(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={props.width ?? 800}
      height={props.height ?? 800}
      viewBox="0 0 16 16"
      className={props.className ?? ""}
      fill="none"
    >
      <path
        fill="#000"
        d="M8 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM14 12a3 3 0 0 0-3-3H5a3 3 0 0 0-3 3v3h12v-3Z"
      />
    </svg>
  );
}
