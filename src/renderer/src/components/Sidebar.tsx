import { SessionRow } from '../types'
import { Icon } from './Icon'

type View = 'scrape' | 'saved' | 'google'
interface Props {
  view: View
  setView: (v: View) => void
  sessions: SessionRow[]
}

export function Sidebar({ view, setView, sessions }: Props) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="logo">A</div>
        <div>
          <div className="brand-name">Airbnb Scraper</div>
          <div className="brand-sub">VN edition</div>
        </div>
      </div>

      <nav className="nav">
        <button className={'nav-item' + (view === 'scrape' ? ' active' : '')} onClick={() => setView('scrape')}>
          <Icon name="search" /> Cào mới
        </button>
        <button className={'nav-item' + (view === 'saved' ? ' active' : '')} onClick={() => setView('saved')}>
          <Icon name="database" /> Đã lưu
          {sessions.length > 0 && <span className="nav-badge">{sessions.length}</span>}
        </button>
        <button className={'nav-item' + (view === 'google' ? ' active' : '')} onClick={() => setView('google')}>
          <Icon name="download" /> Google Sheet & Drive
        </button>
      </nav>

    </aside>
  )
}
