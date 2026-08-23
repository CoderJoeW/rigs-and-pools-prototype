import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* Nothing else in this suite can see CSS. Every other guard here — mounting in
   jsdom, sweeping for unresolved template identifiers, mutating source — is
   structurally blind to a stylesheet, which is how the group strip once shipped
   with its two media queries flattened: the ≤339px folded layout applied at
   every width, and the ≤380px breakpoint was left behind in the parent
   matching nothing.

   So this reads the SFC's own <style> block and asserts the media context each
   rule sits in. It is deliberately about STRUCTURE, not values — it does not
   care what the columns are, only that the three-tier ladder still has three
   tiers and that they are the right way round. */

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const styleOf = (src: string) => src.slice(src.indexOf('<style scoped>') + 14, src.lastIndexOf('</style>'));

/* Selector -> the @media condition it sits under, '' for top level. A selector
   appearing at several widths yields several entries, in source order. */
function rulesByMedia(css: string){
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: { media: string; sel: string; body: string }[] = [];
  const media = /@media([^{]*)\{([\s\S]*?)\n\}/g;
  let m;
  while((m = media.exec(css))){
    for(const r of m[2].matchAll(/([^{}]+)\{([^{}]*)\}/g))
      out.push({ media: m[1].trim(), sel: r[1].trim(), body: r[2].trim() });
  }
  for(const r of css.replace(media, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)){
    const sel = r[1].trim();
    if(!sel.startsWith('@')) out.push({ media: '', sel, body: r[2].trim() });
  }
  return out;
}

const groupCard = rulesByMedia(styleOf(read('../GroupCard.vue')));
const farmView = rulesByMedia(styleOf(read('../../views/FarmView.vue')));
const at = (rules: { media: string; sel: string; body: string }[], sel: string) => rules.filter(r => r.sel === sel).map(r => r.media);

describe('GroupCard stylesheet structure', () => {
  it('keeps the group strip’s three-tier width ladder', () => {
    // A base rule plus one per breakpoint. Losing any tier — or gaining an
    // unconditional duplicate — is the failure this file exists for.
    expect(at(groupCard, '.grp-strip').sort()).toEqual(
      ['', '(max-width:339px)', '(max-width:380px)']);
  });

  it('never states the folded layout unconditionally', () => {
    const folded = groupCard.filter(r => r.sel === '.grp-strip' && r.body.includes('1fr 1fr'));
    expect(folded).toHaveLength(1);
    expect(folded[0].media).toBe('(max-width:339px)');
  });

  it('hides the picker icons only on narrow screens', () => {
    // the base rule stays unconditional; only the hiding is gated
    const hide = groupCard.filter(r => r.sel === '.gsel-ico' && r.body.includes('display:none'));
    expect(hide).toHaveLength(1);
    expect(hide[0].media).toBe('(max-width:380px)');
  });

  it('drops the picker gap and margin at their own separate widths', () => {
    // gap goes at 380 with the icons; the right margin only at 339 when the
    // strip folds. Collapsing these into one breakpoint is a real regression.
    const gsel = groupCard.filter(r => r.sel === '.gsel');
    expect(gsel.find(r => r.body.includes('gap:0'))!.media).toBe('(max-width:380px)');
    expect(gsel.find(r => r.body.includes('margin-right:0'))!.media).toBe('(max-width:339px)');
  });

  it('owns every group-family rule except the parent’s own help line', () => {
    const family = /^\.(grp|gsel|gstat|gtag|gk|gv|group-rename)/;
    const strays = farmView.filter(r => family.test(r.sel) && !r.sel.startsWith('.grp-help'));
    // A group rule left in FarmView carries the PARENT's scope id, and scoped
    // CSS only reaches a child's root — so it would match nothing at all.
    expect(strays.map(r => r.sel)).toEqual([]);
    expect(at(farmView, '.grp-help')).toEqual(['']);
  });

  it('leaves no empty media blocks behind in the parent', () => {
    const css = styleOf(read('../../views/FarmView.vue'));
    expect(css).not.toMatch(/@media[^{]*\{\s*\}/);
  });
});
