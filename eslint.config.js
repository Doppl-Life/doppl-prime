import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Guardrails: the type checker must not be silently circumvented. Escape hatches
// (any, unchecked casts, non-null assertions, ts-comments) are errors here — where one
// is genuinely needed at a trust boundary, it must be a one-line eslint-disable with a
// written reason, so it stays loud, rare, and reviewed.
export default tseslint.config(
  {
    ignores: ['node_modules/**', 'kernel/web/**', 'out/**', 'published/**', 'eslint.config.js'],
  },
  {
    files: ['kernel/src/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' },
      ],
      '@typescript-eslint/ban-ts-comment': ['error', { minimumDescriptionLength: 10 }],
      // Not a type-safety escape hatch: async stubs that satisfy a Promise-returning
      // interface (Sink, ModelClient, gateways) legitimately have no await.
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
);
