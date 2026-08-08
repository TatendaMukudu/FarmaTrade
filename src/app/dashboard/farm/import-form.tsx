"use client";

import { useActionState, useRef, useState } from "react";
import { importInventory, type ImportActionState } from "./actions";

const initialState: ImportActionState = {};

const TEMPLATES: Record<string, string> = {
  LIVESTOCK: "species,breed,sex,quantity,notes\nCATTLE,Brahman,MALE,5,Breeding stock",
  PRODUCE:
    "cropType,quantity,unit,perishable,expectedHarvestDate,notes\nOranges,3,TONNE,yes,2026-09-01,Ready for harvest",
  EQUIPMENT: "name,category,condition,available,notes\nJohn Deere 5075E,TRACTOR,Good,yes,",
};

export function ImportForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: ImportActionState, formData: FormData) => {
      const result = await importInventory(prev, formData);
      if (!result.error) {
        formRef.current?.reset();
        setFileName(null);
      }
      return result;
    },
    initialState,
  );

  return (
    <details className="rounded-lg border border-border bg-card px-4 py-3">
      <summary className="cursor-pointer select-none text-sm font-medium">
        Import from a spreadsheet (CSV)
      </summary>
      <form ref={formRef} action={formAction} className="mt-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-fg" htmlFor="import-category">
              Type
            </label>
            <select
              id="import-category"
              name="category"
              className="rounded-lg border border-border px-2 py-1 text-sm"
              defaultValue="PRODUCE"
            >
              <option value="LIVESTOCK">Livestock</option>
              <option value="PRODUCE">Produce</option>
              <option value="EQUIPMENT">Equipment</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
          >
            {pending ? "Importing…" : "Import"}
          </button>
        </div>

        {/* Dashed border reserved for this one spot in the app — the only
            place "drop a file here" is actually the right convention. */}
        <label
          htmlFor="import-file"
          className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed border-border bg-new-bg px-4 py-6 text-center hover:border-accent"
        >
          <span className="text-sm font-medium text-new-fg">
            {fileName ?? "Choose a CSV file"}
          </span>
          <span className="text-xs text-muted-fg">{fileName ? "Tap to change" : "or drop it here"}</span>
          <input
            id="import-file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
        </label>
      </form>

      <p className="mt-3 text-xs text-muted-fg">
        Expected columns — Livestock: {TEMPLATES.LIVESTOCK.split("\n")[0]} · Produce:{" "}
        {TEMPLATES.PRODUCE.split("\n")[0]} · Equipment: {TEMPLATES.EQUIPMENT.split("\n")[0]}
      </p>

      {state.success && <p className="mt-2 text-sm text-accent">{state.success}</p>}
      {state.error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}
      {state.skipped && state.skipped.length > 0 && (
        <ul className="mt-2 flex flex-col gap-0.5 text-xs text-red-600">
          {state.skipped.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
    </details>
  );
}
