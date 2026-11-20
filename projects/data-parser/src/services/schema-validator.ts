import Ajv from "ajv";
const ajv = new Ajv();

import type { DataFile } from "@shared-lib/types";

export class SchemaValidator {

    // Internal Properties ----------------------------------------------------
    private static readonly configSchema = {
        type: "object",

        properties: {
            id: { type: "string" },
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
    static validate (config: DataFile): boolean {
        const validate = ajv.compile(SchemaValidator.configSchema);
        const valid = validate(config);

        return valid;
    }

}
