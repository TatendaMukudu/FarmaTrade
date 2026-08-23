# Checkpoint 2 adversarial review — a18e125

Reviewer: Claude. Implementer: Codex. Reviewed SHA:
**`a18e12507365c330e3f7547b5370f13bc4b03f37`**, diffed against
**`40c6eee796a1258799e5dd5252889ed672690fd3`**.

Everything below was reproduced against that exact SHA. Nothing is taken from
the implementation summary.

## Verdict: **CHECKPOINT 2 FAIL**

One reproducible regression and one required correction, both small. Every
other claim in the report is accurate and the commercial kernel is untouched.

---

## Diff scope

25 files. **No `prisma/schema.prisma`, no `prisma/migrations/`, no domain
rewrite.** The only domain-adjacent files are three server loaders extracted
verbatim (`farm-data.ts`, `network-data.ts`, `opportunity-data.ts`) — I diffed
the Farm extraction query-by-query and it is identical to what
`farm/page.tsx` ran before. Farm write actions are not in the diff at all.

`scripts/invariants.mjs` changed, which is the one file that can launder
everything else. It adds `navigation.ts` and `network-route.ts` to the
`domain-core-is-database-free` list. That **strengthens** the law. Nothing was
weakened.

## What I reproduced and confirmed true

| Claim | Result |
|---|---|
| Primary nav is exactly Home · Trade · Network · You | **Confirmed in a real browser.** Bottom tabs read `[Home, Trade, Network, You]` at 320, 360 and 390px |
| Unconditional shape | **Confirmed.** `hasFarm` removed from layout and both nav components; all four `alwaysVisible: true` |
| Network canonical, Directory redirects | **Confirmed authenticated.** `/dashboard/directory` → `/dashboard/network`; `?role=FARM` preserved and honoured by the target; `/dashboard/directory/{id}` → `/dashboard/network/{id}` rendering the right party |
| Farm canonical at `/dashboard/farm` | **Confirmed.** Route unmoved, loader extraction only |
| Opportunities reachable, off primary nav | **Confirmed.** Renders; no residual `/dashboard/directory` link anywhere in `src/`; `revalidatePath` updated to `/dashboard/network` |
| `/dashboard/intent`, `/dashboard/posts` intact | **Confirmed.** `intent?side=DEMAND` → DEMAND; `posts?type=HAVE` → `side=SUPPLY`; `posts?type=NEED` → `side=DEMAND` |
| No schema/migration | **Confirmed** |
| Full gate PASS 7/7, 620 passed / 4 skipped | **Reproduced exactly** |
| No horizontal overflow at 320/360/390 | **Reproduced.** `scrollWidth === innerWidth` on all seven routes at all three widths |
| Primary mobile targets exceed 44×44 | **Confirmed for navigation:** 80×47, 90×47, 98×47. See non-blocking note on content controls |

Two further checks the report did not claim:

**Identity safety is unchanged by the rename.** I ran the full relationship
matrix against `canSeeContactDetails`: no relationship, suggested match,
negotiating, agreed (both directions), completed, signed out, and an unrelated
third party. All seven behave exactly as before. The Network profile gates on
the same predicate. **A route rename did not widen visibility.**

**Active state never highlights the wrong destination.** Across nine real
routes, at most one destination is ever active.

**The spec tests were created verbatim.** `navigation.test.ts` and
`network-route.test.ts` match the specification character-for-character; no
assertion was weakened. The `trade-route.test.ts` edit replaces a brittle
grep of `dashboard-nav.tsx` with a structural assertion against
`PRIMARY_DESTINATIONS` — stronger, not weaker.

---

## BLOCKER 1 — You presents a dead Farm link to every party without a farm

**Route/state:** signed in as a party with no `Farm` row (any `TRADER` or
`TRANSPORTER` — i.e. a large share of pilot participants).

**Reproduction:**

1. Create a party with `roles: ["TRADER"]` and no farm.
2. Open `/dashboard/you`. The Farm card renders:
   `href="/dashboard/farm"`, copy *"Your farm records will appear here when a
   farm is added."*
3. Tap it.

**Expected:** either no Farm entry, or a non-interactive entry explaining why
there is nothing there.

