const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('plumbcheckDesktop', Object.freeze({
  createMcpSetup: (contractText, caseName) => ipcRenderer.invoke('plumbcheck:create-mcp-setup', { contractText, caseName }),
  controlSetup: () => ipcRenderer.invoke('plumbcheck:control-setup'),
}));
