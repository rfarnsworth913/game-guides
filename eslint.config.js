// @ts-check
import angular from "angular-eslint";
import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin"
import tseslint from "typescript-eslint";

import { defineConfig  } from "eslint/config";
import jsdoc from "eslint-plugin-jsdoc";
import jest from "eslint-plugin-jest";

export default defineConfig([

    // TypeScript Files Configuration -----------------------------------------
    {
        ...jsdoc.configs["flat/recommended"],

        files: ["**/*.ts"],
        extends: [
            js.configs.recommended,
            ...tseslint.configs.recommended,
            ...tseslint.configs.stylistic,
            ...angular.configs.tsRecommended,
        ],
        processor: angular.processInlineTemplates,

        languageOptions: {
            parserOptions: {
                projectService: true
            },
        },

        plugins: {
            jsdoc,
            "@stylistic": stylistic
        },

        rules: {

            // ESLint: Possible Problems (https://eslint.org/docs/latest/rules/#possible-problems) ------------------------------
            "array-callback-return":        ["error"],
            "no-await-in-loop":             ["off"],
            "no-constructor-return":        ["error"],
            "no-duplicate-imports":         ["error"],
            "no-inner-declarations":        ["error"],
            "no-promise-executor-return":   ["error"],
            "no-self-compare":              ["error"],
            "no-template-curly-in-string":  ["error"],
            "no-unmodified-loop-condition": ["error"],
            "no-unreachable-loop":          ["error"],
            "no-useless-assignment":        ["error"],
            "require-atomic-updates":       ["error"],


            // ESLint: Suggestions (https://eslint.org/docs/latest/rules/#suggestions) ------------------------------------------
            "accessor-pairs":               ["warn"],
            "arrow-body-style":             ["warn", "as-needed"],
            "block-scoped-var":             ["error"],
            "camelcase":                    ["warn", {
                "ignoreDestructuring": true,
                "ignoreImports":       true,
            }],
            "complexity":                   ["warn", {
                "max": 20
            }],
            "consistent-return":            ["warn"],
            "consistent-this":              ["warn"],
            "curly":                        ["error", "all"],
            "default-case":                 ["error"],
            "default-case-last":            ["error"],
            "eqeqeq":                       ["warn", "smart"],
            "func-name-matching":           ["warn"],
            "func-names":                   ["warn", "always"],
            "grouped-accessor-pairs":       ["warn", "setBeforeGet"],
            "guard-for-in":                 ["warn"],
            "logical-assignment-operators": ["warn"],
            "max-classes-per-file":         ["warn", {
                "max": 2
            }],
            "max-depth":                    ["warn", {
                "max": 5
            }],
            "max-lines":                    ["warn", {
                "max":            400,
                "skipBlankLines": true,
                "skipComments":   true
            }],
            "max-lines-per-function":       ["warn", {
                "max":            50,
                "skipBlankLines": true,
                "skipComments":   true
            }],
            "max-nested-callbacks":         ["warn", {
                "max": 5
            }],
            "new-cap":                      ["error", {
                "capIsNewExceptions": [
                    "Component",
                    "ContentChild",
                    "Directive",
                    "HostListener",
                    "Injectable",
                    "Input",
                    "MockComponent",
                    "NgModule",
                    "Pipe",
                    "Output",
                    "ViewChild"
                ]
            }],
            "no-alert":                     ["error"],
            "no-bitwise":                   ["error"],
            "no-caller":                    ["error"],
            "no-else-return":               ["warn"],
            "no-eq-null":                   ["error"],
            "no-eval":                      ["error"],
            "no-extend-native":             ["warn"],
            "no-extra-bind":                ["warn"],
            "no-implicit-globals":          ["error"],
            "no-invalid-this":              ["error"],
            "no-iterator":                  ["error"],
            "no-label-var":                 ["error"],
            "no-lone-blocks":               ["warn"],
            "no-lonely-if":                 ["warn"],
            "no-multi-str":                 ["warn"],
            "no-new":                       ["off"],
            "no-new-func":                  ["error"],
            "no-new-wrappers":              ["error"],
            "no-object-constructor":        ["error"],
            "no-octal-escape":              ["error"],
            "no-proto":                     ["error"],
            "no-return-assign":             ["error"],
            "no-script-url":                ["error"],
            "no-sequences":                 ["warn"],
            "no-undef-init":                ["error"],
            "no-undefined":                 ["error"],
            "no-useless-call":              ["error"],
            "no-useless-computed-key":      ["warn"],
            "no-useless-concat":            ["warn"],
            "no-useless-rename":            ["warn"],
            "no-useless-return":            ["warn"],
            "no-var":                       ["error"],
            "no-void":                      ["error"],
            "prefer-arrow-callback":        ["warn"],
            "prefer-const":                 ["warn"],
            "prefer-object-has-own":        ["warn"],
            "prefer-object-spread":         ["warn"],
            "prefer-rest-params":           ["warn"],
            "prefer-spread":                ["warn"],
            "prefer-template":              ["warn"],
            "sort-imports":                 ["warn", {
                "ignoreCase":            true,
                "ignoreDeclarationSort": true,
                "allowSeparatedGroups":  true
            }],

            // Stylistic (https://eslint.style/rules) ---------------------------------------------------------------------------
            "@stylistic/array-bracket-newline":          ["warn", "consistent"],
            "@stylistic/array-element-newline":          ["warn", "consistent"],
            "@stylistic/arrow-parens":                   ["warn", "as-needed", {
                "requireForBlockBody": true
            }],
            "@stylistic/arrow-spacing":                  ["warn"],
            "@stylistic/block-spacing":                  ["warn"],
            "@stylistic/brace-style":                    ["warn", "1tbs", {
                "allowSingleLine": true
            }],
            "@stylistic/comma-spacing":                  ["warn"],
            "@stylistic/comma-style":                    ["warn"],
            "@stylistic/computed-property-spacing":      ["warn"],
            "@stylistic/dot-location":                   ["warn", "property"],
            "@stylistic/eol-last":                       ["warn"],
            "@stylistic/function-call-argument-newline": ["warn", "consistent"],
            "@stylistic/function-call-spacing":          ["warn", "never"],
            "@stylistic/function-paren-newline":         ["warn", "consistent"],
            "@stylistic/implicit-arrow-linebreak":       ["warn", "beside"],
            "@stylistic/indent":                         ["warn", 4, {
                "ignoreComments": true,
            }],
            "@stylistic/key-spacing":                    ["warn"],
            "@stylistic/keyword-spacing":                ["warn"],
            "@stylistic/lines-between-class-members":    ["warn", "always", {
                "exceptAfterSingleLine": true
            }],
            "@stylistic/max-len":                        ["warn", {
                "code":                   130,
                "ignoreComments":         true,
                "ignoreUrls":             true,
                "ignoreStrings":          true,
                "ignoreTemplateLiterals": true
            }],
            "@stylistic/member-delimiter-style":         ["warn"],
            "@stylistic/new-parens":                     ["warn", "always"],
            "@stylistic/newline-per-chained-call":       ["warn", {
                "ignoreChainWithDepth": 3
            }],
            "@stylistic/no-confusing-arrow":             ["warn"],
            "@stylistic/no-extra-parens":                ["warn", "all", {
                "nestedBinaryExpressions": false,
                "returnAssign": false
            }],
            "@stylistic/no-extra-semi":                  ["warn"],
            "@stylistic/no-floating-decimal":            ["warn"],
            "@stylistic/no-mixed-spaces-and-tabs":       ["warn"],
            "@stylistic/no-multi-spaces":                ["off"],
            "@stylistic/no-multiple-empty-lines":        ["warn", {
                "max":    2,
                "maxEOF": 1,
                "maxBOF": 0
            }],
            "@stylistic/no-tabs":                        ["warn"],
            "@stylistic/no-trailing-spaces":             ["warn"],
            "@stylistic/no-whitespace-before-property":  ["warn"],
            "@stylistic/nonblock-statement-body-position": ["warn", "beside"],
            "@stylistic/object-curly-newline":           ["warn", {
                "multiline":  true,
                "consistent": true
            }],
            "@stylistic/object-curly-spacing":           ["warn", "always"],
            "@stylistic/object-property-newline":        ["warn", {
                "allowAllPropertiesOnSameLine": true
            }],
            "@stylistic/operator-linebreak":             ["warn", "before"],
            "@stylistic/quote-props":                    ["warn", "consistent-as-needed"],
            "@stylistic/quotes":                         ["warn", "double"],
            "@stylistic/rest-spread-spacing":            ["warn"],
            "@stylistic/semi":                           ["error"],
            "@stylistic/semi-spacing":                   ["warn"],
            "@stylistic/semi-style":                     ["warn"],
            "@stylistic/space-before-blocks":            ["warn"],
            "@stylistic/space-before-function-paren":    ["warn", {
                "anonymous": "never",
                "named":     "never",
                "asyncArrow": "never"
            }],
            "@stylistic/space-in-parens":                ["warn"],
            "@stylistic/space-infix-ops":                ["warn"],
            "@stylistic/spaced-comment":                 ["warn", "always"],
            "@stylistic/switch-colon-spacing":           ["warn"],
            "@stylistic/template-curly-spacing":         ["warn", "never"],
            "@stylistic/type-annotation-spacing":        ["warn"],
            "@stylistic/type-generic-spacing":           ["warn"],
            "@stylistic/type-named-tuple-spacing":       ["warn"],
            "@stylistic/wrap-regex":                     ["warn"],

            // TypeScript (https://typescript-eslint.io/rules/) -----------------------------------------------------------------
            "@typescript-eslint/adjacent-overload-signatures":                 ["error"],
            "@typescript-eslint/array-type":                                   ["warn", {
                "default":  "generic",
                "readonly": "generic"
            }],
            "@typescript-eslint/await-thenable":                               ["error"],
            "@typescript-eslint/ban-tslint-comment":                           ["error"],
            "@typescript-eslint/consistent-generic-constructors":              ["warn", "type-annotation"],
            "@typescript-eslint/consistent-indexed-object-style":              ["warn", "record"],
            "@typescript-eslint/consistent-type-assertions":                   ["warn", {
                "assertionStyle": "as"
            }],
            "@typescript-eslint/consistent-type-definitions":                  ["error", "type"],

            "@typescript-eslint/consistent-type-exports":                      ["warn", {
                "fixMixedExportsWithInlineTypeSpecifier": true
            }],
            "@typescript-eslint/explicit-member-accessibility":                ["warn", {
                "accessibility": "no-public"
            }],
            "@typescript-eslint/method-signature-style":                       ["warn"],
            "@typescript-eslint/naming-convention":                            ["warn",
                {
                    "selector": "default",
                    "format": ["camelCase"]
                },
                {
                    "selector": ["class", "enum", "enumMember", "typeAlias"],
                    "format": ["PascalCase"]
                },
                // we have to allow everything for objects since we can use different apis which can produce/consume usually different kinds of objects
                {
                    "selector": ["objectLiteralProperty", "typeProperty"],
                    "format": null
                },
                {
                    "selector": ["classProperty"],
                    "format": ["camelCase", "UPPER_CASE"],
                    "leadingUnderscore": "allow"
                },
                {
                    "selector": "variable",
                    "format": ["camelCase", "UPPER_CASE"]
                },
                {
                    "selector": "parameter",
                    "format": ["camelCase"],
                    "leadingUnderscore": "allow"
                },
                {
                    "selector": "import",
                    "format": ["camelCase", "PascalCase"],
                }
            ],
            "@typescript-eslint/no-array-delete":                              ["error"],
            "@typescript-eslint/no-base-to-string":                            ["error"],
            "@typescript-eslint/no-confusing-non-null-assertion":              ["error"],
            "@typescript-eslint/no-dynamic-delete":                            ["error"],
            "@typescript-eslint/no-extraneous-class":                          ["error", {
                "allowEmpty":      true,
                "allowStaticOnly": true
            }],
            "@typescript-eslint/no-floating-promises":                         ["error"],
            "@typescript-eslint/no-for-in-array":                              ["error"],
            "@typescript-eslint/no-import-type-side-effects":                  ["error"],
            "@typescript-eslint/no-inferrable-types":                          ["warn"],
            "@typescript-eslint/no-misused-promises":                          ["error"],
            "@typescript-eslint/no-mixed-enums":                               ["warn"],
            "@typescript-eslint/no-non-null-asserted-nullish-coalescing":      ["error"],
            "@typescript-eslint/no-unnecessary-boolean-literal-compare":       ["error"],
            "@typescript-eslint/no-unnecessary-condition":                     ["off"],
            "@typescript-eslint/no-unnecessary-parameter-property-assignment": ["warn"],
            "@typescript-eslint/no-unnecessary-qualifier":                     ["warn"],
            "@typescript-eslint/no-unnecessary-template-expression":           ["warn"],
            "@typescript-eslint/no-unnecessary-type-assertion":                ["warn"],
            "@typescript-eslint/no-unsafe-argument":                           ["error"],
            "@typescript-eslint/no-unsafe-assignment":                         ["error"],
            "@typescript-eslint/no-unsafe-call":                               ["error"],
            "@typescript-eslint/no-unsafe-enum-comparison":                    ["error"],
            "@typescript-eslint/no-unsafe-member-access":                      ["error"],
            "@typescript-eslint/no-unsafe-return":                             ["error"],
            "@typescript-eslint/no-useless-empty-export":                      ["error"],
            "@typescript-eslint/prefer-find":                                  ["warn"],
            "@typescript-eslint/prefer-for-of":                                ["warn"],
            "@typescript-eslint/prefer-includes":                              ["warn"],
            "@typescript-eslint/prefer-nullish-coalescing":                    ["warn"],
            "@typescript-eslint/prefer-optional-chain":                        ["warn"],
            "@typescript-eslint/prefer-readonly":                              ["warn"],
            "@typescript-eslint/prefer-string-starts-ends-with":               ["warn"],
            "@typescript-eslint/promise-function-async":                       ["warn"],

            // TypeScript: ESLint Extension Rules (https://typescript-eslint.io/rules/) -----------------------------------------
            "default-param-last": ["off"],
            "@typescript-eslint/default-param-last": ["warn"],

            "dot-notation": ["off"],
            "@typescript-eslint/dot-notation": ["warn"],

            "max-params": ["off"],
            "@typescript-eslint/max-params": ["warn", {
                "max": 5
            }],

            "no-array-constructor": ["off"],
            "@typescript-eslint/no-array-constructor": ["error"],

            "no-empty-function": ["off"],
            "@typescript-eslint/no-empty-function": ["error", {
                "allow": ["constructors"]
            }],

            "no-implied-eval": ["off"],
            "@typescript-eslint/no-implied-eval": ["error"],

            "no-loop-func": ["off"],
            "@typescript-eslint/no-loop-func": ["error"],

            "no-shadow": ["off"],
            "@typescript-eslint/no-shadow": ["warn"],

            "no-unused-expressions": ["off"],
            "@typescript-eslint/no-unused-expressions": ["warn"],

            "no-unused-vars": ["off"],
            "@typescript-eslint/no-unused-vars": ["warn"],

            "no-use-before-define": ["off"],
            "@typescript-eslint/no-use-before-define": ["error"],

            "no-useless-constructor": ["off"],
            "@typescript-eslint/no-useless-constructor": ["warn"],

            "no-throw-literal": ["off"],
            "@typescript-eslint/only-throw-error": ["error"],

            "prefer-destructuring": ["off"],
            "@typescript-eslint/prefer-destructuring": ["warn"],

            "prefer-promise-reject-errors": ["off"],
            "@typescript-eslint/prefer-promise-reject-errors": ["error", {
                "allowEmptyReject": true
            }],

            "require-await": ["off"],
            "@typescript-eslint/require-await": ["warn"],

            "no-return-await": ["off"],
            "@typescript-eslint/return-await": ["off"],

            // JSDocs Plugin (https://github.com/gajus/eslint-plugin-jsdoc) -----------------------------------------------------
            "jsdoc/check-alignment": ["warn"],
            "jsdoc/check-line-alignment": ["warn", "always"],
            "jsdoc/check-param-names": ["warn", {
                "checkRestProperty": true,
                "enableFixer": false
            }],
            "jsdoc/check-property-names": ["warn"],
            "jsdoc/require-description": ["warn"],
            "jsdoc/require-hyphen-before-param-description": ["warn"],
            "jsdoc/require-param": ["warn", {
                "enableFixer": false,
                "contexts": [
                    {
                        "comment": "JsdocBlock:has(JsdocTag:not([name=params]))",
                        "context": "any"
                    }
                ]
            }],
            "jsdoc/require-param-description": ["warn", {
                "contexts": [
                    {
                        "comment": "JsdocBlock:has(JsdocTag:not([name=params]))",
                        "context": "any"
                    }
                ]
            }],
            "jsdoc/require-param-type": ["off"], // because of typescript
            "jsdoc/require-returns": ["off"], // because of typescript
            "jsdoc/require-returns-type": ["off"], // because of typescript

            "jsdoc/require-jsdoc": ["warn",
                {
                    "checkConstructors": false,
                    "checkSetters": false,
                    "checkGetters": false,
                    "require": {
                        "FunctionExpression": true,
                        "FunctionDeclaration": true
                    },
                    // We should not have docs for angular component lifecycle hooks since they are already documented https://angular.io/guide/lifecycle-hooks
                    // But if you add some logic there, you should move it to a separate method, which should have its own documentation.
                    "contexts": [
                        "MethodDefinition[key.name!='ngOnChanges'][key.name!='ngOnInit'][key.name!='ngDoCheck'][key.name!='ngAfterContentInit'][key.name!='ngAfterContentChecked'][key.name!='ngAfterViewInit'][key.name!='ngAfterViewChecked'][key.name!='ngOnDestroy'][key.name!='forRoot']"
                    ]
                }
            ],
            "jsdoc/tag-lines": ["warn", "always", {
                "count": 0,
                "startLines": 1
            }],

            // Angular: Possible Problems (https://github.com/angular-eslint/angular-eslint/blob/main/packages/eslint-plugin/README.md#possible-problems) -----
            "@angular-eslint/contextual-lifecycle":      ["error"],
            "@angular-eslint/no-async-lifecycle-method": ["error"],
            "@angular-eslint/no-attribute-decorator":    ["error"],
            "@angular-eslint/sort-lifecycle-methods":    ["error"],

            // Angular: Suggestions (https://github.com/angular-eslint/angular-eslint/blob/main/packages/eslint-plugin/README.md#suggestions) -----------------
            "@angular-eslint/component-class-suffix":            ["error", {
                "suffixes": ["Component", "View"]
            }],
            "@angular-eslint/component-max-inline-declarations": ["error", {
                "animations": 20,
                "styles":     20,
                "template":   10
            }],
            "@angular-eslint/component-selector":                ["error", {
                "type":   "element",
                "prefix": "game",
                "style":  "kebab-case"
            }],
            "@angular-eslint/contextual-decorator":              ["error"],
            "@angular-eslint/directive-class-suffix":            ["error", {
                "suffixes": ["Directive"]
            }],
            "@angular-eslint/directive-selector":                ["error", {
                "type":   "attribute",
                "prefix": "game",
                "style":  "camelCase"
            }],
            "@angular-eslint/no-conflicting-lifecycle":          ["error"],
            "@angular-eslint/no-duplicates-in-metadata-arrays":  ["error"],
            "@angular-eslint/no-empty-lifecycle-method":         ["error"],
            "@angular-eslint/no-input-rename":                   ["error"],
            "@angular-eslint/no-output-native":                  ["error"],
            "@angular-eslint/no-output-on-prefix":               ["error"],
            "@angular-eslint/no-output-rename":                  ["error"],
            "@angular-eslint/no-pipe-impure":                    ["error"],
            "@angular-eslint/no-queries-metadata-property":      ["error"],
            "@angular-eslint/pipe-prefix":                       ["error", {
                "prefixes": ["srch"]
            }],
            "@angular-eslint/prefer-output-readonly":            ["warn"],
            "@angular-eslint/prefer-standalone":                 ["off"],
            "@angular-eslint/relative-url-prefix":               ["warn"],
            "@angular-eslint/use-component-selector":            ["error"],
            "@angular-eslint/use-component-view-encapsulation":  ["warn"],
            "@angular-eslint/use-injectable-provided-in":        ["error"],
            "@angular-eslint/use-lifecycle-interface":           ["error"],
            "@angular-eslint/use-pipe-transform-interface":      ["error"],
        }
    },

    // Unit Tests Configuration -----------------------------------------------
    {
        files: ["**/*.spec.ts", "**/*.e2e-spec.ts"],
        extends: [
            js.configs.recommended,
            ...tseslint.configs.recommended,
            ...tseslint.configs.stylistic,
            ...angular.configs.tsRecommended
        ],
        processor: angular.processInlineTemplates,

        languageOptions: {
            parserOptions: {
                projectService: true
            },
        },

        plugins: {
            jest
        },

        rules: {
            ...jest.configs["flat/recommended"].rules,
            ...jest.configs["flat/style"].rules,

            // ESLint: Suggestions (https://eslint.org/docs/latest/rules/#suggestions) ------------------------------------------
            "dot-notation":           ["off"],
            "@typescript-eslint/dot-notation": ["off"],
            "max-lines-per-function": ["warn", {
                "max": 400
            }],

            // TypeScript: ESLint Extension Rules (https://typescript-eslint.io/rules/) -----------------------------------------
            "no-empty-function": ["off"],
            "@typescript-eslint/no-empty-function": ["off"],

            // Jest Plugin (https://github.com/jest-community/eslint-plugin-jest) ------------------------------------------------
            "jest/max-nested-describe":           ["warn", {
                "max": 5
            }],
            "jest/no-conditional-in-test":        ["warn"],
            "jest/no-confusing-set-timeout":      ["warn"],
            "jest/no-duplicate-hooks":            ["error"],
            "jest/no-identical-title":            ["error"],
            "jest/no-jasmine-globals":            ["error"],
            "jest/no-mocks-import":               ["error"],
            "jest/no-test-prefixes":              ["warn"],
            "jest/no-test-return-statement":      ["error"],
            "jest/prefer-comparison-matcher":     ["warn"],
            "jest/prefer-each":                   ["warn"],
            "jest/prefer-equality-matcher":       ["warn"],
            "jest/prefer-expect-assertions":      ["warn", {
                "onlyFunctionsWithAsyncKeyword": true
            }],
            "jest/prefer-expect-resolves":        ["warn"],
            "jest/prefer-hooks-in-order":         ["warn"],
            "jest/prefer-hooks-on-top":           ["warn"],
            "jest/prefer-jest-mocked":            ["warn"],
            "jest/prefer-mock-promise-shorthand": ["warn"],
            "jest/prefer-spy-on":                 ["warn"],
            "jest/prefer-strict-equal":           ["warn"],
            "jest/prefer-to-be":                  ["warn"],
            "jest/prefer-to-contain":             ["warn"],
            "jest/prefer-to-have-length":         ["warn"],
            "jest/prefer-todo":                   ["warn"],
            "jest/require-to-throw-message":      ["warn"],
            "jest/require-top-level-describe":    ["error"],
            "jest/valid-describe-callback":       ["error"],
            "jest/valid-expect":                  ["error"],
            "jest/valid-expect-in-promise":       ["error"],
            "jest/valid-title":                   ["error"],
        }
    },

    // Template Files Configuration -------------------------------------------
    {
        files: ["**/*.html"],
        ignores: ["**/ie-upgrade.html"],
        extends: [
            ...angular.configs.templateRecommended,
            ...angular.configs.templateAccessibility,
        ],

        rules: {
            // Angular Template: Possible Problems (https://github.com/angular-eslint/angular-eslint/blob/main/packages/eslint-plugin-template/docs/rules/no-duplicate-attributes.md) -----
            "@angular-eslint/template/no-duplicate-attributes": ["error"],

            // Angular Template: Suggestions (https://github.com/angular-eslint/angular-eslint/blob/main/packages/eslint-plugin-template/README.md#suggestions) ---------------------------
            "@angular-eslint/template/alt-text":                     ["warn"],
            "@angular-eslint/template/banana-in-box":                ["error"],
            "@angular-eslint/template/button-has-type":              ["warn"],
            "@angular-eslint/template/click-events-have-key-events": ["warn"],
            "@angular-eslint/template/conditional-complexity":       ["warn", {
                "maxComplexity": 5
            }],
            "@angular-eslint/template/elements-content":             ["warn"],
            "@angular-eslint/template/eqeqeq":                       ["warn"],
            "@angular-eslint/template/interactive-supports-focus":   ["warn"],
            "@angular-eslint/template/label-has-associated-control": ["warn"],
            "@angular-eslint/template/mouse-events-have-key-events": ["warn"],
            "@angular-eslint/template/no-any":                       ["error"],
            "@angular-eslint/template/no-autofocus":                 ["warn"],
            "@angular-eslint/template/no-distracting-elements":      ["error"],
            "@angular-eslint/template/no-negated-async":             ["error"],
            "@angular-eslint/template/no-positive-tabindex":         ["error"],
            "@angular-eslint/template/prefer-control-flow":          ["warn"],
            "@angular-eslint/template/prefer-ngsrc":                 ["warn"],
            "@angular-eslint/template/role-has-required-aria":       ["warn"],
            "@angular-eslint/template/table-scope":                  ["warn"],
            "@angular-eslint/template/use-track-by-function":        ["warn"],
            "@angular-eslint/template/valid-aria":                   ["warn"],
        }
    }
]);
