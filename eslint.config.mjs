import js from '@eslint/js'
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import globals from 'globals'

const typescriptFiles = ['**/*.{ts,tsx}']

export default [
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/node_modules/**',
      'apps/mobile/.expo/**',
      'apps/mobile/android/**',
      'apps/mobile/ios/**',
    ],
  },
  js.configs.recommended,
  {
    files: typescriptFiles,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
        __DEV__: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['apps/mobile/app/**/*.{ts,tsx}', 'apps/mobile/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/^#[0-9A-Fa-f]{3,8}$/]",
          message:
            'Raw hex colors are not allowed. Use tokens from src/theme or useClubColors().',
        },
        {
          selector: "Literal[value=/^rgba?\\(/]",
          message:
            'Raw rgb/rgba literals are not allowed. Use hexToRgba() with a theme token, or a dedicated token.',
        },
      ],
    },
  },
  {
    files: [
      'apps/mobile/src/theme/**/*.{ts,tsx}',
      'apps/mobile/src/context/ClubThemeContext.tsx',
      'apps/mobile/src/e2e/**/*.{ts,tsx}',
      'apps/mobile/app/club-setup.tsx',
      'apps/mobile/app/register/club.tsx',
      'apps/mobile/**/__tests__/**/*.{ts,tsx}',
      'apps/mobile/**/*.spec.{ts,tsx}',
      'apps/mobile/**/*.test.{ts,tsx}',
      'apps/mobile/jest.setup.js',
    ],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
]
