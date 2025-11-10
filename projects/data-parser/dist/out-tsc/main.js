import chalk from "chalk";
import fs from "fs";
/* ==========================================================================
    Internal Properties
   ========================================================================== */
const dataSourceFolder = "./data";
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
    });
});
