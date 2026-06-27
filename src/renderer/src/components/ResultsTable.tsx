import { Room } from '../types'
import { Icon } from './Icon'

interface Props {
  rooms: Room[]
  onOpen: (url: string) => void
  onSelect: (room: Room) => void
}

export function ResultsTable({ rooms, onOpen, onSelect }: Props) {
  if (!rooms.length) {
    return <div className="empty">Chưa có phòng. Nhập địa điểm rồi bấm <b>Bắt đầu cào</b>.</div>
  }
  return (
    <div className="table-wrap">
      <table className="rooms">
        <thead>
          <tr>
            <th></th>
            <th>Tên phòng</th>
            <th>Giá</th>
            <th>Đánh giá</th>
            <th>Host</th>
            <th>Toạ độ</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rooms.map((r) => (
            <tr key={r.room_id} className="room-row" onClick={() => onSelect(r)}>
              <td className="thumb-cell">
                {r.image ? <img className="thumb" src={r.image} loading="lazy" /> : <div className="thumb ph" />}
              </td>
              <td className="name-cell">
                <div className="rname link" title={r.name}>{r.name || '(không tên)'}</div>
                <div className="rid">#{r.room_id}</div>
              </td>
              <td className="price-cell">{r.price || <span className="muted">{r.price_label || '—'}</span>}</td>
              <td>{r.rating ? <span className="rating"><Icon name="star" size={13} /> {r.rating} <span className="muted">({r.review_count})</span></span> : <span className="muted">Mới</span>}</td>
              <td className="host-cell">
                {r.host_name ? (
                  <div className="host">
                    {r.host_avatar && <img className="host-av" src={r.host_avatar} loading="lazy" />}
                    <span>{r.host_name}</span>
                  </div>
                ) : <span className="muted">—</span>}
              </td>
              <td className="coord">{r.lat && r.lng ? `${(+r.lat).toFixed(3)}, ${(+r.lng).toFixed(3)}` : '—'}</td>
              <td><button className="btn small icon-btn" onClick={(e) => { e.stopPropagation(); onOpen(r.url) }}><Icon name="external" size={14} /> Mở</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
