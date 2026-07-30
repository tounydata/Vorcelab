import { useEffect, useRef, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import type { StyleProp, TextStyle, ViewStyle } from 'react-native'
import { colors, font, radius } from '@/lib/theme'
import { CLabel } from '@/components/coach/ui'

// Primitives communes aux écrans admin mobile. Le web utilise TanStack Query ; le mobile
// ne l'embarque pas (cf. divergence assumée dans le garde-fou de parité), d'où ce petit
// `useAsync` maison — même rôle (chargement, erreur, rechargement, POLLING), sans
// dépendance supplémentaire.

export interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
}

export interface AsyncOptions {
  /**
   * Intervalle de rafraîchissement en ms (équivalent de `refetchInterval` côté web).
   * Indispensable pour l'assistance : le statut Strava change sur l'appareil de
   * l'athlète, l'admin doit le voir sans manipuler sa session.
   */
  pollMs?: number
}

/**
 * Charge une valeur asynchrone. `deps` relance l'appel ; `reload()` le force ;
 * `pollMs` le répète.
 *
 * L'état n'est JAMAIS écrit de façon synchrone dans l'effet (cascade de rendus) : il ne
 * l'est que dans les rappels de la promesse. Les données précédentes restent donc
 * affichées le temps du rechargement, au lieu de clignoter.
 */
export function useAsync<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
  options: AsyncOptions = {},
): AsyncState<T> {
  // La clé des dépendances est mémorisée AVEC la donnée et AVEC l'erreur : un résultat
  // obtenu pour d'autres dépendances est ignoré au rendu suivant. Sans ça, changer de
  // cible d'assistance afficherait un instant le dossier du précédent utilisateur —
  // inacceptable ici. « Chargement » est donc déduit, jamais écrit : ni donnée ni erreur
  // pour la clé courante ⇒ en cours.
  const [state, setState] = useState<{
    dataKey: string | null
    data: T | null
    errorKey: string | null
    error: string | null
  }>({ dataKey: null, data: null, errorKey: null, error: null })
  const [tick, setTick] = useState(0)
  // Clé sérialisée : permet une liste de dépendances littérale, exigée par le lint,
  // tout en réagissant au contenu réel de `deps`.
  const key = JSON.stringify(deps)
  const pollMs = options.pollMs ?? 0
  const loaderRef = useRef(loader)

  useEffect(() => { loaderRef.current = loader })

  useEffect(() => {
    let active = true

    const run = () => {
      loaderRef.current()
        .then((value) => {
          if (active) setState({ dataKey: key, data: value, errorKey: null, error: null })
        })
        .catch((err: unknown) => {
          if (!active) return
          setState((prev) => ({
            // Sur un rafraîchissement périodique, une erreur réseau passagère ne doit
            // pas effacer des données déjà affichées pour la MÊME clé.
            dataKey: prev.dataKey === key ? prev.dataKey : null,
            data: prev.dataKey === key ? prev.data : null,
            errorKey: key,
            error: err instanceof Error ? err.message : 'Erreur inconnue',
          }))
        })
    }

    run()
    if (pollMs <= 0) return () => { active = false }

    const id = setInterval(run, pollMs)
    return () => { active = false; clearInterval(id) }
  }, [key, tick, pollMs])

  const hasData = state.dataKey === key
  const hasError = state.errorKey === key
  return {
    data: hasData ? state.data : null,
    loading: !hasData && !hasError,
    error: hasError ? state.error : null,
    reload: () => setTick((t) => t + 1),
  }
}

