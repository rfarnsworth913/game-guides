import { describe, expect, it } from "vitest";

import type { DataFile } from "@shared-lib/types";

import { SchemaValidator } from "./schema-validator";


// Support Methods ------------------------------------------------------------
/**
 * Supplies malformed JSON values that cannot be represented by the DataFile type.
 */
function validateInput (value: unknown): boolean {
    return SchemaValidator.validate(value as DataFile);
}


// Unit Tests -----------------------------------------------------------------
describe("Data Parser: Schema Validator", () => {

    it("accepts a complete configuration with multiple sources", () => {
        const config: DataFile = {
            id: "Arknights: Endfield",
            sourceList: [
                { id: "Version", url: "https://endfield.wiki.gg/" },
                { id: "Events", url: "https://example.com/events" },
            ],
            configuration: { region: "global", enabled: true },
        };

        expect(SchemaValidator.validate(config)).toBe(true);
    });

    it.each([
        { id: "Genshin Impact" },
        { id: "Genshin Impact", sourceList: globalThis.undefined },
    ])("rejects a missing required source list (%j)", (config) => {
        expect(validateInput(config)).toBe(false);
    });

    it("accepts an empty source list", () => {
        expect(SchemaValidator.validate({ id: "Genshin Impact", sourceList: [] })).toBe(true);
    });

    it.each([
        ["null", null],
        ["an array", []],
        ["a string", "Genshin Impact"],
        ["a number", 42],
        ["a boolean", false],
        ["an absent value", globalThis.undefined],
    ])("rejects %s as the configuration root", (_description, value) => {
        expect(validateInput(value)).toBe(false);
    });

    it.each([
        ["missing", {}],
        ["null", { id: null }],
        ["numeric", { id: 42 }],
        ["boolean", { id: true }],
        ["array", { id: ["genshin"] }],
        ["object", { id: { name: "genshin" } }],
    ])("rejects a %s root id", (_description, config) => {
        expect(validateInput({ ...config, sourceList: [] })).toBe(false);
    });

    it.each([
        ["null", null],
        ["an object", { id: "Version", url: "https://example.com" }],
        ["a string", "https://example.com"],
        ["a number", 1],
    ])("rejects a source list containing %s instead of an array", (_description, sourceList) => {
        expect(validateInput({ id: "genshin", sourceList })).toBe(false);
    });

    it.each([
        ["null", null],
        ["an array", []],
        ["a string", "https://example.com"],
        ["a number", 1],
        ["missing both fields", {}],
        ["missing id", { url: "https://example.com" }],
        ["missing url", { id: "Version" }],
        ["a null id", { id: null, url: "https://example.com" }],
        ["a numeric id", { id: 1, url: "https://example.com" }],
        ["a null url", { id: "Version", url: null }],
        ["a numeric url", { id: "Version", url: 1 }],
        ["an object url", { id: "Version", url: {} }],
    ])("rejects a source entry with %s", (_description, source) => {
        expect(validateInput({ id: "genshin", sourceList: [source] })).toBe(false);
    });

    it("rejects the entire configuration when a later source is invalid", () => {
        expect(validateInput({
            id: "genshin",
            sourceList: [
                { id: "Version", url: "https://example.com/version" },
                { id: "Events" },
            ],
        })).toBe(false);
    });

    it("allows additional root and source properties without removing them", () => {
        const config = {
            id: "genshin",
            sourceList: [{ id: "Version", url: "https://example.com", language: "en" }],
            configuration: { nested: { enabled: true } },
            custom: [1, 2, 3],
        };
        const original = structuredClone(config);

        expect(validateInput(config)).toBe(true);
        expect(config).toEqual(original);
    });

    it("does not impose nonempty-string or URL-format rules absent from the schema", () => {
        expect(validateInput({ id: "", sourceList: [{ id: "", url: "not a URL" }] })).toBe(true);
    });

    it("does not coerce invalid field types or mutate rejected data", () => {
        const config = { id: 123, sourceList: [{ id: "Version", url: 456 }] };
        const original = structuredClone(config);

        expect(validateInput(config)).toBe(false);
        expect(config).toEqual(original);
    });

    it("validates each call independently after previous successes and failures", () => {
        const valid: DataFile = { id: "genshin", sourceList: [] };
        const invalid = { id: "genshin", sourceList: [{ id: "Version" }] };

        expect(SchemaValidator.validate(valid)).toBe(true);
        expect(validateInput(invalid)).toBe(false);
        expect(SchemaValidator.validate(valid)).toBe(true);
        expect(validateInput(invalid)).toBe(false);
    });
});
