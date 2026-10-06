import { BrowserWindow, shell } from 'electron';
import { isSameOrigin } from './url-guard';

/**
 * 主窗口（ADR-0035）：renderer 复用 web UI（同源 loadURL），本模块只管窗口与防护面。
 * 安全：sandbox / contextIsolation 开、nodeIntegration 关；will-navigate 与
 * setWindowOpenHandler 把外部导航交系统浏览器；关窗=隐藏（生命周期在 index.ts）。
 */

export interface CreateWindowOptions {
  preloadPath: string;
  /** 退出中标记：quit 流程里关窗是真关（否则一律隐藏保活子进程） */
  isQuitting: () => boolean;
}

export function createMainWindow(options: CreateWindowOptions): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'PiBoat',
    show: false,
    backgroundColor: '#16181d',
    // macOS：隐藏原生标题栏，页面延伸到顶，红绿灯悬浮（ui/theme.css 的桌面钩子负责
    // 头部让位与拖拽区；其余平台保持原生标题栏，未另做）
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    webPreferences: {
      preload: options.preloadPath,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  // 桌面环境标记：ui/theme.css 据此启用头部让位/拖拽区（浏览器无此类，零影响）
  win.webContents.on('dom-ready', () => {
    const classes = [
      'pi-boat-desktop',
      ...(process.platform === 'darwin' ? ['pi-boat-desktop-mac'] : []),
    ];
    void win.webContents.executeJavaScript(
      `document.documentElement.classList.add(${classes.map((name) => `'${name}'`).join(',')});`,
    );
  });

  // 外链交系统浏览器（ADR-0035）：window.open 一律拒绝
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url !== '') void shell.openExternal(url);
    return { action: 'deny' };
  });

  // 页面发起的导航：同源放行，跨源交系统浏览器（loadURL 本身不触发 will-navigate）
  win.webContents.on('will-navigate', (event, url) => {
    const current = win.webContents.getURL();
    const origin = current === '' ? '' : new URL(current).origin;
    if (!isSameOrigin(url, origin)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  // ADR-0035：关窗=隐藏，页面与子进程继续跑、任务不中断
  win.on('close', (event) => {
    if (!options.isQuitting()) {
      event.preventDefault();
      win.hide();
    }
  });

  return win;
}
