export function RestaurantSvg(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={props.width ?? 800}
      height={props.height ?? 800}
      viewBox="0 0 24 24"
      fill={props.fillColor ?? "black"}
    >
      <path
        fill={props.fillColor ?? "black"}
        fillRule="evenodd"
        d="M13.993 3.434a3 3 0 0 0-3.986 0l-7.671 6.819a1 1 0 1 0 1.328 1.494L4 11.45v5.617c0 .886 0 1.65.082 2.262.088.655.287 1.284.797 1.793.51.51 1.138.709 1.793.797C7.284 22 8.048 22 8.934 22h6.132c.886 0 1.65 0 2.262-.082.655-.088 1.284-.287 1.793-.797.51-.51.709-1.138.797-1.793.082-.612.082-1.376.082-2.262v-5.617l.336.298a1 1 0 0 0 1.328-1.494l-7.67-6.82ZM12 16a1 1 0 0 0-1 1v2a1 1 0 1 1-2 0v-2a3 3 0 1 1 6 0v2a1 1 0 1 1-2 0v-2a1 1 0 0 0-1-1Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
