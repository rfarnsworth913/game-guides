/**
 * Utility method to create a pause in async functions
 *
 * @param ms - The number of milliseconds to pause
 * @returns  A promise that resolves after the specified time
 */
export async function timeout(ms: number) {
    return new Promise((resolve) => { setTimeout(resolve, ms); });
}
