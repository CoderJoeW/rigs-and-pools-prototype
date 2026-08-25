// Single source of truth for "what day is it" off the economic clock (s.t).
// weather.ts, dispatch.ts's today()/yday, and tick.ts's daily bill bucket
// all need the same day boundary — this is the one place that changes if a
// backend ever becomes authoritative over day boundaries instead of the
// client deriving them from s.t.
export const dayIndexOf = (t: number): number => Math.floor(t / 86400);
