import { useEffect, useMemo, useRef, useState } from 'react'
import { ScrapeConfig, Room, SessionRow, ScrapeEvent, RoomDetailData, DEFAULT_CONFIG } from './types'
import { SearchForm } from './components/SearchForm'
import { ResultsTable } from './components/ResultsTable'
import { Sidebar } from './components/Sidebar'
import { ProgressBar } from './components/ProgressBar'
import { RoomDetail } from './components/RoomDetail'
import { GooglePanel } from './components/GooglePanel'
import { Icon } from './components/Icon'

/** Khoang cach 2 toa do (met) - dung de gom "phong cung toa". */
function distM(a: { lat: any; lng: any }, b: { lat: any; lng: any }): number {
  const la1 = +a.lat, lo1 = +a.lng, la2 = +b.lat, lo2 = +b.lng
  if (!la1 || !lo1 || !la2 || !lo2) return Infinity
  const R = 6371000, rad = Math.PI / 180
  const dLa = (la2 - la1) * rad, dLo = (lo2 - lo1) * rad
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(dLo / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

type View = 'scrape' | 'saved' | 'google'

export default function App() {
  const [view, setView] = useState<View>('scrape')
  const [config, setConfig] = useState<ScrapeConfig>(DEFAULT_CONFIG)
  const [rooms, setRooms] = useState<Room[]>([])
  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [progress, setProgress] = useState({ page: 0, total: 0, count: 0, phase: '' })
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [activeSession, setActiveSession] = useState<number | null>(null)
  const [doneSignal, setDoneSignal] = useState(0)
  const [detailCache, setDetailCache] = useState<Record<string, RoomDetailData>>({})
  const logRef = useRef<HTMLDivElement>(null)

  // room detail drawer
  const [selected, setSelected] = useState<Room | null>(null)
  const [detail, setDetail] = useState<RoomDetailData | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  // load persisted driver config + sessions
  useEffect(() => {
    window.api.getDriver().then((c) => { if (c) setConfig({ ...DEFAULT_CONFIG, ...c }) })
    refreshSessions()
  }, [])

  // subscribe to streaming scrape events
  useEffect(() => {
    const off = window.api.onScrapeEvent((ev: ScrapeEvent) => {
      switch (ev.type) {
        case 'status':
          pushLog(ev.msg)
          break
        case 'meta':
          pushLog(`${ev.location} — ${ev.pages} trang`)
          setProgress((p) => ({ ...p, total: ev.pages }))
          break
        case 'room':
          setRooms((prev) => {
            const i = prev.findIndex((r) => r.room_id === ev.data.room_id)
            if (i >= 0) { const cp = [...prev]; cp[i] = ev.data; return cp }
            return [...prev, ev.data]
          })
          break
        case 'progress':
          setProgress({ page: ev.page, total: ev.total_pages, count: ev.count, phase: ev.phase || '' })
          break
        case 'done':
          pushLog(`Hoàn tất — ${ev.count} phòng`)
          setRunning(false)
          setDoneSignal((s) => s + 1)
          break
        case 'error':
          pushLog(`Lỗi: ${ev.msg}`)
          setRunning(false)
          break
      }
    })
    return off
  }, [])

  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight) }, [logs])

  function pushLog(msg: string) {
    const t = new Date().toLocaleTimeString('vi-VN')
    setLogs((l) => [...l.slice(-200), `[${t}] ${msg}`])
  }

  async function refreshSessions() {
    setSessions(await window.api.listSessions())
  }

  async function start() {
    setRooms([])
    setLogs([])
    setActiveSession(null)
    setProgress({ page: 0, total: 0, count: 0, phase: '' })
    setRunning(true)
    await window.api.saveDriver(config) // luu driver/config
    await window.api.startScrape(config)
  }

  async function stop() {
    await window.api.cancelScrape()
    setRunning(false)
    pushLog('Đã dừng')
  }

  async function saveToDb() {
    if (!rooms.length) return
    const sid = await window.api.saveSession(config, rooms)
    pushLog(`Đã lưu ${rooms.length} phòng vào CSDL (session #${sid})`)
    refreshSessions()
  }

  async function exportCsv() {
    if (!rooms.length) return
    const name = `airbnb_${config.location.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 30)}.csv`
    const path = await window.api.exportCsv(rooms, name)
    if (path) pushLog(`Đã xuất CSV: ${path}`)
  }

  async function openSession(sid: number) {
    const rows = await window.api.getRooms(sid)
    setRooms(rows.map((r) => ({ ...r, all_images: (r.all_images || '').split(' | ').filter(Boolean) })))
    setActiveSession(sid)
    setView('scrape')
  }

  async function openDetail(room: Room) {
    setSelected(room)
    setDetail(null)
    setDetailError('')
    setDetailLoading(true)
    const res = await window.api.getDetail({ room_id: room.room_id, domain: config.domain, lang: config.lang })
    setDetailLoading(false)
    if (res?.ok) {
      setDetail(res.detail)
      setDetailCache((c) => ({ ...c, [room.room_id]: res.detail }))
    } else setDetailError(res?.error || 'Không lấy được chi tiết')
  }

  const sameBuilding = useMemo(() => {
    if (!selected) return []
    return rooms.filter((r) => r.room_id !== selected.room_id && distM(r as any, selected as any) <= 60)
  }, [selected, rooms])

  async function removeSession(sid: number) {
    await window.api.deleteSession(sid)
    if (activeSession === sid) { setRooms([]); setActiveSession(null) }
    refreshSessions()
  }

  const pct = progress.total ? Math.round((progress.page / progress.total) * 100) : 0
  const stats = useMemo(() => {
    const withPrice = rooms.filter((r) => r.price).length
    const withHost = rooms.filter((r) => r.host_name).length
    return { total: rooms.length, withPrice, withHost }
  }, [rooms])

  return (
    <div className="app">
      <Sidebar view={view} setView={setView} sessions={sessions} />

      <main className="content">
        <header className="topbar">
          <div>
            <h1>{view === 'scrape' ? 'Cào phòng Airbnb' : view === 'saved' ? 'Phiên đã lưu' : 'Lưu lên Google Sheet & Drive'}</h1>
            <p className="sub">
              {view === 'scrape'
                ? 'Theo địa điểm · loại thuê · ngày · khoảng giá — phân trang tự động'
                : view === 'saved'
                  ? 'Dữ liệu lưu trong SQLite cục bộ'
                  : 'Ghi bảng đầy đủ vào Sheet + upload ảnh từng phòng lên Drive'}
            </p>
          </div>
          {view === 'scrape' && (
            <div className="stat-chips">
              <span className="chip"><Icon name="home" size={14} /> {stats.total}</span>
              <span className="chip"><Icon name="tag" size={14} /> {stats.withPrice} có giá</span>
              <span className="chip"><Icon name="user" size={14} /> {stats.withHost} có host</span>
            </div>
          )}
        </header>

        {view === 'scrape' ? (
          <>
            <SearchForm config={config} setConfig={setConfig} running={running} />

            <div className="action-row">
              {!running ? (
                <button className="btn primary" onClick={start} disabled={!config.location.trim()}>
                  <Icon name="play" /> Bắt đầu cào
                </button>
              ) : (
                <button className="btn danger" onClick={stop}><Icon name="stop" /> Dừng</button>
              )}
              <button className="btn" onClick={saveToDb} disabled={!rooms.length || running}><Icon name="save" /> Lưu CSDL</button>
              <button className="btn" onClick={exportCsv} disabled={!rooms.length}><Icon name="download" /> Xuất CSV</button>
              {activeSession && <span className="badge">đang xem session #{activeSession}</span>}
            </div>

            {(running || progress.total > 0) && (
              <ProgressBar pct={pct} progress={progress} running={running} />
            )}

            {logs.length > 0 && (
              <div className="logbox" ref={logRef}>
                {logs.map((l, i) => <div key={i} className="logline">{l}</div>)}
              </div>
            )}

            <ResultsTable rooms={rooms} onOpen={(u) => window.api.openExternal(u)} onSelect={openDetail} />
          </>
        ) : view === 'saved' ? (
          <SavedView sessions={sessions} onOpen={openSession} onDelete={removeSession} />
        ) : null}

        {/* GooglePanel luôn mount để auto-save hoạt động kể cả khi đang ở tab khác */}
        <div style={{ display: view === 'google' ? undefined : 'none' }}>
          <GooglePanel rooms={rooms} location={config.location} doneSignal={doneSignal} detailCache={detailCache} />
        </div>
      </main>

      {selected && (
        <RoomDetail
          room={selected}
          detail={detail}
          loading={detailLoading}
          error={detailError}
          sameBuilding={sameBuilding}
          onClose={() => setSelected(null)}
          onOpen={(u) => window.api.openExternal(u)}
          onSelectRoom={openDetail}
        />
      )}
    </div>
  )
}

function SavedView({
  sessions, onOpen, onDelete
}: {
  sessions: SessionRow[]
  onOpen: (sid: number) => void
  onDelete: (sid: number) => void
}) {
  if (!sessions.length) return <div className="empty">Chưa có phiên nào được lưu.</div>
  return (
    <div className="session-grid">
      {sessions.map((s) => (
        <div className="session-card" key={s.id}>
          <div className="session-head">
            <span className="session-id">#{s.id}</span>
            <span className="session-count">{s.room_count} phòng</span>
          </div>
          <div className="session-loc">{s.location || '(không tên)'}</div>
          <div className="session-date">{s.created_at}</div>
          <div className="session-actions">
            <button className="btn small primary" onClick={() => onOpen(s.id)}>Mở</button>
            <button className="btn small danger" onClick={() => onDelete(s.id)}>Xoá</button>
          </div>
        </div>
      ))}
    </div>
  )
}
