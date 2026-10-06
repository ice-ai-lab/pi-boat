import { contextBridge, ipcRenderer } from 'electron';

/**
 * preload 窄桥（ADR-0035）：sandbox + contextIsolation 下的唯一 renderer 出口。
 * 只放原生能力，业务 API 一律走 HTTP（web 端感知不到运行环境）；bridge 可选
 * （浏览器里 `window.piBoat === undefined`），ui 层按特性检测消费。
 */

const bridge = {
  /** 原生目录选择对话框；取消返回 null。选完仍走 POST /api/cwd/validate */
  pickDirectory: (): Promise<string | null> => ipcRenderer.invoke('pi-boat:pick-directory'),
  /** 恢复页：重试启动 server；成功返回 true */
  recover: (): Promise<boolean> => ipcRenderer.invoke('pi-boat:recover'),
  /** 恢复页：退出应用 */
  quit: (): Promise<void> => ipcRenderer.invoke('pi-boat:quit'),
};

export type PiBoatBridge = typeof bridge;

contextBridge.exposeInMainWorld('piBoat', bridge);
