"use client";

import { useActionState, useRef, useState } from "react";
import { createPost, type PostActionState } from "./actions";
import { regionFor } from "@/lib/regions";
import { CATEGORY_LABEL } from "@/lib/categories";
import type { PostCategory as Category } from "@/generated/prisma/enums";

const initialState: PostActionState = {};

export function PostForm({
  countryCode,
  defaultProvince,
  defaultDistrict,
  defaultType = "HAVE",
  defaultCategory = "PRODUCE",
  onDone,
}: {
  countryCode: string;
  defaultProvince: string;
  defaultDistrict: string;
  defaultType?: "HAVE" | "NEED";
  defaultCategory?: Category;
  onDone?: () => void;
}) {
  const region = regionFor(countryCode);
  const formRef = useRef<HTMLFormElement>(null);
  const [category, setCategory] = useState<Category>(defaultCategory);
  const [state, formAction, pending] = useActionState(
    async (prev: PostActionState, formData: FormData) => {
      const result = await createPost(prev, formData);
      if (!result.error) {
        formRef.current?.reset();
        setCategory(defaultCategory);
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
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex flex-wrap gap-3">
        <Field label="What?">
          <select
            name="type"
            defaultValue={defaultType}
            className="rounded-lg border border-border px-2 py-1 text-sm"
          >
            <option value="HAVE">I have</option>
            <option value="NEED">I need</option>
          </select>
        </Field>
        <Field label="Category">
          <select
            name="category"
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            className="rounded-lg border border-border px-2 py-1 text-sm"
          >
            {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Title">
        <input
          name="title"
          required
          placeholder="e.g. 10 head of breeding cattle"
          className="w-full rounded-lg border border-border px-2 py-1 text-sm"
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
            className="w-24 rounded-lg border border-border px-2 py-1 text-sm"
          />
        </Field>
        <Field label="Unit (optional)">
          <input name="unit" className="w-24 rounded-lg border border-border px-2 py-1 text-sm" />
        </Field>
        <Field label="Price (optional)">
          <input
            name="askingPrice"
            type="number"
            step="any"
            className="w-32 rounded-lg border border-border px-2 py-1 text-sm"
          />
        </Field>
      </div>

      {category === "TRANSPORT" && (
        <div className="flex flex-wrap gap-3 rounded-lg bg-new-bg p-3">
          <Field label={`Destination ${region.labels.level1.toLowerCase()} (optional)`}>
            <select
              name="destinationProvince"
              defaultValue=""
              className="rounded-lg border border-border px-2 py-1 text-sm"
            >
              <option value="">Not sure yet</option>
              {region.level1.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Destination ${region.labels.level2.toLowerCase()} (optional)`}>
            <input
              name="destinationDistrict"
              placeholder={region.labels.level2}
              className="rounded-lg border border-border px-2 py-1 text-sm"
            />
          </Field>
          <Field label="Travel date (optional)">
            <input
              name="travelDate"
              type="date"
              className="rounded-lg border border-border px-2 py-1 text-sm"
            />
          </Field>
        </div>
      )}

      <details className="rounded-lg border border-border px-3 py-2 text-sm">
        <summary className="cursor-pointer select-none text-muted-fg">
          More details (description, location, timing)
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <Field label="Description (optional)">
            <textarea
              name="description"
              rows={2}
              className="w-full rounded-lg border border-border px-2 py-1 text-sm"
            />
          </Field>

          <div className="flex flex-wrap gap-3">
            <Field
              label={
                category === "TRANSPORT"
                  ? `Starting ${region.labels.level1.toLowerCase()}`
                  : region.labels.level1
              }
            >
              {region.level1.length > 0 ? (
                <select
                  name="province"
                  defaultValue={defaultProvince}
                  className="rounded-lg border border-border px-2 py-1 text-sm"
                >
                  {region.level1.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  name="province"
                  defaultValue={defaultProvince}
                  required
                  className="rounded-lg border border-border px-2 py-1 text-sm"
                />
              )}
            </Field>
            <Field
              label={
                category === "TRANSPORT"
                  ? `Starting ${region.labels.level2.toLowerCase()}`
                  : region.labels.level2
              }
            >
              <input
                name="district"
                defaultValue={defaultDistrict}
                required
                className="rounded-lg border border-border px-2 py-1 text-sm"
              />
            </Field>
            <Field label="Needed by (optional)">
              <input name="neededBy" type="date" className="rounded-lg border border-border px-2 py-1 text-sm" />
            </Field>
          </div>

          <label className="flex w-fit items-center gap-2 text-sm">
            <input type="checkbox" name="urgent" />
            Time-sensitive (e.g. spoiling, breaking down, needed immediately)
          </label>

          <label className="flex w-fit items-center gap-2 text-sm">
            <input type="checkbox" name="recurring" />
            Standing order (e.g. &ldquo;I buy this every month&rdquo;) — stays open and keeps matching
          </label>

          {/* Off by default. Local matches keep coming either way; this only
              adds international ones, and only from posts that also ticked
              it — so nobody is ever shown a border they didn't ask to cross. */}
          <label className="flex w-fit items-center gap-2 text-sm">
            <input type="checkbox" name="openToCrossBorder" />
            Open to buyers and sellers in other countries — adds international
            matches on top of your local ones
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
        className="w-fit rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
      >
        {pending ? "Posting…" : "Post"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-fg">{label}</label>
      {children}
    </div>
  );
}
