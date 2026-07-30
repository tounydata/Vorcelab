import { Text, View } from 'react-native'
import { colors, font } from '@/lib/theme'
import { Card, CLabel } from '@/components/coach/ui'
import { loadProjectionAccuracy } from '@/lib/loadProjectionAccuracy'
import { describeBias } from '@/lib/projectionAccuracy'
import type { ErrorMetrics } from '@/lib/engineBacktest'
import { useAsync } from './adminUi'

// ─── Précision RÉELLE du moteur de projection ────────────────────────────────
// Portage de `src/components/admin/EngineAccuracyCard.tsx`. Confronte les prédictions
// FIGÉES AVANT chaque course (snapshots prospectifs, immuables) aux résultats réels,
// ventilées par version de moteur. C'est le seul endroit du produit qui répond à
// « est-ce que la version N+1 a amélioré ou dégradé la précision ? » — `last_projection`
// ne peut pas y répondre : il est réécrit à chaque ouverture de page, et une projection
// recalculée après la course inclut la course elle-même dans son ancrage, ce qui écrase
// l'erreur.
//
// Limite physique native : le tableau à 7 colonnes du web est illisible sur un écran de
// téléphone. Les mêmes 7 métriques sont donc rendues par version en bloc — aucune valeur
// n'est retirée.

function fmtMin(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—'
  const sign = seconds < 0 ? '−' : ''
  const m = Math.abs(seconds) / 60
  return `${sign}${m.toFixed(1)} min`
}

function fmtPct(x: number): string {
  return Number.isFinite(x) ? `${x.toFixed(1)} %` : '—'
}

function fmtRate(x: number | null): string {
  return x == null ? '—' : `${Math.round(x * 100)} %`
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: 74, minWidth: 74 }}>
      <Text style={{ fontFamily: font.mono, fontSize: 8.5, letterSpacing: 0.7, color: colors.text3 }}>
        {label}
      </Text>
      <Text style={{ fontFamily: font.monoMedium, fontSize: 12, color: color ?? colors.text, marginTop: 2 }}>
        {value}
      </Text>
    </View>
  )
}

function MetricBlock({ label, m, optimistic, accent = false }: {
  label: string
  m: ErrorMetrics
  optimistic: number | null
  accent?: boolean
}) {
  return (
    <View style={{ paddingTop: 9, marginTop: 9, borderTopWidth: 1, borderTopColor: colors.line }}>
      <Text style={{
        fontFamily: font.monoMedium, fontSize: 10.5, letterSpacing: 0.6, marginBottom: 6,
        color: accent ? colors.ember : colors.text2,
      }}>
        {label.toUpperCase()}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, columnGap: 8 }}>
        <Metric label="N" value={String(m.n)} />
        <Metric label="MAPE" value={fmtPct(m.mapePct)} />
        <Metric
          label="BIAIS"
          value={fmtMin(m.meanBiasS)}
          color={m.meanBiasS < 0 ? colors.ember2 : colors.text}
        />
        <Metric label="MÉDIAN" value={fmtMin(m.medianAbsS)} />
        <Metric
          label="COUV."
          value={m.intervalCoverage == null ? '—' : `${Math.round(m.intervalCoverage * 100)} %`}
        />
        <Metric label="OPTIM." value={fmtRate(optimistic)} />
      </View>
    </View>
  )
}

export default function EngineAccuracyCard() {
  const report = useAsync(() => loadProjectionAccuracy(), [])
  const data = report.data
  const bias = data ? describeBias(data.overallMoving) : null

  return (
    <Card>
      <CLabel>PRÉCISION RÉELLE DU MOTEUR</CLabel>
      <Text style={{ fontFamily: font.body, fontSize: 11, lineHeight: 16, color: colors.text3, marginBottom: 4 }}>
        Prédictions figées <Text style={{ fontFamily: font.bodySemiBold }}>avant</Text> le départ,
        confrontées au résultat réel. Biais négatif = le moteur annonce plus vite que la réalité.
      </Text>

      {report.loading ? (
        <Text style={{ fontFamily: font.mono, fontSize: 11, color: colors.text3 }}>Chargement…</Text>
      ) : null}
      {report.error ? (
        <Text style={{ fontFamily: font.mono, fontSize: 11, color: colors.ember2 }}>
          Erreur de chargement.
        </Text>
      ) : null}

      {data && data.evaluatedCount === 0 ? (
        <Text style={{ fontFamily: font.body, fontSize: 11.5, lineHeight: 17, color: colors.text2 }}>
          Aucune course évaluée pour l’instant
          {data.pendingCount > 0
            ? ` — ${data.pendingCount} projection(s) figée(s) en attente de résultat`
            : ''}.
          {' '}Le résultat s’enregistre automatiquement en liant l’activité à la course.
        </Text>
      ) : null}

      {data && data.evaluatedCount > 0 ? (
        <>
          <MetricBlock
            label="Toutes versions"
            m={data.overallMoving}
            optimistic={data.optimisticRate}
            accent
          />
          {data.byVersion.map((v) => (
            <MetricBlock
              key={v.engineVersion}
              label={v.engineVersion}
              m={v.moving}
              optimistic={v.optimisticRate}
            />
          ))}

          {bias ? (
            <Text style={{ fontFamily: font.body, fontSize: 11.5, lineHeight: 17, color: colors.text2, marginTop: 10 }}>
              {bias}
            </Text>
          ) : null}
          <Text style={{ fontFamily: font.body, fontSize: 11, lineHeight: 16, color: colors.text3, marginTop: 6 }}>
            Base : temps de <Text style={{ fontFamily: font.bodySemiBold }}>mouvement</Text> (celle
            sur laquelle le moteur est calibré). Sur le chrono officiel, le MAPE global est de
            {' '}{fmtPct(data.overallElapsed.mapePct)}.
            {data.pendingCount > 0 ? ` ${data.pendingCount} projection(s) encore sans résultat.` : ''}
          </Text>
        </>
      ) : null}
    </Card>
  )
}
