export default function FormInputComponent(props) {
  const getError = (errors, path) => {
    return path.split(".").reduce((acc, part) => acc && acc[part], errors);
  };

  const error = getError(props.errors, props.name);

  return (
    <div className="w-full">
      {props.label && <label>{props.label}</label>}

      <input
        type={props.type || "text"}
        name={props.name}
        disabled={props.disabled ?? false}
        placeholder={props.placeholder}
        {...props.register(props.name, { required: props.required })}
        className={`${props.className || "border border-darkBlue/20 p-2 w-full rounded-lg"} ${
          error ? "border-red" : ""
        }`}
      />
    </div>
  );
}
