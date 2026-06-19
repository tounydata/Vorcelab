import Svg, { Circle, Path, Polygon, Polyline, Rect } from 'react-native-svg'

// Icônes de la barre d'onglets, portées 1:1 depuis le web (Layout.tsx, mobileIcon).
export type TabName = 'index' | 'coach' | 'race' | 'activities' | 'profile'

export function TabIcon({ name, color, size = 22 }: { name: TabName; color: string; size?: number }) {
  const common = { stroke: color, strokeWidth: 2, fill: 'none', strokeLinecap: 'round' as const }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {name === 'index' && <Path d="M3 13L8 6L13 12L17 9L21 14" {...common} strokeLinejoin="round" />}
      {name === 'coach' && (
        <>
          <Circle cx={12} cy={12} r={9} {...common} />
          <Polygon points="14.5 9.5 9.5 11.5 9.5 14.5 14.5 12.5" {...common} />
        </>
      )}
      {name === 'race' && (
        <>
          <Rect x={3} y={5} width={18} height={16} rx={2} {...common} />
          <Path d="M3 10H21M8 3V7M16 3V7" {...common} />
        </>
      )}
      {name === 'activities' && <Polyline points="22 12 18 12 15 21 9 3 6 12 2 12" {...common} />}
      {name === 'profile' && (
        <>
          <Circle cx={12} cy={12} r={3} {...common} strokeLinejoin="round" />
          <Path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
            {...common}
            strokeLinejoin="round"
          />
        </>
      )}
    </Svg>
  )
}
