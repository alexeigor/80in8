# Repository Guidelines

## Project Structure & Module Organization

- `packages/core/src/`: dependency-free TypeScript for exact arithmetic, seeded generation, question identity, scoring, and session state.
- `apps/web/src/`: Preact screens, components, styles, input handling, and browser adapters. Static assets live in `apps/web/public/`.
- Unit tests sit beside source files; shared web fixtures live in `apps/web/src/test/`, core fixtures in `packages/core/test/fixtures/`, and browser tests in `apps/web/e2e/`.
- `DESIGN.md` explains architecture and behavior; `DESIGN_REVIEW.md` records design findings. Prefer executable configuration when older documentation differs.

## Build, Test, and Development Commands

Use Node.js 22+ (CI uses 24) and npm workspaces. Run from the repository root:

- `npm ci`: install locked dependencies.
- `npm run dev`: start the Vite development server.
- `npm run build`: build core and production web assets.
- `npm run typecheck`: check application, library, and core test types.
- `npm run lint` / `npm run lint:fix`: check or apply Biome rules.
- `npm test`: run both unit suites; `npm run test:core` and `npm run test:web` select one.
- `npx playwright install chromium`, then `npm run e2e`: install the default browser and test the built app.
- `npm run ci`: run lint, typechecking, unit tests, mutation smoke checks, and builds. Run E2E separately.

## Coding Style & Naming Conventions

Use strict TypeScript, two-space indentation, single quotes, optional semicolons, trailing commas, and a 110-character line width, as configured in `biome.json`. Explicit `any` is prohibited. Use PascalCase for components/types and camelCase for functions/variables; follow neighboring filenames. Core relative imports use `.js` extensions.

Keep core deterministic and free of browser APIs or side effects. Preserve question-ID reproducibility; version preset changes and retain historical versions.

## Testing Guidelines

Use Vitest, fast-check for core properties, Testing Library for Preact, and Playwright for browser flows. Name unit tests `*.test.ts`/`*.test.tsx` and browser tests `*.spec.ts`. Core coverage thresholds are 100% for lines, functions, branches, and statements. Add regression tests for changed behavior. `npm run mutation` runs representative mutation checks; full Stryker is marked blocked in repository configuration.

## Commit & Pull Request Guidelines

No commits exist yet, so no historical convention is established. Use concise imperative subjects, such as `Fix timer recovery after sleep`. PRs should describe behavior, link relevant issues, report validation, and include screenshots for UI changes.

## Python Tooling

For Python work, use `uv` for packages/environments, `uvx` for tools, Python 3.14 by default, and preferably Polars for tabular data. Initialize with `uv venv --python 3.14 ./.venv && source .venv/bin/activate`.
