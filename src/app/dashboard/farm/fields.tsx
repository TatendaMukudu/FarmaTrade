// Shared field primitives for the Farm inventory forms — the layer the
// three per-category forms build on, not duplicated inside each of them.
export function TextField({
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

export function NumberField({
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

export function SelectField({
  label,
  name,
  options,
  labels,
  defaultValue,
}: {
  label: string;
  name: string;
  options: readonly string[];
  labels?: Record<string, string>;
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
            {labels?.[o] ?? o}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SubmitButton({ pending, label }: { pending: boolean; label: string }) {
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

export function toDateInputValue(date: Date) {
  return new Date(date).toISOString().slice(0, 10);
}

export function FormError({ message }: { message: string }) {
  return (
    <p className="w-full text-sm text-red-600" role="alert">
      {message}
    </p>
  );
}
