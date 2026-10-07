import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
    try {
        contextBridge.exposeInMainWorld('electron', electronAPI)
        contextBridge.exposeInMainWorld('api', api)
        contextBridge.exposeInMainWorld('electronAPI', {
            startTimer: () => ipcRenderer.send('startTimer'),
            stopTimer: () => ipcRenderer.send('stopTimer'),
            startBreak: () => ipcRenderer.send('startBreak'),
            resumeAfterBreak: () => ipcRenderer.send('resumeAfterBreak'),
            startTimerWithSelection: (selection) =>
                ipcRenderer.send('startTimerWithSelection', selection),
            updateRunningTimer: (selection) => ipcRenderer.send('updateRunningTimer', selection),
            setMiniWindowExpanded: (expanded) =>
                ipcRenderer.send('setMiniWindowExpanded', expanded),
            showMainWindow: () => ipcRenderer.send('showMainWindow'),
            getSettings: () => ipcRenderer.invoke('getSettings'),
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
