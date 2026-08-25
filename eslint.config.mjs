import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import prettier from 'eslint-plugin-prettier/recommended';
import reactHooks from 'eslint-plugin-react-hooks';
import importX from 'eslint-plugin-import-x';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import playwright from 'eslint-plugin-playwright';
import jest from 'eslint-plugin-jest';
import testingLibrary from 'eslint-plugin-testing-library';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['dist/', 'node_modules/'],
  },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  reactHooks.configs.flat['recommended-latest'],
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  {
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver()],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      react,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      '@typescript-eslint/consistent-type-imports': 'error',
      // `recommended-latest` pulls in the experimental "React Compiler" rule set. This one
      // flags any setState call in an effect body that isn't inside an async callback,
      // which includes the standard "reset loading/error, then fetch" pattern used by every
      // data-fetching page in this plugin (an effect use case the React docs endorse:
      // https://react.dev/learn/you-might-not-need-an-effect#fetching-data). Off rather than
      // reworking every page's state shape to dodge a compiler-oriented heuristic this repo
      // doesn't otherwise opt into.
      'react-hooks/set-state-in-effect': 'off',
    },
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  {
    files: ['src/**/*.spec.{ts,tsx}'],
    plugins: {
      ...jest.configs['flat/recommended'].plugins,
      ...jest.configs['flat/style'].plugins,
      ...testingLibrary.configs['flat/react'].plugins,
    },
    languageOptions: {
      ...jest.configs['flat/recommended'].languageOptions,
      ...jest.configs['flat/style'].languageOptions,
      globals: {
        ...jest.configs['flat/recommended'].languageOptions?.globals,
        ...globals.node,
      },
    },
    rules: {
      ...jest.configs['flat/recommended'].rules,
      ...jest.configs['flat/style'].rules,
      ...testingLibrary.configs['flat/react'].rules,
    },
  },
  {
    ...playwright.configs['flat/recommended'],
    files: ['integration-tests/**/*.ts'],
    ...tseslint.configs.disableTypeChecked,
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      ...tseslint.configs.disableTypeChecked.rules,
      'no-console': 'off',
    },
  },
  prettier,
);
