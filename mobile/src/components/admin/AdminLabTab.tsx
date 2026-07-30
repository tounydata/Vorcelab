import { useMemo, useState } from 'react'
import { Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { colors, font, radius } from '@/lib/theme'
import { Card, CLabel, HButton, PrimaryButton } from '@/components/coach/ui'
import ProGate from '@/components/ProGate'
import ShareStickers from '@/components/ShareStickers'
import StravaLinkPrompt from '@/components/StravaLinkPrompt'
import CalibrationPopup from '@/components/coach/CalibrationPopup'
import OneRMTestPopup from '@/components/coach/OneRMTestPopup'
import PostRaceModal from '@/components/races/PostRaceModal'
import { setViewAs } from '@/lib/viewAs'
import {
  getDataAccessLog, getUserSupportSnapshot,
  type AdminUser, type SupportSnapshot,
} from '@/lib/adminApi'
import {
  Collapsible, Etat, Field, Hero, Hint, KeyVal, Message, SelectField,
  fmtNumber, fmtStamp, useAsync,
} from './adminUi'

// Onglet Labo & tests — portage de `src/components/admin/AdminLabTab.tsx` :
//   1. galerie des pop-ups produit, en mode SANS ÉCRITURE ;
//   2. scénarios de plan (FREE / PRO simulés) et accès direct aux écrans ;
//   3. explorateur support : dossier RÉEL d'un utilisateur, en lecture tracée ;
//   4. journal des consultations.
//
// Les scénarios visuels n'utilisent que des données fictives. L'explorateur exige un
// MOTIF, journalisé côté serveur avec l'accès : on ne consulte jamais « pour voir ».
//
// Deux pop-ups du web n'ont PAS d'équivalent natif, et c'est assumé :
//   • « Conversion PRO » : la modale chiffrée du web est précisément ce que l'App Store
//     interdit dans l'app (Guideline 3.1.3(b)). L'aperçu montre donc `ProGate`, la version
//     réellement embarquée — sans prix ni lien d'achat.
//   • « Onboarding complet » : le tour guidé n'est pas embarqué sur natif (cf. CLAUDE.md).

type PopupKey = 'strava' | 'progate' | 'calibration' | 'one-rm' | 'post-race' | 'share' | null

const POPUPS: { key: Exclude<PopupKey, null>; title: string; description: string }[] = [
  { key: 'strava', title: 'Invite Strava', description: 'Relance non bloquante quand le moteur ne peut lire aucune activité.' },
  { key: 'progate', title: 'Gate PRO', description: 'Écran de conversion embarqué : sans prix ni lien d’achat (App Store 3.1.3b).' },
  { key: 'calibration', title: 'Calibrage VMA', description: 'Demi-Cooper, validation et calcul des allures.' },
  { key: 'one-rm', title: 'Test de force 1RM', description: 'Parcours complet, sauvegarde simulée.' },
  { key: 'post-race', title: 'Retour de course', description: 'Activité détectée et accès au débrief.' },
  { key: 'share', title: 'Partage story', description: 'Stickers statistiques, tracé, profil et rendu 3D.' },
]

const ROUTES: { path: Href; label: string; check: string }[] = [
  { path: '/(tabs)', label: 'Dashboard', check: 'KPI, cartes, alertes et dernier entraînement' },
  { path: '/(tabs)/activities', label: 'Activités', check: 'Liste, filtres et ouverture d’une activité' },
  { path: '/(tabs)/coach', label: 'Coach', check: 'Plan, restrictions FREE/PRO et adaptation' },
  { path: '/(tabs)/race', label: 'Courses', check: 'Calendrier, ajout et stratégie GPX' },
  { path: '/renfo/library', label: 'Bibliothèque renfo', check: 'Exercices, médias et prescriptions' },
  { path: '/(tabs)/profile', label: 'Profil athlète', check: 'Runner Matrix, données et calibrages' },
  { path: '/settings', label: 'Réglages', check: 'Strava, abonnement et suppression de compte' },
]

/** Données fictives du partage story — mêmes valeurs que le labo web. */
function buildShareData() {
  const distance = Array.from({ length: 60 }, (_, index) => index * 250)
  const altitude = distance.map((_, index) => 380 + Math.sin(index / 6) * 95 + index * 2)
  const latlng = distance.map((_, index) => [
    47.742 + Math.sin(index / 9) * 0.018,
    7.336 + index * 0.0015,
  ] as [number, number])
  return { movingTimeS: 6842, distanceM: 15200, dplusM: 740, distance, altitude, latlng }
}

function JsonBloc({ value }: { value: unknown }) {
  const text = useMemo(() => {
    try { return JSON.stringify(value, null, 2) } catch { return String(value) }
  }, [value])
  return (
    <ScrollView horizontal style={{ maxHeight: 320 }}>
      <Text
        selectable
        style={{
          fontFamily: font.mono, fontSize: 9, lineHeight: 13.5, color: colors.text2,
          backgroundColor: colors.surf2, borderRadius: radius.sm, padding: 9,
        }}
      >
        {text}
      </Text>
    </ScrollView>
  )
}

function DataLine({ label, value }: { label: string; value: unknown }) {
  const rendered = value == null || value === ''
    ? '—'
    : typeof value === 'object' ? JSON.stringify(value) : String(value)
  return (
    <View style={{ paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.line }}>
      <Text style={{ fontFamily: font.mono, fontSize: 8.5, letterSpacing: 0.6, color: colors.text3 }}>
        {label.replaceAll('_', ' ').toUpperCase()}
      </Text>
      <Text style={{ fontFamily: font.mono, fontSize: 10, color: colors.text2 }}>{rendered}</Text>
    </View>
  )
}

function CountCard({ label, value }: { label: string; value: number }) {
  return (
    <View style={{
      flexGrow: 1, flexBasis: 88, minWidth: 88, padding: 11,
      borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surf2,
    }}>
      <Text style={{ fontFamily: font.mono, fontSize: 8.5, letterSpacing: 0.6, color: colors.text3 }}>
        {label.replaceAll('_', ' ').toUpperCase()}
      </Text>
      <Text style={{ fontFamily: font.displayBold, fontSize: 26, lineHeight: 28, color: colors.ember }}>
        {value}
      </Text>
    </View>
  )
}

/** Dossier réel — mêmes blocs que `SnapshotView` (web). */
function SnapshotView({ snapshot }: { snapshot: SupportSnapshot }) {
  const activities = snapshot.activities ?? []
  const races = snapshot.races ?? []
  const coach = snapshot.coach_sessions ?? []
  const renfoSessions = snapshot.renfo?.recent_sessions ?? []
  const validations = snapshot.projection_validation ?? []
  const profileName = typeof snapshot.profile?.name === 'string' ? snapshot.profile.name : null

  return (
    <View style={{ gap: 12, marginTop: 14 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <View style={{
          flexGrow: 1, flexBasis: 150, padding: 11, borderRadius: radius.sm,
          borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surf2,
        }}>
          <CLabel>IDENTITÉ</CLabel>
          <Text style={{ fontFamily: font.bodySemiBold, fontSize: 12.5, color: colors.text }}>
            {profileName || 'Sans nom'}
          </Text>
          <Text style={{ fontFamily: font.mono, fontSize: 9.5, color: colors.text3, marginTop: 3 }}>
            {snapshot.identity.email}
          </Text>
          <Text style={{ fontFamily: font.mono, fontSize: 9, color: colors.text3, marginTop: 6 }}>
            Dernière connexion · {fmtStamp(snapshot.identity.last_sign_in_at)}
          </Text>
        </View>

        <View style={{
          flexGrow: 1, flexBasis: 150, padding: 11, borderRadius: radius.sm,
          borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surf2,
        }}>
          <CLabel>STRAVA</CLabel>
          <Text style={{
            fontFamily: font.bodySemiBold, fontSize: 12.5,
            color: snapshot.strava.connected ? colors.growth : colors.ember,
          }}>
            {snapshot.strava.connected ? '● Connecté' : '○ Non connecté'}
          </Text>
          {snapshot.strava.connected ? (
            <>
              <Text style={{ fontFamily: font.body, fontSize: 11, color: colors.text2, marginTop: 4 }}>
                {[snapshot.strava.athlete_firstname, snapshot.strava.athlete_lastname].filter(Boolean).join(' ')}
              </Text>
              <Text style={{ fontFamily: font.mono, fontSize: 9, color: colors.text3, marginTop: 5 }}>
                Scope · {snapshot.strava.scope || '—'}
              </Text>
              <Text style={{ fontFamily: font.mono, fontSize: 9, color: colors.text3, marginTop: 2 }}>
                Sync · {fmtStamp(snapshot.strava.last_sync_at)}
              </Text>
            </>
          ) : null}
        </View>

        {Object.entries(snapshot.counts ?? {}).map(([key, value]) => (
          <CountCard key={key} label={key} value={Number(value)} />
        ))}
      </View>

      <Collapsible defaultOpen header={<CLabel>PROFIL ET PARAMÈTRES RÉELS</CLabel>}>
        {Object.entries(snapshot.profile ?? {}).map(([key, value]) => (
          <DataLine key={key} label={key} value={value} />
        ))}
      </Collapsible>

      <Collapsible defaultOpen header={<CLabel>{`20 DERNIÈRES ACTIVITÉS (${activities.length})`}</CLabel>}>
        {activities.map((activity) => (
          <View
            key={String(activity.id)}
            style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.line }}
          >
            <Text style={{ fontFamily: font.bodySemiBold, fontSize: 11.5, color: colors.text }}>
              {String(activity.name ?? '—')}
            </Text>
            <Text style={{ fontFamily: font.mono, fontSize: 9, color: colors.text3, marginTop: 2 }}>
              {fmtStamp(activity.start_date)} · {String(activity.sport_type ?? activity.type ?? '—')}
            </Text>
            <Text style={{ fontFamily: font.mono, fontSize: 9, color: colors.text2, marginTop: 2 }}>
              {fmtNumber(Number(activity.distance) / 1000, 1)} km ·
              {' '}+{fmtNumber(activity.total_elevation_gain)} m ·
              {' '}{fmtNumber(Number(activity.moving_time) / 60)} min ·
              {' '}{fmtNumber(activity.average_heartrate)} bpm
            </Text>
          </View>
        ))}
        {!activities.length ? (
          <Text style={{ fontFamily: font.mono, fontSize: 10, color: colors.text3, paddingVertical: 8 }}>
            Aucune activité.
          </Text>
        ) : null}
      </Collapsible>

      <Collapsible defaultOpen header={<CLabel>{`COURSES (${races.length})`}</CLabel>}>
        {races.map((race) => (
          <View key={String(race.id)} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.line }}>
            <Text style={{ fontFamily: font.bodySemiBold, fontSize: 11.5, color: colors.text }}>
              {String(race.name ?? 'Course')}
            </Text>
            <Text style={{ fontFamily: font.mono, fontSize: 9, color: colors.text3, marginTop: 2 }}>
              {fmtStamp(race.date)} · {fmtNumber(race.distance, 1)} km ·
              {' '}+{fmtNumber(race.elevation)} m · GPX {race.has_gpx ? 'oui' : 'non'}
            </Text>
          </View>
        ))}
        {!races.length ? (
          <Text style={{ fontFamily: font.mono, fontSize: 10, color: colors.text3, paddingVertical: 8 }}>
            Aucune course.
          </Text>
        ) : null}
      </Collapsible>

      <Collapsible defaultOpen header={<CLabel>{`RETOURS COACH (${coach.length})`}</CLabel>}>
        {coach.map((session) => (
          <View key={String(session.id)} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.line }}>
            <Text style={{ fontFamily: font.bodySemiBold, fontSize: 11.5, color: colors.text }}>
              {String(session.verdict ?? 'Séance')}
            </Text>
            <Text style={{ fontFamily: font.mono, fontSize: 9, color: colors.text3, marginTop: 2 }}>
              {fmtStamp(session.created_at)} · RPE {String(session.rpe ?? '—')} ·
              {' '}ressenti {String(session.feeling ?? '—')} · douleur {String(session.pain ?? '—')}
            </Text>
          </View>
        ))}
        {!coach.length ? (
          <Text style={{ fontFamily: font.mono, fontSize: 10, color: colors.text3, paddingVertical: 8 }}>
            Aucun retour de séance.
          </Text>
        ) : null}
      </Collapsible>

      <Collapsible defaultOpen header={<CLabel>{`RENFORCEMENT (${renfoSessions.length} RÉCENTS)`}</CLabel>}>
        {renfoSessions.map((session) => (
          <View key={String(session.id)} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.line }}>
            <Text style={{ fontFamily: font.bodySemiBold, fontSize: 11.5, color: colors.text }}>
              {String(session.focus ?? session.day_key ?? 'Renfo')}
            </Text>
            <Text style={{ fontFamily: font.mono, fontSize: 9, color: colors.text3, marginTop: 2 }}>
              {fmtStamp(session.session_date)} · {fmtNumber(session.duration_min)} min ·
              {' '}{String(session.source ?? 'manuel')}
            </Text>
          </View>
        ))}
        <Text style={{ fontFamily: font.mono, fontSize: 9, color: colors.text3, marginTop: 8 }}>
          1RM enregistrés · {snapshot.renfo?.max_lifts?.length ?? 0}
        </Text>
      </Collapsible>

      <Collapsible defaultOpen header={<CLabel>{`VALIDATIONS MOTEUR (${validations.length})`}</CLabel>}>
        {validations.map((validation) => (
          <View key={String(validation.id)} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.line }}>
            <Text style={{ fontFamily: font.bodySemiBold, fontSize: 11.5, color: colors.text }}>
              {String(validation.engine_version ?? 'Moteur')}
            </Text>
            <Text style={{ fontFamily: font.mono, fontSize: 9, color: colors.text3, marginTop: 2 }}>
              {fmtStamp(validation.created_at)} · statut {String(validation.status ?? '—')} ·
              {' '}prédiction {fmtNumber(Number(validation.prediction_central_s) / 60)} min
            </Text>
          </View>
        ))}
        {!validations.length ? (
          <Text style={{ fontFamily: font.mono, fontSize: 10, color: colors.text3, paddingVertical: 8 }}>
            Aucune validation enregistrée.
          </Text>
        ) : null}
      </Collapsible>

      <Collapsible header={<CLabel>INSTANTANÉ JSON ASSAINI</CLabel>}>
        <JsonBloc value={snapshot} />
      </Collapsible>
    </View>
  )
}

