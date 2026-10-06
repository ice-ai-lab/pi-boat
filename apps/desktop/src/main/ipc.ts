import { app, type BrowserWindow, dialog, ipcMain } from 'electron';
import { isAllowedSender } from './url-guard';

/**
 * IPC 窄桥 handler（ADR-0035：原生能力走 contextBridge，业务 API 一律不经 IPC）。
 * 每个 handler 校验 sender frame URL（只放行应用页面与打包内恢复页）。
 */

export interface IpcActions {
  getWindow: () => BrowserWindow | null;
  /** 应用页面 origin 集合（生产 = server 地址；dev = vite 9528） */
  getAllowedOrigins: () => string[];
  /** 从恢复页发起重试：成功返回 true（主进程会把窗口导航回应用页） */
  recover: () => Promise<boolean>;
}

export function registerIpcHandlers(actions: IpcActions): void {
  const assertSender = (url: string | undefined): void => {
    if (!isAllowedSender(url ?? '', actions.getAllowedOrigins())) {
      throw new Error(`[pi-boat-desktop] IPC rejected for sender: ${url ?? '(unknown)'}`);
    }
  };

  // 原生目录选择（窄桥第一项）：选完仍走 POST /api/cwd/validate，业务不经 IPC
  ipcMain.handle('pi-boat:pick-directory', async (event): Promise<string | null> => {
    assertSender(event.senderFrame?.url);
    const window = actions.getWindow();
    const dialogOptions: Electron.OpenDialogOptions = {
      properties: ['openDirectory', 'createDirectory'],
    };
    const result =
      window === null
        ? await dialog.showOpenDialog(dialogOptions)
        : await dialog.showOpenDialog(window, dialogOptions);
    return result.canceled || result.filePaths.length === 0 ? null : (result.filePaths[0] ?? null);
  });

  // 恢复页：重试启动
  ipcMain.handle('pi-boat:recover', async (event): Promise<boolean> => {
    assertSender(event.senderFrame?.url);
    return actions.recover();
  });

  // 恢复页：退出（此时 server 未就绪，走默认退出路径，不触发运行中任务确认）
  ipcMain.handle('pi-boat:quit', (event): void => {
    assertSender(event.senderFrame?.url);
    app.quit();
  });
}
