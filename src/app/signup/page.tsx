"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signupAction, type SignupState } from "./actions";
import { ZIMBABWE_PROVINCES } from "@/lib/zimbabwe";
import { CAPABILITY_LABEL, CAPABILITY_EMOJI } from "@/lib/capabilities";
import type { Capability } from "@/generated/prisma/enums";

const initialState: SignupState = {};

// The capabilities worth offering at signup. Not all seventeen: a
// registration form is the worst possible place to make someone read a
// taxonomy, and the rest can be added from Settings once they're in.
const SIGNUP_CAPABILITIES: Capability[] = [
  "FARMER",
  "BUYER",
  "SUPPLIER",
  "TRANSPORTER",
  "MECHANIC",
  "LABOR_PROVIDER",
  "COLD_STORAGE",
  "VETERINARIAN",
];

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(
    signupAction,
    initialState,
  );
  const [capabilities, setCapabilities] = useState<string[]>([]);

  function toggleCapability(capability: string) {
    setCapabilities((prev) =>
      prev.includes(capability)
        ? prev.filter((c) => c !== capability)
        : [...prev, capability],
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-12">
      <div>
        <h1 className="text-2xl font-semibold">Create your FarmaTrade account</h1>
        <p className="mt-1 text-sm text-gray-500">
          For farm owners, buyers/sellers, and transport providers.
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        <Field label="Full name" name="name" required />
        <Field label="Email" name="email" type="email" required />
        <Field label="Password" name="password" type="password" required />
        <Field label="Phone" name="phone" />

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor="region">
              Region
            </label>
            <select
              id="region"
              name="region"
              required
              className="rounded border px-3 py-2 text-sm"
              defaultValue=""
            >
              <option value="" disabled>
                Select region
              </option>
              {ZIMBABWE_PROVINCES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <Field label="Locality" name="locality" required />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">
            What do you do? (pick everything that applies)
          </legend>
          <p className="text-xs text-gray-500">
            Most people do more than one. Each one you pick is work FarmaTrade
            can bring you.
          </p>
          <div className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {SIGNUP_CAPABILITIES.map((c) => (
              <CapabilityCheckbox
                key={c}
                label={`${CAPABILITY_EMOJI[c]} ${CAPABILITY_LABEL[c]}`}
                value={c}
                checked={capabilities.includes(c)}
                onChange={() => toggleCapability(c)}
              />
            ))}
          </div>
        </fieldset>

        {capabilities.includes("FARMER") && (
          <div className="flex flex-col gap-4 rounded border border-dashed p-4">
            <Field label="Farm name" name="farmName" required />
            <Field
              label="Size (hectares, optional)"
              name="sizeHectares"
              type="number"
              step="any"
            />
          </div>
        )}

        {capabilities.includes("TRANSPORTER") && (
          <div className="flex flex-col gap-4 rounded border border-dashed p-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" htmlFor="vehicleType">
                Vehicle type
              </label>
              <select
                id="vehicleType"
                name="vehicleType"
                required
                className="rounded border px-3 py-2 text-sm"
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
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="text-sm text-gray-500">
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
        className="rounded border px-3 py-2 text-sm"
      />
    </div>
  );
}

function CapabilityCheckbox({
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
        name="capabilities"
        value={value}
        checked={checked}
        onChange={onChange}
      />
      {label}
    </label>
  );
}
