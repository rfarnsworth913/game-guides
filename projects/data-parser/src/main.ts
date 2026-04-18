import chalk from "chalk";
import fs from "fs";
import path from "path";

import { DataFile } from "@common/types";
import * as Parsers from "./parsers";


/* ==========================================================================
    Internal Properties
   ========================================================================== */
const dataSourceFolder = path.join(process.cwd(), "projects/data-parser/config");


/* ==========================================================================
    Processing Controller (sequential)
   ========================================================================== */
(async () => {

    // Load Data Source Files -------------------------------------------------
    let files: Array<string>;

    try {
        files = fs.readdirSync(dataSourceFolder);
    } catch (err) {
        console.error(chalk.red("Error reading data source folder: "), err);
        process.exit(1);
        return; // for type-narrowing
    }

    // Handle Files Processing ------------------------------------------------
    for (const file of files) {
        console.info(chalk.blue("Processing file: "), file);

        const fileContent = fs.readFileSync(path.join(dataSourceFolder, file), "utf-8");
        const dataFile = JSON.parse(fileContent) as DataFile;
        const { id } = dataFile;

        try {
            switch (id) {

                case "Genshin Impact": {
                    const parser = new Parsers.GenshinImpactParser(dataFile);
                    await parser.parseData();
                    break;
                }

                case "Honkai Star Rail": {
                    const parser = new Parsers.HonkaiStarRailParser(dataFile);
                    await parser.parseData();
                    break;
                }

                case "Wuthering Waves": {
                    const parser = new Parsers.WutheringWavesParser(dataFile);
                    await parser.parseData();
                    break;
                }

                default:
                    console.warn(chalk.yellow("No parser available for data file: "), id);
                    break;
            }
        } catch (parserError) {
            console.error(chalk.red(`Error parsing ${id} data: `), parserError);
        }
    }

})().catch((e) => {
    console.error(chalk.red("Unexpected error while processing files: "), e);
    process.exit(1);
});
