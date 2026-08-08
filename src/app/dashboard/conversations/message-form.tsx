"use client";

import { useRef } from "react";
import { sendMessage } from "./actions";

export function MessageForm({ matchId }: { matchId: string }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData: FormData) => {
        await sendMessage(formData);
        formRef.current?.reset();
      }}
      className="flex gap-2"
    >
      <input type="hidden" name="matchId" value={matchId} />
      <input
        name="body"
        required
        placeholder="Write a message…"
        className="flex-1 rounded border px-3 py-2 text-sm"
        autoComplete="off"
      />
      <button
        type="submit"
        className="rounded bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
      >
        Send
      </button>
    </form>
  );
}
