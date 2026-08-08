# UI notes: what to take from the platform, and what not to

FarmaTrade's visual language is its own and should stay that way. The green
accent is doing real work — it echoes produce and growth, and it already
reads as the "I have / positive" colour throughout the app. The semantic
token set in `globals.css` (`warning` / `success` / `info` / `new`) is better
thought-through than most: `new` in particular, deliberately neutral so an
empty history never reads as good or bad, is a decision a lot of products
never make.

So this is not a case for adopting the platform's look. The platform is a
dark, dense, desktop-first analytics console; FarmaTrade is a light, sparse
app for a farmer on a mid-range Android phone, possibly outdoors, possibly on
a metered connection. Those are different problems and should look different.

What follows is the parts of the platform's UI that solve problems FarmaTrade
also has, and how they'd land here.

---

## Worth taking

### 1. A spacing and radius scale, not ad-hoc values

The platform defines `--radius-sm / --radius / --radius-lg` once and uses
nothing else. FarmaTrade currently mixes `rounded`, `rounded-lg` and
`rounded-full` with no rule about which means what, and pads with whatever
looked right at the time (`px-2 py-1` in the post form, `px-3 py-1.5` on the
opportunity buttons, `p-3` and `p-4` on cards that sit next to each other).

Nothing is wrong per card; it's that the page doesn't quite line up, and the
cause is invisible until it's named. Adding a scale to `globals.css` and
picking one value per role — control, card, pill — is a small change with a
disproportionate effect on how finished the app looks.

### 2. Stat tiles that lead with the number

`.stat-card` puts a small muted label above a large bold value. FarmaTrade's
`StatLine` does the opposite: an emoji, then a full sentence at one size
(`3 active listings`), right-aligned. It reads as prose, so nothing is
scannable, and four of them stacked look like a list of notes rather than a
dashboard.

Worth borrowing the hierarchy — **3** large, "active listings" small beneath
it — while keeping FarmaTrade's own colours and its emoji, which are doing
real work for low-literacy users and should not be swapped for the platform's
abstract icons.

### 3. Skeletons instead of blank space

`.skeleton` gives the platform a loading state everywhere. FarmaTrade has
none — pages are server-rendered and simply appear, which on a slow
connection means a long nothing followed by a jump. Next's `loading.tsx`
convention plus a skeleton card would make the wait legible. This matters
more here than it does on the platform, because the connection is worse.

### 4. Empty states as a designed thing

`.empty-state` is a centred icon, a heading and a line of explanation.
FarmaTrade's empty states are bare grey sentences. The bucket work already
gives each section an honest empty line ("Nothing time-critical right now.")
— those deserve the same visual treatment rather than looking like something
failed to load.

### 5. `prefers-reduced-motion`

The platform honours it (`css/styles.css:2552`). FarmaTrade has little motion
today, but the progress bar animates and more will come. Cheap to add before
there's a lot to retrofit.

---

## Worth taking with care

### 6. The status dot

`.status-dot` with a coloured glow is a compact way to show state. It would
work for match status — but only alongside the text label, never replacing
it. Colour-only status fails for the colour-blind and in bright sunlight,
both of which are ordinary conditions here.

### 7. Bottom tab navigation

`member.css` has a `.bottom-nav` with per-tab badges. FarmaTrade's dashboard
nav is currently top-of-page, which on a phone means reaching. A bottom bar
is the right pattern for the primary surfaces — but it costs vertical space,
which is the scarcest thing on the devices this has to work on. Worth
prototyping, not worth assuming.

---

## Not worth taking

- **The dark palette.** `#0a0c14` on a phone in a field is worse than white,
  not better. FarmaTrade's light default is correct for the context.
- **The glow effects.** `--shadow-glow` and the glowing status dots read as a
  console. They also cost paint time on cheap GPUs.
- **`html { font-size: 14px }`.** The platform shrinks the root font size to
  fit more on screen. That is the wrong trade for a farmer squinting at a
  phone, and it silently overrides the user's own accessibility setting.
- **The density generally.** The platform is designed for someone at a desk
  scanning many things at once. FarmaTrade's user is deciding about one trade
  at a time.

---

## Two things FarmaTrade should fix that the platform doesn't help with

Noted here because they came up while looking, and both are more valuable
than anything above.

1. **No focus-visible styling anywhere.** Keyboard and switch users currently
   get the browser default, and in places nothing at all. This is the single
   biggest accessibility gap in the app.

2. **Contrast on the muted greys.** `text-gray-400` on white is around 2.8:1,
   below the 4.5:1 minimum — and it's used for the reason line and the
   distance label, which carry real information. On a phone screen in
   daylight this is the text most likely to be unreadable. `text-gray-500` or
   darker for anything load-bearing.
