# Anstoss Codemods

Run individually:
- `npm run codemod:colors`
- `npm run codemod:spacing`  (added in Task 5)
- `npm run codemod:text`     (added in Task 10)

Each codemod logs off-tolerance values to `docs/revamp/codemod-reports/<pass>.md`.
After running, walk the report file and resolve each entry by hand.

## CLI wrapper note

The `codemod:colors` script runs jscodeshift directly. Token loading from
`apps/mobile/src/theme/colors.ts` at runtime is handled by a thin wrapper
script implemented in Task 4. Until then, tokens are passed programmatically
in tests and the CLI invocation uses the `--option` mechanism for simple
scalar flags only.
