export function NoVisibleSvg(props) {
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
        fill={props.fillColor ?? "black"}
        fillRule="evenodd"
        d="m10.648 10.526 2.826 2.826a2 2 0 0 0-2.826-2.826Z"
        clipRule="evenodd"
      />
      <path
        fill={props.fillColor ?? "black"}
        fillRule="evenodd"
        d="M14.121 18.242a9.057 9.057 0 0 1-2.12.258c-2.255 0-4.278-.895-5.853-1.908a18.298 18.298 0 0 1-3.411-2.877 1.856 1.856 0 0 1-.119-2.4 16.3 16.3 0 0 1 2.213-2.363L6.25 10.37c-.891.76-1.562 1.541-1.97 2.066A16.27 16.27 0 0 0 7.23 14.91c1.396.897 3.04 1.59 4.77 1.59.123 0 .246-.003.369-.01l1.752 1.752Zm1.545-2.698 1.477 1.477c.245-.139.482-.283.71-.429a18.298 18.298 0 0 0 3.41-2.877 1.856 1.856 0 0 0 .12-2.4c-.574-.752-1.69-2.064-3.262-3.196C16.55 6.987 14.471 6 12.001 6c-1.772 0-3.342.507-4.668 1.212l1.494 1.494C9.786 8.276 10.85 8 12 8c1.922 0 3.599.767 4.952 1.742 1.295.932 2.247 2.022 2.77 2.694a16.27 16.27 0 0 1-2.952 2.474c-.353.227-.722.441-1.104.634Z"
        clipRule="evenodd"
      />
      <path
        stroke={props.strokeColor ?? "black"}
        strokeLinecap="round"
        strokeWidth={2}
        d="m4 5 15 15"
      />
    </svg>
  );
}