export default function AdminLabTab({ users }: { users: AdminUser[] }) {
  const router = useRouter()
  const athletes = useMemo(() => users.filter((u) => !u.is_admin), [users])
  const shareData = useMemo(() => buildShareData(), [])

  const [popup, setPopup] = useState<PopupKey>(null)
  const [targetUserId, setTargetUserId] = useState('')
  const [reason, setReason] = useState('Diagnostic technique et contrôle qualité')
  const [snapshot, setSnapshot] = useState<SupportSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  // Le journal se recharge après chaque consultation : l'accès qu'on vient de faire doit
  // apparaître immédiatement, comme sur le web (invalidation de la requête).
  const accessLog = useAsync(() => getDataAccessLog(30), [snapshot])

  async function loadSnapshot() {
    if (!targetUserId) { setMessage('Erreur : choisis un utilisateur.'); return }
    if (reason.trim().length < 8) {
      setMessage('Erreur : indique un motif précis d’au moins 8 caractères.')
      return
    }
    setBusy(true); setMessage(''); setSnapshot(null)
    try {
      setSnapshot(await getUserSupportSnapshot(targetUserId, reason))
    } catch (err) {
      setMessage(`Erreur : ${err instanceof Error ? err.message : 'inconnue'}`)
    } finally {
      setBusy(false)
    }
  }

  /**
   * Scénario de plan : simule un profil FREE / PRO puis ramène au dashboard, exactement
   * comme `simulatePlan` (web). Le bandeau permanent permet d'en sortir — nécessaire, car
   * le profil simulé n'est pas admin et l'écran Admin devient donc inaccessible.
   */
  function simulatePlan(tier: 'free' | 'pro') {
    setViewAs({
      id: `admin-lab-${tier}`,
      email: `scenario-${tier}@vorcelab.test`,
      name: `Scénario ${tier.toUpperCase()}`,
      plan_tier: tier,
      plan_expires_at: null,
      is_admin: false,
    })
    router.replace('/(tabs)')
  }

  const logRows = accessLog.data ?? []

  return (
    <View style={{ gap: 14 }}>
      <Hero title="Labo administrateur">
        Les scénarios visuels utilisent uniquement des données fictives. L’explorateur
        support affiche des données réelles en lecture seule : chaque consultation exige un
        motif et est enregistrée. Les secrets, jetons et données GPS brutes ne quittent
        jamais le serveur.
      </Hero>

      <Card>
        <CLabel>GALERIE DES POPUPS · MODE SANS ÉCRITURE</CLabel>
        <View style={{ gap: 6 }}>
          {POPUPS.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => setPopup(item.key)}
              accessibilityRole="button"
              style={{
                padding: 12, borderRadius: radius.sm, borderWidth: 1,
                borderColor: colors.line, backgroundColor: colors.surf2,
              }}
            >
              <Text style={{ fontFamily: font.bodySemiBold, fontSize: 12.5, color: colors.text }}>
                {item.title}
              </Text>
              <Text style={{ fontFamily: font.body, fontSize: 10.5, lineHeight: 15, color: colors.text3, marginTop: 3 }}>
                {item.description}
              </Text>
              <Text style={{ fontFamily: font.monoSemiBold, fontSize: 9, letterSpacing: 0.8, color: colors.ember, marginTop: 8 }}>
                OUVRIR →
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <Card>
        <CLabel>SCÉNARIOS ET PARCOURS</CLabel>
        <Hint>
          Un scénario simule uniquement le PLAN : tes données restent les tiennes. Le bandeau
          en haut de l’écran permet d’en sortir.
        </Hint>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          <HButton label="TESTER LE PLAN FREE" onPress={() => simulatePlan('free')} />
          <HButton
            label="TESTER LE PLAN PRO"
            onPress={() => simulatePlan('pro')}
            style={{ borderColor: colors.ember }}
            textStyle={{ color: colors.ember }}
          />
        </View>
        <View style={{ gap: 6 }}>
          {ROUTES.map((route) => (
            <Pressable
              key={String(route.path)}
              onPress={() => router.push(route.path)}
              accessibilityRole="button"
              style={{
                padding: 11, borderRadius: radius.sm, borderWidth: 1,
                borderColor: colors.line, backgroundColor: colors.surf2,
              }}
            >
              <Text style={{ fontFamily: font.bodySemiBold, fontSize: 12, color: colors.text }}>
                {route.label}
              </Text>
              <Text style={{ fontFamily: font.body, fontSize: 10, lineHeight: 14, color: colors.text3, marginTop: 3 }}>
                {route.check}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <Card>
        <CLabel>DONNÉES RÉELLES · SUPPORT EN LECTURE SEULE</CLabel>
        <Hint>
          Ouvre uniquement un dossier nécessaire au support ou au contrôle qualité.
          L’utilisateur conserve son mot de passe et sa session ; aucune impersonation Auth
          n’est réalisée ici.
        </Hint>
        <SelectField
          label="Utilisateur"
          value={targetUserId}
          onChange={(v) => { setTargetUserId(v); setSnapshot(null) }}
          options={athletes.map((u) => [u.id, u.name ?? u.email] as const)}
        />
        <Field
          label="Motif journalisé"
          value={reason}
          onChange={setReason}
          maxLength={240}
          placeholder="Au moins 8 caractères"
        />
        <PrimaryButton
          label={busy ? 'CHARGEMENT…' : 'OUVRIR LE DOSSIER'}
          disabled={busy}
          onPress={() => void loadSnapshot()}
        />
        {message ? <View style={{ marginTop: 10 }}><Message text={message} /></View> : null}
        {snapshot ? <SnapshotView snapshot={snapshot} /> : null}
      </Card>

      <Card>
        <CLabel>JOURNAL DES CONSULTATIONS</CLabel>
        <Etat state={accessLog} />
        {logRows.length === 0 && !accessLog.loading && !accessLog.error ? (
          <Text style={{ fontFamily: font.mono, fontSize: 10, color: colors.text3 }}>
            Aucune consultation enregistrée.
          </Text>
        ) : null}
        {logRows.map((row) => (
          <View key={row.id} style={{ paddingVertical: 5, borderTopWidth: 1, borderTopColor: colors.line }}>
            <KeyVal
              label={`${row.admin_email ?? '—'} → ${row.target_email ?? row.target_user_id?.slice(0, 8) ?? '—'}`}
              value={fmtStamp(row.accessed_at)}
            />
            {row.reason ? (
              <Text style={{ fontFamily: font.mono, fontSize: 9, color: colors.text3 }}>{row.reason}</Text>
            ) : null}
          </View>
        ))}
      </Card>

      {/* ── Pop-ups, tous en mode aperçu ─────────────────────────────────────── */}

      {popup === 'strava' ? (
        <StravaLinkPrompt previewMode onPreviewClose={() => setPopup(null)} />
      ) : null}

      {popup === 'progate' ? (
        <Modal transparent visible animationType="fade" onRequestClose={() => setPopup(null)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 16 }}>
            <Card style={{ maxHeight: '88%' }}>
              <ScrollView>
                <ProGate feature="cette fonctionnalité" />
                <HButton label="FERMER" onPress={() => setPopup(null)} />
              </ScrollView>
            </Card>
          </View>
        </Modal>
      ) : null}

      {popup === 'calibration' ? (
        <CalibrationPopup
          show
          saving={false}
          onSave={() => setPopup(null)}
          onSkip={() => setPopup(null)}
        />
      ) : null}

      {popup === 'one-rm' ? (
        <OneRMTestPopup open previewMode onClose={() => setPopup(null)} />
      ) : null}

      {popup === 'post-race' ? (
        <PostRaceModal
          prompt={{
            race: {
              id: 'lab-race',
              name: 'Trail du Grand Ballon',
              date: new Date().toISOString().slice(0, 10),
              distance: 21.4,
              start_time: '09:00',
            },
            suggestion: {
              id: 'lab-activity',
              name: 'Trail du Grand Ballon',
              distance: 21480,
              start_date: new Date().toISOString(),
              moving_time: 7820,
            },
          }}
          onLink={() => setPopup(null)}
          onOpenRace={() => setPopup(null)}
          onDismiss={() => setPopup(null)}
        />
      ) : null}

      {popup === 'share' ? (
        <ShareStickers data={shareData} onClose={() => setPopup(null)} />
      ) : null}
    </View>
  )
}
