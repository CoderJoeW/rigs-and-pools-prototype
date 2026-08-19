import { describe, it, expect } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import SiteFilm from '../SiteFilm.vue';
import { sitePlate, siteFilm, sitePhase } from '../../utils/siteArt.js';
import { SHELLS } from '../../data/site-parts.js';

const mountFilm = props => mount(SiteFilm, { props, attachTo: document.body });
/* The film is gated on device preferences read in onMounted, so it is never
   in the DOM on the first render — a test that asserts the video is PRESENT
   has to let that flush first. */
const mountLive = async props => { const w = mountFilm(props); await nextTick(); return w; };

describe('siteArt', () => {
  it('has a day and a night plate for every shell you can buy', () => {
    for (const s of SHELLS) {
      expect(sitePlate(s.id, 'day'), `${s.id} day`).toMatch(new RegExp(`${s.id}-day`));
      expect(sitePlate(s.id, 'night'), `${s.id} night`).toMatch(new RegExp(`${s.id}-night`));
    }
  });

  it('falls back to the starting shell rather than blanking the hero', () => {
    expect(sitePlate('nonsense', 'day')).toMatch(/bedroom-day/);
  });

  it('reads day and night off the same solar curve the sky uses', () => {
    expect(sitePhase(13 * 3600)).toBe('day');
    expect(sitePhase(23 * 3600)).toBe('night');
    expect(sitePhase(3 * 3600)).toBe('night');
    // Negative and past-midnight times both wrap, since s.t only grows.
    expect(sitePhase(-3 * 3600)).toBe('night');
    expect(sitePhase(86400 + 12 * 3600)).toBe('day');
  });

  it('offers a film only for the shells that have one, in two codecs', () => {
    expect(siteFilm('bedroom')).toBeNull();
    expect(siteFilm('shed')).toBeNull();
    for (const id of ['garage', 'unit', 'warehouse']) {
      const f = siteFilm(id);
      expect(f, id).toBeTruthy();
      // WebM for a Chromium built without H.264, MP4 for Safari.
      expect(f.webm).toMatch(/\.webm/);
      expect(f.mp4).toMatch(/\.mp4/);
    }
  });
});

describe('SiteFilm', () => {
  it('mounts both plates so the day/night change can cross-fade', () => {
    const w = mountFilm({ shell: 'garage', phase: 'day' });
    const plates = w.findAll('.sf-plate');
    expect(plates).toHaveLength(2);
    expect(plates[0].attributes('style')).toContain('opacity: 1');
    expect(plates[1].attributes('style')).toContain('opacity: 0');
  });

  it('swaps which plate is lit when the phase changes', async () => {
    const w = mountFilm({ shell: 'garage', phase: 'day' });
    await w.setProps({ phase: 'night' });
    const plates = w.findAll('.sf-plate');
    expect(plates[0].attributes('style')).toContain('opacity: 0');
    expect(plates[1].attributes('style')).toContain('opacity: 1');
  });

  it('never runs the film over the daylit plate', () => {
    // It was cut from the night generation; over the day plate it would put
    // two different times of day in one frame.
    const w = mountFilm({ shell: 'garage', phase: 'day' });
    expect(w.find('video').exists()).toBe(false);
  });

  it('leaves the still doing the work when motion is refused', () => {
    const w = mountFilm({ shell: 'garage', phase: 'night', motion: false });
    expect(w.find('video').exists()).toBe(false);
    expect(w.findAll('.sf-plate')).toHaveLength(2);
  });

  it('shows the still for a shell with no film at all', () => {
    const w = mountFilm({ shell: 'bedroom', phase: 'night' });
    expect(w.find('video').exists()).toBe(false);
    expect(w.findAll('.sf-plate')).toHaveLength(2);
  });

  it('replaces the video when the site changes to another film-bearing shell', async () => {
    // Patching <source src> in place does nothing: a media element will not
    // re-select its source without load(). Without a key on the element, a
    // move between two film-bearing sites at night left the previous site's
    // loop playing over the new site's plate.
    const w = await mountLive({ shell: 'garage', phase: 'night' });
    const before = w.find('video').element;
    expect(w.findAll('video source')[0].attributes('src')).toMatch(/garage-film/);
    await w.setProps({ shell: 'warehouse' });
    expect(w.findAll('video source')[0].attributes('src')).toMatch(/warehouse-film/);
    expect(w.find('video').element).not.toBe(before);
  });

  it('drops the video when moving to a shell that has no film', async () => {
    const w = await mountLive({ shell: 'garage', phase: 'night' });
    expect(w.find('video').exists()).toBe(true);
    await w.setProps({ shell: 'shed' });
    expect(w.find('video').exists()).toBe(false);
    expect(w.findAll('.sf-plate')[1].attributes('src')).toMatch(/shed-night/);
  });

  it('stays out of the accessibility tree — it is a backdrop', () => {
    const w = mountFilm({ shell: 'garage', phase: 'night' });
    expect(w.attributes('aria-hidden')).toBe('true');
  });
});
