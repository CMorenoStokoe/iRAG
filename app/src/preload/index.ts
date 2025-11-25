import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  selectFolder: async () => await ipcRenderer.invoke('select-folder'),
  indexFolder: async (filePath: string) => await ipcRenderer.invoke('index-folder', filePath),
  search: async (message: string) => await ipcRenderer.invoke('search', message),
  getStats: async () => await ipcRenderer.invoke('get-stats'),
  removeFile: async (fileName: string, folderPath: string) =>
    await ipcRenderer.invoke('remove-file', fileName, folderPath)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('ipc', {
      on: (fn) => ipcRenderer.on('msg', (_, data) => fn(data))
    })
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
