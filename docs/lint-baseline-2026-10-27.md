# Lint baseline - October 27, 2026

The scoped lint configuration checks 136 source/template files. `npm run lint:ci` exits with status 1: **755 errors**, **8094 warnings**, and **0 fatal parsing/project errors**. Before configuring explicit TSConfig associations there were 10 fatal errors; fixing those exposes additional findings in previously unchecked files.

These counts describe the existing codebase after configuration repair, not a passing CI baseline or an allowlist. No rules were disabled to hide existing errors, and no broad formatting changes were applied.

## Remaining errors by rule

| Rule | Errors |
| --- | ---: |
| `curly` | 248 |
| `@typescript-eslint/no-unsafe-member-access` | 145 |
| `no-undefined` | 96 |
| `@typescript-eslint/no-unsafe-assignment` | 86 |
| `@typescript-eslint/no-floating-promises` | 42 |
| `@typescript-eslint/no-unsafe-call` | 38 |
| `@typescript-eslint/no-unsafe-argument` | 25 |
| `@typescript-eslint/no-use-before-define` | 19 |
| `no-script-url` | 9 |
| `no-promise-executor-return` | 6 |
| `@typescript-eslint/no-unsafe-return` | 4 |
| `new-cap` | 4 |
| `@typescript-eslint/no-dynamic-delete` | 3 |
| `@typescript-eslint/no-explicit-any` | 3 |
| `no-duplicate-imports` | 3 |
| `no-return-assign` | 3 |
| `@typescript-eslint/no-loop-func` | 2 |
| `no-control-regex` | 2 |
| `@angular-eslint/use-component-selector` | 2 |
| `@angular-eslint/component-max-inline-declarations` | 2 |
| `@angular-eslint/prefer-inject` | 2 |
| `preserve-caught-error` | 2 |
| `no-eq-null` | 1 |
| `@angular-eslint/pipe-prefix` | 1 |
| `@typescript-eslint/no-unsafe-enum-comparison` | 1 |
| `no-void` | 1 |
| `no-unexpected-multiline` | 1 |
| `require-atomic-updates` | 1 |
| `@typescript-eslint/no-base-to-string` | 1 |
| `@typescript-eslint/prefer-promise-reject-errors` | 1 |
| `@typescript-eslint/no-misused-promises` | 1 |

## Cleanup order

1. Fix correctness and type-safety findings, especially unsafe assignments/access, unhandled promises, promise callbacks, and atomic updates. Run targeted tests for behavior changes.
2. Review policy findings such as `no-undefined`, Angular naming/selector rules, and mandatory braces separately from correctness failures. They currently remain errors; changing their severity requires an explicit policy decision.
3. Agree on formatting conventions, then apply formatting in a separate change. Existing stylistic rules and JSDoc preferences still generate warnings; some style policies (such as semicolons) remain errors.
4. Keep the required lint gate failing until errors are fixed. Add `--max-warnings=0` only after warnings are cleaned up.

To regenerate a machine-readable report locally:

```sh
npm run lint:ci -- --format json --output-file tmp/lint-report.json
```

`tmp/` is ignored by Git. The report command still returns a failure status while code errors remain.
