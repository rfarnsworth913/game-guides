import type { Config } from "jest";

const config: Config = {
    displayName: "data-parser",
    rootDir: "./",
    testEnvironment: "node",
    testMatch: ["<rootDir>/**/*.spec.ts"],
    moduleFileExtensions: ["ts", "js", "json"],
    extensionsToTreatAsEsm: [".ts"],
    transform: {
        "^.+\\.(ts|tsx)$": [
            "ts-jest",
            {
                useESM: true,
                tsconfig: "<rootDir>/tsconfig.json"
            }
        ],
        "^.+\\.[mc]?js$": [
            "babel-jest",
            {
                presets: [
                    ["@babel/preset-env", { targets: { node: "current" } }]
                ]
            }
        ]
    },
    transformIgnorePatterns: ["/node_modules/(?!chalk/)"],
    moduleNameMapper: {
        "^(\\.{1,2}/.*)\\.js$": "$1"
    }
};

export default config;
