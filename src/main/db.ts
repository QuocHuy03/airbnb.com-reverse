import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

export interface RoomRow {
  room_id: string
  name: string
  price: string
  price_label: string
  rating: string
  review_count: string
  lat: string | number
  lng: string | number
  image: string
  all_images: string[] | string
  url: string
  host_name: string
  host_id: string
  host_url: string
  host_avatar: string
  host_phone: string
}

let db: Database.Database

export function initDb(): void {
  const file = join(app.getPath('userData'), 'airbnb-scraper.db')
  db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      location   TEXT,
      config     TEXT,
      room_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS rooms (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id   INTEGER,
      room_id      TEXT,
      name         TEXT,
      price        TEXT,
      price_label  TEXT,
      rating       TEXT,
      review_count TEXT,
      lat          TEXT,
      lng          TEXT,
      image        TEXT,
      all_images   TEXT,
      url          TEXT,
      host_name    TEXT,
      host_id      TEXT,
      host_url     TEXT,
      host_avatar  TEXT,
      host_phone   TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_rooms_session ON rooms(session_id);
  `)
}

/* ---------- settings (the "driver" / persisted config) ---------- */
export function getSetting(key: string): string | null {
  const r = db.prepare('SELECT value FROM settings WHERE key=?').get(key) as { value: string } | undefined
  return r ? r.value : null
}
export function setSetting(key: string, value: string): void {
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value)
}
export function getDriverConfig(): any {
  const v = getSetting('driver_config')
  return v ? JSON.parse(v) : null
}
export function saveDriverConfig(config: any): void {
  setSetting('driver_config', JSON.stringify(config))
}

/* ---------- generic JSON section store (oauth token, google config) ---------- */
export function getSection(key: string): any {
  const v = getSetting(key)
  return v ? JSON.parse(v) : null
}
export function setSection(key: string, data: any): void {
  setSetting(key, JSON.stringify(data))
}

/* ---------- sessions + rooms ---------- */
export function saveSession(config: any, rooms: RoomRow[]): number {
  const insSession = db.prepare('INSERT INTO sessions(location,config,room_count) VALUES(?,?,?)')
  const info = insSession.run(config.location ?? '', JSON.stringify(config), rooms.length)
  const sid = Number(info.lastInsertRowid)
  const insRoom = db.prepare(`INSERT INTO rooms
    (session_id,room_id,name,price,price_label,rating,review_count,lat,lng,image,all_images,url,host_name,host_id,host_url,host_avatar,host_phone)
    VALUES (@session_id,@room_id,@name,@price,@price_label,@rating,@review_count,@lat,@lng,@image,@all_images,@url,@host_name,@host_id,@host_url,@host_avatar,@host_phone)`)
  const tx = db.transaction((list: RoomRow[]) => {
    for (const r of list) {
      insRoom.run({
        session_id: sid,
        room_id: r.room_id ?? '',
        name: r.name ?? '',
        price: r.price ?? '',
        price_label: r.price_label ?? '',
        rating: r.rating ?? '',
        review_count: r.review_count ?? '',
        lat: String(r.lat ?? ''),
        lng: String(r.lng ?? ''),
        image: r.image ?? '',
        all_images: Array.isArray(r.all_images) ? r.all_images.join(' | ') : (r.all_images ?? ''),
        url: r.url ?? '',
        host_name: r.host_name ?? '',
        host_id: r.host_id ?? '',
        host_url: r.host_url ?? '',
        host_avatar: r.host_avatar ?? '',
        host_phone: r.host_phone ?? ''
      })
    }
  })
  tx(rooms)
  return sid
}

export function listSessions(): any[] {
  return db.prepare('SELECT id,location,room_count,created_at FROM sessions ORDER BY id DESC').all()
}
export function getRooms(sessionId: number): any[] {
  return db.prepare('SELECT * FROM rooms WHERE session_id=? ORDER BY id').all(sessionId)
}
export function deleteSession(sessionId: number): void {
  db.prepare('DELETE FROM sessions WHERE id=?').run(sessionId)
}
