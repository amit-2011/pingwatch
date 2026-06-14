// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Root flat ESLint config for the whole monorepo. Non-type-aware (fast, robust across
 * the workspace graph). The key project rule: no `any` (TypeScript strict everywhere).
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/node_modules/**',
      '**/generated-sqlite/**',
      '**/generated-postgres/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
