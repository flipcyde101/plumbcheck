const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('plumbcheckDesktop', Object.freeze({
  createMcpSetup: (contractText, caseName) => ipcRenderer.invoke('plumbcheck:create-mcp-setup', { contractText, caseName }),
  controlSetup: () => ipcRenderer.invoke('plumbcheck:control-setup'),
  updateStatus: () => ipcRenderer.invoke('plumbcheck:updates-status'),
  setUpdateChecks: enabled => ipcRenderer.invoke('plumbcheck:updates-set-enabled', enabled === true),
}));
