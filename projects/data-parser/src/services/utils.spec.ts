import { getDateFromString, removeDatesFromString } from "./utils";

describe("getDateFromString", () => {
    it("returns the first Month Day, Year date found in a string", () => {
        const value = "Season 11 starts January 16, 2026 and ends February 16, 2026";

        expect(getDateFromString(value)).toBe("January 16, 2026");
    });

    it("returns an empty string when no matching date is found", () => {
        const value = "No date is available in this text.";

        expect(getDateFromString(value)).toBe("");
    });
});

describe("removeDatesFromString", () => {
    it("removes Month Day, Year dates from a title", () => {
        const value = "Version Update January 16, 2026";

        expect(removeDatesFromString(value)).toBe("Version Update");
    });

    it("removes YYYY-MM-dd dates from a title", () => {
        const value = "Patch Notes 2026-03-06";

        expect(removeDatesFromString(value)).toBe("Patch Notes");
    });

    it("removes both supported date formats when present", () => {
        const value = "Event January 16, 2026 2026-03-06";

        expect(removeDatesFromString(value)).toBe("Event");
    });
});
