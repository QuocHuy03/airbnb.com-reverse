import { Room, RoomDetailData } from '../types'
import { Icon } from './Icon'
import { sanitizeHtml } from '../sanitize'

interface Props {
  room: Room
  detail: RoomDetailData | null
  loading: boolean
  error: string
  sameBuilding: Room[]
  onClose: () => void
  onOpen: (url: string) => void
  onSelectRoom: (r: Room) => void
}

const RATING_LABELS: Record<string, string> = {
  cleanliness: 'Sạch sẽ',
  accuracy: 'Chính xác',
  checking: 'Nhận phòng',
  communication: 'Giao tiếp',
  location: 'Vị trí',
  value: 'Đáng giá'
}

export function RoomDetail({ room, detail, loading, error, sameBuilding, onClose, onOpen, onSelectRoom }: Props) {
  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div className="drawer-title">
            <div className="dt-name" title={room.name}>{room.name || '(không tên)'}</div>
            <div className="dt-meta">
              {detail?.room_type && <span className="tag">{detail.room_type}</span>}
              {detail?.person_capacity ? <span className="tag">{detail.person_capacity} khách</span> : null}
              {detail?.is_super_host && <span className="tag gold">Superhost</span>}
              {detail?.is_guest_favorite && <span className="tag gold">Guest favorite</span>}
            </div>
          </div>
          <button className="icon-only" onClick={onClose} title="Đóng">✕</button>
        </div>

        <div className="drawer-body">
          {loading && <div className="drawer-loading"><span className="spinner" /> Đang tải chi tiết…</div>}
          {error && <div className="drawer-error">{error}</div>}

          {detail && !loading && (
            <>
              {/* gallery */}
              {detail.images.length > 0 && (
                <div className="gallery">
                  {detail.images.slice(0, 12).map((im, i) => (
                    <img key={i} src={im.url} title={im.title} loading="lazy" onClick={() => onOpen(im.url)} />
                  ))}
                </div>
              )}

              {/* sleeping arrangements */}
              {detail.sleeping_arrangements?.length > 0 && (
                <Section title="Nơi bạn sẽ ngủ nghỉ">
                  <div className="sleeping-grid">
                    {detail.sleeping_arrangements.map((br, i) => (
                      <div className="bedroom-card" key={i}>
                        <div className="bedroom-icon">🛏</div>
                        <div className="bedroom-title">{br.title}</div>
                        <div className="bedroom-beds muted small">{br.beds.join(' · ') || '—'}</div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* price + open */}
              <div className="detail-bar">
                <div className="detail-price">{room.price || room.price_label || 'Không có giá'}</div>
                <button className="btn small primary icon-btn" onClick={() => onOpen(detail.url)}>
                  <Icon name="external" size={14} /> Mở trên Airbnb
                </button>
              </div>

              {/* rating breakdown */}
              {detail.rating?.guest_satisfaction ? (
                <Section title="Đánh giá">
                  <div className="rating-head">
                    <Icon name="star" size={18} className="rstar" />
                    <span className="rating-big">{detail.rating.guest_satisfaction}</span>
                    <span className="muted">({detail.rating.review_count} đánh giá)</span>
                  </div>
                  <div className="rating-grid">
                    {Object.keys(RATING_LABELS).map((k) =>
                      detail.rating[k] != null ? (
                        <div className="rrow" key={k}>
                          <span>{RATING_LABELS[k]}</span>
                          <span className="rval">{detail.rating[k]}</span>
                        </div>
                      ) : null
                    )}
                  </div>
                </Section>
              ) : null}

              {/* description (render HTML da sanitize) */}
              {detail.description && (
                <Section title="Mô tả">
                  <div className="desc" dangerouslySetInnerHTML={{ __html: sanitizeHtml(detail.description) }} />
                </Section>
              )}

              {/* amenities */}
              {detail.amenities.length > 0 && (
                <Section title={`Tiện nghi (${detail.amenities.reduce((n, g) => n + g.values.length, 0)})`}>
                  <div className="amen-groups">
                    {detail.amenities.map((g, i) => (
                      <div className="amen-group" key={i}>
                        <h4>{g.title}</h4>
                        <ul>
                          {g.values.map((a, j) => (
                            <li key={j} className={a.available ? '' : 'na'}>{a.title}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* host */}
              <Section title="Chủ nhà">
                <div className="host-card">
                  {detail.host?.avatar && <img className="host-card-av" src={detail.host.avatar} />}
                  <div>
                    <div className="host-card-name">{detail.host?.name || '—'}</div>
                    <div className="muted small">
                      SĐT: <b className="na-text">không khả dụng</b> (Airbnb ẩn)
                    </div>
                    {detail.host?.url && (
                      <button className="link-btn" onClick={() => onOpen(detail.host!.url!)}>Xem trang chủ nhà</button>
                    )}
                  </div>
                </div>
              </Section>

              {/* same building */}
              <Section title={`Phòng cùng toà / cùng vị trí (${sameBuilding.length})`}>
                {sameBuilding.length === 0 ? (
                  <p className="muted small">Không tìm thấy phòng nào khác cùng toạ độ trong kết quả hiện tại.</p>
                ) : (
                  <div className="sb-list">
                    {sameBuilding.map((r) => (
                      <div className="sb-item" key={r.room_id} onClick={() => onSelectRoom(r)}>
                        {r.image ? <img src={r.image} loading="lazy" /> : <div className="sb-ph" />}
                        <div className="sb-info">
                          <div className="sb-name" title={r.name}>{r.name}</div>
                          <div className="sb-price">{r.price || r.price_label || '—'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="section">
      <h3>{title}</h3>
      {children}
    </div>
  )
}
