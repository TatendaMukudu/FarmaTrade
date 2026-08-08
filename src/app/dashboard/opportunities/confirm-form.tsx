"use client";

import { useActionState } from "react";
import { confirmMatch, type ConfirmActionState } from "./actions";

const initialState: ConfirmActionState = {};

export function ConfirmForm({
  matchId,
  counterpartyName,
}: {
  matchId: string;
  counterpartyName: string;
}) {
  const [state, formAction, pending] = useActionState(
    confirmMatch,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="matchId" value={matchId} />
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-fg" htmlFor={`outcome-${matchId}`}>
          Did this go through?
        </label>
        <select
          id={`outcome-${matchId}`}
          name="outcome"
          defaultValue="COMPLETED_GOOD"
          className="rounded border px-2 py-1 text-sm"
        >
          <option value="COMPLETED_GOOD">Yes, went well</option>
          <option value="COMPLETED_ISSUE">Happened, but had an issue</option>
          <option value="DID_NOT_HAPPEN">Never happened</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-fg" htmlFor={`score-${matchId}`}>
          Rate {counterpartyName} (optional)
        </label>
        <select
          id={`score-${matchId}`}
          name="score"
          defaultValue=""
          className="rounded border px-2 py-1 text-sm"
        >
          <option value="">No rating</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {"★".repeat(n)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-fg" htmlFor={`comment-${matchId}`}>
          Comment (optional)
        </label>
        <input
          id={`comment-${matchId}`}
          name="comment"
          className="rounded border px-2 py-1 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
      >
        {pending ? "Saving…" : "Log outcome"}
      </button>
      {state.error && (
        <p className="w-full text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