export function Segmented<T extends string>({ options, value, onChange }: {
  options: readonly (readonly [T, string])[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
      {options.map(([key, label]) => {
        const on = key === value
        return (
          <Pressable
            key={key}
            onPress={() => { if (!on) onChange(key) }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={({ pressed }) => ({
              paddingVertical: 7, paddingHorizontal: 13, borderRadius: radius.sm,
              backgroundColor: on ? colors.ember : colors.surf2,
              borderWidth: 1, borderColor: on ? colors.ember : colors.line,
              opacity: pressed && !on ? 0.7 : 1,
            })}
          >
            <Text style={{
              fontFamily: font.monoMedium, fontSize: 10.5, letterSpacing: 0.9,
              color: on ? colors.bg : colors.text2,
            }}>
              {label.toUpperCase()}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/** Ligne clé / valeur alignée, pour les fiches de contexte. */
export function KeyVal({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 3 }}>
      <Text style={{ fontFamily: font.mono, fontSize: 10.5, color: colors.text3, flexShrink: 1 }}>
        {label}
      </Text>
      <Text style={{ fontFamily: font.monoMedium, fontSize: 11, color: color ?? colors.text, textAlign: 'right', flexShrink: 1 }}>
        {value}
      </Text>
    </View>
  )
}

export function Pastille({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: ok ? colors.growth : colors.ember2 }} />
      <Text style={{ fontFamily: font.mono, fontSize: 10.5, color: colors.text2 }}>{label}</Text>
    </View>
  )
}

export function Etat({ state }: { state: AsyncState<unknown> }) {
  if (state.loading) {
    return <Text style={{ fontFamily: font.mono, fontSize: 11, color: colors.text3 }}>Chargement…</Text>
  }
  if (state.error) {
    return <Text style={{ fontFamily: font.mono, fontSize: 11, color: colors.ember2 }}>{state.error}</Text>
  }
  return null
}

export function SectionTitle({ children }: { children: string }) {
  return <CLabel>{children.toUpperCase()}</CLabel>
}

/** Texte explicatif d'une section (équivalent des paragraphes gris du web). */
export function Hint({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{
      fontFamily: font.body, fontSize: 11, lineHeight: 16,
      color: colors.text3, marginBottom: 10,
    }}>
      {children}
    </Text>
  )
}

/** En-tête de section mis en avant — équivalent des bandeaux dégradés du web. */
export function Hero({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{
      padding: 14, borderRadius: radius.md, borderWidth: 1,
      borderColor: colors.ember, backgroundColor: 'rgba(214,128,62,0.09)',
    }}>
      <Text style={{ fontFamily: font.display, fontSize: 19, color: colors.text }}>{title}</Text>
      <Text style={{
        marginTop: 6, fontFamily: font.body, fontSize: 11.5, lineHeight: 17, color: colors.text2,
      }}>
        {children}
      </Text>
    </View>
  )
}

/** Bandeau de message (succès / erreur), aligné sur la convention « Erreur : … ». */
export function Message({ text }: { text: string }) {
  if (!text) return null
  const bad = text.startsWith('Erreur')
  return (
    <View
      accessibilityRole={bad ? 'alert' : 'text'}
      accessibilityLiveRegion="polite"
      style={{
        paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.sm,
        borderWidth: 1, borderColor: bad ? colors.ember2 : colors.growth,
        backgroundColor: colors.surf2,
      }}
    >
      <Text style={{
        fontFamily: font.mono, fontSize: 10.5, lineHeight: 15,
        color: bad ? colors.ember2 : colors.growth,
      }}>
        {text}
      </Text>
    </View>
  )
}

/** Grande valeur + libellé + sous-titre — équivalent de `KpiCard` (web). */
export function KpiCard({ label, value, sub, accent = false }: {
  label: string
  value: string | number
  sub?: string
  accent?: boolean
}) {
  return (
    <View style={{
      flexGrow: 1, flexBasis: 100, minWidth: 100,
      paddingVertical: 11, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1,
      borderColor: accent ? colors.ember : colors.line,
      backgroundColor: accent ? 'rgba(214,128,62,0.08)' : colors.surf2,
    }}>
      <Text style={{
        fontFamily: font.mono, fontSize: 9, letterSpacing: 0.9,
        color: accent ? colors.ember : colors.text3, marginBottom: 5,
      }}>
        {label.toUpperCase()}
      </Text>
      <Text style={{
        fontFamily: font.displayBold, fontSize: 26, lineHeight: 27,
        color: accent ? colors.ember : colors.text,
      }}>
        {value}
      </Text>
      {sub ? (
        <Text style={{ fontFamily: font.mono, fontSize: 9, color: colors.text3, marginTop: 4 }}>
          {sub}
        </Text>
      ) : null}
    </View>
  )
}

/**
 * Histogramme 30 jours — même lecture que le web : les 7 derniers jours sont
 * pleinement colorés, les précédents atténués.
 */
export function BarChart({ data, color, height = 56 }: {
  data: readonly { day: string; value: number }[]
  color: string
  height?: number
}) {
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height }}>
      {data.map((d, i) => {
        const recent = data.length - i <= 7
        const pct = Math.max((d.value / max) * 100, d.value > 0 ? 3 : 0)
        return (
          <View
            key={d.day}
            accessibilityLabel={`${d.day} : ${d.value}`}
            style={{
              flex: 1,
              height: `${pct}%`,
              minHeight: d.value > 0 ? 2 : 0,
              backgroundColor: recent ? color : `${color}73`,
              borderTopLeftRadius: 2, borderTopRightRadius: 2,
            }}
          />
        )
      })}
    </View>
  )
}

