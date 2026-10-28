# Refactoring inventory and planning

Snapshot: October 28, 2026. Paths are relative to the repository root.

This document records the current project structure as a baseline for planning refactors. The tree lists every existing tracked file and every non-ignored untracked file, including assets, tests, configuration, and this document. Folder entries are derived from those paths. It describes the current layout; proposed review areas below are not completed changes.

Local dependencies, Git internals, generated output, backups, and runtime data are listed separately rather than expanding their contents. Empty folders and ignored local files are outside the repository tree. Tracked files inside ignored folders are included, such as the workspace smoke screenshots under `.angular/`.

## Project areas

| Path | Current responsibility | Refactoring review area |
| --- | --- | --- |
| `projects/common/` | Shared models, configuration, constants, enums, and types | Review domain ownership and consistent placement of root models versus `types/`; preserve shared import contracts. |
| `projects/data-parser/` | Game parser configuration, parsers, services, mocks, and tests | Review parser interfaces and shared service boundaries before changing game-specific parsing. |
| `projects/guides-app/` | Angular application, components, workspace features, styles, and game images | Review the large `src/app/workspace/` folder for feature groupings; move related templates, styles, and tests together. |
| `projects/middleware/` | API, authentication, persistence, migrations, launchers, and integration checks | Review boundaries between request handling, document transformations, repository access, and startup scripts. |
| `scripts/` | Browser smoke checks | Review shared setup and ownership alongside middleware integration checks. |
| `docs/` | Architecture notes, feature documentation, implementation instructions, and baselines | Keep the organization guide and this inventory aligned with any accepted moves. |
| `.github/workflows/` | CI and browser integration workflows | Update path filters and commands when affected files move. |
| `.vscode/` | Shared editor tasks, launch configuration, extensions, and tool configuration | Update workspace paths after moves. |
| Root configuration | Package scripts, dependencies, Angular, TypeScript, lint, and formatting settings | Check aliases, build inputs, test discovery, and script paths after moves. |

## Complete repository file and folder inventory

The inventory contains **437 files** in **50 folders** (excluding the repository root). Every file is named individually.

