import { useNavigate } from 'react-router'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from 'chart.js'
import { Bar } from 'react-chartjs-2'
import type { Activity } from '../../types/activity'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

interface Props {
  activities: Activity[]
}

export function WeeklyKmChart({ activities }: Props) {
  const navigate = useNavigate()
  const weeks: { label: string; km: number }[] = []
  const now = new Date()
  for (let i = 7; i >= 0; i--) {
    const monOffset = (now.getDay() + 6) % 7
    const weekMon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - monOffset - i * 7)
    const weekSun = new Date(weekMon.getTime() + 7 * 86400000)
    const km = activities
      .filter(a => { const d = new Date(a.start_date); return d >= weekMon && d < weekSun })
      .reduce((s, a) => s + a.distance / 1000, 0)
    const label = weekMon.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
    weeks.push({ label, km: Math.round(km * 10) / 10 })
  }

  return (
    <div style={{ height: 140, cursor: 'pointer' }}>
      <Bar
        onClick={() => navigate('/activities')}
        data={{
          labels: weeks.map(w => w.label),
          datasets: [{
            data: weeks.map(w => w.km),
            backgroundColor: weeks.map((_, i) => i === 7 ? 'var(--vl-ember,#E5562A)' : 'rgba(229,86,42,.35)'),
            borderRadius: 4,
          }],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.raw} km` } } },
          scales: {
            x: { ticks: { font: { size: 9 }, color: '#6b7d94' }, grid: { display: false } },
            y: { ticks: { font: { size: 9 }, color: '#6b7d94', callback: v => v + ' km' }, grid: { color: 'rgba(255,255,255,.05)' } },
          },
        }}
      />
    </div>
  )
}
