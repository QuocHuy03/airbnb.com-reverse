import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'

export type ScrapeEvent =
  | { type: 'status'; msg: string }
  | { type: 'meta'; pages: number; location: string }
  | { type: 'room'; data: any }
  | { type: 'progress'; page: number; total_pages: number; count: number; phase?: string }
  | { type: 'done'; count: number }
  | { type: 'error'; msg: string }

function pythonBin(): string {
  // Windows dung 'python', cac he khac thu 'python3'
  return process.platform === 'win32' ? 'python' : 'python3'
}

function scriptPath(file: string): string {
  // dev: <root>/python/<file> ; packaged: resources/python/<file>
  const packaged = join(process.resourcesPath, 'python', file)
  if (app.isPackaged && existsSync(packaged)) return packaged
  return join(app.getAppPath(), 'python', file)
}
function enginePath(): string {
  return scriptPath('engine.py')
}

let current: ChildProcessWithoutNullStreams | null = null

export function cancelScrape(): void {
  if (current) {
    try { current.kill() } catch { /* ignore */ }
    current = null
  }
}

export function runScrape(config: any, onEvent: (e: ScrapeEvent) => void): Promise<void> {
  return new Promise((resolve) => {
    cancelScrape()
    const proc = spawn(pythonBin(), [enginePath(), JSON.stringify(config)], {
      cwd: app.getAppPath(),
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }
    })
    current = proc
    let buf = ''

    proc.stdout.setEncoding('utf-8')
    proc.stdout.on('data', (chunk: string) => {
      buf += chunk
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line) continue
        try {
          onEvent(JSON.parse(line) as ScrapeEvent)
        } catch {
          onEvent({ type: 'status', msg: line })
        }
      }
    })

    proc.stderr.setEncoding('utf-8')
    proc.stderr.on('data', (chunk: string) => {
      const msg = chunk.trim()
      if (msg) onEvent({ type: 'status', msg: '[py] ' + msg.slice(0, 200) })
    })

    proc.on('error', (err) => {
      onEvent({ type: 'error', msg: 'Khong chay duoc Python: ' + err.message })
      current = null
      resolve()
    })
    proc.on('close', () => {
      if (buf.trim()) {
        try { onEvent(JSON.parse(buf.trim()) as ScrapeEvent) } catch { /* ignore */ }
      }
      current = null
      resolve()
    })
  })
}

/** Lay chi tiet 1 phong (chay python/detail.py, tra 1 JSON object). */
export function runDetail(config: any): Promise<any> {
  return new Promise((resolve) => {
    const proc = spawn(pythonBin(), [scriptPath('detail.py'), JSON.stringify(config)], {
      cwd: app.getAppPath(),
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }
    })
    let out = ''
    let err = ''
    proc.stdout.setEncoding('utf-8')
    proc.stdout.on('data', (c: string) => (out += c))
    proc.stderr.setEncoding('utf-8')
    proc.stderr.on('data', (c: string) => (err += c))
    proc.on('error', (e) => resolve({ ok: false, error: 'Khong chay duoc Python: ' + e.message }))
    proc.on('close', () => {
      const line = out.trim().split('\n').filter(Boolean).pop() || ''
      try {
        resolve(JSON.parse(line))
      } catch {
        resolve({ ok: false, error: err.trim().slice(0, 200) || 'Khong doc duoc ket qua' })
      }
    })
  })
}
