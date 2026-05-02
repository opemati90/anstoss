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
        {
          selector:
            'JSXOpeningElement[name.name="Pressable"]:not(:has(JSXAttribute[name.name=/^(accessibilityLabel|accessibilityRole|accessibilityElementsHidden|importantForAccessibility|accessible)$/]))',
          message:
            'Pressable requires accessibilityLabel or accessibilityRole so VoiceOver/TalkBack can announce it.',
        },
        {
          selector:
            "Property[key.name=/^(padding|paddingTop|paddingBottom|paddingLeft|paddingRight|paddingHorizontal|paddingVertical|margin|marginTop|marginBottom|marginLeft|marginRight|marginHorizontal|marginVertical|gap|rowGap|columnGap|borderRadius|borderTopLeftRadius|borderTopRightRadius|borderBottomLeftRadius|borderBottomRightRadius)$/] > Literal[value!=0][value!=1]",
          message:
            'Raw spacing/radius literals are not allowed. Use SPACING_*, RADIUS_*, or a dedicated token from src/theme.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              importNames: ['Text'],
              message:
                "Use the themed Text primitive from 'src/components/ui' instead of react-native's raw Text.",
            },
          ],
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
  {
    // Pre-provider / early-boot screens and specialized UI primitives
    // that build their own typography. The themed Text primitive is
    // intentionally skipped in these files:
    //  - _layout / e2e: may render before ClubThemeProvider mounts
    //  - Text.tsx: IS the primitive
    //  - Button.tsx, ScrollPicker.tsx: render custom typography (size
    //    and family vary with internal state) and are consumed through
    //    the primitive surface
    files: [
      'apps/mobile/app/_layout.tsx',
      'apps/mobile/app/e2e.tsx',
      'apps/mobile/src/components/ui/Text.tsx',
      'apps/mobile/src/components/ui/Button.tsx',
      'apps/mobile/src/components/ScrollPicker.tsx',
    ],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    // Test files mock or construct raw Text directly; skip both rules.
    files: [
      'apps/mobile/**/__tests__/**/*.{ts,tsx}',
      'apps/mobile/**/*.spec.{ts,tsx}',
      'apps/mobile/**/*.test.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
]
