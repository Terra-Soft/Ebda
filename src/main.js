const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const https = require('node:https');
const catalog = require('./catalog');

const INSTALL_ROOT = path.join(app.getPath('userData'), 'downloads');
let mainWindow;

function repoParts(input) {
  if (typeof input !== 'string') throw new Error('لم يتم تحديد مستودع GitHub لهذا البرنامج.');
  const raw = input.trim().replace(/\.git$/i, '').replace(/\/+$/, '');
  const match = raw.match(/^(?:https?:\/\/github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/i);
  if (!match) throw new Error('صيغة المستودع غير صحيحة. استخدم owner/repo داخل src/catalog.js.');
  return { owner: match[1], repo: match[2], url: `https://github.com/${match[1]}/${match[2]}` };
}
function requestJson(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('تجاوز GitHub عدد التحويلات المسموح.'));
    const req = https.get(url, { headers: { 'User-Agent': 'IBDAA-Launcher/1.5', 'Accept': 'application/vnd.github+json' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(requestJson(new URL(res.headers.location, url).href, redirects + 1));
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          let message = `GitHub API: HTTP ${res.statusCode}`;
          try { message = JSON.parse(body).message || message; } catch {}
          return reject(new Error(message));
        }
        try { resolve(JSON.parse(body)); } catch { reject(new Error('تعذر قراءة رد GitHub.')); }
      });
    });
    req.setTimeout(20000, () => req.destroy(new Error('انتهت مهلة الاتصال بـ GitHub.')));
    req.on('error', reject);
  });
}
function safeFilename(value) {
  const name = path.basename(String(value || 'release-download')).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  return name.slice(0, 150) || 'release-download';
}
function downloadAsset(url, destination, onProgress, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) return reject(new Error('رابط التنزيل يحتوي على تحويلات كثيرة.'));
    let parsed;
    try { parsed = new URL(url); } catch { return reject(new Error('رابط التنزيل غير صالح.')); }
    const allowed = ['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'];
    if (parsed.protocol !== 'https:' || !allowed.includes(parsed.hostname)) {
      return reject(new Error('التنزيل مسموح فقط من نطاقات GitHub الرسمية.'));
    }
    const req = https.get(parsed, { headers: { 'User-Agent': 'IBDAA-Launcher/1.5', 'Accept': 'application/octet-stream' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return downloadAsset(new URL(res.headers.location, parsed).href, destination, onProgress, redirects + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`فشل التنزيل: HTTP ${res.statusCode}`)); }
      const total = Number(res.headers['content-length'] || 0);
      let received = 0;
      const output = fs.createWriteStream(destination);
      res.on('data', chunk => {
        received += chunk.length;
        if (onProgress) onProgress(total ? Math.floor(received / total * 100) : null, received, total);
      });
      res.pipe(output);
      output.on('finish', () => output.close(() => resolve({ bytes: received, path: destination })));
      output.on('error', error => { try { fs.unlinkSync(destination); } catch {} reject(error); });
    });
    req.setTimeout(120000, () => req.destroy(new Error('انتهت مهلة تنزيل الملف.')));
    req.on('error', reject);
  });
}
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 940, minWidth: 1080, minHeight: 720,
    frame: false, autoHideMenuBar: true, show: false,
    backgroundColor: '#090B12',
    icon: path.join(__dirname, '..', 'assets', 'ibdaa.ico'),
    title: 'إبداع | IBDAA Creative Suite',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized', false));
}
app.whenReady().then(() => {
  app.setAppUserModelId('dev.ibdaa.launcher');
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('catalog:list', () => catalog);
ipcMain.handle('github:latest', async (_event, appId) => {
  const item = catalog.find(entry => entry.id === appId);
  if (!item) throw new Error('البرنامج غير موجود في catalog.js.');
  const repo = repoParts(item.repo);
  const release = await requestJson(`https://api.github.com/repos/${repo.owner}/${repo.repo}/releases/latest`);
  return {
    appId, repository: repo.url, tag: release.tag_name, name: release.name || release.tag_name,
    htmlUrl: release.html_url, publishedAt: release.published_at, prerelease: release.prerelease,
    notes: String(release.body || '').slice(0, 12000),
    assets: (release.assets || []).map(asset => ({
      name: asset.name, size: asset.size, url: asset.browser_download_url,
      contentType: asset.content_type, downloads: asset.download_count
    }))
  };
});
ipcMain.handle('github:releases', async (_event, appId) => {
  const item = catalog.find(entry => entry.id === appId);
  if (!item) throw new Error('البرنامج غير موجود.');
  const repo = repoParts(item.repo);
  const releases = await requestJson(`https://api.github.com/repos/${repo.owner}/${repo.repo}/releases?per_page=8`);
  return releases.map(release => ({
    tag: release.tag_name, name: release.name || release.tag_name,
    htmlUrl: release.html_url, publishedAt: release.published_at, prerelease: release.prerelease,
    assets: (release.assets || []).map(a => ({ name: a.name, size: a.size, url: a.browser_download_url }))
  }));
});
ipcMain.handle('download:asset', async (event, appId, assetUrl, assetName) => {
  const item = catalog.find(entry => entry.id === appId);
  if (!item) throw new Error('البرنامج غير موجود.');
  repoParts(item.repo);
  const folder = path.join(INSTALL_ROOT, appId);
  fs.mkdirSync(folder, { recursive: true });
  const filename = safeFilename(assetName);
  const destination = path.join(folder, filename);
  const result = await downloadAsset(assetUrl, destination, (percent, received, total) => {
    if (!event.sender.isDestroyed()) event.sender.send('download:progress', { appId, percent, received, total, filename });
  });
  return { ...result, filename };
});
ipcMain.handle('files:openFolder', async (_event, appId) => {
  if (!catalog.some(entry => entry.id === appId)) throw new Error('برنامج غير معروف.');
  const folder = path.join(INSTALL_ROOT, appId);
  fs.mkdirSync(folder, { recursive: true });
  return shell.openPath(folder);
});
ipcMain.handle('files:openDownloaded', async (_event, appId, filename) => {
  if (!catalog.some(entry => entry.id === appId)) throw new Error('برنامج غير معروف.');
  const target = path.join(INSTALL_ROOT, appId, safeFilename(filename));
  if (!fs.existsSync(target)) throw new Error('الملف غير موجود.');
  return shell.openPath(target);
});
ipcMain.handle('window:control', (_event, action) => {
  if (!mainWindow) return false;
  if (action === 'minimize') mainWindow.minimize();
  else if (action === 'toggle-maximize') mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  else if (action === 'close') mainWindow.close();
  return mainWindow.isMaximized();
});
ipcMain.handle('window:isMaximized', () => !!mainWindow && mainWindow.isMaximized());
ipcMain.handle('system:openGithub', async (_event, url) => {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') throw new Error('رابط خارجي غير مسموح.');
  return shell.openExternal(parsed.href);
});
