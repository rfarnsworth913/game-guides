/**
 * Utility method to create a pause in async functions
 *
 * @param ms - The number of milliseconds to pause
 * @returns  A promise that resolves after the specified time
 */
export async function timeout (ms: number) {
    return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/**
 * Extracts the first date in "Month Day, Year" format from a string.
 *
 * Example: "Season 11 starts January 16, 2026 and ends February 16, 2026"
 * returns "January 16, 2026".
 *
 * @param value - The source string to search.
 * @returns     The first matching date string, or an empty string if no match is found.
 */
export function getDateFromString (value: string): string {
    const monthPattern = [
        "January|February|March|April|May|June",
        "July|August|September|October|November|December"
    ].join("|");
    const datePattern = new RegExp(`\\b(?:${monthPattern})\\s+\\d{1,2},\\s+\\d{4}\\b`);
    const match = value.match(datePattern);

    return match ? match[0] : "";
}

/**
 * Removes date strings from a string.
 *
 * Supported formats:
 * - Month Day, Year (e.g. January 16, 2026)
 * - YYYY-MM-dd (e.g. 2026-03-06)
 *
 * @param title - The source string.
 * @returns     The string without supported date formats.
 */
export function removeDatesFromString (title: string): string {
    const monthDayYear = "(?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{1,2},\\s+\\d{4}";
    const isoDate = "\\d{4}-\\d{2}-\\d{2}";
    const datePattern = new RegExp(`\\b(?:${monthDayYear}|${isoDate})\\b`, "g");

    return title.replace(datePattern, "").trim();
}
