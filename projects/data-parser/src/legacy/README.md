# Legacy parsers

The classes under `parsers/` are deprecated implementations retained with their regression tests. The application entry point is `src/main.ts`, which runs `src/sync/runner.ts`.

Do not add production behavior here. Implement source extraction in `sync/source-adapters.ts` / `sync/extract.ts`, recurrence in `sync/recurring-events.ts`, and persistence in `services/data-service.ts`. ESLint prevents production parser modules from importing this folder.

Before removing a legacy implementation, preserve any still-relevant fixture and regression coverage in the active pipeline. Retaining these files does not enable a second production import path.
