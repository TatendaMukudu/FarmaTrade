"use client";

import { useActionState, useRef } from "react";
import {
  upsertLivestock,
  upsertProduce,
  upsertEquipment,
  type FarmActionState,
} from "./actions";

const initialState: FarmActionState = {};

export function LivestockForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: FarmActionState, formData: FormData) => {
      const result = await upsertLivestock(prev, formData);
      if (!result.error) formRef.current?.reset();
      return result;
    },
    initialState,
  );

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-wrap items-end gap-3 rounded border border-dashed p-4"
    >
      <SelectField
        label="Species"
        name="species"
        options={["CATTLE", "GOAT", "SHEEP", "PIG", "POULTRY", "OTHER"]}
      />
      <SelectField label="Sex" name="sex" options={["MALE", "FEMALE", "MIXED"]} />
      <TextField label="Breed (optional)" name="breed" />
      <NumberField label="Quantity" name="quantity" defaultValue="1" />
      <TextField label="Notes (optional)" name="notes" />
      <SubmitButton pending={pending} label="Add livestock" />
      {state.error && <Error message={state.error} />}
    </form>
  );
}

export function ProduceForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: FarmActionState, formData: FormData) => {
      const result = await upsertProduce(prev, formData);
      if (!result.error) formRef.current?.reset();
      return result;
    },
    initialState,
  );

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-wrap items-end gap-3 rounded border border-dashed p-4"
    >
      <TextField label="Crop type" name="cropType" />
      <NumberField label="Quantity" name="quantity" defaultValue="1" />
      <SelectField
        label="Unit"
        name="unit"
        options={["KG", "TONNE", "BAG", "CRATE", "LITRE", "HEAD"]}
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="perishable" defaultChecked />
        Perishable
      </label>
      <TextField label="Notes (optional)" name="notes" />
      <SubmitButton pending={pending} label="Add produce" />
      {state.error && <Error message={state.error} />}
    </form>
  );
}

export function EquipmentForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: FarmActionState, formData: FormData) => {
      const result = await upsertEquipment(prev, formData);
      if (!result.error) formRef.current?.reset();
      return result;
    },
    initialState,
  );

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-wrap items-end gap-3 rounded border border-dashed p-4"
    >
      <TextField label="Name" name="name" />
      <SelectField
        label="Category"
        name="category"
        options={["TRACTOR", "PLOUGH", "IRRIGATION", "TRAILER", "OTHER"]}
      />
      <TextField label="Condition (optional)" name="condition" />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="available" defaultChecked />
        Available to lend
      </label>
      <TextField label="Notes (optional)" name="notes" />
      <SubmitButton pending={pending} label="Add equipment" />
      {state.error && <Error message={state.error} />}
    </form>
  );
}

function TextField({ label, name }: { label: string; name: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-500" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="text"
        className="rounded border px-2 py-1 text-sm"
      />
    </div>
  );
}

function NumberField({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-500" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="number"
        step="any"
        defaultValue={defaultValue}
        required
        className="w-24 rounded border px-2 py-1 text-sm"
      />
    </div>
  );
}

function SelectField({
  label,
  name,
  options,
}: {
  label: string;
  name: string;
  options: string[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-500" htmlFor={name}>
        {label}
      </label>
      <select id={name} name={name} className="rounded border px-2 py-1 text-sm">
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function SubmitButton({ pending, label }: { pending: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-black px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

function Error({ message }: { message: string }) {
  return (
    <p className="w-full text-sm text-red-600" role="alert">
      {message}
    </p>
  );
}
