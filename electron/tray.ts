import { Tray, Menu, nativeImage, BrowserWindow, App } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { t } from './i18n';

export function createTray(mainWindow: BrowserWindow, app: App): Tray {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.ico');
  let trayIcon: Electron.NativeImage;

  if (fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } else {
    trayIcon = nativeImage.createEmpty();
  }

  const tray = new Tray(trayIcon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: t('tray.open'),
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    { type: 'separator' },
    {
      label: t('tray.close'),
      click: () => {
        (app as any).isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('OpenClaw Desktop');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  return tray;
}

