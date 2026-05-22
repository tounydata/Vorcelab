import { useNavigate } from 'react-router'
import type { Activity } from '../types/activity'
import { fmtP, fmtD, tL } from '../utils/formatters'

interface ActivityCardProps {
  activity: Activity
}

export function ActivityCard({ activity }: ActivityCardProps) {
  const navigate = useNavigate()
  const date = new Date(activity.start_date_local || activity.start_date)
  const ds = date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }).toUpperCase()
  const distKm = (activity.distance / 1000).toFixed(1)
  const meta = [
    distKm + ' km',
    fmtD(activity.moving_time),
    activity.total_elevation_gain > 0 ? `D+ ${Math.round(activity.total_elevation_gain)}m` : null,
    activity.average_heartrate ? `${Math.round(activity.average_heartrate)} bpm` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div
      className="act-card"
      onClick={() => navigate(`/activities/${activity.id}`)}
      style={{ cursor: 'pointer' }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="act-name">{activity.name}</div>
        <div className="act-meta">{meta}</div>
      </div>
      <div style={{ flexShrink: 0, textAlign: 'right' }}>
        <div className="act-pace">{fmtP(activity.average_speed)}</div>
        <div className="act-date">/KM · {ds}</div>
        <div className="act-badge" style={{ marginTop: 4, display: 'inline-block' }}>{tL(activity.type)}</div>
      </div>
    </div>
  )
}
