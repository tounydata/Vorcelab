// Primitives UI partagées du Coach — portage fidèle des classes CSS du web
// (.card, .hbtn, .mlabel, .clabel) en composants React Native. Mêmes couleurs,
// tailles, espacements et casses que style.css.
import { Pressable, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { colors, radius, space } from '@/lib/theme'

// .card{background:var(--vl-surf);border:1px solid var(--vl-line);border-radius:var(--vl-r-lg);padding:1.25rem;}
export const cardStyle: ViewStyle = {
  backgroundColor: colors.surf,
  borderWidth: 1,
  borderColor: colors.line,
  borderRadius: radius.lg,
  padding: 20,
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[cardStyle, style]}>{children}</View>
}

// .hbtn{padding:6px 12px;border-radius:var(--vl-r-sm);border:1px solid var(--vl-line-2);
//   background:var(--vl-surf-2);color:var(--vl-text-2);font-family:mono;font-size:10.5px;
//   font-weight:600;letter-spacing:0.08em;white-space:nowrap;}
export const hbtnStyle: ViewStyle = {
  paddingVertical: 6,
  paddingHorizontal: 12,
  borderRadius: radius.sm,
  borderWidth: 1,
  borderColor: colors.line2,
  backgroundColor: colors.surf2,
  alignItems: 'center',
  justifyContent: 'center',
  flexDirection: 'row',
}
export const hbtnTextStyle: TextStyle = {
  color: colors.text2,
  fontSize: 10.5,
  fontWeight: '600',
  letterSpacing: 0.84,
}

export function HButton({
  label, children, onPress, disabled, style, textStyle,
}: {
  label?: string
  children?: React.ReactNode
  onPress?: () => void
  disabled?: boolean
  style?: StyleProp<ViewStyle>
  textStyle?: StyleProp<TextStyle>
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={({ pressed }) => [hbtnStyle, pressed && !disabled ? { opacity: 0.7 } : null, style]}
    >
      {label != null ? <Text style={[hbtnTextStyle, textStyle]}>{label}</Text> : children}
    </Pressable>
  )
}

// .mlabel{font-family:mono;font-size:10.5px;letter-spacing:0.16em;text-transform:uppercase;color:var(--vl-text-3);font-weight:600;line-height:1.4;}
export const mlabelStyle: TextStyle = {
  fontSize: 10.5,
  letterSpacing: 1.68,
  textTransform: 'uppercase',
  color: colors.text3,
  fontWeight: '600',
  lineHeight: 14.7,
}
export function MLabel({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[mlabelStyle, style]}>{children}</Text>
}

// .clabel{font-family:mono;font-size:10.5px;color:var(--vl-text-3);text-transform:uppercase;letter-spacing:0.16em;margin-bottom:.75rem;font-weight:600;}
export const clabelStyle: TextStyle = {
  fontSize: 10.5,
  color: colors.text3,
  textTransform: 'uppercase',
  letterSpacing: 1.68,
  marginBottom: 12,
  fontWeight: '600',
}
export function CLabel({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[clabelStyle, style]}>{children}</Text>
}

// .fl{font-family:mono;font-size:10.5px;color:var(--vl-text-3);text-transform:uppercase;letter-spacing:0.14em;margin-bottom:6px;font-weight:600;}
export const flStyle: TextStyle = {
  fontSize: 10.5,
  color: colors.text3,
  textTransform: 'uppercase',
  letterSpacing: 1.47,
  marginBottom: 6,
  fontWeight: '600',
}
export function FL({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[flStyle, style]}>{children}</Text>
}

// .btn-primary{width:100%;background:var(--vl-ember);color:var(--vl-ink);border-radius:var(--vl-r-sm);
//   padding:13px;font-family:display;font-weight:700;font-size:1rem;letter-spacing:0.06em;height:46px;center;}
export function PrimaryButton({
  label, onPress, disabled, style,
}: {
  label: string
  onPress?: () => void
  disabled?: boolean
  style?: StyleProp<ViewStyle>
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={({ pressed }) => [{
        width: '100%', height: 46, backgroundColor: colors.ember, borderRadius: radius.sm,
        alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.6 : pressed ? 0.85 : 1,
      }, style]}
    >
      <Text style={{ color: colors.bg, fontWeight: '700', fontSize: 16, letterSpacing: 0.96 }}>{label}</Text>
    </Pressable>
  )
}

// .sval{font-family:display;font-size:1.5rem;line-height:1;} .slbl{mono 10px text-3 uppercase}
export function SVal({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[{ fontSize: 24, letterSpacing: 0.48, lineHeight: 24, color: colors.text, fontWeight: '700' }, style]}>{children}</Text>
}
export function SLbl({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[{ fontSize: 10, color: colors.text3, textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 4, fontWeight: '600' }, style]}>{children}</Text>
}

// Lien retour façon .mlabel (← Libellé) — Pressable.
export function BackLink({ label, onPress, color }: { label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={{ marginBottom: 16, alignSelf: 'flex-start' }}>
      <Text style={[mlabelStyle, color ? { color } : null]}>{label}</Text>
    </Pressable>
  )
}

export { colors, radius, space }
