// Tich hop Google Sheets (service account) + Drive (OAuth) cho Airbnb scraper.
import { readFileSync } from 'fs'
import { Readable } from 'stream'
import { google, type sheets_v4 } from 'googleapis'
import { getOAuthClient } from './oauth'

export interface GoogleConfig {
  rows: any[]
  location?: string
  sheetCredPath?: string
  oauthClientPath?: string
  sheetUrl?: string
  sheetTab?: string
  doSheet?: boolean
  doDrive?: boolean
  writeMode?: 'append' | 'overwrite'
  driveParentId?: string
  masterFolderName?: string
}

const SCOPES_SA = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']

// Header cot Sheet (tieng Viet, day du). Cot "folder ảnh (Drive)" duoc dien sau khi upload.
const SHEET_HEADERS = [
  'địa điểm', 'tên phòng', 'phòng ngủ', 'loại giường', 'room_id', 'giá', 'giá (mô tả)', 'đánh giá', 'số đánh giá',
  'toạ độ', 'ảnh đại diện', 'folder ảnh (Drive)', 'link phòng',
  'tên chủ nhà', 'id chủ nhà', 'link chủ nhà', 'sđt chủ'
]

function rowToValues(r: any, location: string): string[] {
  return [
    r._location || location || '',
    r.name || '',
    r._bedroom_name || '',
    r._bedroom_beds || '',
    r.room_id || '',
    r.price || '',
    r.price_label || '',
    r.rating || '',
    r.review_count || '',
    r.lat && r.lng ? `${r.lat}, ${r.lng}` : '',
    r.image || '',
    r.__driveLink || '',
    r.url || '',
    r.host_name || '',
    r.host_id || '',
    r.host_url || '',
    r.host_phone || ''
  ]
}

function imagesOf(r: any): string[] {
  const a = r.all_images
  if (Array.isArray(a)) return a.filter(Boolean)
  if (typeof a === 'string' && a) return a.split(' | ').map((s) => s.trim()).filter(Boolean)
  return r.image ? [r.image] : []
}

function authFrom(credPath: string) {
  const key = JSON.parse(readFileSync(credPath, 'utf8'))
  if (!key.client_email || !key.private_key) throw new Error('File JSON không phải service account.')
  return new google.auth.JWT({ email: key.client_email, key: key.private_key, scopes: SCOPES_SA })
}

function buildAuth(cfg: GoogleConfig, which: 'drive' | 'sheet') {
  if (which === 'drive') return getOAuthClient(cfg.oauthClientPath)
  if (!cfg.sheetCredPath) throw new Error('Chưa chọn file service account cho Sheet.')
  return authFrom(cfg.sheetCredPath)
}

function gErr(e: any): string {
  return e?.response?.data?.error?.message || e?.errors?.[0]?.message || e?.message || String(e)
}

export function parseSheetId(urlOrId: string): string {
  const m = String(urlOrId).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return m ? m[1] : String(urlOrId).trim()
}

function hexToRgb(hex: string) {
  const n = parseInt(hex, 16)
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 }
}

function sanitizeFolderName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'unnamed'
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function withRetry<T>(fn: () => Promise<T>, retries = 6): Promise<T> {
  let delay = 600
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (e: any) {
      const code = e?.code || e?.response?.status
      const reason = e?.errors?.[0]?.reason || e?.response?.data?.error?.errors?.[0]?.reason || ''
      const retriable =
        code === 429 || code === 500 || code === 502 || code === 503 ||
        reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded' || reason === 'backendError'
      if (!retriable || attempt >= retries) throw e
      await sleep(delay + Math.floor(Math.random() * 400))
      delay = Math.min(delay * 2, 16000)
    }
  }
}

async function call<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try { return await withRetry(fn) } catch (e) { throw new Error(`Sheet [${label}]: ${gErr(e)}`) }
}

async function pool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let i = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length || 1) }, async () => {
    while (i < items.length) {
      const idx = i++
      try { await worker(items[idx]) } catch { /* skip */ }
    }
  })
  await Promise.all(runners)
}

// ---------------------------------------------------------------- Drive
async function findOrCreateFolder(drive: any, name: string, parentId?: string): Promise<string> {
  const safe = name.replace(/'/g, "\\'")
  const q = [
    "mimeType='application/vnd.google-apps.folder'", 'trashed=false',
    `name='${safe}'`, parentId ? `'${parentId}' in parents` : null
  ].filter(Boolean).join(' and ')
  const res = await withRetry(() => drive.files.list({ q, fields: 'files(id,name)', pageSize: 1, supportsAllDrives: true }))
  if (res.data.files?.length) return res.data.files[0].id!
  const created = await withRetry(() => drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: parentId ? [parentId] : undefined },
    fields: 'id', supportsAllDrives: true
  }))
  return created.data.id!
}

