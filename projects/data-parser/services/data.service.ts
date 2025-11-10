import chalk from "chalk";
import * as dotenv from "dotenv";
import * as mongoDB from "mongodb";

import { Events, RootDocument } from "../lib/types";


export class DataService {

    // Internal Properties ----------------------------------------------------
    private readonly dbConnection: mongoDB.MongoClient;
    private readonly db: mongoDB.Db;


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
    async connect(): Promise<void> {
        try {
            await this.dbConnection.connect();
            console.info("Database connection established successfully.");
        } catch (err) {
            console.error("Error establishing database connection:", err);
            throw err;
        }
    }

    /**
     * Closes the database connection and performs cleanup.
     */
    async disconnect(): Promise<void> {
        try {
            await this.dbConnection.close();
            console.info("Database connection closed successfully.");
        } catch (err) {
            console.error("Error closing database connection:", err);
            throw err;
        }
    }

    /**
     * Ensures the root document exists. If it does not exist, it creates it.
     *
     * @param rootDocumentName - The name of the root document.
     * @param subDocumentName  - The name of the sub-document to initialize (optional).
     * @returns                The root document.
     */
    private async getRootDocument(rootDocumentName: string, subDocumentName?: string): Promise<RootDocument> {
        const collection = this.db.collection(process.env["DB_COLLECTION"] ?? "");
        let rootDocument = await collection.findOne<RootDocument>({ name: rootDocumentName });

        if (!rootDocument) {
            console.info(chalk.yellow(`Root document '${rootDocumentName}' does not exist. Creating it.`));

            rootDocument = { _id: new mongoDB.ObjectId(), name: rootDocumentName };
            if (subDocumentName) {
                rootDocument[subDocumentName] = [];
            }
            await collection.insertOne(rootDocument);
        }

        return rootDocument;
    }

    /**
     * Ensures the sub-document exists within the root document. If it does not exist, it initializes it.
     *
     * @param rootDocument      - The root document.
     * @param rootDocument._id  - The unique identifier of the root document.
     * @param rootDocument.name - The name of the root document.
     * @param subDocumentName   - The name of the sub-document.
     * @returns                 The updated root document.
     */
    private getSubDocument(rootDocument: RootDocument, subDocumentName: string): RootDocument {
        if (!rootDocument[subDocumentName]) {
            console.info(chalk.yellow(`Sub-document '${subDocumentName}' does not exist. Creating it.`));
            rootDocument[subDocumentName] = [];
        }
        return rootDocument;
    }


    // Common Data Handlers ---------------------------------------------------

    /**
     * Cleans up expired items from a specified document and topic based on the provided filter function.
     *
     * @param documentName - The name of the document to clean.
     * @param topic        - The topic within the document to clean.
     * @param filterFn     - A function that determines whether an item should be retained (returns true) or removed (returns false).
     */
    async cleanupExpiredItems(documentName: string, topic: string, filterFn: (item: Events) => boolean): Promise<void> {
        try {

            // Get document to be cleaned -------------------------------------
            const collection = this.db.collection(process.env["DB_COLLECTION"] ?? "");
            const document = await collection.findOne({ name: documentName });

            if (!document) {
                console.warn(chalk.yellow(`No document found for '${documentName}'.`));
                return;
            }

            // Extract topic data ---------------------------------------------
            const items: Array<Events> = (document[topic] as Array<Events>) ?? [];
            const filteredItems = items.filter(filterFn);

            // Update database if any items were removed ----------------------
            if (filteredItems.length !== items.length) {
                await collection.updateOne(
                    { name: documentName },
                    { $set: { [topic]: filteredItems } }
                );
                console.info(chalk.green(`Updated '${documentName}' ${topic} in the database.`));
            } else {
                console.info(chalk.blue(`No changes to '${documentName}' ${topic}.`));
            }


        } catch (err) {
            console.error(chalk.red(`Error cleaning up expired items for ${documentName} - ${topic}: `), err);
            throw err;
        }
    }

    /**
     * Adds only new records to the specified sub-document of the root document.
     *
     * @param rootDocumentName - The name of the root document (e.g., "Genshin Impact").
     * @param subDocumentName  - The name of the sub-document (e.g., "Events").
     * @param records          - The array of records to add.
     */
    async addRecords<T extends { title: string }>(
        rootDocumentName: string,
        subDocumentName: string,
        records: Array<T>
    ): Promise<void> {
        try {
            const collection = this.db.collection(process.env["DB_COLLECTION"] ?? "");
            let rootDocument = await this.getRootDocument(rootDocumentName, subDocumentName);
            rootDocument = this.getSubDocument(rootDocument, subDocumentName);

            // Add only new records to the sub-document -----------------------
            const existingRecords: Array<T> = rootDocument[subDocumentName] as Array<T>;
            const newRecords: Array<T> = [];

            records.forEach((record: T) => {
                const exists = existingRecords.some(
                    (existing: T) => existing.title === record.title
                );

                if (!exists) {
                    newRecords.push(record);
                    console.info(chalk.green(`Added new record: ${record.title}`));
                }
            });

            // Update the database
            await collection.updateOne(
                { name: rootDocumentName },
                { $set: { [subDocumentName]: [...existingRecords, ...newRecords] } }
            );

            console.info(chalk.green(`Successfully updated '${subDocumentName}' in '${rootDocumentName}'.`));
        } catch (err) {
            console.error(chalk.red("Error adding records: "), err);
            throw err;
        }
    }
}
