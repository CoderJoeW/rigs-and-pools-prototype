import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/rigs-and-pools-prototype/' : '/',
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{js,vue}'],
      exclude: ['src/**/__tests__/**', 'src/test/**', 'src/main.js'],
    },
  },
});
