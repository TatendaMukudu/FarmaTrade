"use client";

import { useActionState, useRef, useState } from "react";
import { createPost, type PostActionState } from "./actions";
import { ZIMBABWE_PROVINCES, CURRENCIES } from "@/lib/zimbabwe";
import { CATEGORY_LABEL } from "@/lib/categories";
import { OBJECTIVES, COMMON_OBJECTIVES, categoriesForObjective } from "@/lib/objectives";
import type { Objective } from "@/generated/prisma/enums";

const initialState: PostActionState = {};

// The composer asks "what are you trying to accomplish?" and derives
// everything it can from the answer. Picking an objective sets the
// direction (HAVE/NEED) and the vertical, so the two questions that used to
// come first — "I have / I need" and "which category" — are gone: they were
// asking the user to describe the platform's data model rather than their
// own business.
export function PostForm({
  defaultProvince,
  defaultDistrict,
  defaultObjective,
  onDone,
}: {
  defaultProvince: string;
  defaultDistrict: string;
  defaultObjective?: Objective;
  onDone?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [objective, setObjective] = useState<Objective | null>(defaultObjective ?? null);
  const [state, formAction, pending] = useActionState(
    async (prev: PostActionState, formData: FormData) => {
      const result = await createPost(prev, formData);
      if (!result.error) {
        formRef.current?.reset();
        setObjective(null);
        onDone?.();
      }
      return result;
    },
    initialState,
  );

  // Step one is the only question on screen until it's answered. A farmer
  // who opens this to sell oranges shouldn't have to look at destination
  // provinces and travel dates to find the field they need.
  if (!objective) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-lg font-medium">What are you trying to do?</h2>
        <p className="mt-1 text-sm text-gray-500">
          Pick the closest one — FarmaTrade works out the rest.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {COMMON_OBJECTIVES.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setObjective(o)}
              className="flex items-center gap-3 rounded-lg border border-border px-3 py-3 text-left text-sm hover:border-accent hover:bg-new-bg"
            >
              <span className="text-xl">{OBJECTIVES[o].emoji}</span>
              <span>{OBJECTIVES[o].prompt}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const spec = OBJECTIVES[objective];
  const categories = categoriesForObjective(objective);
  const isTransport = spec.category === "TRANSPORT";

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <input type="hidden" name="objective" value={objective} />

      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-medium">
          <span className="text-xl">{spec.emoji}</span>
          {spec.prompt}
        </p>
        <button
          type="button"
          onClick={() => setObjective(null)}
          className="shrink-0 text-xs text-gray-500 underline"
        >
          Change
        </button>
      </div>

      {/* Only shown when the objective genuinely spans verticals (SELL/BUY).
          For everything else the category is implied and asking would be
          busywork. */}
      {categories.length > 1 ? (
        <Field label="What kind?">
          <select
            name="category"
            defaultValue={categories[0]}
            className="rounded-lg border border-border px-2 py-1 text-sm"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <input type="hidden" name="category" value={categories[0]} />
      )}

      <Field label="Describe it in a few words">
        <input
          name="title"
          required
          placeholder="e.g. 10 head of breeding cattle"
          className="w-full rounded-lg border border-border px-2 py-1 text-sm"
        />
      </Field>

      <Field label="Photos (optional, up to 4 — quality sells)">
        <input name="photos" type="file" accept="image/*" multiple className="w-full text-sm" />
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
        <Field label="Currency">
          <select
            name="currency"
            defaultValue="USD"
            className="rounded-lg border border-border px-2 py-1 text-sm"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {isTransport && (
        <div className="flex flex-wrap gap-3 rounded-lg bg-new-bg p-3">
          <Field label="Destination region (optional)">
            <select
              name="destinationProvince"
              defaultValue=""
              className="rounded-lg border border-border px-2 py-1 text-sm"
            >
              <option value="">Not sure yet</option>
              {ZIMBABWE_PROVINCES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Destination locality (optional)">
            <input
              name="destinationDistrict"
              placeholder="e.g. Harare"
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
        <summary className="cursor-pointer select-none text-gray-600">
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
            <Field label={isTransport ? "Starting region" : "Region"}>
              <select
                name="region"
                defaultValue={defaultProvince}
                className="rounded-lg border border-border px-2 py-1 text-sm"
              >
                {ZIMBABWE_PROVINCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={isTransport ? "Starting locality" : "Locality"}>
              <input
                name="locality"
                defaultValue={defaultDistrict}
                required
                className="rounded-lg border border-border px-2 py-1 text-sm"
              />
            </Field>
            <Field label="Needed by (optional)">
              <input
                name="neededBy"
                type="date"
                className="rounded-lg border border-border px-2 py-1 text-sm"
              />
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
        {pending ? "Posting…" : "Post it"}
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
