# @ice-ai/desktop

PiBoat Electron 桌面端壳（ADR-0035）。main 编排 + preload 窄桥，**renderer 零自有代码**——
页面永远是 `@ice-ai/pi-boat` 托管的 web UI（生产态同源 loadURL；dev 态直连 vite 9528）。

```
src/main/            进程编排（无业务逻辑）
  index.ts           生命周期：单实例锁 / dev-prod 分支 / 退出确认 / 恢复界面
  server-process.ts  RunAsNode 子进程编排（electron-free，vitest 直测）
  window.ts          主窗口与防护面（sandbox / 导航拦截 / 关窗=隐藏）
  menu.ts            应用菜单（含「复制服务地址」）
  tray.ts            Windows/Linux 最小托盘（macOS 走 Dock）
  ipc.ts             窄桥 handler（校验 sender frame URL）
  runtime.ts         打包态运行时定位 + 登录 shell PATH 对策
  url-guard.ts       URL 安全判定（纯函数）
src/preload/         contextBridge 窄桥（sandbox CJS）：pickDirectory / recover / quit
src/recovery.html    启动失败恢复页
scripts/build.mjs    esbuild bundle + desktop-bundle-imports 静态检查 + Node 底线断言
test/                vitest（electron-free）
```

## 常用命令

```bash
pnpm --filter @ice-ai/desktop run build     # esbuild 出 dist/（main ESM + preload CJS + recovery.html）
pnpm turbo run dev                          # 先起两进程（server 9527 + vite 9528）
pnpm --filter @ice-ai/desktop run start     # dev 态壳：loadURL http://127.0.0.1:9528，不拉子进程
pnpm --filter @ice-ai/desktop run package   # 先 bundle @ice-ai/pi-boat（含 turbo build + web 产物拷贝）→ electron-builder --dir
pnpm --filter @ice-ai/desktop run dist      # 出 dmg/zip（未签名；签名/公证随自动更新立项）
pnpm --filter @ice-ai/desktop run test      # 就绪行解析 / 子进程编排 / Node 底线 / 版本绑定
```

## 运行模型（ADR-0035）

- **生产**：main `spawn(process.execPath, [pi-boat.mjs], { ELECTRON_RUN_AS_NODE: '1' })`
  拉起 server 子进程（不要求系统 Node），默认 `PORT=0`（OS 分配；`PIBOAT_PORT` 可覆盖），
  解析 stdout `[pi-boat-server] listening on <url>`（`packages/server/src/start.ts` 契约）后同源
  `loadURL`；超时/失败进恢复页（重试经窄桥 `pi-boat:recover`）。
- **dev**：`app.isPackaged === false` → 只 loadURL(9528)，复用 `turbo dev`，不拉子进程。
- **退出**：`before-quit` 先 `GET /api/agent/running` 询问进行中任务，确认后 SIGTERM 子进程
  （start.ts 优雅退出）；关窗=隐藏，macOS 经 Dock、Windows/Linux 经托盘恢复。
- **浏览器可访问**：桌面实例的地址可复制给系统浏览器（无凭据的副产品，有意保留）。

## 打包要点

- `@ice-ai/pi-boat` 是唯一运行时依赖（`dependencies`），自带 server bundle + web 静态产物；
  desktop 不二次打包它们。
- **RunAsNode 子进程是普通 Node，读不了 asar** —— 因此 `electron-builder.yml` 把
  `node_modules/**` 全量 `asarUnpack`（asar 只包 main/preload/恢复页）。
- Electron 内嵌 Node 须 ≥ 22.19（SDK engines）：`scripts/build.mjs` 与
  `test/release-constraints.test.ts` 双闸把关。
- 版本与 `@ice-ai/pi-boat` 绑定、同版本发布（`scripts/release.mjs` 负责同步 bump）。

## 已知边界

- 应用图标暂用 Electron 默认（自定义 icns 随品牌批次）；托盘图标是内嵌的占位方块。
- Windows/Linux 打包目标未配置（M4 验收线 = macOS；其余平台单独立项）。
- 自动更新 / 全局快捷键 / 多窗口：见 ADR-0035「二期后续」。
