# GameGuides

A personal progression workspace for Genshin Impact, Honkai: Star Rail, Wuthering Waves,
Zenless Zone Zero, and Arknights: Endfield. The Angular frontend runs independently of
the database and parser projects.

Run `npm run ui:start` and open http://localhost:4200. The root and legacy `/gacha`
URLs lead to the dashboard. Choose a game to open its own workspace at `/games/:game/:page`. Inventory, characters, teams, plans, story guides, and farming belong to that game. The global overview summarizes progress across games.

Start by adding inventory items (including items with zero quantity) and characters.
Create plans with manually entered material requirements, then use Farming to see
combined shortages. Teams link your characters; story steps support ordered progression
and required, recommended, or optional priority. No sample player data or live game
catalog is loaded. Automatic game-specific upgrade recipes are not included.

Achievements are grouped into game-specific categories with a symbol, emoji, or image URL icon,
wiki reference, completion reward, and automatically calculated completion counts.
Categories and individual achievements support reference URLs linked from their titles.
Each achievement stores its title, requirements, rewards, and completion checkbox, with
requirements and rewards shown in separate columns on desktop.
Earlier standalone achievements are grouped automatically without losing their progress.
Deleting a category also deletes its achievements after confirmation.

Data is stored under `gg-workspace-v1` in localStorage, with appearance and game context
stored separately. There is no account, backend, or device sync. Settings provides JSON
export and import; import merges entries by ID. Clearing browser storage removes local
data. Completing a plan removes its farming requirements without consuming inventory.

Validation: `npm run ui:build`, `npm run ui:test -- --watch=false`, and (with the dev
server running) `node scripts/workspace-smoke.mjs`. The browser test uses an isolated
Chrome profile and does not modify your personal workspace.

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.2.7.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
