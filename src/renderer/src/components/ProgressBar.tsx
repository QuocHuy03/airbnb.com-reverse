interface Props {
  pct: number
  progress: { page: number; total: number; count: number; phase: string }
  running: boolean
}

export function ProgressBar({ pct, progress, running }: Props) {
  return (
    <div className="progress-wrap">
      <div className="progress-bar">
        <div className={'progress-fill' + (running ? ' anim' : '')} style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-text">
        {progress.phase === 'host' ? 'Đang lấy host' : 'Trang'} {progress.page}/{progress.total || '?'} · {progress.count} phòng
        {running && <span className="spinner" />}
      </div>
    </div>
  )
}
