import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

const api = {
  // scraping
  startScrape: (config: any) => ipcRenderer.invoke('scrape:start', config),
  cancelScrape: () => ipcRenderer.invoke('scrape:cancel'),
  getDetail: (config: any) => ipcRenderer.invoke('detail:get', config),
  onScrapeEvent: (cb: (ev: any) => void) => {
    const listener = (_e: IpcRendererEvent, ev: any) => cb(ev)
    ipcRenderer.on('scrape:event', listener)
    return () => ipcRenderer.removeListener('scrape:event', listener)
  },
  // driver config
  getDriver: () => ipcRenderer.invoke('driver:get'),
  saveDriver: (config: any) => ipcRenderer.invoke('driver:save', config),
  // sessions / rooms
  saveSession: (config: any, rooms: any[]) => ipcRenderer.invoke('db:saveSession', config, rooms),
  listSessions: () => ipcRenderer.invoke('db:listSessions'),
  getRooms: (sid: number) => ipcRenderer.invoke('db:getRooms', sid),
  deleteSession: (sid: number) => ipcRenderer.invoke('db:deleteSession', sid),
  // export / misc
  exportCsv: (rooms: any[], suggested: string) => ipcRenderer.invoke('export:csv', rooms, suggested),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open', url),
  // Google Sheets / Drive
  pickJson: () => ipcRenderer.invoke('dialog:pickJson'),
  googleLogin: (clientPath: string) => ipcRenderer.invoke('google:login', clientPath),
  oauthStatus: (clientPath: string) => ipcRenderer.invoke('google:oauthStatus', clientPath),
  loadSettings: (section: string) => ipcRenderer.invoke('settings:load', section),
  saveSettings: (section: string, data: any) => ipcRenderer.invoke('settings:save', section, data),
  runGoogle: (cfg: any) => ipcRenderer.invoke('google:run', cfg),
  onGoogleProgress: (cb: (p: { stage: string; done: number; total: number }) => void) => {
    const listener = (_e: IpcRendererEvent, p: any) => cb(p)
    ipcRenderer.on('google:progress', listener)
    return () => ipcRenderer.removeListener('google:progress', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api