async function listChildFolders(drive: any, parentId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  let pageToken: string | undefined
  do {
    const res: any = await withRetry(() => drive.files.list({
      q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'nextPageToken, files(id,name)', pageSize: 1000, pageToken,
      supportsAllDrives: true, includeItemsFromAllDrives: true
    }))
    for (const f of res.data.files || []) if (f.name && f.id) map.set(f.name, f.id)
    pageToken = res.data.nextPageToken || undefined
  } while (pageToken)
  return map
}

async function createFolder(drive: any, name: string, parentId: string): Promise<string> {
  const created = await withRetry(() => drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id', supportsAllDrives: true
  }))
  return created.data.id!
}

async function makeAnyoneReader(drive: any, fileId: string) {
  try {
    await drive.permissions.create({ fileId, requestBody: { role: 'reader', type: 'anyone' }, supportsAllDrives: true })
  } catch { /* policy domain co the chan */ }
}

const folderLink = (id: string) => `https://drive.google.com/drive/folders/${id}`

async function listFileNames(drive: any, folderId: string): Promise<Set<string>> {
  const names = new Set<string>()
  let pageToken: string | undefined
  do {
    const res: any = await withRetry(() => drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'nextPageToken, files(name)', pageSize: 1000, pageToken,
      supportsAllDrives: true, includeItemsFromAllDrives: true
    }))
    for (const f of res.data.files || []) if (f.name) names.add(f.name)
    pageToken = res.data.nextPageToken || undefined
  } while (pageToken)
  return names
}

function isFatalDrive(e: any): boolean {
  const reason = e?.errors?.[0]?.reason || e?.response?.data?.error?.errors?.[0]?.reason || ''
  const msg = gErr(e).toLowerCase()
  return reason === 'storageQuotaExceeded' || reason === 'insufficientFilePermissions' ||
    reason === 'insufficientPermissions' || msg.includes('storage quota') ||
    msg.includes('do not have storage') || msg.includes('service accounts do not have')
}

function imageName(url: string, idx: number): string {
  const ext = (url.split('.').pop() || 'jpg').split('?')[0].slice(0, 5)
  return `${String(idx).padStart(3, '0')}.${ext}`
}

