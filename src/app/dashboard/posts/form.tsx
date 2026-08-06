"use client";

import { useActionState, useRef } from "react";
import { createPost, type PostActionState } from "./actions";
import { ZIMBABWE_PROVINCES } from "@/lib/zimbabwe";

const initialState: PostActionState = {};

export function PostForm({
  defaultProvince,
  defaultDistrict,
  defaultType = "HAVE",
  defaultCategory = "PRODUCE",
}: {
  defaultProvince: string;
  defaultDistrict: string;
  defaultType?: "HAVE" | "NEED";
  defaultCategory?: "LIVESTOCK" | "PRODUCE" | "EQUIPMENT" | "TRANSPORT";
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: PostActionState, formData: FormData) => {
      const result = await createPost(prev, formData);
      if (!result.error) formRef.current?.reset();
      return result;
    },
    initialState,
  );

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-3 rounded border border-dashed p-4"
    >
      <div className="flex flex-wrap gap-3">
        <Field label="What?">
          <select
            name="type"
            defaultValue={defaultType}
            className="rounded border px-2 py-1 text-sm"
          >
            <option value="HAVE">I have</option>
            <option value="NEED">I need</option>
          </select>
        </Field>
        <Field label="Category">
          <select
            name="category"
            defaultValue={defaultCategory}
            className="rounded border px-2 py-1 text-sm"
          >
            <option value="LIVESTOCK">Livestock</option>
            <option value="PRODUCE">Produce</option>
            <option value="EQUIPMENT">Equipment</option>
            <option value="TRANSPORT">Transport</option>
          </select>
        </Field>
      </div>

      <Field label="Title">
        <input
          name="title"
          required
          placeholder="e.g. 10 head of breeding cattle"
          className="w-full rounded border px-2 py-1 text-sm"
        />
      </Field>

      <Field label="Photos (optional, up to 4 — quality sells)">
        <input
          name="photos"
          type="file"
          accept="image/*"
          multiple
          className="w-full text-sm"
        />
      </Field>

      <div className="flex flex-wrap gap-3">
        <Field label="Quantity (optional)">
          <input
            name="quantity"
            type="number"
            step="any"
            className="w-24 rounded border px-2 py-1 text-sm"
          />
        </Field>
        <Field label="Unit (optional)">
          <input name="unit" className="w-24 rounded border px-2 py-1 text-sm" />
        </Field>
        <Field label="Price (optional)">
          <input
            name="askingPrice"
            type="number"
            step="any"
            className="w-32 rounded border px-2 py-1 text-sm"
          />
        </Field>
      </div>

      <details className="rounded border px-3 py-2 text-sm">
        <summary className="cursor-pointer select-none text-gray-600">
          More details (description, location, timing)
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <Field label="Description (optional)">
            <textarea
              name="description"
              rows={2}
              className="w-full rounded border px-2 py-1 text-sm"
            />
          </Field>

          <div className="flex flex-wrap gap-3">
            <Field label="Province">
              <select
                name="province"
                defaultValue={defaultProvince}
                className="rounded border px-2 py-1 text-sm"
              >
                {ZIMBABWE_PROVINCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="District">
              <input
                name="district"
                defaultValue={defaultDistrict}
                required
                className="rounded border px-2 py-1 text-sm"
              />
            </Field>
            <Field label="Needed by (optional)">
              <input name="neededBy" type="date" className="rounded border px-2 py-1 text-sm" />
            </Field>
          </div>

          <label className="flex w-fit items-center gap-2 text-sm">
            <input type="checkbox" name="urgent" />
            Time-sensitive (e.g. spoiling, breaking down, needed immediately)
          </label>

          <label className="flex w-fit items-center gap-2 text-sm">
            <input type="checkbox" name="recurring" />
            Standing order (e.g. "I buy this every month") — stays open and keeps matching
          </label>
        </div>
      </details>

      {state.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Posting…" : "Post"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-500">{label}</label>
      {children}
    </div>
  );
}
