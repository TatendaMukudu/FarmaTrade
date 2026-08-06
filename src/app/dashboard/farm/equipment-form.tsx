"use client";

import { useActionState, useRef } from "react";
import { upsertEquipment, type FarmActionState } from "./actions";
import { TextField, SelectField, SubmitButton, FormError } from "./fields";
import { EQUIPMENT_CATEGORY, EQUIPMENT_CATEGORY_LABEL } from "@/lib/enums";
import type { Equipment } from "@/generated/prisma/client";

const initialState: FarmActionState = {};

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
        options={EQUIPMENT_CATEGORY}
        labels={EQUIPMENT_CATEGORY_LABEL}
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
      {state.error && <FormError message={state.error} />}
    </form>
  );
}