async function uploadImage(drive: any, folderId: string, url: string, name: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`tải ảnh ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const mime = res.headers.get('content-type') || 'image/jpeg'
  await withRetry(() => drive.files.create({
    requestBody: { name, parents: [folderId] },
    media: { mimeType: mime, body: Readable.from(buf) }, fields: 'id', supportsAllDrives: true
  }))
}

const UPLOAD_CONCURRENCY = 6
const FOLDER_CONCURRENCY = 10

// ---------------------------------------------------------------- Sheets
async function getSheetTabId(sheets: sheets_v4.Sheets, spreadsheetId: string, tabTitle: string): Promise<number> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const found = meta.data.sheets?.find((s) => s.properties?.title === tabTitle)
  if (found?.properties?.sheetId != null) return found.properties.sheetId
  const add = await sheets.spreadsheets.batchUpdate({
    spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: tabTitle } } }] }
  })
  return add.data.replies![0].addSheet!.properties!.sheetId!
}

const SHEET_BATCH_ROWS = 500
const SHEET_BATCH_REQS = 100

async function writeSheet(
  sheets: sheets_v4.Sheets, spreadsheetId: string, tabTitle: string,
  rows: any[], location: string, mode: 'append' | 'overwrite',
  onProgress: (stage: string, done: number, total: number) => void
) {
  const header = [...SHEET_HEADERS]

  // expand listing co sleeping_arrangements thanh: header toa + sub-row moi phong ngu
  const dataRows: string[][] = []
  const buildingHeaderRowIndices: number[] = []
  for (const r of rows) {
    const sa: { title: string; beds: string[] }[] = r.sleeping_arrangements || []
    if (sa.length > 0) {
      buildingHeaderRowIndices.push(dataRows.length)
      dataRows.push([`${r.name || r.room_id} (${sa.length} phòng)`, ...Array(SHEET_HEADERS.length - 1).fill('')])
      for (const br of sa) {
        dataRows.push(rowToValues({ ...r, _bedroom_name: br.title, _bedroom_beds: br.beds.join(', ') }, location))
      }
    } else {
      dataRows.push(rowToValues(r, location))
    }
  }

  const tabId = await call('lấy tab', () => getSheetTabId(sheets, spreadsheetId, tabTitle))

  const existing = await call('đọc dòng hiện có', () =>
    sheets.spreadsheets.values.get({ spreadsheetId, range: `${tabTitle}!A1:A` }))
  const existingRows = existing.data.values?.length || 0
  let wroteHeader = false

  if (mode === 'overwrite' || existingRows === 0) {
    if (mode === 'overwrite' && existingRows > 0) {
      await call('xoá dữ liệu cũ', () => sheets.spreadsheets.values.clear({ spreadsheetId, range: tabTitle }))
    }
    await call('ghi header', () => sheets.spreadsheets.values.update({
      spreadsheetId, range: `${tabTitle}!A1`, valueInputOption: 'RAW', requestBody: { values: [header] }
    }))
    wroteHeader = true
  }

  for (let i = 0; i < dataRows.length; i += SHEET_BATCH_ROWS) {
    const chunk = dataRows.slice(i, i + SHEET_BATCH_ROWS)
    await call(`ghi dòng ${i + 1}-${i + chunk.length}`, () => sheets.spreadsheets.values.append({
      spreadsheetId, range: `${tabTitle}!A1`, valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS', requestBody: { values: chunk }
    }))
    onProgress('Sheets: ghi dòng', Math.min(i + chunk.length, dataRows.length), dataRows.length)
  }

  const formatRequests: any[] = []
  if (wroteHeader) {
    formatRequests.push(
      {
        repeatCell: {
          range: { sheetId: tabId, startRowIndex: 0, endRowIndex: 1 },
          cell: { userEnteredFormat: { backgroundColor: hexToRgb('FF385C'), textFormat: { bold: true, foregroundColor: hexToRgb('FFFFFF') } } },
          fields: 'userEnteredFormat(backgroundColor,textFormat)'
        }
      },
      {
        updateSheetProperties: {
          properties: { sheetId: tabId, gridProperties: { frozenRowCount: 1 } },
          fields: 'gridProperties.frozenRowCount'
        }
      }
    )
  }
  // format building header rows (header row = 0, data starts at 1)
  for (const ri of buildingHeaderRowIndices) {
    const sheetRow = 1 + ri
    formatRequests.push(
      {
        mergeCells: {
          range: { sheetId: tabId, startRowIndex: sheetRow, endRowIndex: sheetRow + 1, startColumnIndex: 0, endColumnIndex: SHEET_HEADERS.length },
          mergeType: 'MERGE_ALL'
        }
      },
      {
        repeatCell: {
          range: { sheetId: tabId, startRowIndex: sheetRow, endRowIndex: sheetRow + 1 },
          cell: { userEnteredFormat: { backgroundColor: hexToRgb('1E2333'), textFormat: { bold: true, foregroundColor: hexToRgb('FF385C'), fontSize: 11 } } },
          fields: 'userEnteredFormat(backgroundColor,textFormat)'
        }
      }
    )
  }
  if (formatRequests.length) {
    await call('định dạng', () => sheets.spreadsheets.batchUpdate({
      spreadsheetId, requestBody: { requests: formatRequests }
    }))
  }
  void SHEET_BATCH_REQS
}

// ---------------------------------------------------------------- Group rooms by building (proximity ≤60m)
function distM(a: any, b: any): number {
  const la1 = +a.lat, lo1 = +a.lng, la2 = +b.lat, lo2 = +b.lng
  if (!la1 || !lo1 || !la2 || !lo2) return Infinity
  const R = 6371000, rad = Math.PI / 180
  const dLa = (la2 - la1) * rad, dLo = (lo2 - lo1) * rad
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(dLo / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

function groupByBuilding(rows: any[]): { buildingName: string | null; rooms: any[] }[] {
  const assigned = new Array(rows.length).fill(false)
  const groups: { buildingName: string | null; rooms: any[] }[] = []
  for (let i = 0; i < rows.length; i++) {
    if (assigned[i]) continue
    const group = [rows[i]]
    assigned[i] = true
    for (let j = i + 1; j < rows.length; j++) {
      if (assigned[j]) continue
      if (distM(rows[i], rows[j]) <= 60) { group.push(rows[j]); assigned[j] = true }
    }
    const buildingName = group.length > 1
      ? sanitizeFolderName(rows[i].lat && rows[i].lng
          ? `Tòa ${(+rows[i].lat).toFixed(4)},${(+rows[i].lng).toFixed(4)}`
          : `Tòa ${rows[i].host_id || i}`)
      : null
    groups.push({ buildingName, rooms: group })
  }
  return groups
}

// ---------------------------------------------------------------- Orchestrator
export async function runGoogle(cfg: GoogleConfig, onProgress: (stage: string, done: number, total: number) => void) {
  const rows = cfg.rows.map((r) => ({ ...r }))
  let uploaded = 0, failed = 0, skipped = 0, folders = 0
  let firstError = ''
  let masterUrl: string | undefined

  if (cfg.doDrive) {
    const driveAuth = buildAuth(cfg, 'drive')
    const drive = google.drive({ version: 'v3', auth: driveAuth as any })

    const masterName = cfg.masterFolderName || `Airbnb - ${cfg.location || 'Ảnh phòng'}`
    const masterId = await findOrCreateFolder(drive, masterName, cfg.driveParentId || undefined)
    await makeAnyoneReader(drive, masterId)
    masterUrl = folderLink(masterId)

    // folder phong da co duoi master (lay 1 lan de reuse + dedup)
    const masterChildren = await listChildFolders(drive, masterId)

    // nhom phong theo toa (khoang cach ≤60m) -> moi toa 1 folder cha
    const groups = groupByBuilding(rows)
    const tasks: { folderId: string; url: string; name: string }[] = []
    let pi = 0
    onProgress('Drive: tạo folder phòng', 0, rows.length)

    for (const grp of groups) {
      // xac dinh folder cha: neu co nhieu phong thi tao building folder, 1 phong thi dung master
      let parentId = masterId
      if (grp.buildingName) {
        let bid = masterChildren.get(grp.buildingName)
        if (!bid) { bid = await createFolder(drive, grp.buildingName, masterId); folders++ }
        parentId = bid
      }
      const parentChildren = grp.buildingName ? await listChildFolders(drive, parentId) : masterChildren

      await pool(grp.rooms, FOLDER_CONCURRENCY, async (r) => {
        const imgs = imagesOf(r)
        if (!imgs.length) { pi++; return }
        const folderName = sanitizeFolderName(`${r.name || 'phòng'} #${r.room_id}`)
        let folderId = parentChildren.get(folderName)
        let existing = new Set<string>()
        if (!folderId) { folderId = await createFolder(drive, folderName, parentId); folders++ }
        else existing = await listFileNames(drive, folderId)
        r.__driveLink = folderLink(folderId)
        imgs.forEach((u, k) => {
          const name = imageName(u, k + 1)
          if (existing.has(name)) { skipped++; return }
          tasks.push({ folderId: folderId!, url: u, name })
        })
        pi++
        if (pi % 5 === 0 || pi === rows.length) onProgress('Drive: tạo folder phòng', pi, rows.length)
      })
    }

    const total = tasks.length
    let fatal = ''
    onProgress('Drive: upload ảnh', 0, total)
    await pool(tasks, UPLOAD_CONCURRENCY, async (t) => {
      if (fatal) return
      let ok = false
      let lastErr: any
      for (let attempt = 0; attempt < 3 && !fatal; attempt++) {
        try { await uploadImage(drive, t.folderId, t.url, t.name); ok = true; break }
        catch (e: any) {
          lastErr = e
          if (isFatalDrive(e)) { fatal = gErr(e); break }
          await sleep(500 * (attempt + 1))
        }
      }
      if (ok) { uploaded++ } else { failed++; if (!firstError) firstError = gErr(lastErr) }
      const seen = uploaded + failed
      if (seen % 5 === 0 || seen === total) onProgress(`Drive: upload ảnh${failed ? ` (lỗi ${failed})` : ''}`, seen, total)
    })
    onProgress(`Drive: xong${skipped ? ` · bỏ qua ${skipped}` : ''}${failed ? ` · lỗi ${failed}` : ''}`, total, total)
  }

  let outSheetUrl: string | undefined
  if (cfg.doSheet) {
    const sheetAuth = buildAuth(cfg, 'sheet')
    const sheets = google.sheets({ version: 'v4', auth: sheetAuth as any })
    const spreadsheetId = parseSheetId(cfg.sheetUrl || '')
    if (!spreadsheetId) throw new Error('Thiếu link Google Sheet.')
    onProgress('Sheets: đang ghi', 0, 1)
    await writeSheet(sheets, spreadsheetId, cfg.sheetTab || 'airbnb', rows, cfg.location || '', cfg.writeMode || 'append', onProgress)
    onProgress('Sheets: đang ghi', 1, 1)
    outSheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
  }

  return { ok: true, uploaded, failed, skipped, firstError, folders, masterFolderUrl: masterUrl, sheetUrl: outSheetUrl }
}
