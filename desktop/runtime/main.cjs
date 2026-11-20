const { app, BrowserWindow, dialog, ipcMain, Menu, shell, safeStorage, net } = require('electron');
const path = require('node:path');
const { writeFile } = require('node:fs/promises');

const args = process.argv.slice(app.isPackaged ? 1 : 2);
let window, server, origin, creatingSetup = false;
let quitting = false;
app.setPath('userData', path.join(app.getPath('appData'), 'PlumbCheck'));

function external(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password &&
      ((parsed.hostname === 'plumbnote.com' && parsed.pathname === '/') ||
       (parsed.hostname === 'github.com' && (parsed.pathname === '/stepan4002/plumbcheck' || parsed.pathname.startsWith('/stepan4002/plumbcheck/'))));
  } catch { return false; }
}

async function start() {
  await app.whenReady();
  const { startStudio } = await import('../../src/studio.js');
  const { makeMcpSetup, readDesktopContract } = await import('./config.mjs');
  const { createVault } = require('./vault.cjs');
  const { createUpdateChecker } = require('./updates.cjs');
  const directory = app.getPath('userData');
  const updates = createUpdateChecker({ fetch: (url, options) => net.fetch(url, { ...options, credentials: 'omit' }), settingsFile: path.join(directory, 'settings.json'), currentVersion: app.getVersion() });
  server = await startStudio({ port: 0, workspaceDirectory: directory, vault: await createVault(directory, safeStorage), fetch: (url, options) => net.fetch(url, { ...options, credentials: 'omit' }) });
  origin = `http://127.0.0.1:${server.address().port}`;
  window = new BrowserWindow({
    title: 'PlumbCheck', width: 1320, height: 940, minWidth: 420, minHeight: 620,
    show: false, backgroundColor: '#f4f1e9', icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false,
      contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false,
      devTools: !app.isPackaged, partition: 'plumbcheck-local' },
  });
  const session = window.webContents.session;
  session.webRequest.onBeforeSendHeaders((details, callback) => {
    const requestHeaders = { ...details.requestHeaders };
    const url = new URL(details.url);
    if (url.origin === origin && url.pathname.startsWith('/api/')) {
      for (const key of Object.keys(requestHeaders)) if (key.toLowerCase() === 'authorization') delete requestHeaders[key];
      requestHeaders.Authorization = `Bearer ${server.workspaceToken}`;
    }
    callback({ requestHeaders });
  });
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
  session.webRequest.onBeforeRequest((details, callback) => {
    let allowed = false;
    try { allowed = new URL(details.url).origin === origin; } catch { /* Deny malformed destinations. */ }
    callback({ cancel: !allowed });
  });
  session.on('will-download', (_event, item) => item.setSaveDialogOptions({ title: 'Save PlumbCheck JSON', defaultPath: path.join(app.getPath('downloads'), item.getFilename()) }));
  window.webContents.setWindowOpenHandler(({ url }) => { if (external(url)) shell.openExternal(url); return { action: 'deny' }; });
  window.webContents.on('will-navigate', (event, url) => { if (url !== `${origin}/`) { event.preventDefault(); if (external(url)) shell.openExternal(url); } });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  const trusted = event => event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === `${origin}/`;
  ipcMain.handle('plumbcheck:updates-status', event => { if (!trusted(event)) throw new Error('Invalid update request.'); return updates.status(); });
  ipcMain.handle('plumbcheck:updates-set-enabled', (event, enabled) => { if (!trusted(event)) throw new Error('Invalid update request.'); return updates.setEnabled(enabled); });
  ipcMain.handle('plumbcheck:control-setup', event => {
    if (!trusted(event)) throw new Error('Invalid setup request.');
    const runtime = path.join(app.isPackaged ? process.resourcesPath : path.dirname(app.getAppPath()), 'mcp-runtime');
    return { mcpServers: { plumbcheck: { command: path.join(runtime, 'node.exe'), args: [path.join(runtime, 'bin', 'plumbcheck-control.js'), '--connect', path.join(directory, 'bridge.json')] } } };
  });
  ipcMain.handle('plumbcheck:create-mcp-setup', async (event, request) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== `${origin}/`) throw new Error('Invalid setup request.');
    if (creatingSetup) throw new Error('Finish the current save dialog first.');
    const suite = readDesktopContract(request?.contractText);
    if (typeof request?.caseName !== 'string' || !suite.cases.some(c => c.name === request.caseName)) throw new Error('Choose a case from this contract.');
    creatingSetup = true;
    try {
      const selected = await dialog.showSaveDialog(window, {
        title: 'Save the contract used by your MCP agent', buttonLabel: 'Save contract',
        defaultPath: path.join(app.getPath('documents'), 'plumbcheck-contract.json'),
        filters: [{ name: 'PlumbCheck JSON contract', extensions: ['json'] }],
      });
      if (selected.canceled || !selected.filePath) return { canceled: true };
      const reportPath = path.join(path.dirname(selected.filePath), 'plumbcheck-reports', `${path.basename(selected.filePath, '.json')}-${Date.now()}`);
      const setup = makeMcpSetup(suite, request.caseName, {
        executable: path.join(app.isPackaged ? process.resourcesPath : path.dirname(app.getAppPath()), 'mcp-runtime', 'node.exe'),
        runnerScript: path.join(app.isPackaged ? process.resourcesPath : path.dirname(app.getAppPath()), 'mcp-runtime', 'bin', 'plumbcheck-mcp.js'),
        contractPath: selected.filePath, reportPath,
      });
      await writeFile(selected.filePath, JSON.stringify(suite, null, 2) + '\n');
      return setup;
    } finally { creatingSetup = false; }
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
    { label: 'Help', submenu: [{ label: 'About PlumbCheck', click: () => dialog.showMessageBox(window, { type: 'info', title: 'PlumbCheck', message: `PlumbCheck ${app.getVersion()}`, detail: 'By Plumbnote · MIT licensed\nLocal tool-call regression testing. Replay covers intercepted calls; it is not a sandbox for agent code.\nIncludes Electron and Chromium; their license notices ship with the application.' }) }, { label: 'Source and documentation', click: () => shell.openExternal('https://github.com/stepan4002/plumbcheck') }] },
  ]));
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => { window = null; app.quit(); });
  await window.loadURL(`${origin}/`);
}

if (args[0] === '--mcp') { process.stderr.write('Use the MCP configuration generated in the app; it points to the bundled console helper.\n'); app.exit(2); }
else if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.on('before-quit', event => {
    if (server && !quitting) { event.preventDefault(); quitting = true; server.shutdown().finally(() => app.quit()); }
  });
  app.on('window-all-closed', () => app.quit());
  start().catch(error => { dialog.showErrorBox('PlumbCheck could not start', error.message); app.quit(); });
}
