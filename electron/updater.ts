import { autoUpdater, UpdateInfo } from 'electron-updater';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import * as log from 'electron-log';

log.transports.file.level = 'info';
log.transports.console.level = 'info';

const GITHUB_OWNER: string = 'wzdavid';
// Releases are now published in the main open-source repository.
const GITHUB_REPO: string  = 'openclaw-desktop';

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<\/li>\s*<li>/gi, '\n- ')
    .replace(/<li>/gi, '- ')
    .replace(/<\/?(p|ul|ol|div|strong|em|tt|code)>/gi, '')
    .replace(/<a [^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function formatReleaseNotes(releaseNotes: UpdateInfo['releaseNotes']): string {
  if (Array.isArray(releaseNotes)) {
    return releaseNotes
      .map((item) => {
        const version = typeof item?.version === 'string' ? item.version.trim() : '';
        const note = stripHtml(String(item?.note ?? '').trim());
        if (!version) return note;
        if (!note) return `Version ${version}`;
        return `Version ${version}\n${note}`;
      })
      .filter(Boolean)
      .join('\n\n');
  }

  return stripHtml(String(releaseNotes ?? '').trim());
}

export function setupUpdater(): void {
  // Skip in development
  if (!app.isPackaged) {
    log.info('Auto-updater disabled: development mode');
    return;
  }

  // Skip if GitHub repo is not yet configured
  if (!GITHUB_OWNER || GITHUB_OWNER === 'your-username') {
    log.info('Auto-updater disabled: GITHUB_OWNER not configured in updater.ts');
    return;
  }

  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    log.info('Update available:', info.version);
    BrowserWindow.getAllWindows()[0]?.webContents.send('update-available', info);
    const releaseNotes = formatReleaseNotes(info.releaseNotes);

    dialog.showMessageBox({
      type: 'info',
      title: 'Update Available',
      message: `Version ${info.version} is available`,
      detail: [
        `Current version: ${app.getVersion()}`,
        `Available version: ${info.version}`,
        releaseNotes,
      ].filter(Boolean).join('\n\n'),
      buttons: ['Download Now', 'Later'],
      defaultId: 0, cancelId: 1,
    }).then((result) => {
      if (result.response === 0) autoUpdater.downloadUpdate();
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('No update available:', info.version);
    BrowserWindow.getAllWindows()[0]?.webContents.send('update-not-available', info);
  });

  autoUpdater.on('download-progress', (progress) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('update-progress', progress);
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info.version);
    BrowserWindow.getAllWindows()[0]?.webContents.send('update-downloaded', info);

    dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: 'Restart to apply the update?',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0, cancelId: 1,
    }).then((result) => {
      if (result.response === 0) autoUpdater.quitAndInstall(false, true);
    });
  });

  autoUpdater.on('error', (err) => {
    log.error('Update error:', err.message);
    BrowserWindow.getAllWindows()[0]?.webContents.send('update-error', err);
    // Don't show dialog for network / 404 / config errors — log only
  });

  setupIpcHandlers();

  // Check on startup (delayed) and every 24 hours
  setTimeout(() => checkForUpdates(), 5000);
  setInterval(() => checkForUpdates(), 24 * 60 * 60 * 1000);

  log.info(`Auto-updater ready: ${GITHUB_OWNER}/${GITHUB_REPO}`);
}

function setupIpcHandlers(): void {
  ipcMain.handle('check-for-updates', async () => {
    try {
      await autoUpdater.checkForUpdates();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('download-update', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall(false, true);
  });

  ipcMain.handle('get-app-version', () => app.getVersion());

  ipcMain.handle('restart-app', () => {
    app.relaunch();
    app.exit();
  });
}

export function checkForUpdates(): void {
  autoUpdater.checkForUpdates().catch((err) => {
    log.error('Failed to check for updates:', err.message);
  });
}

export function getCurrentVersion(): string {
  return app.getVersion();
}
