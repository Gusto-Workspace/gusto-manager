import { useForm } from "react-hook-form";

export default function FormAdminComponent() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  function onSubmit(data) {
    console.log("Login data:", data);
  }

  return (
    <section className="bg-white flex flex-col justify-center items-center gap-8 rounded-xl p-12 w-[500px]">
      <h1 className="text-4xl">Gusto</h1>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full flex flex-col items-center gap-4"
      >
        <div className="flex flex-col gap-2 items-center w-full">
          <input
            id="email"
            type="email"
            placeholder="Email"
            className={`border rounded-lg p-2 w-full ${errors.email ? "border-red" : ""}`}
            {...register("email", { required: "Email is required" })}
          />
        </div>

        <div className="flex flex-col gap-2 items-center w-full">
          <input
            id="password"
            type="password"
            placeholder="Password"
            className={`border rounded-lg p-2 w-full ${errors.password ? "border-red" : ""}`}
            {...register("password", { required: "Password is required" })}
          />
        </div>

        <button
          type="submit"
          className="bg-black text-white rounded-full py-2 px-12 hover:bg-opacity-70 w-fit mt-6"
        >
          Login
        </button>
      </form>
    </section>
  );
}
