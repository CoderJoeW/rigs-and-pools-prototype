import fs from 'node:fs';
import path from 'node:path';

/* jsdom doesn't apply main.css, so real paint/stacking order, layout and
   pointer-events behaviour can't be exercised at runtime by mounting a
   component alone — these read the actual stylesheet instead, so a rule
   regressing silently (e.g. someone dropping a z-index, a wrap flag, or
   a flex property a fix depends on) fails a test instead of just fading
   into an unwitnessed bug again. One copy shared by every test file that
   needs it, rather than each pasting its own. */
const mainCss = fs.readFileSync(path.resolve(import.meta.dirname, '../assets/main.css'), 'utf8');

// Full escape, not just the leading character — a compound selector like
// '.btn-order.btn-pri' has a SECOND regex-special '.' that a bare leading
// backslash never touched, so it matched as "any character" rather than a
// literal dot. Harmless while every selector in the file happened to be
// one edit away from nothing else, but not something worth relying on.
const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function cssRule(selector) {
  // negative lookahead so e.g. '.tour' doesn't also match '.tour-spot'
  const re = new RegExp(escapeRegExp(selector) + '(?![\\w-])\\{([^}]*)\\}');
  return mainCss.match(re)?.[1] || '';
}

/* cssRule finds the FIRST `selector{...}` in the file — fine for a rule that
   only appears once, but a selector like `*` reappears (the base reset,
   the reduced-motion override). Search the whole stylesheet text directly
   when a caller needs to pin a rule nested inside a specific block, e.g.
   an `@media` query, rather than "the first bare match". */
export function cssSource() { return mainCss; }

export function cssNum(rule, prop) {
  const m = rule.match(new RegExp(prop + ':\\s*(-?\\d+)'));
  return m ? Number(m[1]) : null;
}
