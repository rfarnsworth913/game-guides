import { jest } from "@jest/globals";
import type { Config } from "jest";

const config: Config = {

    rootDir: "./",

    projects: [
        {
            displayName: "game-guides",
            testMatch: [
                "<rootDir>/projects/guide/**/*.spec.ts"
            ],
        },
        {
            displayName: "server",
            testMatch: [
                "<rootDir>/projects/server/**/*.spec.ts"
            ]
        }
    ]
};

export default config;