**Actual:** `/dashboard/farm` hits `if (!party?.farm) redirect("/dashboard")`
and the user lands silently on Home. Measured: landed on `/dashboard`, `h1`
= `"0 opportunities found"`. No explanation, no way back to what they tapped.

**Why this is a Checkpoint 2 regression rather than pre-existing:** the old
navigation gated Farm behind `hasFarm`, so a farmless party never saw a Farm
entry. Removing `hasFarm` was correct for the four-destination shape, but the
condition it encoded was dropped rather than moved. You now offers the link
unconditionally.

**Commercial consequence:** `farm.create` exists in exactly one place —
`src/app/signup/actions.ts`. There is **no post-signup path to create a
farm**. So this is not a transient empty state a user can resolve; a trader
who taps Farm is bounced to Home every time, forever. A pilot participant's
first read of the product is that a whole destination is broken.

**Smallest correction:** in `you/page.tsx`, when `party.farm` is absent,
render the Farm entry as non-interactive with its existing explanatory copy
(or omit it). Do not link to a route that redirects away. No change to
`farm/page.tsx`, no new farm-creation flow — that is Checkpoint 3 or later
scope.

---

## BLOCKER 2 — four routes leave the navigation with no active destination

**Reproduction:** `isDestinationActive(pathname, href)` against every real
route:

```
/dashboard                   Home
/dashboard/trade             Trade
/dashboard/network           Network
/dashboard/network/p1        Network
/dashboard/you               You
/dashboard/farm              *** NO ACTIVE TAB ***
/dashboard/opportunities     *** NO ACTIVE TAB ***
/dashboard/settings          *** NO ACTIVE TAB ***
/dashboard/conversations/m1  *** NO ACTIVE TAB ***
```

**Expected:** a route owned by a destination lights that destination.

**Actual:** nothing is lit. Nothing is *wrongly* lit — the sibling-prefix trap
is handled correctly (`/dashboard/networking` does not match
`/dashboard/network`) — but on mobile, where the bottom bar is the only
orientation a farmer has, tapping You → Farm turns the whole bar grey.

**Why this is a Checkpoint 2 regression:** Farm and Opportunities each had
their own lit tab before. The checkpoint removed that feedback without
replacing it.

**This one is my fault as much as Codex's.** My specification's B1 only pinned
Home-only behaviour and section-children behaviour; it never required
sub-route ownership, so Codex satisfied the letter of the spec. The spec was
incomplete.

**Smallest correction:** map owned sub-routes to their destination — Farm,
Settings and conversations to You; Opportunities to whichever destination the
founder considers its home. **Note the ambiguity:** You currently labels
`/dashboard/opportunities` as "Trade history", which argues for You, while the
concept argues for Trade or Home. That is a product question, not an
implementation one — Codex should ask rather than pick.

---

## Non-blocking — properly Checkpoint 3

1. **Content touch targets below 44px.** Farm `Edit` 21×16 and `Remove` 45×16;
   Network role filters 30px tall; Home `See all` 30px. **Pre-existing**
   (introduced in `bbed60b`, before this checkpoint) and outside the "primary
   mobile targets" the report claimed. Belongs to the Checkpoint 3 mobile pass.
2. **`/dashboard/settings` has four entry points** — You > Profile
   (`#profile`, and the anchor does exist), You > Settings, the desktop
   sidebar footer, and the mobile header. Two of five You entries land on the
   same page. Duplicate ownership; a Checkpoint 3 IA/copy question.
3. **You uses `SettingsIcon` for itself**, which reads as "settings" rather
   than "you". Cosmetic.
4. **Headings not yet in V1 language** — Opportunities still says
   "Opportunities", Trade says "Supply & needs". Expected Checkpoint 3 copy
   work, explicitly not a blocker now.

## Withdrawn

I initially flagged `/dashboard/intent?type=NEED` as failing to normalise to
`side=DEMAND` while `posts` does. That URL never existed — `/dashboard/intent`
has always used `side=`, and `intent?side=DEMAND` resolves correctly. Not a
defect; recorded because a review that only lists the findings that survived
is not an audit.

---

## What Codex must correct before Checkpoint 3

1. Blocker 1 — the dead Farm link in You.
2. Blocker 2 — sub-route active state, after asking the founder where
   Opportunities belongs.

Everything else in Checkpoint 2 is sound. The IA is right, the redirects are
right, the kernel is untouched, and the safety boundary held under attack.
