import chalk from "chalk";
import * as dotenv from "dotenv";
import * as mongoDB from "mongodb";
export class DataService {
    // Internal Properties ----------------------------------------------------
    dbConnection;
    db;
    // Constructor ------------------------------------------------------------
    constructor() {
        dotenv.config();
        this.dbConnection = new mongoDB.MongoClient(process.env["DB_CONN_STRING"] ?? "");
        this.db = this.dbConnection.db(process.env["DB_NAME"]);
        this.connect().catch((err) => {
            console.error("Failed to connect to the database:", err);
        });
    }
    // Generic DB Methods -----------------------------------------------------
    /**
     * Establishes the database connection and prepares it for usage.
     */
    async connect() {
        try {
            await this.dbConnection.connect();
            console.info("Database connection established successfully.");
        }
        catch (err) {
            console.error("Error establishing database connection:", err);
            throw err;
        }
    }
    /**
     * Closes the database connection and performs cleanup.
     */
    async disconnect() {
        try {
            await this.dbConnection.close();
            console.info("Database connection closed successfully.");
        }
        catch (err) {
            console.error("Error closing database connection:", err);
            throw err;
        }
    }
    // Common Data Handlers ---------------------------------------------------
    /**
     * Cleans up expired items from a specified document and topic based on the provided filter function.
     *
     * @param documentName - The name of the document to clean.
     * @param topic        - The topic within the document to clean.
     * @param filterFn     - A function that determines whether an item should be retained (returns true) or removed (returns false).
     */
    async cleanupExpiredItems(documentName, topic, filterFn) {
        try {
            // Get document to be cleaned -------------------------------------
            const collection = this.db.collection(process.env["DB_COLLECTION"] ?? "");
            const document = await collection.findOne({ name: documentName });
            if (!document) {
                console.warn(chalk.yellow(`No document found for '${documentName}'.`));
                return;
            }
            // Extract topic data ---------------------------------------------
            const items = document[topic] ?? [];
            const filteredItems = items.filter(filterFn);
            // Update database if any items were removed ----------------------
            if (filteredItems.length !== items.length) {
                await collection.updateOne({ name: documentName }, { $set: { [topic]: filteredItems } });
                console.info(chalk.green(`Updated '${documentName}' ${topic} in the database.`));
            }
            else {
                console.info(chalk.blue(`No changes to '${documentName}' ${topic}.`));
            }
        }
        catch (err) {
            console.error(chalk.red(`Error cleaning up expired items for ${documentName} - ${topic}: `), err);
            throw err;
        }
    }
}
