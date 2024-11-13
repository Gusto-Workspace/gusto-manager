import { useRouter } from "next/router";
import { useContext, useState } from "react";

// REACT HOOK FORM
import { useForm } from "react-hook-form";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// AXIOS
import axios from "axios";

export default function FormAdminComponent() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const { adminContext } = useContext(GlobalContext);

  function onSubmit(data) {
    setLoading(true);
    setErrorMessage("");

    axios
      .post(`${process.env.NEXT_PUBLIC_API_URL}/admin/login`, data)

      .then((response) => {
        const { token } = response.data;
        localStorage.setItem("admin-token", token);

        adminContext.fetchOwnersList();
        adminContext.fetchSubscriptionsList();
        adminContext.fetchRestaurantsList();
        adminContext.fetchOwnersSubscriptionsList();
        adminContext.setIsAuth(true);
        router.push("/admin");
      })
      .catch((error) => {
        if (error.response && error.response.data) {
          setErrorMessage(error.response.data.message || "Login failed");
        } else {
          setErrorMessage("An error occurred. Please try again.");
        }
      })
      .finally(() => {
        setLoading(false);
      });
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

        {errorMessage && <p className="text-red-500">{errorMessage}</p>}

        <button
          type="submit"
          className="bg-black text-white rounded-full py-2 px-12 hover:bg-opacity-70 w-fit mt-6"
          disabled={loading}
        >
          {loading ? "Loading..." : "Login"}
        </button>
      </form>
    </section>
  );
}
