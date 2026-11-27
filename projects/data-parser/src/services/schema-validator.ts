import Ajv from "ajv";
const ajv = new Ajv();

import type { DataFile } from "@lib/types";

export class SchemaValidator {

    // Internal Properties ----------------------------------------------------
    private static readonly configSchema = {
        type: "object",

        properties: {
            id: { type: "string" },
            gameId: { type: "string", minLength: 1 },
            sourceList: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        id: { type: "string" },
                        url: { type: "string" }
                    },
                    required: ["id", "url"]
                }
            }
        },

        required: ["id", "sourceList"]
    };


    /**
     * Validates that the configuration file follows the defined schema.
     *
     * @param config - The configuration object to validate against the schema.
     */
    private static readonly validator = ajv.compile<DataFile>(SchemaValidator.configSchema);

    static validate(config: unknown): config is DataFile {
        return SchemaValidator.validator(config);
    }

    static errors(config: unknown): string[] {
        if (SchemaValidator.validator(config)) {return [];}
        return (SchemaValidator.validator.errors ?? []).map(error => `${error.instancePath || '/'}: ${error.message ?? 'Invalid configuration'}`);
    }

}
