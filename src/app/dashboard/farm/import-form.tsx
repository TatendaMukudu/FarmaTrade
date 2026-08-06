"use client";

import { useActionState, useRef } from "react";
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
  const [state, formAction, pending] = useActionState(
    async (prev: ImportActionState, formData: FormData) => {
      const result = await importInventory(prev, formData);
      if (!result.error) formRef.current?.reset();
      return result;
    },
    initialState,
  );

  return (
    <details className="rounded border px-4 py-3">
      <summary className="cursor-pointer select-none text-sm font-medium">
        Import from a spreadsheet (CSV)
      </summary>
      <form ref={formRef} action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500" htmlFor="import-category">
            Type
          </label>
          <select
            id="import-category"
            name="category"
            className="rounded border px-2 py-1 text-sm"
            defaultValue="PRODUCE"
          >
            <option value="LIVESTOCK">Livestock</option>
            <option value="PRODUCE">Produce</option>
            <option value="EQUIPMENT">Equipment</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500" htmlFor="import-file">
            CSV file
          </label>
          <input id="import-file" name="file" type="file" accept=".csv,text/csv" className="text-sm" />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-black px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Importing…" : "Import"}
        </button>
      </form>

      <p className="mt-3 text-xs text-gray-500">
        Expected columns — Livestock: {TEMPLATES.LIVESTOCK.split("\n")[0]} · Produce:{" "}
        {TEMPLATES.PRODUCE.split("\n")[0]} · Equipment: {TEMPLATES.EQUIPMENT.split("\n")[0]}
      </p>

      {state.success && <p className="mt-2 text-sm text-green-700">{state.success}</p>}
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
