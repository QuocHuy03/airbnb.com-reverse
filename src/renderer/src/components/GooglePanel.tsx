import { useEffect, useRef, useState } from 'react'
import { Room } from '../types'
import { Icon } from './Icon'

interface Props {
  rooms: Room[]
  location: string
}

interface GResult {
  ok: boolean
  uploaded?: number
  failed?: number
  skipped?: number
  folders?: number
  firstError?: string
  masterFolderUrl?: string
  sheetUrl?: string
  error?: string
}

function FilePick({ label, hint, path, onPick }: { label: string; hint: string; path: string; onPick: (p: string) => void }) {
  const pick = async () => {
    const res = await window.api.pickJson()
    if (res?.ok && res.path) onPick(res.path)
  }
  const name = path ? path.split(/[\\/]/).pop() : ''
  return (
    <div className="field">
      <label>{label}</label>
      <button type="button" className={'file-pick' + (name ? ' has-file' : '')} onClick={pick} title={path}>
        <Icon name={name ? 'check' : 'save'} size={14} />
        <span className="fp-text">{name || <span className="muted">{hint}</span>}</span>
      </button>
    </div>
  )
}

export function GooglePanel({ rooms, location }: Props) {
  const [sheetCred, setSheetCred] = useState('')
  const [oauthClient, setOauthClient] = useState('')
  const [oauthEmail, setOauthEmail] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)
  const [sheetUrl, setSheetUrl] = useState('')
  const [sheetTab, setSheetTab] = useState('airbnb')
  const [writeMode, setWriteMode] = useState<'append' | 'overwrite'>('append')
  const [masterFolderName, setMasterFolderName] = useState('Airbnb - Ảnh phòng')
  const [driveParentId, setDriveParentId] = useState('')
  const [doSheet, setDoSheet] = useState(true)
  const [doDrive, setDoDrive] = useState(true)

  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState<GResult | null>(null)
  const loaded = useRef(false)

  // load persisted config
  useEffect(() => {
    window.api.loadSettings('google').then((s: any) => {
      if (s) {
        setSheetCred(s.sheetCred || ''); setOauthClient(s.oauthClient || '')
        setSheetUrl(s.sheetUrl || ''); setSheetTab(s.sheetTab || 'airbnb')
        setWriteMode(s.writeMode === 'overwrite' ? 'overwrite' : 'append')
        setMasterFolderName(s.masterFolderName || 'Airbnb - Ảnh phòng')
        setDriveParentId(s.driveParentId || '')
        if (typeof s.doSheet === 'boolean') setDoSheet(s.doSheet)
        if (typeof s.doDrive === 'boolean') setDoDrive(s.doDrive)
      }
      loaded.current = true
    })
    const off = window.api.onGoogleProgress((p) => {
      setProgress(`${p.stage} — ${p.done}/${p.total}`)
    })
    return off
  }, [])

  // persist config
  useEffect(() => {
    if (!loaded.current) return
    window.api.saveSettings('google', {
      sheetCred, oauthClient, sheetUrl, sheetTab, writeMode, masterFolderName, driveParentId, doSheet, doDrive
    })
  }, [sheetCred, oauthClient, sheetUrl, sheetTab, writeMode, masterFolderName, driveParentId, doSheet, doDrive])

  // oauth status
  useEffect(() => {
    if (!oauthClient) { setOauthEmail(''); return }
    window.api.oauthStatus(oauthClient).then((st) => setOauthEmail(st.loggedIn ? (st.email || '(đã đăng nhập)') : ''))
  }, [oauthClient])

  const login = async () => {
    if (!oauthClient) { alert('Chọn OAuth Client JSON (Desktop app) trước.'); return }
    setLoggingIn(true)
    const res = await window.api.googleLogin(oauthClient)
    setLoggingIn(false)
    if (res?.ok) setOauthEmail(res.email || '(đã đăng nhập)')
    else alert('Đăng nhập lỗi: ' + (res?.error || '?'))
  }

  const run = async () => {
    if (!rooms.length) { alert('Chưa có phòng nào để lưu. Cào dữ liệu trước.'); return }
    if (doSheet && (!sheetCred || !sheetUrl.trim())) { alert('Cần file service account + link Sheet.'); return }
    if (doDrive && (!oauthClient || !oauthEmail)) { alert('Cần đăng nhập Google Drive (OAuth) trước.'); return }
    setRunning(true); setResult(null); setProgress('Đang chuẩn bị…')
    const r = await window.api.runGoogle({
      rows: rooms, location,
      sheetCredPath: sheetCred, oauthClientPath: oauthClient,
      sheetUrl, sheetTab, writeMode, masterFolderName, driveParentId, doSheet, doDrive
    })
    setRunning(false); setResult(r); setProgress('')
    if (!r?.ok) alert('Lỗi: ' + (r?.error || '?'))
  }

  return (
    <div className="gpanel">
      <div className="gpanel-top">
      <div className="card">
        <div className="section-label">Google Sheet · Service account</div>
        <FilePick label="JSON service account (cho Sheet)" hint="chọn service-account.json…" path={sheetCred} onPick={setSheetCred} />
        <div className="field">
          <label>Link Google Sheet</label>
          <input placeholder="https://docs.google.com/spreadsheets/d/…" value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} />
        </div>
        <div className="grid2">
          <div className="field"><label>Tên tab</label><input value={sheetTab} onChange={(e) => setSheetTab(e.target.value)} /></div>
          <div className="field">
            <label>Chế độ ghi</label>
            <select value={writeMode} onChange={(e) => setWriteMode(e.target.value as any)}>
              <option value="append">Nối tiếp</option>
              <option value="overwrite">Ghi đè</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-label">Google Drive · OAuth (tài khoản bạn)</div>
        <p className="g-note">Drive bắt buộc OAuth (service account không có dung lượng). Chọn OAuth Client JSON (Desktop app) rồi đăng nhập — chỉ 1 lần.</p>
        <FilePick label="OAuth Client JSON (Desktop app)" hint="chọn oauth-client.json…" path={oauthClient} onPick={setOauthClient} />
        <div className="login-row">
          <button className="btn small" disabled={loggingIn} onClick={login}>
            {loggingIn ? 'Đang mở trình duyệt…' : (oauthEmail ? 'Đăng nhập lại' : 'Đăng nhập Google')}
          </button>
          <span className={'login-status' + (oauthEmail ? ' ok' : '')}>
            {oauthEmail ? `Đã đăng nhập: ${oauthEmail}` : 'Chưa đăng nhập'}
          </span>
        </div>
        <div className="grid2">
          <div className="field"><label>Tên folder tổng</label><input value={masterFolderName} onChange={(e) => setMasterFolderName(e.target.value)} /></div>
          <div className="field"><label>Folder gốc Drive (ID — tuỳ chọn)</label><input placeholder="để trống = Drive của bạn" value={driveParentId} onChange={(e) => setDriveParentId(e.target.value)} /></div>
        </div>
      </div>
      </div>

      <div className="card">
        <div className="section-label">Tuỳ chọn lưu</div>
        <label className="toggle"><input type="checkbox" checked={doSheet} onChange={(e) => setDoSheet(e.target.checked)} /><span>Ghi bảng vào Google Sheet (đầy đủ cột)</span></label>
        <label className="toggle"><input type="checkbox" checked={doDrive} onChange={(e) => setDoDrive(e.target.checked)} /><span>Upload ảnh lên Drive (mỗi phòng 1 folder, tự bỏ ảnh trùng)</span></label>

        <div className="action-row">
          <button className="btn primary" disabled={running || !rooms.length} onClick={run}>
            <Icon name="database" /> {running ? 'Đang lưu…' : `Lưu lên Google (${rooms.length} phòng)`}
          </button>
        </div>
        {running && <p className="g-progress"><span className="spinner" /> {progress}</p>}
        {result?.ok && (
          <div className="g-result">
            <div>Đã tạo {result.folders} folder · {result.uploaded} ảnh{result.skipped ? ` · bỏ qua ${result.skipped}` : ''}{result.failed ? ` · lỗi ${result.failed}` : ''}</div>
            {result.failed && result.firstError ? <div className="g-err">Lý do: {result.firstError}</div> : null}
            <div className="g-links">
              {result.masterFolderUrl && <button className="link-btn" onClick={() => window.api.openExternal(result.masterFolderUrl!)}>Mở folder Drive</button>}
              {result.sheetUrl && <button className="link-btn" onClick={() => window.api.openExternal(result.sheetUrl!)}>Mở Google Sheet</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
