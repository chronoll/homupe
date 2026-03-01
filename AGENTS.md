# Repository Guidelines

## Project Structure & Module Organization
- `src/app/`: Next.js App Router pages, layouts, and API route handlers (`api/**/route.ts`).
- `src/components/`: Reusable UI components; component tests live in `src/components/__tests__/`.
- `src/lib/`: Shared logic, external integrations, and repositories (e.g., Redis/Notion access).
- `data/`: Local JSON data used by app features and lightweight persistence.
- `public/`: Static assets (icons, images) served as-is.

Keep feature logic close to its route/component, and extract shared utilities into `src/lib/`.

## Build, Test, and Development Commands
- `npm run dev`: Start local development server with Turbopack.
- `npm run build`: Create production build.
- `npm run start`: Run built app in production mode.
- `npm run lint`: Run Next.js + TypeScript ESLint checks.
- `npm test`: Run Jest test suite.

Typical local flow: `npm run lint && npm test` before opening a PR.

## Coding Style & Naming Conventions
- Language: TypeScript (`strict: true`), React function components, Next.js App Router conventions.
- Use 2-space indentation, semicolons, and double quotes to match existing files.
- Naming: components in `PascalCase` (e.g., `TaskCard.tsx`), variables/functions in `camelCase`.
- Route file names follow Next.js defaults (`page.tsx`, `layout.tsx`, `route.ts`).
- Prefer import alias `@/` for modules under `src/`.

## Testing Guidelines
- Frameworks: Jest + `@testing-library/react` with `jsdom` environment.
- Test files: `*.test.ts` / `*.test.tsx`, typically in `__tests__` folders.
- Focus on behavior and API responses (status codes, payload shape, edge cases).
- Mock external dependencies (e.g., repositories, timers, network/Redis) for stable tests.

Run targeted tests during development (example): `npm test -- TaskCard.test.tsx`.

## Commit & Pull Request Guidelines
- Prefer Conventional Commit style seen in history: `feat: ...`, `fix: ...`, `refactor: ...`.
- Keep commits small and scoped to one concern.
- PRs should include: summary of changes, linked issue (if any), test/lint results, and UI screenshots for visual updates.
- Call out config or data changes explicitly (e.g., `.env` requirements, `data/*.json` updates).

## Security & Configuration Tips
- Never commit secrets; keep local values in `.env.local`.
- Use `.env.local.example` as the template for required variables (currently `REDIS_URL`).
- For external-service code paths, handle missing environment variables gracefully.
