@AGENTS.md

# Conventions

- **No emojis.** Not in the UI, not in code, not in commit messages, not in
  docs. Plain text labels, and an inline SVG where an icon is genuinely
  needed (see `src/components/icons.tsx`). Typographic symbols are text, not
  decoration. Enforced by `scripts/invariants.mjs`.
- **A farmer's own words survive.** Crop names, units and prices are stored
  exactly as typed, with canonical identity recorded alongside — never
  instead.
