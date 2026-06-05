import type { Demo, Pose, Joint } from '../lib/renfoDemos'

// Figure articulée animée : interpole en boucle (ping-pong) entre deux poses clés via
// SMIL <animate>. Vue de profil, viewBox 120×120. `color` = couleur du focus.
// Os = segments entre articulations ; tête = cercle ; sol = ligne discrète.

type Seg = [keyof Pose, keyof Pose]
const BONES: Seg[] = [
  ['shoulder', 'hip'],   // colonne
  ['shoulder', 'elbow'], // bras
  ['elbow', 'hand'],     // avant-bras
  ['hip', 'knee'],       // cuisse
  ['knee', 'ankle'],     // tibia
]

function vals(a: Joint, b: Joint, i: 0 | 1) {
  // ping-pong A → B → A
  return `${a[i]};${b[i]};${a[i]}`
}

export default function StickFigure({ demo, color = '#7c3aed', size = '100%' }: {
  demo: Demo; color?: string; size?: number | string
}) {
  const { a, b, dur = 2.2 } = demo
  const anim = {
    dur: `${dur}s`, repeatCount: 'indefinite', calcMode: 'spline',
    keyTimes: '0;0.5;1', keySplines: '0.4 0 0.2 1;0.4 0 0.2 1',
  } as const

  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label="démonstration animée">
      {/* sol */}
      <line x1={8} y1={114} x2={112} y2={114} stroke={color} strokeWidth={1} opacity={0.25} />

      {/* os */}
      {BONES.map(([j1, j2], i) => (
        <line key={i} stroke={color} strokeWidth={3.2} strokeLinecap="round"
          x1={a[j1][0]} y1={a[j1][1]} x2={a[j2][0]} y2={a[j2][1]}>
          <animate attributeName="x1" values={vals(a[j1], b[j1], 0)} {...anim} />
          <animate attributeName="y1" values={vals(a[j1], b[j1], 1)} {...anim} />
          <animate attributeName="x2" values={vals(a[j2], b[j2], 0)} {...anim} />
          <animate attributeName="y2" values={vals(a[j2], b[j2], 1)} {...anim} />
        </line>
      ))}

      {/* articulations (épaule, hanche, genou) pour lisibilité */}
      {(['shoulder', 'hip', 'knee'] as (keyof Pose)[]).map((j, i) => (
        <circle key={i} cx={a[j][0]} cy={a[j][1]} r={2.2} fill={color}>
          <animate attributeName="cx" values={vals(a[j], b[j], 0)} {...anim} />
          <animate attributeName="cy" values={vals(a[j], b[j], 1)} {...anim} />
        </circle>
      ))}

      {/* tête */}
      <circle cx={a.head[0]} cy={a.head[1]} r={7} fill="none" stroke={color} strokeWidth={3}>
        <animate attributeName="cx" values={vals(a.head, b.head, 0)} {...anim} />
        <animate attributeName="cy" values={vals(a.head, b.head, 1)} {...anim} />
      </circle>
    </svg>
  )
}
