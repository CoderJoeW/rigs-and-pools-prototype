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

export function cssRule(selector) {
  // negative lookahead so e.g. '.tour' doesn't also match '.tour-spot'
  const re = new RegExp('\\' + selector + '(?![\\w-])\\{([^}]*)\\}');
  return mainCss.match(re)?.[1] || '';
}

export function cssNum(rule, prop) {
  const m = rule.match(new RegExp(prop + ':\\s*(-?\\d+)'));
  return m ? Number(m[1]) : null;
}
