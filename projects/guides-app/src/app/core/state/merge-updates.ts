/** Rebase a local edit onto newer data without overwriting concurrent changes.
 * Arrays are atomic: concurrent row edits/reordering require explicit review.
 */
export function mergeUpdates<T>(base: T, edited: T, latest: T): T {
    if (equal(edited, base)) return latest;
    if (equal(latest, base) || equal(edited, latest)) return edited;
    if ((base === undefined || object(base)) && object(edited) && object(latest)) {
        const original: Record<string, unknown> = object(base) ? base : {};
        const result: Record<string, unknown> = {};
        for (const key of new Set([...Object.keys(original), ...Object.keys(edited), ...Object.keys(latest)])) {
            const value = mergeUpdates(original[key], edited[key], latest[key]);
            if (value !== undefined) Object.defineProperty(result, key, { value, enumerable: true, writable: true, configurable: true });
        }
        return result as T;
    }
    throw new Error('Another tab changed the same content. Your edit has not been saved; compare it with the latest guide before retrying.');
}

function object(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function equal(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, index) => equal(value, b[index]));
    if (object(a) && object(b)) {
        const keys = Object.keys(a).filter(key => a[key] !== undefined);
        return keys.length === Object.keys(b).filter(key => b[key] !== undefined).length && keys.every(key => equal(a[key], b[key]));
    }
    return false;
}
