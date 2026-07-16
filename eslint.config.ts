import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettierConfig from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';

export default defineConfig(
  // 1. Global ignores (replaces .eslintignore)
  {
    // Les tests sont exécutés par vitest et formatés par prettier, mais pas lintés :
    // les mocks (vi.fn(), casts) sont incompatibles avec les règles type-aware du prod.
    ignores: ['dist', 'node_modules', '**/*.test.ts', '**/*.spec.ts'],
  },

  // 2. Base ESLint and TypeScript configurations
  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  // 3. Configuration specific to Node/Express
  {
    languageOptions: {
      globals: {
        ...globals.node, // Adds 'process', 'console', 'module', etc.
        ...globals.es2024,
      },
      parserOptions: {
        project: true, // Required if you use type-aware rules (optional)
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // --- Express & Node Specific Customizations ---

      // Allow console.log/error (common in server-side apps), but warn generally
      'no-console': ['warn', { allow: ['info', 'warn', 'error'] }],

      // Handle unused variables (e.g., ignoring '_next' in Express middleware)
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // Enforce specific naming conventions (Optional but good practice)
      '@typescript-eslint/naming-convention': [
        'warn',
        { selector: 'default', format: ['camelCase', 'PascalCase'] },
        { selector: 'variable', format: ['camelCase', 'UPPER_CASE'] },
        {
          selector: 'parameter',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
        },
        { selector: 'typeLike', format: ['PascalCase'] },
      ],

      // Ensure promises are handled (Great for catching missing 'await' in async Express handlers)
      '@typescript-eslint/no-floating-promises': 'warn',
      // BAN 'any' types explicitly
      // ❌ const user: any = ...
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',

      // FORCE explicit types on function boundaries
      '@typescript-eslint/explicit-module-boundary-types': 'warn',
    },
  },

  // 4. Prettier Config (Must be last to override other formatting rules)
  prettierConfig,

  // 1. BAN 'any' types explicitly
  // ❌ const user: any = ...
);
