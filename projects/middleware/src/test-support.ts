import { Security } from './auth';
/** Explicit test fixture. Runtime defaults always deny protected requests. */
export const editorFixture: Security = {
    async handle() {
        return false;
    },
    async requireUser() {
        return { id: 'test', name: 'Test', csrf: 'test', editor: true };
    },
    async requireEditor() {
        return { id: 'test', name: 'Test', csrf: 'test', editor: true };
    },
};
