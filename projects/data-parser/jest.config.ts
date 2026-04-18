import type { Config } from "jest";

const config: Config = {
    rootDir: ".",
    testEnvironment: "node",
    testMatch: ["<rootDir>/src/**/*.spec.ts"],
    moduleFileExtensions: ["ts", "js", "json"],
    extensionsToTreatAsEsm: [".ts"],
    transform: {
        "^.+\\.ts$": [
            "ts-jest",
            {
                useESM: true,
                tsconfig: "<rootDir>/tsconfig.spec.json"
            }
        ]
    },
    moduleNameMapper: {
        "^@common/(.*)$": "<rootDir>/../common/$1",
        "^chalk$": "<rootDir>/src/test/mocks/chalk.ts",
        "^(\\.{1,2}/.*)\\.js$": "$1"
    }
};

export default config;
