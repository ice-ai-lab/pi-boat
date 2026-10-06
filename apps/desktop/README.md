# @ice-ai/desktop

**English** | [简体中文](./README.zh-CN.md)

PiBoat's Electron desktop shell ([ADR-0035](../../docs/adr/0035-electron-desktop-shell.md)). The main process orchestrates, the preload exposes a narrow bridge, and the **renderer contains zero code of its own** — the page is always the web UI hosted by `@ice-ai/pi-boat` (production: same-origin `loadURL`; dev: connects straight to vite on `9528`).

## Quick start (from source)

Requires Node.js ≥ 22.19.0, pnpm, and a macOS host for packaging (the dev shell itself also runs on other platforms, but packaging targets are macOS-only today).

```bash
# from the repository root
pnpm install
pnpm turbo run dev                        # terminal 1: agent server (9527) + web (9528)
pnpm --filter @ice-ai/desktop run start   # terminal 2: dev shell, loads http://127.0.0.1:9528
```

In dev mode the shell does **not** spawn a server child process — it reuses the two dev servers from `pnpm turbo run dev`. Changes to main/preload code need `pnpm --filter @ice-ai/desktop run build` (or restart `start`) to take effect; web UI changes hot-reload via vite.

To produce an installable app from source:

```bash
pnpm --filter @ice-ai/desktop run package   # bundles @ice-ai/pi-boat, then electron-builder --dir
                                            # → apps/desktop/release/mac-arm64/PiBoat.app (unsigned)
```

## Layout

```text
src/main/            Process orchestration (no business logic)
  index.ts           Lifecycle: single-instance lock / dev-prod branches / quit confirmation / recovery view
  server-process.ts  RunAsNode child-process orchestration (electron-free, tested directly by vitest)
  window.ts          Main window and protective surface (sandbox / navigation guard / close = hide)
  menu.ts            Application menu (incl. "Copy Server URL")
  tray.ts            Minimal tray for Windows/Linux (macOS uses the Dock)
  ipc.ts             Narrow-bridge handlers (validate sender frame URL)
  runtime.ts         Packaged-runtime resolution + login-shell PATH workaround
  url-guard.ts       URL safety decision (pure function)
src/preload/         contextBridge narrow bridge (sandboxed CJS): pickDirectory / recover / quit
src/recovery.html    Recovery page for failed startup
scripts/build.mjs    esbuild bundle + desktop-bundle-imports static check + Node floor assertion
test/                vitest (electron-free)
```

## Common commands

```bash
pnpm --filter @ice-ai/desktop run build     # esbuild to dist/ (main ESM + preload CJS + recovery.html)
pnpm turbo run dev                          # start the two dev processes (server 9527 + vite 9528)
pnpm --filter @ice-ai/desktop run start     # dev shell: loadURL http://127.0.0.1:9528, spawns no child
pnpm --filter @ice-ai/desktop run package   # bundle @ice-ai/pi-boat first (turbo build + web output copy) → electron-builder --dir
pnpm --filter @ice-ai/desktop run dist      # produce dmg/zip (unsigned; signing/notarization comes with auto-update)
pnpm --filter @ice-ai/desktop run test      # readiness-line parsing / child orchestration / Node floor / version binding
```

## Runtime model (ADR-0035)

- **Production**: main `spawn(process.execPath, [pi-boat.mjs], { ELECTRON_RUN_AS_NODE: '1' })` spawns the server child process (no system Node required), default `PORT=0` (OS-assigned; `PIBOAT_PORT` overrides). It parses `[pi-boat-server] listening on <url>` from stdout (the contract in `packages/server/src/start.ts`) and then does a same-origin `loadURL`; on timeout or failure it shows the recovery page (retry goes through the narrow bridge `pi-boat:recover`).
- **Dev**: `app.isPackaged === false` → only `loadURL(9528)`, reusing `turbo dev`, spawning no child process.
- **Quit**: `before-quit` first asks `GET /api/agent/running` about in-flight tasks, then SIGTERMs the child after confirmation (graceful exit in start.ts). Closing the window hides it; macOS restores via the Dock, Windows/Linux via the tray.
- **Browser access**: a desktop instance's URL can be copied for the system browser (a deliberate by-product of having no credentials).

## Packaging notes

- `@ice-ai/pi-boat` is the only runtime dependency; it ships the server bundle + web static output, and desktop does not repackage them.
- **The RunAsNode child is a plain Node process and cannot read asar** — therefore `electron-builder.yml` unpacks `node_modules/**` entirely (`asarUnpack`); asar only wraps main/preload/the recovery page.
- Electron's embedded Node must be ≥ 22.19 (SDK engines): `scripts/build.mjs` and `test/release-constraints.test.ts` both enforce it.
- The version is bound to `@ice-ai/pi-boat` and released at the same version (`scripts/release.mjs` syncs bumps).

## Known limitations

- The app icon is still Electron's default (a custom icns comes with the branding batch); the tray icon is a placeholder block.
- Windows/Linux packaging targets are not configured (the M4 acceptance line = macOS; other platforms are separate work items).
- Auto-update / global shortcuts / multi-window: see ADR-0035 "phase-two follow-ups".
