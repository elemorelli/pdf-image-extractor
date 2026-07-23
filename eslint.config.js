import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'public/dist/**', 'docs/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { ignoreRestSiblings: true, argsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['server/**/*.ts', 'test/**/*.ts', 'scripts/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['public/**/*.ts'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  eslintConfigPrettier,
);
