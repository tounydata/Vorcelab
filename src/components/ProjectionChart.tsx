import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
  type ChartOptions,
} from 'chart.js'
import type { Race } from '../types/race'
import { fmtD } from '../utils/formatters'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

interface Props {
  races: Race[]
}

export function ProjectionChart({ races }: Props) {
  const now = new Date()

  const withProj = [...races]
    .filter(r => r.last_projection != null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  if (withProj.length < 2) return null

  const isUpcoming = (r: Race) => new Date(r.date) >= now

  const labels = withProj.map(r => {
    const short = r.name.length > 18 ? r.name.slice(0, 16) + '…' : r.name
    const d = new Date(r.date).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
    return [short, d]
  })

  const projMins = withProj.map(r => Math.round(r.last_projection!.cible / 60))

  const goalMins = withProj.map(r => {
    if (!r.goal_time) return null
    const m = r.goal_time.match(/(\d+)[hH](\d*)/)
    return m ? parseInt(m[1]) * 60 + (parseInt(m[2]) || 0) : null
  })
  const hasGoals = goalMins.some(g => g !== null)

  const data = {
    labels,
    datasets: [
      {
        label: 'Projection',
        data: projMins,
        backgroundColor: withProj.map(r =>
          isUpcoming(r) ? 'rgba(229,86,42,.7)' : 'rgba(229,86,42,.28)',
        ),
        borderColor: withProj.map(r =>
          isUpcoming(r) ? 'rgba(229,86,42,1)' : 'rgba(229,86,42,.45)',
        ),
        borderWidth: 1,
        borderRadius: 3,
      },
      ...(hasGoals
        ? [{
            label: 'Objectif',
            data: goalMins,
            backgroundColor: 'rgba(16,185,129,.22)',
            borderColor: 'rgba(16,185,129,.55)',
            borderWidth: 1,
            borderRadius: 3,
          }]
        : []),
    ],
  }

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: hasGoals,
        labels: {
          color: '#888',
          font: { family: 'monospace', size: 10 },
          boxWidth: 10,
          padding: 14,
        },
      },
      tooltip: {
        callbacks: {
          title: ctx => withProj[ctx[0].dataIndex].name,
          label: ctx => {
            const val = ctx.raw as number | null
            if (val == null) return ''
            const race = withProj[ctx.dataIndex]
            const dist = race.distance > 0 ? ` · ${(race.distance / 1000).toFixed(0)} km` : ''
            return `${ctx.dataset.label} : ${fmtD(val * 60)}${dist}`
          },
        },
        backgroundColor: 'rgba(14,14,16,.95)',
        titleColor: '#f0f0f0',
        bodyColor: '#aaa',
        borderColor: 'rgba(255,255,255,.1)',
        borderWidth: 1,
        padding: 10,
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,.04)' },
        ticks: { color: '#666', font: { family: 'monospace', size: 9 } },
      },
      y: {
        grid: { color: 'rgba(255,255,255,.06)' },
        beginAtZero: false,
        ticks: {
          color: '#888',
          font: { family: 'monospace', size: 10 },
          callback: val => fmtD((val as number) * 60),
        },
      },
    },
  }

  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ fontFamily: 'var(--vl-mono)', fontSize: '.55rem', color: 'var(--vl-text-3)', letterSpacing: '.1em', marginBottom: 10 }}>
        PROGRESSION · {withProj.length} course{withProj.length > 1 ? 's' : ''} projetées
      </div>
      <div style={{ height: 200, background: 'var(--vl-surf-2)', borderRadius: 8, padding: '14px 12px 8px' }}>
        <Bar data={data} options={options} />
      </div>
    </section>
  )
}
