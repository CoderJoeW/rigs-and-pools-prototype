import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

const BASE = process.env.GITHUB_ACTIONS ? '/rigs-and-pools-prototype/' : '/';

// Vite rewrites `src`/`href` in index.html for the deploy base, but not the
// `content` of a <meta>. The share card's og:image was therefore shipping as
// "/share.webp" while everything around it became "/rigs-and-pools-prototype/…",
// which is a 404 on Pages. Social scrapers also want an absolute URL — they do
// not resolve a root-relative one against the page — so on Actions this builds
// the real Pages origin out of the owner and repo the runner already knows,
// rather than hardcoding a hostname that would rot if the repo moved.
function absoluteMetaUrls(): Plugin {
  const owner = (process.env.GITHUB_REPOSITORY_OWNER || '').toLowerCase();
  const origin = owner ? `https://${owner}.github.io` : '';
  return {
    name: 'absolute-meta-urls',
    transformIndexHtml(html: string) {
      return html.replace(
        /(<meta[^>]+(?:property|name)="(?:og:image|twitter:image)"[^>]+content=")\/([^"]+)(")/g,
        (_m, head, path, tail) => `${head}${origin}${BASE}${path}${tail}`);
    },
  };
}

export default defineConfig({
  base: BASE,
  plugins: [vue(), absoluteMetaUrls()],
  build: {
    /* Keep every image out of the JS bundle.

       Vite inlines any asset under 4 KB as a base64 data URI by default,
       which is a reasonable trade for two or three icons. This project now
       ships ~100 small WebP files — the part catalogue alone is 43 — and
       under the default the bundle grew from 389 KB to 577 KB, and its
       gzipped size from 154 KB to 294 KB, because base64 costs a third
       more than binary and then barely compresses. As separate files they
       are fetched only when something renders them, cached individually,
       and never sit in front of the parser. */
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'jsdom',
    // See setupWebStorage.js: Node's own global localStorage otherwise
    // shadows jsdom's, and not portably enough to fix via a NODE_OPTIONS flag.
    setupFiles: ['./src/test/setupWebStorage.js'],
    // Several offline-catch-up tests run the real engine through a 24h
    // return (~2,880 tick chunks) and now also yield periodically rather
    // than blocking — both real seconds of work, measured at 4-4.7s on
    // this machine and sitting uncomfortably close to vitest's 5s default
    // on a slower CI runner. 20s leaves real headroom without masking a
    // test that's actually hung (a genuine infinite loop still times out
    // well short of that).
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{js,ts,vue}'],
      exclude: ['src/**/__tests__/**', 'src/test/**', 'src/main.ts'],
    },
  },
});
