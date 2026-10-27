/** Parser unit tests use supplied source data; browser automation belongs in integration tests. */
export function launch (): never {
    throw new Error("Unexpected browser launch in a parser unit test. Mock the browser operation explicitly.");
}
