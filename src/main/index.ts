import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { writeFileSync } from 'fs'
import {
  initDb, getDriverConfig, saveDriverConfig,
  saveSession, listSessions, getRooms, deleteSession, RoomRow
} from './db'
import { runScrape, cancelScrape, runDetail, ScrapeEvent } from './scraper'

let win: BrowserWindow | null = null

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: '#0f1115',
    title: 'Airbnb VN Scraper',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  win.on('ready-to-show', () => win?.show())
  win.webContents.setWindowOpenHandler((d) => {
    shell.openExternal(d.url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const CSV_COLS = [
  'room_id', 'name', 'price', 'price_label', 'rating', 'review_count',
  'lat', 'lng', 'image', 'all_images', 'url',
  'host_name', 'host_id', 'host_url', 'host_avatar', 'host_phone'
]
function toCsv(rows: any[]): string {
  const esc = (v: any) => {
    let s = v == null ? '' : Array.isArray(v) ? v.join(' | ') : String(v)
    if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"'
    return s
  }
  const head = CSV_COLS.join(',')
  const body = rows.map((r) => CSV_COLS.map((c) => esc(r[c])).join(',')).join('\n')
  return '﻿' + head + '\n' + body
}

function registerIpc(): void {
  // ----- scraping (streams events to renderer) -----
  ipcMain.handle('scrape:start', async (e, config) => {
    const sender = e.sender
    await runScrape(config, (ev: ScrapeEvent) => {
      if (!sender.isDestroyed()) sender.send('scrape:event', ev)
    })
    return true
  })
  ipcMain.handle('scrape:cancel', () => { cancelScrape(); return true })

  // ----- room detail -----
  ipcMain.handle('detail:get', (_e, config) => runDetail(config))

  // ----- driver (persisted config) -----
  ipcMain.handle('driver:get', () => getDriverConfig())
  ipcMain.handle('driver:save', (_e, config) => { saveDriverConfig(config); return true })

  // ----- sessions / rooms (SQLite) -----
  ipcMain.handle('db:saveSession', (_e, config, rooms: RoomRow[]) => saveSession(config, rooms))
  ipcMain.handle('db:listSessions', () => listSessions())
  ipcMain.handle('db:getRooms', (_e, sid: number) => getRooms(sid))
  ipcMain.handle('db:deleteSession', (_e, sid: number) => { deleteSession(sid); return true })

  // ----- export CSV -----
  ipcMain.handle('export:csv', async (_e, rooms: any[], suggested: string) => {
    const res = await dialog.showSaveDialog(win!, {
      title: 'Luu CSV',
      defaultPath: suggested || 'airbnb.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (res.canceled || !res.filePath) return null
    writeFileSync(res.filePath, toCsv(rooms), 'utf-8')
    return res.filePath
  })

  ipcMain.handle('shell:open', (_e, url: string) => { shell.openExternal(url); return true })
}

app.whenReady().then(() => {
  initDb()
  registerIpc()
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
