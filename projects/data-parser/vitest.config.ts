import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const localPath = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
    root: localPath("./"),
    resolve: {
        alias: {
            "@common": localPath("../common"),
            "@lib": localPath("../lib"),
            "@shared-lib": localPath("../lib"),
            chalk: localPath("./src/test/mocks/chalk.ts"),
            puppeteer: localPath("./src/test/mocks/puppeteer.ts"),
        },
    },
    test: {
        name: "data-parser",
        environment: "node",
        include: ["src/**/*.spec.ts"],
        clearMocks: true,
        restoreMocks: true,
    },
});
