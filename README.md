# PiBoat

> The ship that carries pi — a **local AI coding assistant** built on the [@earendil-works/pi-coding-agent](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) SDK. One core, many front ends.

PiBoat shares the same local configuration and session files as the pi CLI: conversations you start in the terminal can be resumed in the browser, and models or credentials you configure in the browser are visible to the terminal. Everything runs on your own machine (it binds `127.0.0.1` by default) — no account, no cloud relay, no telemetry.

**One command to start, then use it in your browser**: `npx @ice-ai/pi-boat@latest`

![PiBoat Web UI: session workspace, project navigation, and streaming replies](https://raw.githubusercontent.com/ice-ai-lab/pi-boat/main/docs/images/web-chat.png)

---

## One core, many front ends

PiBoat is not "yet another web version of pi". It is a **single core with multiple front ends**. All agent business logic lives in `packages/` and is written once; every front end under `apps/` is a thin shell responsible only for rendering and interaction. Front ends talk to the core over one shared HTTP + SSE contract, which is deliberately transport-agnostic so that node.js process models (Electron, mobile, plug-ins) can reuse it unchanged.

| Front end | Status | Notes |
| --- | --- | --- |
| **Web** | ✅ Shipped in the current version | Visit the local agent from a browser; one process is the whole product (UI + API + SSE served from the same origin). |
| **Desktop (Electron)** | 🚧 Phase two | The shell spawns the same server process and reuses the same Web UI and every core package. |
| **Mobile / others** | 📋 Later | A transport-agnostic core plus browser-native SSE makes mobile a natural fit. |

> **Only the Web front end is implemented today.** Desktop and mobile have not been started, but the core and the contract are already designed for them: `packages/core` contains no HTTP concepts and the protocol is not bound to a transport, so adding a front end requires no changes to core logic.

---

## Features

- **Session workspace**: browse, resume, rename, export, and delete conversations grouped by project, with running state, context usage, cost, and compaction details.
- **Two ways to branch**: create an independent session from an earlier message, or fork inside the current session by editing from here.
- **Project file tools**: browse and upload files, inspect Git diffs, and preview source, Markdown, images, audio, PDFs, and DOCX files with automatic refresh.
- **Git worktrees**: switch checkouts from the sidebar while sessions from the same repository stay grouped together.
- **In-browser configuration**: manage provider login and API keys, models, model connectivity tests, plugin packages, and skills without leaving the page.
- **English, Simplified Chinese, and Japanese UI**: PiBoat follows the browser language initially and provides a language switcher in Settings.

| Session stats and usage | Settings |
| --- | --- |
| ![Session stats: message counts, tokens, cost, context, and cache hit rate](https://raw.githubusercontent.com/ice-ai-lab/pi-boat/main/docs/images/web-session-stats.png) | ![Settings: interface language, chat content width, and font size](https://raw.githubusercontent.com/ice-ai-lab/pi-boat/main/docs/images/web-settings.png) |

**Tools and source viewing**: tool calls, file browsing, Git diffs, and syntax-highlighted source previews live in the same interface.

![Tool panel and source viewer](https://raw.githubusercontent.com/ice-ai-lab/pi-boat/main/docs/images/web-source-viewer.png)

---

## Quick Start

PiBoat requires **Node.js 22.19.0 or newer** (a pi SDK requirement). Check your version with `node --version`, then run:

```bash
npx @ice-ai/pi-boat@latest
```

The CLI opens a browser once the server is ready. If it does not, open <http://127.0.0.1:9527> manually. The server listens only on `127.0.0.1` by default.

If no model provider is configured yet, open the **Models** panel after startup to sign in or add an API key.

To install the `piboat` command globally:

```bash
npm install -g @ice-ai/pi-boat@latest
piboat
```

To update, stop the running process with `Ctrl+C` and run the same install command again. To uninstall, run `npm uninstall -g @ice-ai/pi-boat`.

### Launch options

Command-line options override environment variables.

| Option or environment variable | Purpose | Default |
| --- | --- | --- |
| `-h`, `--help` | Print launch options and exit | — |
| `-v`, `--version` | Print the version and exit | — |
| `-p <port>`, `--port <port>`, or `PORT` | Server port | `9527` |
| `--no-open` | Do not open a browser automatically | Browser opens |

```bash
piboat --help
piboat -p 8080 --no-open
PORT=8080 piboat
```

---

## Notes

- **Agent data**: PiBoat reads pi data from `~/.pi/agent` by default, including session files under `sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl`. Set `PI_CODING_AGENT_DIR` to use another pi agent directory.
- **Filesystem access**: PiBoat must be able to read the agent data directory and the working directories recorded by its sessions. Run PiBoat in the same filesystem environment as pi when sharing existing sessions.
- **Shared configuration**: the Models panel reads and writes pi's model, settings, and credential storage, so changes are visible to both interfaces.
- **File access boundary**: the file browser is limited to working directories selected in PiBoat and project or session roots it already knows about; it is not a general-purpose filesystem browser.
- **Concurrent writes**: pi CLI and PiBoat writing the same session file at the same time is not supported. The server detects external writes and rebuilds the runtime on full reads, but not while a turn is running.

### Security

The server binds to the loopback address only and always enforces three gates (a Host check against DNS rebinding, an Origin check against CSRF, and a `Sec-Fetch-Site` check that rejects cross-site requests). **Do not expose PiBoat to the public internet** — it has full access to your local filesystem.

---

## Development

```bash
pnpm install         # Node >= 22.19 (enforced by engines)
pnpm turbo run dev   # agent server (9527, tsx watch) + web (9528, vite dev, /api proxied to 9527)
pnpm turbo run build
pnpm turbo run test  # Vitest (core / protocol / client / ui) + Playwright (web E2E)
pnpm turbo run lint  # Biome 2
```

`pnpm turbo run dev` starts two processes: the agent server provides the API and SSE, while the vite dev server serves the pages with hot reload and proxies `/api` to the server — so the browser sees the same single origin as in production. In production the server hosts the web build output directly, and that one process is the complete product.

To build the npm distribution (`dist/piboat.mjs` plus `dist/web/`):

```bash
pnpm bundle
```

### Repository layout

```text
apps/web            Front-end SPA: Vite + React 19 (the front end shipped today)
apps/desktop        Electron desktop shell (phase two, not built yet)
packages/protocol   API contract and event wire format (types + Zod, no business logic)
packages/core       Agent business core (the only package allowed to depend on the pi SDK; transport-agnostic)
packages/server     Hono HTTP/SSE server assembling core (bin: piboat-server)
packages/client     Type-safe client SDK plus React hooks
packages/ui         Presentational component library (protocol types and client hooks only)
packages/pi-boat    npm distribution: the `piboat` CLI (bundles the server and the web build output)
```

Dependencies flow strictly downward and never backward: `apps/* → client → protocol` and `apps/server → core → protocol`. No package may bypass core to import the pi SDK directly.

---

## Documentation

- Overview and architecture: [`docs/01-overview.md`](./docs/01-overview.md) (layering, process model, event stream protocol, known risks)
- Architecture decision records: [`docs/adr/`](./docs/adr/README.md) (naming, dependency rules, transport protocol, and more)
- Contributor guide: [`AGENTS.md`](./AGENTS.md)

## Third-party notices

See [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).
