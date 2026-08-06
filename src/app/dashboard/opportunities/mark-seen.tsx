"use client";

import { useEffect } from "react";
import { markOpportunitiesSeen } from "./actions";

// Renders nothing — exists purely to fire the "seen" write exactly once,
// on an actual client-side visit to this page, rather than as a side
// effect of the Server Component rendering (which can happen on a
// prefetch or a retry, not just a real visit).
export function MarkSeen() {
  useEffect(() => {
    markOpportunitiesSeen();
  }, []);
  return null;
}
