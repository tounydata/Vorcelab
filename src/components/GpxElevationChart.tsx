import { Line } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip } from 'chart.js'
import type { GpxSample } from '../utils/gpxCore'
import type { Section } from '../utils/gpxCore'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip)

interface Props {
  samples: GpxSample[]
  sections: Section[]
}

export function GpxElevationChart({ samples, sections }: Props) {
  const alts = samples.map(s => s.alt)
  const labels = samples.map(s => s.d.toFixed(1))

  return (
    <div style={{ height: 100 }}>
      <Line
        data={{
          labels,
          datasets: [{
            label: 'Alt',
            data: alts,
            borderColor: '#E5562A',
            backgroundColor: (ctx) => {
              const chart = ctx.chart
              const { ctx: c, chartArea } = chart
              if (!chartArea) return 'rgba(229,86,42,.15)'
              const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
              g.addColorStop(0, 'rgba(229,86,42,.3)')
              g.addColorStop(1, 'rgba(229,86,42,0)')
              return g
            },
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 2,
          }],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx) => `${ctx.raw}m` } }
          },
          scales: {
            x: {
              ticks: {
                maxTicksLimit: 8,
                font: { size: 9 },
                callback: (v) => v + 'km'
              },
              grid: { color: 'rgba(255,255,255,.05)' }
            },
            y: {
              ticks: {
                font: { size: 9 },
                callback: (v) => v + 'm'
              },
              grid: { color: 'rgba(255,255,255,.05)' }
            },
          },
        }}
      />
    </div>
  )
}

