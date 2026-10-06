import { app, clipboard, Menu, type MenuItemConstructorOptions } from 'electron';

/**
 * 应用菜单（ADR-0035）：提供「复制服务地址」入口——桌面端拉起的实例浏览器同样可访问，
 * 是无凭据架构下有意保留的副产品；其余走标准 role 菜单。
 * 文案用英文，与 CLI（pi-boat --help）口径一致；i18n 三语只覆盖 web UI（ADR-0021）。
 */

export function installApplicationMenu(getServerUrl: () => URL | null): void {
  const copyServerUrl: MenuItemConstructorOptions = {
    label: 'Copy Server URL',
    click: () => {
      const url = getServerUrl();
      if (url !== null) clipboard.writeText(url.toString());
    },
  };

  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              copyServerUrl,
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      // macOS 的 app 菜单已含复制/退出，file 菜单只留关窗
      role: 'fileMenu',
      submenu:
        process.platform === 'darwin'
          ? [{ role: 'close' }]
          : [copyServerUrl, { type: 'separator' }, { role: 'quit' }],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