/** Barre horizontale libellée — funnel et usage des fonctionnalités. */
export function BarRow({ label, sub, value, max, color = colors.ember, trailing }: {
  label: string
  sub?: string
  value: number
  max: number
  color?: string
  trailing?: string
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <View style={{ paddingVertical: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ fontFamily: font.mono, fontSize: 10, color: colors.text2, flexShrink: 1 }}>
          {label}
        </Text>
        <Text style={{ fontFamily: font.monoMedium, fontSize: 10.5, color: colors.text }}>
          {value}
          {trailing ? <Text style={{ color: colors.text3 }}>{`  ${trailing}`}</Text> : null}
        </Text>
      </View>
      <View style={{
        height: 8, backgroundColor: colors.surf3, borderRadius: 4, marginTop: 4, overflow: 'hidden',
      }}>
        <View style={{ width: `${pct}%`, height: 8, backgroundColor: color, borderRadius: 4 }} />
      </View>
      {sub ? (
        <Text style={{ fontFamily: font.mono, fontSize: 9, color: colors.text3, marginTop: 3 }}>
          {sub}
        </Text>
      ) : null}
    </View>
  )
}

/** Équivalent natif de `<details>` : en-tête pressable + contenu replié. */
export function Collapsible({ header, defaultOpen = false, children }: {
  header: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <View style={{
      borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm,
      backgroundColor: colors.surf2, overflow: 'hidden',
    }}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, paddingVertical: 9 }}
      >
        <View style={{ flex: 1 }}>{header}</View>
        <Text style={{ fontFamily: font.mono, fontSize: 13, color: colors.text3 }}>{open ? '−' : '+'}</Text>
      </Pressable>
      {open ? <View style={{ paddingHorizontal: 11, paddingBottom: 10 }}>{children}</View> : null}
    </View>
  )
}

/** Champ texte, équivalent de `Field` (web). */
export function Field({ label, value, onChange, placeholder, numeric = false, maxLength }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  numeric?: boolean
  maxLength?: number
}) {
  return (
    <View style={{ marginBottom: 9 }}>
      <Text style={{ fontFamily: font.mono, fontSize: 9.5, color: colors.text3, marginBottom: 3, letterSpacing: 0.5 }}>
        {label.toUpperCase()}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.text3}
        keyboardType={numeric ? 'numeric' : 'default'}
        autoCapitalize="none"
        maxLength={maxLength}
        style={{
          backgroundColor: colors.surf2, borderWidth: 1, borderColor: colors.line,
          borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8,
          color: colors.text, fontFamily: font.mono, fontSize: 12,
        }}
      />
    </View>
  )
}

/**
 * Équivalent de `SelectField` (web). Limite physique native : pas de `<select>` — les
 * options sont des puces, mêmes valeurs et mêmes libellés.
 */
