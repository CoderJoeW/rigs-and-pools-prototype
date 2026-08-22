# Rigs & Pools — project instructions

This is a free, open-source hobby project. It has a publicly accessible
backend

- **No accounts, no personal data.** Do not add user registration, login,
  email capture, or any field that stores a name/email/address/phone tied
  to a person. If save state needs a persistent identity, use an anonymous
  client-generated ID (e.g. random UUID in localStorage/cookie), never
  anything collected from the user.
- **No long-lived request logging.** Ephemeral, short-retention access logs
  (rotated out within days) for debugging are fine. Do not add IP logging,
  analytics, or telemetry that persists or is tied to individuals.
- **No third-party trackers.** No Google Analytics, ad pixels, session
  replay tools, or similar — these are what trigger privacy-policy
  obligations, so don't wire any in without flagging it to the user first.
- **No payments.** Don't integrate Stripe/PayPal/etc. — payment processing
  brings its own compliance surface.

If a feature request would require crossing one of these lines (e.g. user
accounts, persistent analytics, payments), flag the compliance implication
to the user before implementing rather than building it silently.

## Comments

Code should be self-explanatory: good names, small functions, and clear
structure over prose. Do not add long comment blocks explaining what code
does or why a change was made — if it needs that much explanation, rework
the code (extract a well-named function, simplify the logic) instead of
narrating it.

- Prefer no comment at all. A short one-liner is only justified for a
  genuinely non-obvious constraint (a subtle invariant, a workaround for a
  specific bug, something that would surprise a future reader) — never for
  what the code does, which the code itself already says.
- Tribal knowledge — the reasoning behind an architectural decision,
  historical context, cross-module contracts that aren't visible from one
  file — belongs in `docs/`, not inline. Link out from the code with a
  short pointer if needed, rather than reproducing it as a comment block.
- When editing code that already has a long or narrative comment block,
  remove it and either fold anything load-bearing into `docs/` or make the
  code itself clear enough that the comment isn't needed. Don't leave
  existing over-commented code as-is just because you didn't write it.
