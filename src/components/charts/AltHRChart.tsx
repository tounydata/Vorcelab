import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Filler, Tooltip, Legend,
} from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

interface Props {
  altitude: number[]
  heartrate: number[]
  distance: number[]
}

export function AltHRChart({ altitude, heartrate, distance }: Props) {
  const step = Math.max(1, Math.floor(altitude.length / 80))
  const cAlt = altitude.filter((_, i) => i % step === 0)
  const cHR = heartrate.filter((_, i) => i % step === 0)
  const cDist = distance.filter((_, i) => i % step === 0).map(d => (d / 1000).toFixed(2))

  const datasets = [
    {
      label: 'Altitude',
      data: cAlt,
      borderColor: '#00d4ff',
      backgroundColor: 'rgba(0,212,255,.08)',
      fill: true,
      tension: 0.4,
      pointRadius: 0,
      borderWidth: 1.5,
      yAxisID: 'yA',
    },
    ...(cHR.length ? [{
      label: 'FC',
      data: cHR,
      borderColor: '#f43f5e',
      backgroundColor: 'transparent',
      fill: false,
      tension: 0.4,
      pointRadius: 0,
      borderWidth: 1.5,
      borderDash: [3, 2],
      yAxisID: 'yH',
    }] : []),
  ]

  return (
    <div style={{ height: 190 }}>
      <Line
        data={{ labels: cDist, datasets }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: {
              ticks: { maxTicksLimit: 8, font: { size: 9 }, callback: (v) => v + 'km' },
              grid: { color: 'rgba(255,255,255,.05)' },
            },
            yA: {
              position: 'left',
              ticks: { font: { size: 9 }, callback: (v) => v + 'm' },
              grid: { color: 'rgba(255,255,255,.05)' },
            },
            yH: {
              position: 'right',
              min: 50, max: 220,
              ticks: { font: { size: 9 } },
              grid: { display: false },
            },
          },
        }}
      />
    </div>
  )
}
