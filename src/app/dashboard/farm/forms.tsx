"use client";

import { useActionState, useRef } from "react";
import {
  upsertLivestock,
  upsertProduce,
  upsertEquipment,
  type FarmActionState,
} from "./actions";
import type { Livestock, ProduceStock, Equipment } from "@/generated/prisma/client";

const initialState: FarmActionState = {};

export function LivestockForm({
  initial,
  onDone,
}: {
  initial?: Livestock;
  onDone?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: FarmActionState, formData: FormData) => {
      const result = await upsertLivestock(prev, formData);
      if (!result.error) {
        formRef.current?.reset();
        onDone?.();
      }
      return result;
    },
    initialState,
  );

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4"
    >
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <SelectField
        label="Species"
        name="species"
        defaultValue={initial?.species}
        options={["CATTLE", "GOAT", "SHEEP", "PIG", "POULTRY", "OTHER"]}
      />
      <SelectField
        label="Sex"
        name="sex"
        defaultValue={initial?.sex}
        options={["MALE", "FEMALE", "MIXED"]}
      />
      <TextField label="Breed (optional)" name="breed" defaultValue={initial?.breed ?? undefined} />
      <NumberField
        label="Quantity"
        name="quantity"
        defaultValue={String(initial?.quantity ?? 1)}
      />
      <TextField label="Notes (optional)" name="notes" defaultValue={initial?.notes ?? undefined} />
      <SubmitButton pending={pending} label={initial ? "Save" : "Add livestock"} />
      {onDone && (
        <button type="button" onClick={onDone} className="text-xs text-gray-500 underline">
          Cancel
        </button>
      )}
      {state.error && <Error message={state.error} />}
    </form>
  );
}

export function ProduceForm({
  initial,
  onDone,
}: {
  initial?: ProduceStock;
  onDone?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: FarmActionState, formData: FormData) => {
      const result = await upsertProduce(prev, formData);
      if (!result.error) {
        formRef.current?.reset();
        onDone?.();
      }
      return result;
    },
    initialState,
  );

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4"
    >
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <TextField label="Crop type" name="cropType" defaultValue={initial?.cropType} />
      <NumberField
        label="Quantity"
        name="quantity"
        defaultValue={String(initial?.quantity ?? 1)}
      />
      <SelectField
        label="Unit"
        name="unit"
        defaultValue={initial?.unit}
        options={["KG", "TONNE", "BAG", "CRATE", "LITRE", "HEAD"]}
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="perishable"
          defaultChecked={initial ? initial.perishable : true}
        />
        Perishable
      </label>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500" htmlFor="expectedHarvestDate">
          Expected harvest (optional)
        </label>
        <input
          id="expectedHarvestDate"
          name="expectedHarvestDate"
          type="date"
          defaultValue={initial?.expectedHarvestDate ? toDateInputValue(initial.expectedHarvestDate) : undefined}
          className="rounded-lg border border-border px-2 py-1 text-sm"
        />
      </div>
      <TextField label="Notes (optional)" name="notes" defaultValue={initial?.notes ?? undefined} />
      <SubmitButton pending={pending} label={initial ? "Save" : "Add produce"} />
      {onDone && (
        <button type="button" onClick={onDone} className="text-xs text-gray-500 underline">
          Cancel
        </button>
      )}
      {state.error && <Error message={state.error} />}
    </form>
  );
}

export function EquipmentForm({
  initial,
  onDone,
}: {
  initial?: Equipment;
  onDone?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: FarmActionState, formData: FormData) => {
      const result = await upsertEquipment(prev, formData);
      if (!result.error) {
        formRef.current?.reset();
        onDone?.();
      }
      return result;
    },
    initialState,
  );

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4"
    >
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <TextField label="Name" name="name" defaultValue={initial?.name} />
      <SelectField
        label="Category"
        name="category"
        defaultValue={initial?.category}
        options={["TRACTOR", "PLOUGH", "IRRIGATION", "TRAILER", "OTHER"]}
      />
      <TextField
        label="Condition (optional)"
        name="condition"
        defaultValue={initial?.condition ?? undefined}
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="available"
          defaultChecked={initial ? initial.available : true}
        />
        Available to lend
      </label>
      <TextField label="Notes (optional)" name="notes" defaultValue={initial?.notes ?? undefined} />
      <SubmitButton pending={pending} label={initial ? "Save" : "Add equipment"} />
      {onDone && (
        <button type="button" onClick={onDone} className="text-xs text-gray-500 underline">
          Cancel
        </button>
      )}
      {state.error && <Error message={state.error} />}
    </form>
  );
}

function TextField({
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
        type="text"
        defaultValue={defaultValue}
        className="rounded-lg border border-border px-2 py-1 text-sm"
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
        className="w-24 rounded-lg border border-border px-2 py-1 text-sm"
      />
    </div>
  );
}

function SelectField({
  label,
  name,
  options,
  defaultValue,
}: {
  label: string;
  name: string;
  options: string[];
  defaultValue?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-500" htmlFor={name}>
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        className="rounded-lg border border-border px-2 py-1 text-sm"
      >
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
      className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

function toDateInputValue(date: Date) {
  return new Date(date).toISOString().slice(0, 10);
}

function Error({ message }: { message: string }) {
  return (
    <p className="w-full text-sm text-red-600" role="alert">
      {message}
    </p>
  );
}
