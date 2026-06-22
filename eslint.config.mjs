import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/scaffold/**',
      // Vendored design-system PROTOTYPE — a port/reference source, not our code (the web track
      // PORTS from it TS-strict, never runs its JS). eslint doesn't read .prettierignore's `docs/`,
      // so it must be ignored here too (same class as the scaffold/ hotfix). P7.15 round-3 finding.
      '**/doppl-design-system/**',
      // Playwright transient artifacts (P7.15 e2e).
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
);
