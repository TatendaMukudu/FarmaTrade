import type { ReportReason } from "@/generated/prisma/enums";

// Report reasons in the words a farmer would actually use, not moderation
// jargon. A reason list nobody recognises themselves in gets answered with
// "Other" every time, and "Other" tells a reviewer nothing.
//
// Split from safety.ts because that file is `server-only` and the report
// form is a client component — the labels have to reach both.
export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "SCAM", label: "Took payment and never delivered" },
  { value: "MISREPRESENTED_GOODS", label: "Goods weren't what was described" },
  { value: "NO_SHOW", label: "Agreed a deal, then never showed up" },
  { value: "ABUSIVE", label: "Abusive or threatening messages" },
  { value: "SPAM", label: "Spam or repeated irrelevant posts" },
  { value: "FAKE_ACCOUNT", label: "Account is impersonating someone" },
  { value: "OTHER", label: "Something else" },
];
