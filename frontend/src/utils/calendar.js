/* Single source of truth for "what day is it" off the economic clock (s.t).
   weather.js, dispatch.js's today()/yday, and tick.js's daily bill bucket
   all need the same day boundary — this is the one place that changes if a
   backend ever becomes authoritative over day boundaries instead of the
   client deriving them from s.t. */
export const dayIndexOf = t => Math.floor(t/86400);
