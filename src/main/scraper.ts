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

/** Trả về [cmd, args[]] để spawn engine hoặc detail.
 *  Packaged: dùng .exe đã compile bằng PyInstaller (không cần Python trên máy user).
 *  Dev: dùng python + script .py bình thường. */
function resolvePy(name: 'engine' | 'detail'): { cmd: string; args: string[] } {
  if (app.isPackaged) {
    const exe = join(process.resourcesPath, 'python-dist', `${name}.exe`)
    if (existsSync(exe)) return { cmd: exe, args: [] }
  }
  // dev mode — script .py
  const script = join(app.getAppPath(), 'python', `${name}.py`)
  const py = process.platform === 'win32' ? 'python' : 'python3'
  return { cmd: py, args: [script] }
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
    const { cmd, args } = resolvePy('engine')
    const proc = spawn(cmd, [...args, JSON.stringify(config)], {
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
    const { cmd, args } = resolvePy('detail')
    const proc = spawn(cmd, [...args, JSON.stringify(config)], {
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
