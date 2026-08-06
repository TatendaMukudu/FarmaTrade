"use client";

import { useActionState, useState } from "react";
import { confirmMatch, type ConfirmActionState } from "./actions";
import { DIMENSION_LABEL, DIMENSION_QUESTION, relevantDimensions } from "@/lib/trust-core";
import type { TrustDimension } from "@/generated/prisma/enums";

const initialState: ConfirmActionState = {};

const FIELD_NAME: Record<TrustDimension, string> = {
  COMMUNICATION: "communication",
  RELIABILITY: "reliability",
  QUALITY: "quality",
  PAYMENT: "payment",
  TIMELINESS: "timeliness",
  FAIRNESS: "fairness",
};

export function ConfirmForm({
  matchId,
  counterpartyName,
  // Whether the counterparty was the one supplying goods or work, which
  // decides whether it's meaningful to ask about quality or about payment.
  counterpartyWasSupplier,
}: {
  matchId: string;
  counterpartyName: string;
  counterpartyWasSupplier: boolean;
}) {
  const [state, formAction, pending] = useActionState(confirmMatch, initialState);
  const [showDetail, setShowDetail] = useState(false);

  const dimensions = relevantDimensions({ subjectWasSupplier: counterpartyWasSupplier });

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="matchId" value={matchId} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500" htmlFor={`outcome-${matchId}`}>
            Did this go through?
          </label>
          <select
            id={`outcome-${matchId}`}
            name="outcome"
            defaultValue="COMPLETED_GOOD"
            className="rounded-lg border border-border px-2 py-1 text-sm"
          >
            <option value="COMPLETED_GOOD">Yes, went well</option>
            <option value="COMPLETED_ISSUE">Happened, but had an issue</option>
            <option value="DID_NOT_HAPPEN">Never happened</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500" htmlFor={`score-${matchId}`}>
            Rate {counterpartyName} (optional)
          </label>
          <select
            id={`score-${matchId}`}
            name="score"
            defaultValue=""
            className="rounded-lg border border-border px-2 py-1 text-sm"
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
          <label className="text-xs text-gray-500" htmlFor={`comment-${matchId}`}>
            Comment (optional)
          </label>
          <input
            id={`comment-${matchId}`}
            name="comment"
            className="rounded-lg border border-border px-2 py-1 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Saving…" : "Log outcome"}
        </button>
      </div>

      {/* Collapsed by default and never required: the detail is what makes
          the trust graph useful, but demanding five extra answers to log one
          trade is how a rating flow gets abandoned halfway — and a half-
          finished form records nothing at all. */}
      {!showDetail ? (
        <button
          type="button"
          onClick={() => setShowDetail(true)}
          className="w-fit text-xs text-gray-500 underline"
        >
          Add detail — helps others know what {counterpartyName} is good at
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-new-bg p-3">
          {dimensions.map((d) => (
            <div key={d} className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs" htmlFor={`${FIELD_NAME[d]}-${matchId}`}>
                <span className="font-medium">{DIMENSION_LABEL[d]}</span>{" "}
                <span className="text-gray-500">{DIMENSION_QUESTION[d]}</span>
              </label>
              <select
                id={`${FIELD_NAME[d]}-${matchId}`}
                name={FIELD_NAME[d]}
                defaultValue=""
                className="rounded-lg border border-border px-2 py-1 text-xs"
              >
                <option value="">Skip</option>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {"★".repeat(n)}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {state.error && (
        <p className="w-full text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
