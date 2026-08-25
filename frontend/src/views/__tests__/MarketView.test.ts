import { describe, it, expect } from 'vitest';
import { mountWithStore } from '../../test/mountWithStore.js';
import MarketView from '../MarketView.vue';
import { fmt } from '../../utils/format.js';
import fs from 'node:fs';
import path from 'node:path';

/* cssRule() reads main.css; these rules are scoped to the SFC, so the
   stylesheet to search is the component's own <style> block. Same idea —
   pin a cascade fix in the source rather than hope a runtime that does not
   apply CSS would have caught it. */
const sfcCss = fs.readFileSync(path.resolve(import.meta.dirname, '../MarketView.vue'), 'utf8');
const scopedRule = (sel: string) =>
  sfcCss.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])\\{([^}]*)\\}'))?.[1] || '';

/* Four segments now, so anything below prices has to be switched to first. */
const seg = (wrapper: any, label: string) =>
  wrapper.findAll('.segtab').find((t: any) => t.text().includes(label))!.trigger('click');

describe('MarketView', () => {
  it('shows the auto-sell drip controls and an empty ledger', () => {
    const { wrapper } = mountWithStore(MarketView);
    expect(wrapper.text()).toContain('Auto-sell drip');
    expect(wrapper.text()).toContain('Ledger');
    expect(wrapper.text()).toContain('Net to date');
  });

  it('lists every chain with its held balance', () => {
    const { wrapper } = mountWithStore(MarketView);
    for (const tick of ['TSR', 'FRO', 'HAL', 'NVA', 'OBL']) {
      expect(wrapper.text()).toContain(tick);
    }
  });

  it('toggling the drip switch flips it on the store', async () => {
    const { wrapper, store } = mountWithStore(MarketView);
    expect(store.s.drip.on).toBe(true);
    await wrapper.find('.switch')!.trigger('click');
    expect(store.s.drip.on).toBe(false);
  });

  it('the erase-save button requires a second tap to confirm', async () => {
    const { wrapper, store } = mountWithStore(MarketView);
    const eraseBtn = wrapper.findAll('button').find(b => b.text().includes('Erase save'))!;
    await eraseBtn.trigger('click');
    expect(store.s.wipeArm).toBe(true);
    expect(wrapper.text()).toContain('Tap again to erase everything');
  });

  it('defaults to Auto theme and switches on click', async () => {
    const { wrapper, store } = mountWithStore(MarketView);
    expect(store.s.theme).toBe('auto');
    const darkBtn = wrapper.findAll('button').find(b => b.text() === 'Dark')!;
    await darkBtn.trigger('click');
    expect(store.s.theme).toBe('dark');
  });

  it('the drip size/frequency button groups have an accessible group name', () => {
    const { wrapper } = mountWithStore(MarketView);
    const groups = wrapper.findAll('[role="group"]');
    expect(groups.some(g => g.attributes('aria-labelledby') === 'drip-size-label')).toBe(true);
    expect(groups.some(g => g.attributes('aria-labelledby') === 'drip-freq-label')).toBe(true);
  });

  it('the segmented control is a real tablist, with four panels', async () => {
    const { wrapper } = mountWithStore(MarketView);
    const tabs = wrapper.findAll('.segtab');
    expect(tabs.length).toBe(4);
    expect(tabs.map(t => t.attributes('tabindex'))).toEqual(['0', '-1', '-1', '-1']);
    for (const t of tabs) {
      const panel = wrapper.find('#' + t.attributes('aria-controls'))!;
      expect(panel.attributes('role')).toBe('tabpanel');
      expect(panel.attributes('aria-labelledby')).toBe(t.attributes('id'));
    }
    await wrapper.find('.segbar')!.trigger('keydown', { key: 'End' });
    expect(wrapper.findAll('.segtab')[3].attributes('aria-selected')).toBe('true');
  });

  it('a coin card carries its emblem, price, change window and sparkline', () => {
    const { wrapper } = mountWithStore(MarketView, {
      seed: g => { for (const c of g.s.chains) c.hist.push(c.price * 1.1); },
    });
    const cards = wrapper.findAll('.coincard');
    expect(cards.length).toBe(5);
    const tsr = cards.find(c => c.text().includes('TSR'))!;
    expect(tsr.find('.chaingem img')!.exists()).toBe(true);
    expect(tsr.text()).toContain('Tessera');
    expect(tsr.find('.cc-w')!.text()).toBe('18h');
    expect(tsr.find('.cc-spark path')!.attributes('d')).toBeTruthy();
  });

  it('prices a sub-dollar coin in the digits it actually moves in', () => {
    const { wrapper, store } = mountWithStore(MarketView);
    const tsr = wrapper.findAll('.coincard').find(c => c.text().includes('TSR'))!;
    // Tessera trades near $0.024 — two decimals would round the day away.
    expect(tsr.find('.cc-p')!.text()).toBe('$' + store.price(store.chain('tessera')!).toFixed(4));
    const nva = wrapper.findAll('.coincard').find(c => c.text().includes('NVA'))!;
    expect(nva.find('.cc-p')!.text()).toMatch(/^\$\d+\.\d{2}$/);
  });

  it('the change is measured between two samples, and says so when there are not two', () => {
    const { wrapper } = mountWithStore(MarketView);
    // A fresh chain has one sample, so there is no closed window to report.
    expect(wrapper.findAll('.coincard')[0].find('.cc-chg')!.text()).toBe('new');
  });

  it('a holding row shows its share of what the wallet is worth', async () => {
    const { wrapper, store } = mountWithStore(MarketView, {
      seed: g => { g.s.wallet.tessera = 1000; g.s.wallet.ferro = 0; },
    });
    const row = wrapper.findAll('.holdrow').find(r => r.text().includes('TSR'))!;
    // The only holding, so it is the whole wallet.
    expect(row.find('.hr-pct')!.text()).toBe('100%');
    expect(row.find('.hr-usd')!.text())
      .toContain(fmt.usd2(1000 * store.price(store.chain('tessera')!)));
    // An empty wallet slot has no share to claim.
    const ferro = wrapper.findAll('.holdrow').find(r => r.text().includes('FRO'))!;
    expect(ferro.find('.hr-pct')!.text()).toBe('—');
    // The bar is decorative — the percentage above it says the same thing.
    expect(row.find('.hr-bar')!.attributes('aria-hidden')).toBeUndefined();
  });

  it('the drip settings, ledger and setup each live behind their own segment', async () => {
    const { wrapper } = mountWithStore(MarketView);
    const vis = () => wrapper.findAll('.mkpanel')
      .map(p => !(p.attributes('style') || '').includes('display: none'));
    expect(vis()).toEqual([true, false, false, false]);
    await seg(wrapper, 'Auto-sell');
    expect(wrapper.find('#mkpan-drip')!.text()).toContain('Order size');
    await seg(wrapper, 'Ledger');
    expect(wrapper.find('#mkpan-ledger')!.text()).toContain('Net to date');
    expect(wrapper.find('#mkpan-ledger')!.text()).toContain('Taken in');
    await seg(wrapper, 'Setup');
    expect(wrapper.find('#mkpan-setup')!.text()).toContain('Erase save');
  });

  describe('the review fixes', () => {
    it('the change actually renders green or red, not the scoped base grey', () => {
      // A scoped rule compiles with its data-v attribute, so a bare
      // .cc-chg{color} outranks the global .pos/.neg and every change was
      // painted grey. The state colours have to be restated at that weight.
      expect(scopedRule('.cc-chg.pos')).toMatch(/color:\s*var\(--green\)/);
      expect(scopedRule('.cc-chg.neg')).toMatch(/color:\s*var\(--red\)/);
      expect(scopedRule('.hr-sub.pos')).toMatch(/color:\s*var\(--green\)/);

      const { wrapper } = mountWithStore(MarketView, {
        seed: g => { for (const c of g.s.chains) c.hist.push(c.price * 1.1); },
      });
      const chg = wrapper.findAll('.coincard')[0].find('.cc-chg')!;
      expect(chg.classes()).toContain('pos');
    });

    it('the THIN badge is reachable, and lands on the thinnest book', () => {
      const { wrapper, store } = mountWithStore(MarketView);
      const thinnest = store.s.chains
        .reduce((a, c) => (c.depth < a.depth ? c : a));
      const tagged = wrapper.findAll('.holdrow')
        .filter(r => r.find('.tag.d')!.exists())
        .map(r => r.find('.hr-t')!.text().split(/\s/)[0]);
      expect(tagged.length).toBeGreaterThan(0);
      expect(tagged).toContain(thinnest.tick);
      // Not everything is thin, or the badge says nothing.
      expect(tagged.length).toBeLessThan(store.s.chains.length);
    });

    it('the share column can hold a seven-figure balance', () => {
      const { wrapper } = mountWithStore(MarketView, {
        seed: g => { g.s.wallet.tessera = 1_250_000; },
      });
      const row = wrapper.findAll('.holdrow').find(r => r.text().includes('TSR'))!;
      // The count is on its own line, and the percentage moved down beside
      // the dollar value, so neither line has to hold both.
      expect(row.find('.hr-v')!.text()).toBe(fmt.c(1_250_000));
      expect(row.find('.hr-usd')!.text()).toContain('%');
      expect(scopedRule('.hd-head,.holdrow')).toMatch(/minmax\(86px,\s*auto\)/);
    });
  });
});
