import chalk from "chalk";
import fs from "fs";
import path from "path";

import { DataFile } from "./lib/types";
import * as Parsers from "./parsers";

/* ==========================================================================
    Internal Properties
   ========================================================================== */
const dataSourceFolder = path.join(process.cwd(), "projects/data-parser/data");

/* ==========================================================================
    Processing Controller
   ========================================================================== */
fs.readdir(dataSourceFolder, (err, files) => {


    // Handle Error Conditions ------------------------------------------------
    if (err) {
        console.error(chalk.red("Error reading data source folder: "), err);
        process.exit(1);
    }

    // Handle Files Processing ------------------------------------------------
    files.forEach((file) => {
        console.info(chalk.blue("Processing file: "), file);

        const fileContent = fs.readFileSync(path.join(dataSourceFolder, file), "utf-8");
        const dataFile = JSON.parse(fileContent) as DataFile;
        const { id } = dataFile;

        switch (id) {
        case "Genshin Impact": {
            new Parsers.GenshinImpactParser(dataFile);
            break;
        }

        default:
            console.warn(chalk.yellow("No parser available for data file: "), id);
            break;
        }
    });
});
