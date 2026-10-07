import { join } from 'path'
import { app, autoUpdater as nativeAutoUpdater, BrowserWindow, ipcMain, screen } from 'electron'
import { isE2ETesting } from './env'

const MINI_WIDTH = 420
const MINI_HEIGHT = 32
// Room for an open project or tag picker below the bar
const MINI_EXPANDED_HEIGHT = 380

export function initializeMiniWindow(icon: string) {
    const miniWindow = new BrowserWindow({
        width: MINI_WIDTH,
        height: MINI_HEIGHT,
        show: false,
        autoHideMenuBar: true,
        frame: false,
        resizable: false,
        transparent: true,
        hasShadow: false,
        ...(process.platform === 'linux' ? { icon } : {}),
        webPreferences: {
            preload: join(__dirname, '../preload/mini.mjs'),
            sandbox: false,
        },
    })
    miniWindow.setAutoHideMenuBar(true)
    miniWindow.on('ready-to-show', () => {
        miniWindow.setAlwaysOnTop(true, 'floating')
        if (process.platform === 'win32') {
            miniWindow.setShape([{ x: 0, y: 0, width: MINI_WIDTH, height: MINI_HEIGHT }])
        }
    })

    return miniWindow
}

/**
 * Grows the mini window downwards while a picker is open, and shrinks it back afterwards.
 * Near the bottom of the screen the window moves up while expanded so the picker stays visible.
 */
function setMiniWindowExpanded(miniWindow: BrowserWindow, expanded: boolean) {
    const height = expanded ? MINI_EXPANDED_HEIGHT : MINI_HEIGHT
    const bounds = miniWindow.getBounds()
    if (bounds.height === height) {
        return
    }
    let y = bounds.y
    if (expanded) {
        collapsedY = bounds.y
        const workArea = screen.getDisplayMatching(bounds).workArea
        y = Math.max(workArea.y, Math.min(bounds.y, workArea.y + workArea.height - height))
    } else if (collapsedY !== null) {
        y = collapsedY
        collapsedY = null
    }
    if (process.platform === 'win32') {
        miniWindow.setShape([{ x: 0, y: 0, width: MINI_WIDTH, height }])
    }
    miniWindow.setBounds({ x: bounds.x, y, width: MINI_WIDTH, height })
}

let collapsedY: number | null = null

export function registerMiniWindowListeners(miniWindow: BrowserWindow) {
    ipcMain.on('setMiniWindowExpanded', (_event, expanded: boolean) => {
        setMiniWindowExpanded(miniWindow, expanded === true)
    })
    ipcMain.on('showMiniWindow', () => {
        if (!isE2ETesting()) {
            miniWindow.show()
            miniWindow.focus()
        }
    })
    ipcMain.on('hideMiniWindow', () => {
        miniWindow.hide()
    })
    let forcequit = false
    miniWindow.on('close', (event) => {
        if (process.platform === 'darwin') {
            if (forcequit === false) {
                event.preventDefault()
                miniWindow.hide()
            }
        } else {
            app.quit()
        }
    })
    app.on('before-quit', () => {
        forcequit = true
    })
    nativeAutoUpdater.on('before-quit-for-update', () => {
        forcequit = true
    })
}