```text
game-guides/
|-- .angular/
|   `-- workspace-smoke/
|       |-- desktop.png
|       `-- mobile.png
|-- .github/
|   `-- workflows/
|       |-- browser-integration.yml
|       `-- ci.yml
|-- .vscode/
|   |-- extensions.json
|   |-- launch.json
|   |-- mcp.json
|   `-- tasks.json
|-- docs/
|   |-- browser-integration.md
|   |-- character-management.md
|   |-- code-organization.md
|   |-- implementation-guide.md
|   |-- lint-baseline-2026-10-27.md
|   `-- refactoring.md
|-- projects/
|   |-- common/
|   |   |-- constants/
|   |   |   |-- date.constants.ts
|   |   |   |-- index.ts
|   |   |   `-- world-quest.constants.ts
|   |   |-- enums/
|   |   |   |-- event-types.enum.ts
|   |   |   |-- index.ts
|   |   |   `-- story-tracking.enum.ts
|   |   |-- types/
|   |   |   |-- data-collections.type.ts
|   |   |   |-- data-file.type.ts
|   |   |   |-- index.ts
|   |   |   |-- story-group.type.ts
|   |   |   `-- world-quest.type.ts
|   |   |-- auth0-config.ts
|   |   |-- characters.ts
|   |   |-- game-images.ts
|   |   |-- main-quest.ts
|   |   |-- player-progress.ts
|   |   |-- story-content-types.ts
|   |   |-- story-guide.ts
|   |   |-- story-template.ts
|   |   |-- tsconfig.common.json
|   |   |-- tsconfig.lint.json
|   |   |-- workspace.ts
|   |   `-- world-quest.ts
|   |-- data-parser/
|   |   |-- config/
|   |   |   |-- arknights-endfield.json
|   |   |   |-- fate-grand-order.json
|   |   |   |-- genshin-impact.json
|   |   |   |-- honkai-star-rail.json
|   |   |   |-- wuthering-waves.json
|   |   |   `-- zenless-zone-zero.json
|   |   |-- src/
|   |   |   |-- parsers/
|   |   |   |   |-- abstract-data-parser.ts
|   |   |   |   |-- arknights-endfield.ts
|   |   |   |   |-- genshin-impact.spec.ts
|   |   |   |   |-- genshin-impact.ts
|   |   |   |   |-- honkai-star-rail.spec.ts
|   |   |   |   |-- honkai-star-rail.ts
|   |   |   |   |-- index.ts
|   |   |   |   |-- wuthering-waves.spec.ts
|   |   |   |   |-- wuthering-waves.ts
|   |   |   |   `-- zenless-zone-zero.ts
|   |   |   |-- services/
|   |   |   |   |-- data-service.spec.ts
|   |   |   |   |-- data-service.ts
|   |   |   |   |-- index.ts
|   |   |   |   |-- logger.ts
|   |   |   |   |-- utils.spec.ts
|   |   |   |   `-- utils.ts
|   |   |   |-- test/
|   |   |   |   `-- mocks/
|   |   |   |       |-- chalk.ts
|   |   |   |       `-- puppeteer.ts
|   |   |   `-- main.ts
|   |   |-- jest.config.ts
|   |   |-- tsconfig.app.json
|   |   |-- tsconfig.json
|   |   |-- tsconfig.lint.json
|   |   `-- tsconfig.spec.json
|   |-- guides-app/
|   |   |-- public/
|   |   |   |-- images/
|   |   |   |   `-- zenless-zone-zero/
|   |   |   |       |-- miyabi-computer-01.webp
|   |   |   |       |-- miyabi-computer-02.webp
|   |   |   |       |-- miyabi-computer-03.webp
|   |   |   |       |-- miyabi-computer-04.webp
|   |   |   |       |-- miyabi-computer-05.webp
|   |   |   |       `-- miyabi-computer-06.webp
|   |   |   `-- favicon.ico
|   |   |-- src/
|   |   |   |-- app/
|   |   |   |   |-- common/
|   |   |   |   |   |-- header/
|   |   |   |   |   |   |-- header.html
|   |   |   |   |   |   |-- header.scss
|   |   |   |   |   |   `-- header.ts
|   |   |   |   |   |-- theme-example/
|   |   |   |   |   |   `-- theme-example.component.ts
|   |   |   |   |   `-- theme-switcher/
|   |   |   |   |       |-- theme-switcher.html
|   |   |   |   |       |-- theme-switcher.scss
|   |   |   |   |       `-- theme-switcher.ts
|   |   |   |   |-- lib/
|   |   |   |   |   `-- types/
|   |   |   |   |       |-- index.ts
|   |   |   |   |       `-- theme.type.ts
|   |   |   |   |-- pages/
|   |   |   |   |   `-- gacha/
|   |   |   |   |       |-- overview/
|   |   |   |   |       |   |-- overview.html
|   |   |   |   |       |   |-- overview.scss
|   |   |   |   |       |   |-- overview.spec.ts
|   |   |   |   |       |   `-- overview.ts
|   |   |   |   |       |-- sidebar/
|   |   |   |   |       |   |-- sidebar.html
|   |   |   |   |       |   |-- sidebar.scss
|   |   |   |   |       |   `-- sidebar.ts
|   |   |   |   |       |-- gacha.html
|   |   |   |   |       |-- gacha.scss
|   |   |   |   |       `-- gacha.ts
|   |   |   |   |-- services/
|   |   |   |   |   `-- theme-switcher/
|   |   |   |   |       |-- theme.service.spec.ts
|   |   |   |   |       `-- theme.service.ts
|   |   |   |   |-- workspace/
|   |   |   |   |   |-- account-menu.html
|   |   |   |   |   |-- account-menu.scss
|   |   |   |   |   |-- account-menu.spec.ts
|   |   |   |   |   |-- account-menu.ts
|   |   |   |   |   |-- achievements.html
|   |   |   |   |   |-- achievements.ts
|   |   |   |   |   |-- auth.store.spec.ts
|   |   |   |   |   |-- auth.store.ts
|   |   |   |   |   |-- back-to-top.scss
|   |   |   |   |   |-- back-to-top.ts
|   |   |   |   |   |-- character-information.ts
|   |   |   |   |   |-- characters.html
|   |   |   |   |   |-- characters.scss
|   |   |   |   |   |-- characters.spec.ts
|   |   |   |   |   |-- characters.store.spec.ts
|   |   |   |   |   |-- characters.ts
|   |   |   |   |   |-- dialog-focus.ts
|   |   |   |   |   |-- event-template.spec.ts
|   |   |   |   |   |-- game-image-picker.html
|   |   |   |   |   |-- game-image-picker.scss
|   |   |   |   |   |-- game-image-picker.spec.ts
|   |   |   |   |   |-- game-image-picker.ts
|   |   |   |   |   |-- lore.ts
|   |   |   |   |   |-- markdown.spec.ts
|   |   |   |   |   |-- markdown.ts
|   |   |   |   |   |-- merge-updates.ts
|   |   |   |   |   |-- patch-badge.ts
|   |   |   |   |   |-- patch-overview.html
|   |   |   |   |   |-- patch-overview.scss
|   |   |   |   |   |-- patch-overview.spec.ts
|   |   |   |   |   |-- patch-overview.ts
|   |   |   |   |   |-- story-content-list.html
|   |   |   |   |   |-- story-content-list.spec.ts
|   |   |   |   |   |-- story-content-list.ts
|   |   |   |   |   |-- story-content-types.spec.ts
|   |   |   |   |   |-- story-context-editor.html
|   |   |   |   |   |-- story-context-editor.ts
|   |   |   |   |   |-- story-dashboard.spec.ts
|   |   |   |   |   |-- story-dashboard.ts
|   |   |   |   |   |-- story-position.store.spec.ts
|   |   |   |   |   |-- story-position.store.ts
|   |   |   |   |   |-- story-progress.spec.ts
|   |   |   |   |   |-- story-progress.ts
|   |   |   |   |   |-- story-search.spec.ts
|   |   |   |   |   |-- story-search.ts
|   |   |   |   |   |-- story.html
|   |   |   |   |   |-- story.scss
|   |   |   |   |   |-- story.spec.ts
|   |   |   |   |   |-- story.ts
|   |   |   |   |   |-- workspace.html
|   |   |   |   |   |-- workspace.scss
|   |   |   |   |   |-- workspace.store.spec.ts
|   |   |   |   |   |-- workspace.store.ts
|   |   |   |   |   |-- workspace.ts
|   |   |   |   |   |-- world-quest.spec.ts
|   |   |   |   |   `-- world-quests.ts
|   |   |   |   |-- app.config.ts
|   |   |   |   |-- app.html
|   |   |   |   |-- app.routes.spec.ts
|   |   |   |   |-- app.routes.ts
|   |   |   |   |-- app.scss
|   |   |   |   `-- app.ts
|   |   |   |-- assets/
|   |   |   |   |-- arknights-endfield/
|   |   |   |   |   |-- a-fistful-of-feflections-a8d7c8ac-97ae-4538-a476-cdf27a2e1e6f.webp
|   |   |   |   |   |-- a-winter-dream-b0dc3be3-7b00-4bcb-aca2-2cd01b772645.webp
|   |   |   |   |   |-- aic-support-chubby-lung-attacks-47a9a0d3-679a-420c-a042-d3055b7eb52c.webp
|   |   |   |   |   |-- aic-support-palm-top-savior-a79cc20c-7c01-4857-95d2-8466a476e888.webp
|   |   |   |   |   |-- akekuri-2a291b1a-b34f-40a3-9a7b-8f7243af1f79.webp
|   |   |   |   |   |-- alesh-d17f9bd2-8e6c-46b4-bf9f-c1818a9ec122.webp
|   |   |   |   |   |-- antal-b250b31d-2ba0-4a31-8296-99e30d8f248f.webp
|   |   |   |   |   |-- arcane-dcc7b24d-b3f8-4ba5-85e1-c014fc9ef25f.webp
|   |   |   |   |   |-- arclight-ff1fa56c-e398-4c5e-8514-bfe01003d195.webp
|   |   |   |   |   |-- ardelia-051d521c-b0f1-40e3-8b0d-b620f4e747d8.webp
|   |   |   |   |   |-- arknights-endfield-valley-iv-divider-e4bd7f20-aa97-466a-b0ba-ae0dc0bd80d2.png
|   |   |   |   |   |-- at-the-wake-of-spring-ccb7dc06-d7c5-4306-9532-516cf0a5190b.webp
|   |   |   |   |   |-- avywenna-427d2cbd-e69d-4b5a-8865-a8ecca5f2cf8.webp
|   |   |   |   |   |-- camille-6a5d21e0-20e4-4554-b780-4d9f64cc9b65.webp
|   |   |   |   |   |-- carly-fairtale-of-the-valley-8605c940-a786-4633-8e6c-e4a70a4ed69f.webp
|   |   |   |   |   |-- carly-fairytale-of-wuling-f77b6863-36da-4ed2-8062-3e17c9daa097.webp
|   |   |   |   |   |-- catcher-8fb8d1de-36c6-423e-b415-8e57902979e5.webp
|   |   |   |   |   |-- chen-eec2673c-7af5-4131-9ca2-fe9d1be4518f.webp
|   |   |   |   |   |-- cleanse-and-rinse-0583d02e-a5d2-4630-9ada-1cfec6b0838c.webp
|   |   |   |   |   |-- contingency-contract-cfae7c02-ba47-4e01-b558-6cbbb883d418.webp
|   |   |   |   |   |-- curious-use-of-xiranite-366018fd-3e94-44ed-af52-f149624800d1.webp
|   |   |   |   |   |-- da-pan-ff303f4c-b6ad-4bdd-b11c-abc47175de0e.webp
|   |   |   |   |   |-- danse-macabre-6d9f651b-eb78-4e5f-abf4-937e40c174e9.webp
|   |   |   |   |   |-- delver-of-the-cryptic-f8101172-e5aa-49ed-9f4e-723ed6433b7e.webp
|   |   |   |   |   |-- dreamscape-of-wind-and-snow-02b54353-5239-463d-a8e0-18432dcf4e79.webp
|   |   |   |   |   |-- ember-1f9da638-3184-43c6-a543-07ddc27f766f.webp
|   |   |   |   |   |-- endfield-cryo-c4560adb-7e2f-4bd9-91e5-0fdf9c6b7e41.webp
|   |   |   |   |   |-- endfield-electric-9fa20e39-0b42-4066-99a4-f4e39be20ebe.webp
|   |   |   |   |   |-- endfield-heat-f314e043-57bb-45b1-a706-e5b15b180822.webp
|   |   |   |   |   |-- endfield-industries-1f7bb745-972c-4168-bb15-7a0b8a2220e3.webp
|   |   |   |   |   |-- endfield-physical-bd031ba3-e07a-4e58-b628-5534fe3eadd0.webp
|   |   |   |   |   |-- endministrator-9af3a059-684b-4716-8048-4f8cd508509c.webp
|   |   |   |   |   |-- estella-e5960922-2781-4424-bf4b-69ecf3e6cf01.webp
|   |   |   |   |   |-- etchings-of-our-cosmic-dream-f633b706-80e7-473d-a112-072e0b76f709.webp
|   |   |   |   |   |-- etchspace-salvage-937eb4dd-7def-4fd3-b508-6c5a8964fa9c.webp
|   |   |   |   |   |-- fluorite-3a7fb5c0-e12a-4f5c-a5f3-70ecd5de2dce.webp
|   |   |   |   |   |-- gilberta-82412738-0dad-44a8-b830-e6b4069e0ae5.webp
|   |   |   |   |   |-- homecoming-bb23e070-0ebc-4d01-99c6-cd01d195c1bc.webp
|   |   |   |   |   |-- hongshan-academy-sciences-32d25a45-8fe3-4a33-88af-39541e294128.webp
|   |   |   |   |   |-- laevatain-d4374578-f827-41ef-ae04-78f87d4312c5.webp
|   |   |   |   |   |-- last-rite-c21be1af-5080-48a5-b049-acbc1e95749b.webp
|   |   |   |   |   |-- let-the-fire-consume-the-ashen-past-77285774-59ef-4e80-8ec2-0742dffb4cd5.webp
|   |   |   |   |   |-- letter-from-a-messenger-86bb1819-91aa-4adb-bf93-b0cb6fc4d461.webp
|   |   |   |   |   |-- lifeng-21e74693-0085-4851-9fa9-54f3ee4ba8dd.webp
|   |   |   |   |   |-- like-a-star-streaking-through-the-boundaries-ffcae8c4-277e-4cc8-b2f8-fd597eb32423.webp
|   |   |   |   |   |-- lino-ff93794e-d3be-4bad-99fd-ff8c5011a7c3.webp
|   |   |   |   |   |-- lone-wolf-7460e7c3-dbc0-4480-ac87-80e8c6de884b.webp
|   |   |   |   |   |-- lost-in-the-marsh-931cadf4-d3ab-4264-9d51-ba621f91dc34.webp
|   |   |   |   |   |-- love-scream-and-the-prototype-508c4ff4-e8fe-4963-a0b7-9bfe44dc855c.webp
|   |   |   |   |   |-- mi-fu-076d5276-2a68-4d8a-9888-2d05b4be862e.webp
|   |   |   |   |   |-- nature-f9e1bfc8-8ef6-4e57-9bab-ba8550b2014e.webp
|   |   |   |   |   |-- old-deep-water-dies-5187eb40-73ba-4be3-8e29-cb0d7c209c42.webp
|   |   |   |   |   |-- path-of-ascension-1261bd91-60a2-4a9d-8b62-47a12c24338c.webp
|   |   |   |   |   |-- perlica-4ba36043-b9d4-4855-9293-7182b7fc8404.webp
|   |   |   |   |   |-- pogranichnik-7c84165b-cb05-4431-b1f3-52c50620d571.webp
|   |   |   |   |   |-- ponderous-load-8d3cbbfb-098a-41e8-835c-d5dd7c82279f.webp
|   |   |   |   |   |-- prologue-d61a51ae-5c56-47aa-86f8-2c79fef309d9.webp
|   |   |   |   |   |-- purrchena-7a14e251-8f41-4e4a-91a0-e7e692d9c54f.webp
|   |   |   |   |   |-- purry-big-feline-bc3ac2af-c438-4994-af72-ce40aca040e9.webp
|   |   |   |   |   |-- rhodes-island-d875728e-dc7c-4a6f-8c5a-94894c78607f.webp
|   |   |   |   |   |-- rossi-2f85270e-a305-4bfa-a284-9527a71121a3.webp
|   |   |   |   |   |-- rossi-2f85270e-a305-4bfa-a284-9527a71121a3.webp.json
|   |   |   |   |   |-- ruins-in-the-miasma-3aac03b1-2ef5-4e4f-9104-2d6053fac8f8.webp
|   |   |   |   |   |-- runners-steeplechase-6522dd19-0729-4c68-8830-9f0245e39ae8.webp
|   |   |   |   |   |-- sanctuary-from-the-rift-dbe1fcae-c9f0-4f2e-b245-e75ace42ae76.webp
|   |   |   |   |   |-- sketches-of-lost-heirlooms-d0739fc3-d5b5-4e59-8c2c-abf18ed10265.webp
|   |   |   |   |   |-- smoking-embers-66d7d994-ec1e-46ba-b83d-a8d80a58c743.webp
|   |   |   |   |   |-- snowshine-a63e0eca-bd0a-47a5-af25-85871b1c2b8d.webp
|   |   |   |   |   |-- supply-exploration-day-82c4ff38-edb6-4c9c-a99e-a79069365c41.webp
|   |   |   |   |   |-- supply-wuling-super-chef-27820a92-135e-4cb7-9100-f6e005f00ca9.webp
|   |   |   |   |   |-- survival-training-9f548f40-31d7-4a8c-abbf-efbbd046d922.webp
|   |   |   |   |   |-- tales-of-old-005ddfdd-eb5b-42aa-b885-1af209d69373.webp
|   |   |   |   |   |-- tangtang-af34edde-ee73-4436-98bb-4186d008efa9.webp
|   |   |   |   |   |-- tgcc-75e030ea-0d7d-4314-a618-bd3db833c269.webp
|   |   |   |   |   |-- the-broken-lands-f32802ee-dffe-46e9-b780-f055dfccf825.webp
|   |   |   |   |   |-- the-long-feud-579d3055-fc45-4d1c-a2ea-1a5760d24768.webp
|   |   |   |   |   |-- the-red-knight-0a9e008f-d47d-4770-9729-93add1bf6af0.webp
|   |   |   |   |   |-- the-way-of-water-727f4118-dc41-4c5b-94be-f4b438bad732.webp
|   |   |   |   |   |-- trail-of-swordmancy-342f31a8-3a61-4f82-a5e9-d284bc1c2008.webp
|   |   |   |   |   |-- trial-of-the-bow-ecf114a6-c211-452e-b0a5-db44991801e7.webp
|   |   |   |   |   |-- turbid-heavens-a55bc30b-4754-47d1-b08f-12243ecbd94b.webp
|   |   |   |   |   |-- typhoeus-f5f87405-3d8c-46b8-89f4-335df353f24e.webp
|   |   |   |   |   |-- umbral-monument-2ff3a120-e3e1-42f1-8d5b-401578f7ff55.webp
|   |   |   |   |   |-- uwst-38b090d8-f5cf-4337-bcbc-b23805b6866f.webp
|   |   |   |   |   |-- wrothful-tide-14d07325-112b-4b52-9add-200a7045f749.webp
|   |   |   |   |   |-- wulfgard-52107e19-f222-433f-9b3a-414b943c87d9.webp
|   |   |   |   |   |-- xaihi-f72bd484-0485-4b22-81b4-ebc0b16925c0.webp
|   |   |   |   |   |-- yvonne-818f14ff-c4c8-4d37-841b-cb94b9d728c6.webp
|   |   |   |   |   |-- zeroth-directive-07344e6c-d771-4f9e-b015-3e1da9610c74.webp
|   |   |   |   |   `-- zhuang-fangyi-29f9346d-d5ef-43e2-a4f0-fccc5d6556e6.webp
|   |   |   |   |-- genshin-impact/
|   |   |   |   |   |-- a-new-star-approaches-e5a735e6-5a16-432d-9701-6ce4953386de.webp
|   |   |   |   |   |-- a-new-star-approaches-quest-19a0f950-47ad-4345-9dd1-6c4a46797e53.webp
|   |   |   |   |   |-- a-rekviem-for-the-underworld-079ed1aa-9922-4b2a-9f39-187354e87af6.webp
|   |   |   |   |   |-- a-rekviem-for-the-underworld-ab567c1f-2e3f-4370-86cd-aba5e15110d0.webp
|   |   |   |   |   |-- albedo-a81f97ad-cb85-4474-ab41-48bff4123ddb.webp
|   |   |   |   |   |-- alyosha-1138e849-01ff-46f0-ae18-1741406e9b02.webp
|   |   |   |   |   |-- amber-523469fc-351e-48eb-bf87-2436fabfe73e.webp
|   |   |   |   |   |-- anemo-e4ef8f84-80f5-4831-b21d-b81c40961bea.webp
|   |   |   |   |   |-- beyond-this-worlds-stars-b38c2961-cddc-4f82-85cd-589257293dc5.webp
|   |   |   |   |   |-- bookworm-swordsman-d97ea93d-d896-4528-b44b-c7abe9375df9.webp
|   |   |   |   |   |-- chivalric-training-cf97fd1f-2c90-42c6-850d-3b50c61de318.webp
|   |   |   |   |   |-- cryo-04de537f-6ad1-4e0b-98e6-c5d548941cd7.webp
|   |   |   |   |   |-- darknight-heros-alibi-e2c47a4c-e3da-43fc-9258-b9afd7a8b973.webp
|   |   |   |   |   |-- diluc-ea274376-ee3b-4af6-a58e-a58602356965.webp
|   |   |   |   |   |-- diona-460e838b-2714-4954-b66b-625bf1335a53.webp
|   |   |   |   |   |-- electro-f4f152af-5823-41d2-97df-80d9a80689c5.webp
|   |   |   |   |   |-- everwinter-without-mercy-3a89af12-ec38-4b75-8334-2b458b79ad74.webp
|   |   |   |   |   |-- everwinter-without-mercy-quest.webp
|   |   |   |   |   |-- farewell-archaic-lord-2121449f-2c12-42f1-a0a0-413c2240b4f7.webp
|   |   |   |   |   |-- fischl-4fc8291c-55be-41b9-846b-ca585841b26b.webp
|   |   |   |   |   |-- for-tomorrow-without-tears-76a58cc2-5682-46bf-9b0c-2129e162f98a.webp
|   |   |   |   |   |-- genius-invokation-tcg-e82c0315-dc92-474d-91df-13b7ea2aed55.webp
|   |   |   |   |   |-- geo-868500f3-88a1-45d0-95cf-f522be7258f4.webp
|   |   |   |   |   |-- great-expeditionist-challenge-3e8bd8a0-e864-45b4-820c-d1c82bb6a950.webp
|   |   |   |   |   |-- huntsmans-cabin-18c6b034-1850-4fcc-9dc8-54100266dcab.webp
|   |   |   |   |   |-- hydro-73597609-beca-47e7-b9d3-4e83a8a8742e.webp
|   |   |   |   |   |-- imaginarium-theater-208fcdb2-13c1-453c-b590-7dd0e6b0f7df.webp
|   |   |   |   |   |-- jean-81eeab3a-db5c-4c64-bca0-03a8f8f9aa0a.webp
|   |   |   |   |   |-- kaeya-a4779ada-4a61-4570-8e6e-15c06ba1cd8d.webp
|   |   |   |   |   |-- kaeya-d5e88e95-7631-4306-bd0d-e9c662da6018.webp
|   |   |   |   |   |-- keqing-dbbe20bc-944a-444b-b843-3680a120b535.webp
|   |   |   |   |   |-- klee-4c994c7b-bd6d-42cd-a7c2-2ea5c2c974fd.webp
|   |   |   |   |   |-- korolevskiy-theater-ded73a15-b165-4a53-bb9a-74773d75d38f.webp
|   |   |   |   |   |-- lisa-45d51342-013c-4d7f-8347-9ab39c29af6a.webp
|   |   |   |   |   |-- masters-day-off-cc5b42df-a4e8-40e3-b5fa-8a03f8d55c34.webp
|   |   |   |   |   |-- miliastra-wonderland-9ccce52f-5d66-4888-bdca-70cbe2a6a75d.webp
|   |   |   |   |   |-- mona-ca420944-92d9-43c3-8a24-4089627557ad.webp
|   |   |   |   |   |-- mondstadt-gastronomy-trip-48e49b89-15b2-41ed-b787-2800de229a9c.webp
|   |   |   |   |   |-- monstadt-divider-c8e93abe-d9a9-4691-ae45-48e93afd0ce2.png
|   |   |   |   |   |-- mutual-aid-in-bloom-cb1801ed-bc6b-4ba6-930d-76c235dd0837.webp
|   |   |   |   |   |-- noelle-33ec3da9-d085-48b1-8cbe-26399ca17076.webp
|   |   |   |   |   |-- odette-4bd7d700-438c-455a-a0ea-1c0f45fb500d.webp
|   |   |   |   |   |-- of-the-land-amidst-monoliths-b43487ce-b9d3-4b5b-9fc8-368d05717df1.webp
|   |   |   |   |   |-- pyro-2c11c7df-143b-4ad9-89d1-cf9f19fce8da.webp
|   |   |   |   |   |-- qiqi-9898fb36-c9e4-4f4b-9fc3-72798d9b7888.webp
|   |   |   |   |   |-- razor-39a74061-4df8-4a93-b84d-1f06a27870e5.webp
|   |   |   |   |   |-- rosaria-6f1fef17-8a92-4eb4-b35a-2ce2a59b6137.webp
|   |   |   |   |   |-- secret-pirate-treasure-9ae69d6d-5963-4047-87b5-76c38d692285.png
|   |   |   |   |   |-- serenitea-pot-32f22fe6-afb5-4d29-8e26-4ffca9567b06.webp
|   |   |   |   |   |-- should-you-be-trapped-in-a-windless-land-a7fa6c94-1581-417f-ab97-a30963ef1535.webp
|   |   |   |   |   |-- song-of-dragon-and-freedom-0b9e72f8-77fa-4ab9-b1ce-d189d76f8d70.webp
|   |   |   |   |   |-- spiral-abyss-355ec544-f2d7-4a2f-b3fb-cb44bd24120d.webp
|   |   |   |   |   |-- the-cat-and-the-cocktail-7d701ff7-a0db-4343-bb29-1c281f209d3e.webp
|   |   |   |   |   |-- the-chalk-prince-and-the-dragon-69787fc8-a64f-49b7-a22d-d27554f34cc5.webp
|   |   |   |   |   |-- the-meaning-of-lupical-9365be0f-6260-484f-8c2b-8f5f9b4675c5.webp
|   |   |   |   |   |-- the-outlander-who-caught-the-wind-ab91c64e-a619-435c-95fb-aae6645ab8af.webp
|   |   |   |   |   |-- tidesong-cavern-2c1f50a4-7734-40d5-a829-30dac81871e5.webp
|   |   |   |   |   |-- traveler-observation-report-1229b32f-fc80-458e-9cbb-9f989afd280f.png
|   |   |   |   |   |-- trial-of-the-bastion-9fa5717c-bde2-44cf-b7e3-ac39aa0a8aba.webp
|   |   |   |   |   |-- troublesome-work-494aa99f-142d-40b7-b05e-6218ab0081c7.webp
|   |   |   |   |   |-- true-treasure-0cf7bd0d-c34d-49b5-855f-b480b7bcee64.webp
|   |   |   |   |   |-- unreconciled-stars-3d5a8d83-4be2-4417-9384-e4b1891e2c4c.webp
|   |   |   |   |   |-- venti-73dc1329-4232-40cc-a93a-cd7ee46f7325.webp
|   |   |   |   |   |-- vesna-1ba5d71a-d376-4c3f-80f1-be080f5d95a9.webp
|   |   |   |   |   |-- vodyanitsa-22f125bc-0a31-4e9c-9480-3ff8cfd4da15.webp
|   |   |   |   |   |-- welcome-to-teyvat-b48822b5-cef1-4384-bcbc-fc560ebf86eb.webp
|   |   |   |   |   |-- white-night-like-a-dream-upon-waking-102295b9-eb31-45ed-935c-3574ea8943f3.webp
|   |   |   |   |   |-- wind-courage-wings-48dc31f7-9e34-43c7-ae4e-af473bc84015.jpg
|   |   |   |   |   |-- wishful-drops-8f5fea7d-6a3b-40b8-b4f9-80078c228820.webp
|   |   |   |   |   |-- wraiths-nocturne-bcc51318-50b7-48e2-8169-9805fde8959d.webp
|   |   |   |   |   |-- xiangling-94a4e15a-b330-4a5d-8176-fa9dd9d3d4d6.webp
|   |   |   |   |   |-- xingqiu-b19c6305-6deb-4449-870f-1ae0d31e671e.webp
|   |   |   |   |   `-- yanfei-70f8cf70-f159-457b-9cc8-2fd45d6ca7c0.webp
|   |   |   |   |-- honkai-star-rail/
|   |   |   |   |   |-- herta-8a262e8e-91dd-4156-ac59-dfe3de85c755.webp
|   |   |   |   |   |-- herta-eb58f33c-1ead-471b-bbd1-a26e28312309.webp
|   |   |   |   |   |-- ice-a0c2f77c-bb20-4c33-9254-e09784f6edcb.webp
|   |   |   |   |   |-- the-rail-unto-the-stars-4393e171-f68a-42ac-8993-f7da85dbabeb.webp
|   |   |   |   |   `-- today-is-yesterdays-tomorrow-abf646b8-982a-4fe1-9f6a-0df25d08d7e2.webp
|   |   |   |   |-- neverness-to-everness/
|   |   |   |   |   |-- adler-8e4c5c18-e083-409e-8f7c-9ddc9cb29f6d.webp
|   |   |   |   |   |-- anima-ba17226a-321c-4f73-b3c3-2ac43816c20c.webp
|   |   |   |   |   |-- aurelia-1ac8f75a-8f2c-4779-a85c-81446a697107.webp
|   |   |   |   |   |-- baicang-8b894d20-1ce0-4ef5-85f1-e69d98a36d49.webp
|   |   |   |   |   |-- baicang-d837a5aa-b1f3-41c3-b5ad-979280fb0bcd.webp
|   |   |   |   |   |-- chaos-7e0733df-c688-4eec-855f-ae1264d96da4.webp
|   |   |   |   |   |-- chiz-8665832f-fd54-4f53-ab84-b8eeacbc6858.webp
|   |   |   |   |   |-- cosmos-c3104d11-eda5-41d3-a873-a4e2df46792a.webp
|   |   |   |   |   |-- daffodill-3d2a9953-20cd-43e5-8bc5-7eee9bbb2ae7.webp
|   |   |   |   |   |-- edgar-76777549-4f77-4ac2-8191-7a176068eb7d.webp
|   |   |   |   |   |-- esper-zero-f532d337-fb7b-48e3-8072-1439ab6b71fa.webp
|   |   |   |   |   |-- fadia-60e13496-9b75-48d8-bb5e-01c8c6f5af99.webp
|   |   |   |   |   |-- haniel-bb0d7ef2-2bbb-4cf0-a0e3-c7bad033c12b.webp
|   |   |   |   |   |-- hathor-13b84a72-6ae0-44d2-a9f5-959036754685.webp
|   |   |   |   |   |-- hotori-dd2d30fb-be09-444b-84ae-872d2cd06a16.webp
|   |   |   |   |   |-- incantation-cd475a4d-dd9a-4984-a4ef-4efcb7d587e0.webp
|   |   |   |   |   |-- jiuyuan-c0ac86b2-0888-41d3-b230-ab4a1a6b3f83.webp
|   |   |   |   |   |-- lakshana-798508fb-17e3-4736-9313-c405d2f8b8f7.webp
|   |   |   |   |   |-- mint-169e54b9-5de5-4d9a-99cf-8c63a9690881.webp
|   |   |   |   |   |-- nanally-458336f5-eea0-4267-8ba3-3004091c0cb9.webp
|   |   |   |   |   |-- psyche-c28b7d4e-ce9d-4ed2-8092-ec4945448204.webp
|   |   |   |   |   |-- sakiri-18207f99-cf28-4f1a-b2c8-5ea6b1cb4c74.webp
|   |   |   |   |   |-- skia-ced59263-0c04-4ba9-91c4-52b3dc320f92.webp
|   |   |   |   |   |-- unforseen-yet-foretold-fb307925-a2a1-4d42-938c-b5d9940d4ae3.webp
|   |   |   |   |   `-- welcome-to-hethereau-e30adb6c-4891-42ed-a2e8-80830233d580.webp
|   |   |   |   |-- wuthering-waves/
|   |   |   |   |   |-- prologue-c6af94ef-3bb1-487d-9c1d-2e23e677b831.webp
|   |   |   |   |   `-- waking-of-a-world-2ce655ec-fcca-4297-8079-a8b78aebd881.webp
|   |   |   |   `-- zenless-zone-zero/
|   |   |   |       |-- and-true-heroes-behind-the-scenes-61a9655f-2e4e-41f2-a388-0e80180a51c5.webp
|   |   |   |       |-- business-strangeness-justness-7e46f8d1-bdd9-47d1-a07b-b14abd24256c.webp
|   |   |   |       |-- call-from-hollows-heart-77bb1e3a-1b0d-4b6c-b5a2-df0199a8814e.webp
|   |   |   |       |-- cat-and-mouse-game-ed81f2a4-d833-49db-9610-806d32b22227.webp
|   |   |   |       |-- cat-lost-and-found-87826c51-a22f-45f1-83e9-b4c58cff0f94.webp
|   |   |   |       |-- hollow-zero-84fc1387-82b8-45cf-afb6-b7cece91e1cc.webp
|   |   |   |       |-- just-another-day-at-the-video-store-bed1f6c6-8959-40f5-8b1c-3d30d1772a3f.webp
|   |   |   |       |-- mission-unthinkable-96bc8463-2874-4056-9c9e-40c304a10f05.webp
|   |   |   |       |-- mole-in-the-hole-69aef875-ef13-4963-8864-61ca09c6e35b.webp
|   |   |   |       |-- schoolyard-powerhouse-a83fad89-5fb1-4a2a-a6f9-ab680b52d62c.webp
|   |   |   |       |-- shiyu-defense-da171eb8-ee55-4502-a20b-e4f404539d8e.webp
|   |   |   |       |-- the-iron-witch-cf2625b5-6398-4cb2-83bd-2bcbb567ff9b.webp
|   |   |   |       |-- the-midnight-pursuit-3ee2cfca-a13e-40ce-a584-8993c904b2e4.webp
|   |   |   |       |-- the-zero-zone-bd1f9f7d-c401-4bce-ad83-3bcb7c7b218d.webp
|   |   |   |       |-- until-your-memory-fades-98882591-8bee-4c53-a86d-e441376f1289.webp
|   |   |   |       |-- watch-your-step-0fb1b616-7cba-4d45-9f52-c4915688aab0.webp
|   |   |   |       `-- welcome-to-new-eridu-2e600fac-7c8a-470d-97c8-cc9931ba1763.webp
|   |   |   |-- index.html
|   |   |   `-- main.ts
|   |   |-- styles/
|   |   |   |-- themes/
|   |   |   |   |-- _dark-theme.scss
|   |   |   |   |-- _game-themes.scss
|   |   |   |   |-- _light-theme.scss
|   |   |   |   |-- _story-topics.scss
|   |   |   |   |-- _theme-mixin.scss
|   |   |   |   `-- _variables.scss
|   |   |   |-- _story-layout.scss
|   |   |   |-- _story-reading.scss
|   |   |   |-- _workspace.scss
|   |   |   `-- styles.scss
|   |   |-- proxy.conf.cjs
|   |   |-- tsconfig.app.json
|   |   |-- tsconfig.lint.json
|   |   `-- tsconfig.spec.json
|   `-- middleware/
|       |-- e2e/
|       |   |-- auth0-config.ts
|       |   |-- stack-smoke.ts
|       |   `-- tsconfig.json
|       |-- src/
|       |   |-- auth.test.ts
|       |   |-- auth.ts
|       |   |-- auth0.test.ts
|       |   |-- auth0.ts
|       |   |-- characters.test.ts
|       |   |-- config.ts
|       |   |-- game-document.test.ts
|       |   |-- game-document.ts
|       |   |-- game-images.test.ts
|       |   |-- game-images.ts
|       |   |-- main-quest-document.ts
|       |   |-- main-quest-migration.ts
|       |   |-- main-quest.test.ts
|       |   |-- main.ts
|       |   |-- migrate.ts
|       |   |-- progress.ts
|       |   |-- repository.ts
|       |   |-- server.test.ts
|       |   |-- server.ts
|       |   |-- story-document.test.ts
|       |   |-- story-document.ts
|       |   |-- story-redesign.test.ts
|       |   |-- story-template.test.ts
|       |   `-- test-support.ts
|       |-- database.mjs
|       |-- parser-smoke.ts
|       |-- patch-smoke.mjs
|       |-- README.md
|       |-- stack-smoke.mjs
|       |-- start.mjs
|       |-- story-smoke.mjs
|       |-- tsconfig.json
|       `-- tsconfig.lint.json
|-- scripts/
|   |-- achievement-order-smoke.mjs
|   |-- achievements-smoke.mjs
|   `-- workspace-smoke.mjs
|-- .coderabbit.yaml
|-- .editorconfig
|-- .env.example
|-- .gitignore
|-- .node-version
|-- .prettierrc
|-- angular.json
|-- eslint.config.js
|-- package-lock.json
|-- package.json
|-- README.md
|-- THEME.md
`-- tsconfig.json
```

## Local and generated entries

These entries are present in this working directory but their ignored contents are not enumerated above. They are not source refactoring targets. Only names and roles are recorded; environment values and database contents are not copied into this document.

| Entry | Role |
| --- | --- |
| `.git/` | Local Git objects, references, index, and repository metadata |
| `.angular/` | Angular cache and local tool artifacts; tracked screenshots appear in the repository tree |
| `.env` | Local environment configuration |
| `backups/` | Local backups |
| `dist/` | Compiled application output |
| `node_modules/` | Installed third-party dependencies |
| `projects/database/` | Local MongoDB binaries, configuration, and runtime data |
| `tmp/` | Temporary output |

## Refactoring checklist

- [ ] Agree on the intended structure using [Code Organization](code-organization.md), distinguishing shared domain types from UI-only types.
- [ ] Record each proposed move with its current path, destination, reason, affected imports/configuration, and relevant checks before implementation.
- [ ] Refactor one feature or boundary at a time, keeping its tests, templates, and styles together.
- [ ] Preserve API shapes, persisted data, authentication behavior, parser output, and asset URLs unless a separate behavior change is intended.
- [ ] Update barrel exports, import paths, TypeScript/Angular configuration, package scripts, workflows, and editor tasks affected by moves.
- [ ] Run relevant existing checks after code changes: `npm run lint:ci`, `npm test`, and `npm run ui:build`; use the browser integration checks for affected user flows.
- [ ] Refresh this inventory and related documentation once the final structure is accepted.

## Refreshing the inventory

From the repository root, this PowerShell command lists the files used as inventory inputs:

```powershell
git ls-files --cached --others --exclude-standard | Sort-Object -Unique
```

Exclude paths that no longer exist, derive parent folders from the remaining paths, and include any new documentation file itself. This is a dated snapshot and does not update automatically. Use `Get-ChildItem -Force` to review root-level local entries separately; Git's inventory does not include empty directories or ignored runtime contents.
