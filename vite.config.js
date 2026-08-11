import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/rigs-and-pools-prototype/' : '/',
  plugins: [vue()],
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
