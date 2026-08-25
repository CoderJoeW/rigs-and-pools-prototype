// Calibrated to this codebase's actual style rather than a generic preset:
// dense one-liners and widespread `any` in the game/ engine are deliberate
// (see CLAUDE.md and docs/implementation-notes.md#shared-context-g-module-pattern),
// so this catches real bugs — unused code, undefined globals, Vue footguns —
// without fighting formatting choices already made on purpose.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: globals.browser } },
  { files: ['vite.config.ts', 'eslint.config.js'], languageOptions: { globals: globals.node } },
  // 'essential' only — correctness rules (duplicate keys, valid v-for/v-if,
  // side-effect-free computeds, ...). 'recommended'/'strongly-recommended'
  // add hundreds of template formatting opinions (attribute order, forced
  // line breaks, indentation) that fight this codebase's deliberately dense
  // one-liner template style rather than catching anything.
  ...pluginVue.configs['flat/essential'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    rules: {
      // The engine (game/*.ts) and its call sites deliberately trade static
      // precision for a shared, evolving context object — see types.ts's own
      // comment. noUnusedLocals/noUnusedParameters in tsconfig already catch
      // real dead code without this.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
      // Best-effort browser API calls (localStorage, location.reload) that
      // may legitimately throw in a restricted or test environment, with
      // nothing sensible to do about it — a real, repeated pattern here,
      // not an accident.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Every component reads/writes g.s.* directly by design (Pinia setup
      // stores) rather than through props/emit — the whole point of
      // G.__exports (see stores/game.ts).
      'vue/no-mutating-props': 'off',
      'vue/multi-word-component-names': 'off',
      // This codebase writes template one-liners densely (see any .vue file);
      // these are pure formatting opinions vite/eslint shouldn't police.
      'vue/max-attributes-per-line': 'off',
      'vue/html-self-closing': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/attribute-hyphenation': 'off',
      'vue/require-default-prop': 'off',
      'vue/no-v-html': 'off',
    },
  },
);
