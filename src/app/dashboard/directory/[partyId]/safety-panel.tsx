"use client";

import { useActionState, useState } from "react";
import {
  blockPartyAction,
  unblockPartyAction,
  reportPartyAction,
  type SafetyActionState,
} from "./safety-actions";
import { REPORT_REASONS } from "@/lib/safety-reasons";

const initialState: SafetyActionState = {};

// Kept deliberately understated and at the bottom of the profile. These
// controls have to exist and be findable the moment someone needs them, but
// a prominent "REPORT THIS PERSON" button on every profile frames every
// counterparty as a suspect — which is the opposite of what a marketplace
// that runs on trust wants people feeling as they browse.
export function SafetyPanel({
  targetId,
  targetName,
  isBlocked,
}: {
  targetId: string;
  targetName: string;
  isBlocked: boolean;
}) {
  const [showReport, setShowReport] = useState(false);
  const [state, formAction, pending] = useActionState(reportPartyAction, initialState);

  if (isBlocked) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm font-medium">You blocked {targetName}</p>
        <p className="mt-1 text-xs text-gray-500">
          Neither of you appears in the other&rsquo;s matches, network or search.
        </p>
        <form action={unblockPartyAction} className="mt-3">
          <input type="hidden" name="targetId" value={targetId} />
          <button type="submit" className="text-xs text-accent underline">
            Unblock
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      {state.done ? (
        <p className="text-sm text-gray-600">✓ {state.done}</p>
      ) : showReport ? (
        <form action={formAction} className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <input type="hidden" name="subjectId" value={targetId} />
          <p className="text-sm font-medium">Report {targetName}</p>
          <select
            name="reason"
            defaultValue=""
            required
            className="rounded-lg border border-border px-2 py-1 text-sm"
          >
            <option value="" disabled>
              What happened?
            </option>
            {REPORT_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <textarea
            name="detail"
            rows={2}
            placeholder="Anything else that would help us understand (optional)"
            className="rounded-lg border border-border px-2 py-1 text-sm"
          />
          {state.error && (
            <p className="text-sm text-red-600" role="alert">
              {state.error}
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50"
            >
              {pending ? "Sending…" : "Send report"}
            </button>
            <button
              type="button"
              onClick={() => setShowReport(false)}
              className="text-xs text-gray-500 underline"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => setShowReport(true)}
            className="text-xs text-gray-500 underline"
          >
            Report {targetName}
          </button>
          <form action={blockPartyAction}>
            <input type="hidden" name="targetId" value={targetId} />
            <button type="submit" className="text-xs text-gray-500 underline">
              Block
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
