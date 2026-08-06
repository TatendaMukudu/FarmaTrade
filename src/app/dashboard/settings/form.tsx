"use client";

import { useActionState } from "react";
import { updateProfile, type ProfileActionState } from "./actions";
import { ZIMBABWE_PROVINCES } from "@/lib/zimbabwe";
import type { getCurrentParty } from "@/lib/auth";

const initialState: ProfileActionState = {};

type PartyWithFacets = NonNullable<Awaited<ReturnType<typeof getCurrentParty>>>;

export function ProfileForm({ party }: { party: PartyWithFacets }) {
  const [state, formAction, pending] = useActionState(
    updateProfile,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="Name" name="name" defaultValue={party.name} required />
      <Field label="Phone (optional)" name="phone" defaultValue={party.phone ?? ""} />

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium" htmlFor="contactDetails">
          Other contact details (optional)
        </label>
        <textarea
          id="contactDetails"
          name="contactDetails"
          rows={2}
          defaultValue={party.contactDetails ?? ""}
          placeholder="Office line, sales email, who to ask for — whatever's useful for a stranger to reach you"
          className="rounded-lg border border-border px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor="province">
            Province
          </label>
          <select
            id="province"
            name="province"
            required
            defaultValue={party.province}
            className="rounded-lg border border-border px-3 py-2 text-sm"
          >
            {ZIMBABWE_PROVINCES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <Field label="District" name="district" defaultValue={party.district} required />
      </div>

      {party.farm && (
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium">Farm</p>
          <Field label="Farm name" name="farmName" defaultValue={party.farm.farmName} required />
          <Field
            label="Size (hectares, optional)"
            name="sizeHectares"
            type="number"
            step="any"
            defaultValue={party.farm.sizeHectares?.toString() ?? ""}
          />
        </div>
      )}

      {party.transportProfile && (
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium">Transport</p>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor="vehicleType">
              Vehicle type
            </label>
            <select
              id="vehicleType"
              name="vehicleType"
              required
              defaultValue={party.transportProfile.vehicleType}
              className="rounded-lg border border-border px-3 py-2 text-sm"
            >
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
            defaultValue={party.transportProfile.capacityKg?.toString() ?? ""}
          />
          <Field
            label="Service region (optional)"
            name="serviceRegion"
            defaultValue={party.transportProfile.serviceRegion ?? ""}
          />
        </div>
      )}

      {state.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="text-sm text-green-700" role="status">
          Saved.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required,
  step,
}: {
  label: string;
  name: string;
  defaultValue?: string;
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
        defaultValue={defaultValue}
        required={required}
        step={step}
        className="rounded-lg border border-border px-3 py-2 text-sm"
      />
    </div>
  );
}
