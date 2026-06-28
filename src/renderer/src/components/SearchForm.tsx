import { ScrapeConfig } from '../types'

interface Props {
  config: ScrapeConfig
  setConfig: (c: ScrapeConfig) => void
  running: boolean
}

export function SearchForm({ config, setConfig, running }: Props) {
  const up = (patch: Partial<ScrapeConfig>) => setConfig({ ...config, ...patch })
  const num = (v: string) => (v === '' ? 0 : Number(v))

  return (
    <div className="card form">
      <div className="form-grid">
        <Field label="Địa điểm" wide>
          <input
            value={config.location}
            disabled={running}
            placeholder="vd: Hội An, Việt Nam"
            onChange={(e) => up({ location: e.target.value })}
          />
        </Field>

        <Field label="Loại thuê">
          <select value={config.type} disabled={running} onChange={(e) => up({ type: e.target.value as any })}>
            <option value="nightly">Theo đêm / ngày</option>
            <option value="monthly">Theo tháng</option>
          </select>
        </Field>

        <Field label="Loại chỗ ở">
          <select value={config.place_type} disabled={running} onChange={(e) => up({ place_type: e.target.value })}>
            <option value="">Tất cả</option>
            <option value="Entire home/apt">Nguyên căn</option>
            <option value="Private room">Phòng riêng</option>
          </select>
        </Field>

        {config.type === 'nightly' ? (
          <>
            <Field label="Nhận phòng">
              <input type="date" value={config.checkin} disabled={running} onChange={(e) => up({ checkin: e.target.value })} />
            </Field>
            <Field label="Trả phòng">
              <input type="date" value={config.checkout} disabled={running} onChange={(e) => up({ checkout: e.target.value })} />
            </Field>
          </>
        ) : (
          <>
            <Field label="Bắt đầu tháng">
              <input type="date" value={config.month_start} disabled={running} onChange={(e) => up({ month_start: e.target.value })} />
            </Field>
            <Field label="Số tháng">
              <input type="number" min={1} max={12} value={config.months} disabled={running} onChange={(e) => up({ months: num(e.target.value) })} />
            </Field>
          </>
        )}

        <Field label="Giá từ">
          <input type="number" min={0} value={config.price_min || ''} disabled={running} placeholder="0" onChange={(e) => up({ price_min: num(e.target.value) })} />
        </Field>
        <Field label="Giá đến">
          <input type="number" min={0} value={config.price_max || ''} disabled={running} placeholder="0" onChange={(e) => up({ price_max: num(e.target.value) })} />
        </Field>

        <Field label="Người lớn">
          <input type="number" min={0} value={config.adults} disabled={running} onChange={(e) => up({ adults: num(e.target.value) })} />
        </Field>
        <Field label="Trẻ em">
          <input type="number" min={0} value={config.children} disabled={running} onChange={(e) => up({ children: num(e.target.value) })} />
        </Field>

        <Field label="Tiền tệ">
          <select value={config.currency} disabled={running} onChange={(e) => up({ currency: e.target.value })}>
            <option value="VND">VND</option>
            <option value="USD">USD</option>
          </select>
        </Field>
        <Field label="Số trang (0 = hết)">
          <input type="number" min={0} value={config.max_pages} disabled={running} onChange={(e) => up({ max_pages: num(e.target.value) })} />
        </Field>

        <Field label="Proxy (tùy chọn)" wide>
          <input value={config.proxy} disabled={running} placeholder="http://user:pass@host:port" onChange={(e) => up({ proxy: e.target.value })} />
        </Field>
      </div>

      <label className="toggle">
        <input type="checkbox" checked={config.with_host} disabled={running} onChange={(e) => up({ with_host: e.target.checked })} />
        <span>Lấy thông tin host (tên + ảnh + link) — chậm hơn, +1 request/phòng.</span>
      </label>
    </div>
  )
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={'field' + (wide ? ' wide' : '')}>
      <label>{label}</label>
      {children}
    </div>
  )
}