export function SelectField({ label, value, onChange, options }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: readonly (readonly [string, string])[]
}) {
  return (
    <View style={{ marginBottom: 9 }}>
      <Text style={{ fontFamily: font.mono, fontSize: 9.5, color: colors.text3, marginBottom: 4, letterSpacing: 0.5 }}>
        {label.toUpperCase()}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
        {options.map(([optValue, optLabel]) => {
          const on = optValue === value
          return (
            <Pressable
              key={optValue || '__none__'}
              onPress={() => onChange(optValue)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={{
                paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm, borderWidth: 1,
                borderColor: on ? colors.ember : colors.line,
                backgroundColor: on ? 'rgba(214,128,62,0.12)' : colors.surf2,
              }}
            >
              <Text style={{
                fontFamily: font.mono, fontSize: 10.5,
                color: on ? colors.ember : colors.text2,
              }}>
                {optLabel}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

/** Case à cocher native (équivalent `<input type="checkbox">`). */
export function CheckRow({ checked, onChange, label, style, textStyle }: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  style?: StyleProp<ViewStyle>
  textStyle?: StyleProp<TextStyle>
}) {
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 7 }, style]}
    >
      <View style={{
        width: 18, height: 18, borderRadius: 5, borderWidth: 1,
        alignItems: 'center', justifyContent: 'center',
        borderColor: checked ? colors.ember : colors.line2,
        backgroundColor: checked ? colors.ember : 'transparent',
      }}>
        {checked ? (
          <Text style={{ fontFamily: font.monoMedium, fontSize: 11, color: colors.bg }}>✓</Text>
        ) : null}
      </View>
      <Text style={[{ fontFamily: font.body, fontSize: 11.5, color: colors.text2, flexShrink: 1 }, textStyle]}>
        {label}
      </Text>
    </Pressable>
  )
}

/** Ligne de journal : horodatage · action · résumé, avec la coche de résultat. */
export function LogLine({ at, ok, action, summary }: {
  at: string
  ok: boolean
  action: string
  summary: string
}) {
  return (
    <View style={{ paddingVertical: 5, borderTopWidth: 1, borderTopColor: colors.line }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Text style={{ fontFamily: font.monoMedium, fontSize: 9.5, color: ok ? colors.growth : colors.ember2 }}>
          {ok ? '✓' : '✕'} {action}
        </Text>
        <Text style={{ fontFamily: font.mono, fontSize: 9.5, color: colors.text3, marginLeft: 'auto' }}>
          {fmtDateTime(at)}
        </Text>
      </View>
      <Text style={{ fontFamily: font.mono, fontSize: 9.5, lineHeight: 13.5, color: colors.text2 }}>
        {summary}
      </Text>
    </View>
  )
}

// ── Événements produit (mêmes libellés que le web) ───────────────────────────────

export const EVENT_ICONS: Record<string, string> = {
  session_start:     '🟢',
  coach_viewed:      '🗓',
  race_created:      '🏁',
  strategy_viewed:   '🗺',
  activities_viewed: '📊',
  strava_connected:  '🔗',
  gpx_uploaded:      '📍',
  plan_upgraded:     '✦',
}

export const EVENT_LABELS: Record<string, string> = {
  session_start:     'Ouvertures app',
  coach_viewed:      'Coach consulté',
  race_created:      'Course créée',
  strategy_viewed:   'Stratégie vue',
  activities_viewed: 'Activités vues',
  strava_connected:  'Strava connecté',
  gpx_uploaded:      'GPX uploadé',
  plan_upgraded:     'Passé PRO',
}

/** Libellé du flux d'activité : mêmes textes que `EVENT_LABELS` du web, icône incluse. */
export function eventFeedLabel(event: string): string {
  const label = EVENT_LABELS[event]
  if (!label) return event
  const icon = EVENT_ICONS[event]
  return icon ? `${icon} ${label}` : label
}

export function retentionColor(pct: number): string {
  if (pct >= 50) return colors.growth
  if (pct >= 25) return colors.amber
  return colors.ember
}

// ── Formatage ────────────────────────────────────────────────────────────────────

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** Semaine de cohorte, comme `fmtWeek` (web) : « 14 juil. ». */
export function fmtWeek(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return '—'
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'à l’instant'
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h}h`
  return `il y a ${Math.floor(h / 24)}j`
}

/** Minutes restantes avant expiration (négatif = expiré). */
export function minutesLeft(iso: string | null | undefined): number | null {
  if (!iso) return null
  const ms = Date.parse(iso) - Date.now()
  return Number.isFinite(ms) ? Math.round(ms / 60_000) : null
}

/** Nombre localisé, comme `fmtNumber` (web) — « — » si non finie. */
export function fmtNumber(value: unknown, digits = 0): string {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n.toLocaleString('fr-FR', { maximumFractionDigits: digits }) : '—'
}

/** Horodatage long, comme le `fmtDate` de `AdminLabTab` (web). */
export function fmtStamp(value: unknown): string {
  if (typeof value !== 'string' || !value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}
