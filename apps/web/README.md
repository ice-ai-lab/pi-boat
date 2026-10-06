# @ice-ai/web

**English** | [简体中文](./README.zh-CN.md)

PiBoat's web front end — a Vite + React 19 SPA ([ADR-0002](../../docs/adr/0002-web-frontend-vite-react-spa.md), phase-one plan in [`docs/08`](../../docs/08-web-frontend-plan.md)). It is a **thin shell**: all agent logic lives in `packages/`, and this app only renders state and interaction, talking to the agent server over one shared HTTP + SSE contract via `@ice-ai/client`.

In production the build output under `dist/` is hosted by the server itself (same origin, one process is the whole product). In development the vite dev server serves the pages on port `9528` and proxies `/api` (including SSE) to the agent server on `9527`, so the browser sees the same single origin as in production ([ADR-0009](../../docs/adr/0009-frontend-stack.md)).

## Tech stack

- **React 19** with the React Compiler enabled ([ADR-0009](../../docs/adr/0009-frontend-stack.md))
- **React Router 7** for routing, **TanStack Query** for server state
- **Tailwind CSS 4**, CSS modules by domain ([ADR-0028](../../docs/adr/0028-css-modules-by-domain.md))
- UI components come from `@ice-ai/ui` (pure presentational, no host-framework dependencies)
- **Vite 7** + **Vitest** for unit tests, **Playwright** for E2E

## Quick start (from source)

Requires Node.js ≥ 22.19.0 and pnpm.

```bash
# from the repository root
pnpm install
pnpm turbo run dev   # agent server (9527, tsx watch) + web (9528, vite dev)
```

Open <http://127.0.0.1:9528>. The vite dev server proxies `/api` to the agent server, so no CORS setup is needed. If no model provider is configured yet, open the **Models** panel after startup to sign in or add an API key.

> Running `pnpm --filter @ice-ai/web run dev` alone only starts the page layer; it needs an agent server on `9527` (start it with `pnpm --filter @ice-ai/server run dev`) or every API call will fail.

## Commands

All commands work from the repository root via `pnpm --filter @ice-ai/web run <script>` (or `pnpm turbo run <script> --filter @ice-ai/web`):

| Command | Purpose |
| --- | --- |
| `dev` | Vite dev server on `127.0.0.1:9528` (strict port), `/api` proxied to `9527` |
| `build` | `tsc --noEmit` type check, then vite production build into `dist/` |
| `test` | Vitest unit tests (`src/**/*.{test,spec}.{ts,tsx}`) |
| `test:e2e` | Playwright E2E; auto-starts both dev servers (`reuseExistingServer`) |
| `lint` | Biome check (lint + format) |
| `typecheck` | `tsc --noEmit` |

### E2E tests

```bash
pnpm --filter @ice-ai/web run test:e2e
```

The Playwright config ([`playwright.config.ts`](./playwright.config.ts)) declares both dev servers as `webServer` entries — the agent server (health-checked on `/api/health`) and vite — and reuses already-running instances, so you do not need to start anything manually. Smoke and session-switch specs live in [`e2e/`](./e2e/); `manual-*.mjs` scripts are manual driving helpers, not tests.

## Source layout

```text
src/
  main.tsx           entry: providers, query client
  router.tsx         route table (React Router 7)
  layout/            app shell: sidebar, header, global panes
  pages/             top-level pages
  panes/             feature panes (session workspace, files, settings, ...)
  services/          data access built on @ice-ai/client hooks
e2e/                Playwright specs + manual driving scripts
public/             static assets
```

Ports are not hard-coded here: `vite.config.ts` and `playwright.config.ts` read `PORTS` from `packages/protocol` (the single source of truth). The app version injected as `__APP_VERSION__` comes from `packages/pi-boat/package.json`, so the shipped UI version always matches the npm package ([ADR-0030](../../docs/adr/0030-npm-distribution-packaging.md)).
