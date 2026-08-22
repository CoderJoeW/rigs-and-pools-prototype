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
