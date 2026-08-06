"use client";

import { cloneElement, isValidElement, useState, type ReactElement } from "react";

type Closable = { onDone?: () => void };

// Turns "a form is always sitting open under every section" into "a list
// with an add action" — the form only exists while you're actually adding
// something.
//
// `children` is a plain element (e.g. <LivestockForm />), not a render-prop
// function — a function can't cross the Server → Client Component boundary
// (App Router props must be serializable), so the onDone callback is wired
// up here, client-side only, via cloneElement.
export function AddToggle({
  label,
  defaultOpen = false,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  children: ReactElement<Closable>;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-fit rounded-lg border border-accent px-4 py-2 text-sm font-medium text-accent hover:bg-accent hover:text-accent-foreground"
      >
        + {label}
      </button>
    );
  }

  return isValidElement(children) ? cloneElement(children, { onDone: () => setOpen(false) }) : children;
}
