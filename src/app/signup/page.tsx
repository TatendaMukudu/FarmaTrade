"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signupAction, type SignupState } from "./actions";
import { CountryAndLocationFields } from "@/components/location-fields";

const initialState: SignupState = {};

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(
    signupAction,
    initialState,
  );
  const [roles, setRoles] = useState<string[]>([]);

  function toggleRole(role: string) {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-12">
      <div>
        <h1 className="text-2xl font-semibold">Create your FarmaTrade account</h1>
        <p className="mt-1 text-sm text-muted-fg">
          For farm owners, buyers/sellers, and transport providers.
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        <Field label="Full name" name="name" required />
        <Field label="Email" name="email" type="email" required />
        <Field label="Password" name="password" type="password" required />
        <Field label="Phone" name="phone" />

        <div className="grid grid-cols-2 gap-4">
          <CountryAndLocationFields />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">
            What are you registering as? (pick at least one)
          </legend>
          <RoleCheckbox
            label="Farm owner"
            value="FARM"
            checked={roles.includes("FARM")}
            onChange={() => toggleRole("FARM")}
          />
          <RoleCheckbox
            label="Trader (buyer/seller)"
            value="TRADER"
            checked={roles.includes("TRADER")}
            onChange={() => toggleRole("TRADER")}
          />
          <RoleCheckbox
            label="Transport provider"
            value="TRANSPORTER"
            checked={roles.includes("TRANSPORTER")}
            onChange={() => toggleRole("TRANSPORTER")}
          />
        </fieldset>

        {roles.includes("FARM") && (
          <div className="flex flex-col gap-4 rounded-control border border-dashed p-4">
            <Field label="Farm name" name="farmName" required />
            <Field
              label="Size (hectares, optional)"
              name="sizeHectares"
              type="number"
              step="any"
            />
          </div>
        )}

        {roles.includes("TRANSPORTER") && (
          <div className="flex flex-col gap-4 rounded-control border border-dashed p-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" htmlFor="vehicleType">
                Vehicle type
              </label>
              <select
                id="vehicleType"
                name="vehicleType"
                required
                className="rounded-control border px-3 py-2 text-sm"
                defaultValue=""
              >
                <option value="" disabled>
                  Select vehicle type
                </option>
                <option value="TRUCK">Truck</option>
                <option value="REFRIGERATED_TRUCK">Refrigerated truck</option>
                <option value="PICKUP">Pickup</option>
                <option value="TRAILER">Trailer</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <Field
              label="Capacity (kg, optional)"
              name="capacityKg"
              type="number"
              step="any"
            />
            <Field label="Service region (optional)" name="serviceRegion" />
          </div>
        )}

        {state.error && (
          <p className="text-sm text-red-600" role="alert">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-control bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="text-sm text-muted-fg">
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Log in
        </Link>
      </p>
    </main>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  step,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  step?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        step={step}
        className="rounded-control border px-3 py-2 text-sm"
      />
    </div>
  );
}

function RoleCheckbox({
  label,
  value,
  checked,
  onChange,
}: {
  label: string;
  value: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        name="roles"
        value={value}
        checked={checked}
        onChange={onChange}
      />
      {label}
    </label>
  );
}
