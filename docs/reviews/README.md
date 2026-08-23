# Checkpoint reviews

A review that isn't in the repo didn't happen.

When a phase reaches checkpoint, the second seat (see `AGENTS.md` §3) files
findings here as `P0.x-review.md`, or as a PR comment. Not a chat window —
the shared record is the truth, same discipline as the truth layer.

A review is not "I read the diff and agree". It is a re-run of the audit the
phase claimed:

1. **Run `npm run verify` yourself.** Paste the verdict. If it disagrees with
   the phase report, that is the first finding.
2. **Try to break one law.** Take a law from `AGENTS.md` §2 and attempt a
   change that violates it. If the gate stays green, the law is not really
   enforced — that is a finding about the gate, not about the phase.
3. **Check the numbers.** Test counts, migration classifications and row
   counts in a report should match what the tools output.
4. **Audit the "unknowns".** Where a phase says something is deliberately
   unresolved, confirm it is genuinely unresolved rather than defaulted —
   a null that reads as zero downstream is the failure this catches.
5. **Name what you could not check**, and why.

Findings are ranked most-severe first, each with: what is wrong, the concrete
sequence that makes it wrong, and what you would do about it. Disagreement is
welcome. The gate settles it, not seniority.
