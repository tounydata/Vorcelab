import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { Doughnut } from 'react-chartjs-2'

ChartJS.register(ArcElement, Tooltip, Legend)

interface Props {
  zones: [number, number, number, number, number]
}

export function HRZonesChart({ zones }: Props) {
  return (
    <div style={{ height: 190 }}>
      <Doughnut
        data={{
          labels: ['Z1 <60%', 'Z2 60-70%', 'Z3 70-80%', 'Z4 80-90%', 'Z5 >90%'],
          datasets: [{
            data: zones,
            backgroundColor: ['#3b82f6', '#2ecc71', '#fbbf24', '#ff6b35', '#f43f5e'],
            borderWidth: 0,
            hoverOffset: 4,
          }],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: { boxWidth: 10, font: { size: 10 }, color: '#6b7d94', padding: 8 },
            },
          },
        }}
      />
    </div>
  )
}
