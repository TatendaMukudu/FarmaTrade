"use client";

import { useActionState, useRef } from "react";
import { upsertLivestock, type FarmActionState } from "./actions";
import { TextField, NumberField, SelectField, SubmitButton, FormError } from "./fields";
import { LIVESTOCK_SPECIES, LIVESTOCK_SPECIES_LABEL, LIVESTOCK_SEX, LIVESTOCK_SEX_LABEL } from "@/lib/enums";
import type { Livestock } from "@/generated/prisma/client";

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
        options={LIVESTOCK_SPECIES}
        labels={LIVESTOCK_SPECIES_LABEL}
      />
      <SelectField
        label="Sex"
        name="sex"
        defaultValue={initial?.sex}
        options={LIVESTOCK_SEX}
        labels={LIVESTOCK_SEX_LABEL}
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
        <button type="button" onClick={onDone} className="text-xs text-muted-fg underline">
          Cancel
        </button>
      )}
      {state.error && <FormError message={state.error} />}
    </form>
  );
}
