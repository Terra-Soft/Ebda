const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ibdaa', {
  listCatalog: () => ipcRenderer.invoke('catalog:list'),
  latestRelease: appId => ipcRenderer.invoke('github:latest', appId),
  releases: appId => ipcRenderer.invoke('github:releases', appId),
  downloadAsset: (appId, url, name) => ipcRenderer.invoke('download:asset', appId, url, name),
  openFolder: appId => ipcRenderer.invoke('files:openFolder', appId),
  openDownloaded: (appId, name) => ipcRenderer.invoke('files:openDownloaded', appId, name),
  windowControl: action => ipcRenderer.invoke('window:control', action),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  openGithub: url => ipcRenderer.invoke('system:openGithub', url),
  onProgress: callback => ipcRenderer.on('download:progress', (_event, data) => callback(data)),
  onMaximized: callback => ipcRenderer.on('window:maximized', (_event, value) => callback(value))
});
