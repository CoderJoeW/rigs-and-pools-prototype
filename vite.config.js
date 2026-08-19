import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/rigs-and-pools-prototype/' : '/',
  plugins: [vue()],
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
      include: ['src/**/*.{js,vue}'],
      exclude: ['src/**/__tests__/**', 'src/test/**', 'src/main.js'],
    },
  },
});
