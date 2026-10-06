import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORTS } from '@ice-ai/protocol';
import { app, type BrowserWindow, dialog } from 'electron';
import { registerIpcHandlers } from './ipc';
import { installApplicationMenu } from './menu';
import { assertServerEntry, loginShellPath, serverEntryPath } from './runtime';
import { ServerProcess } from './server-process';
import { createTray } from './tray';
import { createMainWindow } from './window';

/**
 * 应用编排（ADR-0035）：单实例锁 → packaged 态拉起 RunAsNode server 子进程并等就绪 →
 * 同源 loadURL；dev 态只 loadURL(vite 9528) 复用 `turbo dev` 两进程，不拉子进程。
 * 生命周期：关窗=隐藏；显式退出先问 server 进行中任务（GET /api/agent/running），
 * 确认后 SIGTERM 子进程优雅退出。
 */

/** dev 态页面地址（端口单一来源 = protocol 的 PORTS） */
const DEV_WEB_URL = `http://127.0.0.1:${PORTS.web}`;

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  void bootstrap();
}

let mainWindow: BrowserWindow | null = null;
let serverProcess: ServerProcess | null = null;
let serverUrl: URL | null = null;
let starting = false;
let quitting = false;

app.on('second-instance', () => {
  showMainWindow();
});

app.on('activate', () => {
  showMainWindow();
});

// ADR-0035：不做 window-all-closed 退出——macOS 等 Dock、Windows/Linux 等托盘恢复
app.on('window-all-closed', () => {});

app.on('before-quit', (event) => {
  if (quitting || !app.isPackaged || serverUrl === null) {
    quitting = true;
    return;
  }
  // 退出前经 server 询问进行中任务（v1 判据 = GET /api/agent/running，ADR-0035）
  event.preventDefault();
  void confirmQuit();
});

app.on('will-quit', (event) => {
  if (serverProcess === null) return;
  event.preventDefault();
  const child = serverProcess;
  serverProcess = null;
  void child.stop().then(() => app.quit());
});

async function bootstrap(): Promise<void> {
  registerIpcHandlers({
    getWindow: () => mainWindow,
    getAllowedOrigins: () => [DEV_WEB_URL, ...(serverUrl === null ? [] : [serverUrl.origin])],
    recover: () => recoverFromRecoveryPage(),
  });
  installApplicationMenu(() => serverUrl);
  createTray({ onOpen: showMainWindow, getServerUrl: () => serverUrl });

  // dev/prod 同一份 main 代码，按 app.isPackaged 分支（ADR-0035）
  if (app.isPackaged) {
    await startServerAndWindow();
  } else {
    mainWindow = createMainWindow({ preloadPath: preloadPathOf(), isQuitting: () => quitting });
    void mainWindow.loadURL(DEV_WEB_URL);
  }
}

/** packaged 态：spawn RunAsNode 子进程 → 就绪 → 同源 loadURL；失败进恢复界面 */
async function startServerAndWindow(): Promise<void> {
  if (starting) return;
  starting = true;
  try {
    const entryPath = serverEntryPath(app.getAppPath());
    assertServerEntry(entryPath);
    // Finder 启动的打包应用 PATH 极简，补一份登录 shell 的 PATH 供 agent 工具链使用
    const path = await loginShellPath();
    const child = new ServerProcess({
      nodePath: process.execPath,
      entryPath,
      port: overridePort(),
      env: path === null ? { ...process.env } : { ...process.env, PATH: path },
      onLine: (line, stream) => console.log(`[server:${stream}] ${line}`),
    });
    serverProcess = child;
    serverUrl = await child.start();

    // 重试路径复用恢复页窗口，直接导航回应用；首启路径新建窗口
    if (mainWindow === null || mainWindow.isDestroyed()) {
      mainWindow = createMainWindow({ preloadPath: preloadPathOf(), isQuitting: () => quitting });
    }
    void mainWindow.loadURL(serverUrl.toString());
  } catch (error) {
    serverUrl = null;
    console.error('[pi-boat-desktop] failed to start the local server:', error);
    showRecoveryWindow();
  } finally {
    starting = false;
  }
}

function preloadPathOf(): string {
  return fileURLToPath(new URL('../preload/index.cjs', import.meta.url));
}

/** 恢复界面（ADR-0035：超时/失败进恢复页；重试经窄桥 pi-boat:recover 回到本流程） */
function showRecoveryWindow(): void {
  if (mainWindow === null || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow({ preloadPath: preloadPathOf(), isQuitting: () => quitting });
  }
  void mainWindow.loadFile(join(app.getAppPath(), 'dist', 'recovery.html'));
}

async function recoverFromRecoveryPage(): Promise<boolean> {
  await startServerAndWindow();
  return serverUrl !== null;
}

/** ADR-0035：端口默认 0（OS 分配），PIBOAT_PORT 提供覆盖入口 */
function overridePort(): number {
  const raw = process.env.PIBOAT_PORT;
  if (raw === undefined || raw === '') return 0;
  const port = Number(raw);
  return Number.isInteger(port) && port >= 0 && port <= 65535 ? port : 0;
}

async function confirmQuit(): Promise<void> {
  let running = 0;
  if (serverUrl !== null) {
    try {
      const response = await fetch(new URL('/api/agent/running', serverUrl));
      if (response.ok) {
        const data = (await response.json()) as { runningSessionIds?: string[] };
        running = data.runningSessionIds?.length ?? 0;
      }
    } catch {
      // server 已不可达：按无进行中任务处理，直接退
    }
  }
  if (running === 0) {
    quitting = true;
    app.quit();
    return;
  }
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    message: `${running} task(s) still running`,
    detail: 'Quitting stops the local server. Quit anyway?',
    buttons: ['Quit', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
  });
  if (response === 0) {
    quitting = true;
    app.quit();
  }
}

function showMainWindow(): void {
  if (mainWindow !== null && !mainWindow.isDestroyed()) {
    mainWindow.show();
  }
}
