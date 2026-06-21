import rootConfig from '../../eslint.config.mjs';

// Web-local flat config: adopts the workspace rules (js + typescript-eslint recommended, shared
// ignores) and enables JSX parsing for the React/TSX surface. typescript-eslint disables
// `no-undef` for TS files, so browser globals (window/document) need no extra declaration.
export default [
  ...rootConfig,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  },
];
