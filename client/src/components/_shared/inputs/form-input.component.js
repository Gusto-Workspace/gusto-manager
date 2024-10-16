export default function FormInputComponent(props) {
  return (
    <div className="w-full">
      {props.label && <label>{props.label}</label>}

      <input
        type={props.type || "text"}
        name={props.name}
        placeholder={props.placeholder}
        {...props.register(props.name, { required: props.required })}
        className={`${props.className || "border p-2 w-full rounded-lg"} ${
          props.errors[props.name] ? "border-red" : ""
        }`}
      />
    </div>
  );
}
