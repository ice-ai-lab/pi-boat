import { app, clipboard, Menu, type MenuItemConstructorOptions, nativeImage, Tray } from 'electron';

/**
 * Windows/Linux 最小托盘（ADR-0035 窗口生命周期：关窗=隐藏后经托盘恢复；macOS 走 Dock，
 * 不建托盘）。图标用构建期内嵌的 32×32 PNG（无图片资产管线），菜单只有三条。
 */

// 生成的纯色圆角方块（scripts 见仓库历史）；Tray 各平台会自行缩放
const TRAY_ICON_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAV0lEQVR42u3XQQoAIAgFUQ/Y1Tqz7doUQmEqNELrecu+iHGtq3o8OTmv6BXmddxERMW3iOj4gvgbkBWfCAAAAAAAAAAAgHQAf8ISgPRhUmKalRinGfN8APVJhMNsfXI7AAAAAElFTkSuQmCC';

export interface TrayActions {
  onOpen: () => void;
  getServerUrl: () => URL | null;
}

export function createTray(actions: TrayActions): Tray | null {
  if (process.platform === 'darwin') return null; // macOS：Dock 点击恢复（activate）

  const tray = new Tray(nativeImage.createFromBuffer(Buffer.from(TRAY_ICON_PNG_BASE64, 'base64')));
  const menu: MenuItemConstructorOptions[] = [
    { label: 'Open PiBoat', click: actions.onOpen },
    {
      label: 'Copy Server URL',
      click: () => {
        const url = actions.getServerUrl();
        if (url !== null) clipboard.writeText(url.toString());
      },
    },
    { type: 'separator' },
    { label: 'Quit PiBoat', click: () => app.quit() },
  ];
  tray.setToolTip('PiBoat');
  tray.setContextMenu(Menu.buildFromTemplate(menu));
  tray.on('click', actions.onOpen);
  return tray;
}
