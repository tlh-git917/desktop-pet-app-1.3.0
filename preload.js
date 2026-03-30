const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopPet', {
  getState: () => ipcRenderer.invoke('get-state'),
  saveState: (patch) => ipcRenderer.invoke('save-state', patch),
  updateFocus: (patch) => ipcRenderer.invoke('update-focus', patch),
  selectImage: () => ipcRenderer.invoke('select-image'),
  showControlWindow: () => ipcRenderer.invoke('show-control-window'),
  testAiConnection: () => ipcRenderer.invoke('test-ai-connection'),
  getWeatherPreview: () => ipcRenderer.invoke('get-weather-preview'),
  generateAvatar: (payload) => ipcRenderer.invoke('generate-avatar', payload),
  chatAvatar: (payload) => ipcRenderer.invoke('chat-avatar', payload),
  triggerVisitor: () => ipcRenderer.invoke('trigger-visitor'),
  startDrag: (payload) => ipcRenderer.send('start-drag', payload),
  dragging: (payload) => ipcRenderer.send('dragging', payload),
  endDrag: () => ipcRenderer.send('end-drag'),
  onStateUpdated: (callback) => ipcRenderer.on('state-updated', (_event, payload) => callback(payload)),
  onVisitor: (callback) => ipcRenderer.on('visitor-appeared', (_event, payload) => callback(payload)),
  onPetNotice: (callback) => ipcRenderer.on('pet-notice', (_event, payload) => callback(payload))
});
