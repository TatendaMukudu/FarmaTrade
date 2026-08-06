"use client";

import { useActionState, useRef } from "react";
import { upsertProduce, type FarmActionState } from "./actions";
import { TextField, NumberField, SelectField, SubmitButton, FormError, toDateInputValue } from "./fields";
import { PRODUCE_UNIT, PRODUCE_UNIT_LABEL } from "@/lib/enums";
import type { ProduceStock } from "@/generated/prisma/client";

const initialState: FarmActionState = {};

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
        options={PRODUCE_UNIT}
        labels={PRODUCE_UNIT_LABEL}
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
      {state.error && <FormError message={state.error} />}
    </form>
  );
}
