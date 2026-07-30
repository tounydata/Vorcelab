import { useMemo, useState } from 'react'
import { Alert, Pressable, Text, TextInput, View } from 'react-native'
import { colors, font, radius } from '@/lib/theme'
import { Card, CLabel, HButton } from '@/components/coach/ui'
import {
  getActivityFeed, getGrants, getUserActivity, grantPro, revokePro, sendPasswordResetEmail,
  startSupportSession,
  type AdminActivityEvent, type AdminUser,
} from '@/lib/adminApi'
import { startAssistedSession } from '@/lib/assistedSession'
import {
  Collapsible, Etat, Hint, Message, eventFeedLabel, fmtDate, fmtDateTime, fmtRelative, useAsync,
} from './adminUi'

// Onglet Utilisateurs — portage de la section `users` de `src/pages/AdminPage.tsx` :
// accès rapide « +1 mois » pour tous, flux d'activité global, recherche, fiche par
// utilisateur (octroi/révocation PRO, reset mot de passe, historique des octrois,
// activité récente) et bascule en session assistée.
//
// Tout passe par les mêmes RPC `admin_*` que le web : aucune règle n'est réimplémentée
// ici, et le serveur revérifie l'habilitation à chaque appel.

/** Badge d'abonnement — mêmes trois états que `tierBadge` (web) : PRO, PRO expiré, FREE. */
function TierBadge({ tier, expires }: { tier: string; expires: string | null }) {
  const expired = Boolean(expires && new Date(expires) < new Date())
  const pro = tier === 'pro' && !expired
  const label = pro
    ? `✦ PRO${expires ? ` · exp. ${fmtDate(expires)}` : ' · permanent'}`
    : tier === 'pro' ? 'PRO expiré' : 'FREE'
  const color = pro ? colors.ember : colors.text3

  return (
    <View style={{
      alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999,
      borderWidth: 1, borderColor: pro ? colors.ember : colors.line2,
      backgroundColor: pro ? 'rgba(214,128,62,0.12)' : colors.surf2,
    }}>
      <Text style={{ fontFamily: font.monoMedium, fontSize: 9, letterSpacing: 0.9, color }}>
        {label}
      </Text>
    </View>
  )
}

/** Initiales dans un rond, comme l'avatar du web. */
function Avatar({ user }: { user: AdminUser }) {
  return (
    <View style={{
      width: 34, height: 34, borderRadius: 17, backgroundColor: colors.ember,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontFamily: font.displayBold, fontSize: 15, color: colors.bg }}>
        {(user.name?.[0] ?? user.email[0]).toUpperCase()}
      </Text>
    </View>
  )
}

/** Ligne d'événement — même libellé et même mention de course que `EventLine` (web). */
function EventLine({ ev, showUser = false }: { ev: AdminActivityEvent; showUser?: boolean }) {
  const raceName = typeof ev.meta?.name === 'string' ? ev.meta.name : null
  return (
    <View style={{ paddingVertical: 4, borderTopWidth: 1, borderTopColor: colors.line }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
        <Text style={{ fontFamily: font.mono, fontSize: 10, color: colors.text2, flexShrink: 1 }}>
          {eventFeedLabel(ev.event)}{raceName ? ` — ${raceName}` : ''}
        </Text>
        <Text style={{ fontFamily: font.mono, fontSize: 9, color: colors.text3 }}>
          {fmtRelative(ev.created_at)}
        </Text>
      </View>
      {showUser ? (
        <Text style={{ fontFamily: font.mono, fontSize: 9, color: colors.text3 }} numberOfLines={1}>
          {ev.user_name ?? ev.user_email ?? '—'}
        </Text>
      ) : null}
    </View>
  )
}

function UserActions({ user, onDone }: { user: AdminUser; onDone: () => void }) {
  const [note, setNote] = useState(user.plan_note ?? '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function act(run: () => Promise<unknown>, ok: string) {
    setBusy(true); setMsg('')
    try {
      await run()
      setMsg(ok)
      onDone()
    } catch (err) {
      setMsg(`Erreur : ${err instanceof Error ? err.message : 'inconnue'}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <View>
      <CLabel>ABONNEMENT</CLabel>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Note (ex: testeur, influenceur, cadeau…)"
        placeholderTextColor={colors.text3}
        style={{
          backgroundColor: colors.surf2, borderWidth: 1, borderColor: colors.line,
          borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8,
          color: colors.text, fontFamily: font.mono, fontSize: 12, marginBottom: 8,
        }}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {[1, 3, 6].map((m) => (
          <HButton
            key={m}
            label={`+ ${m} MOIS`}
            disabled={busy}
            onPress={() => void act(() => grantPro(user.id, m, note), '✓ Accordé')}
          />
        ))}
        <HButton
          label="PRO PERMANENT"
          disabled={busy}
          onPress={() => void act(() => grantPro(user.id, null, note), '✓ Accordé')}
        />
        {user.plan_tier === 'pro' ? (
          <HButton
            label="RÉVOQUER → FREE"
            disabled={busy}
            onPress={() => void act(() => revokePro(user.id), '✓ Révoqué')}
            style={{ borderColor: colors.ember2 }}
            textStyle={{ color: colors.ember2 }}
          />
        ) : null}
        <HButton
          label="RESET MDP"
          disabled={busy}
          onPress={() => void act(
            () => sendPasswordResetEmail(user.email),
            '✓ Email de reset envoyé',
          )}
        />
      </View>
      {msg ? (
        <Text style={{
          marginTop: 8, fontFamily: font.mono, fontSize: 11,
          color: msg.startsWith('Erreur') ? colors.ember2 : colors.growth,
        }}>
          {msg}
        </Text>
      ) : null}
    </View>
  )
}

function GrantHistory({ userId }: { userId: string }) {
  const grants = useAsync(() => getGrants(userId), [userId])
  const list = grants.data ?? []

  return (
    <View>
      <CLabel>HISTORIQUE</CLabel>
      <Etat state={grants} />
      {list.length === 0 && !grants.loading ? (
        <Text style={{ fontFamily: font.mono, fontSize: 10, color: colors.text3 }}>Aucun historique</Text>
      ) : null}
      {list.map((g) => (
        <View key={g.id} style={{ paddingVertical: 4 }}>
          <Text style={{
            fontFamily: font.mono, fontSize: 10.5,
            color: g.revoked_at ? colors.text3 : colors.text2,
            textDecorationLine: g.revoked_at ? 'line-through' : 'none',
          }}>
            {fmtDateTime(g.granted_at)}
          </Text>
          <Text style={{
            fontFamily: font.mono, fontSize: 9,
            color: g.revoked_at ? colors.text3 : colors.ember,
          }}>
            {g.expires_at ? `exp. ${fmtDate(g.expires_at)}` : 'permanent'}
            {g.note ? ` · ${g.note}` : ''}
            {g.revoked_at ? ` · révoqué ${fmtDate(g.revoked_at)}` : ''}
          </Text>
          <Text style={{ fontFamily: font.mono, fontSize: 9, color: colors.text3 }}>
            par {g.granted_by_email}
          </Text>
        </View>
      ))}
    </View>
  )
}

function UserActivity({ userId }: { userId: string }) {
  const activity = useAsync(() => getUserActivity(userId, 20), [userId])
  const list = activity.data ?? []

  return (
    <View>
      <CLabel>ACTIVITÉ RÉCENTE</CLabel>
      <Etat state={activity} />
      {list.length === 0 && !activity.loading ? (
        <Text style={{ fontFamily: font.mono, fontSize: 10, color: colors.text3 }}>
          Aucune activité enregistrée
        </Text>
      ) : null}
      {list.map((ev) => <EventLine key={ev.event_id} ev={ev} />)}
    </View>
  )
}

/**
 * Bascule immédiate en session assistée depuis la fiche : ouvre la session d'assistance
 * côté serveur (motif + consentement journalisés) puis passe l'app sur le compte visé.
 *
 * Le web ouvre une FENÊTRE isolée ; le mobile n'en a pas, il bascule la session courante
 * et la restaure en quittant (cf. `assistedSession.ts`).
 */
function AssistButton({ user }: { user: AdminUser }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const label = user.name ?? user.email

  function confirmThenStart() {
    Alert.alert(
      `Assister ${label} ?`,
      'En continuant, tu attestes que cette personne est présente et t’a donné son accord ' +
      'oral. Vorcelab journalise ton attestation, sans pouvoir la vérifier. Ta session admin ' +
      'est conservée et restaurée en quittant.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Assister',
          onPress: () => {
            setBusy(true); setMsg('')
            void (async () => {
              try {
                const supportSession = await startSupportSession({
                  targetUserId: user.id,
                  reason: 'Assistance demandée par l’utilisateur, présent pendant l’intervention',
                  consentMode: 'verbal',
                  userPresent: true,
                })
                await startAssistedSession(supportSession.id, label)
                setMsg(`Session réelle ouverte pour ${label}.`)
              } catch (err) {
                setMsg(`Erreur : ${err instanceof Error ? err.message : 'ouverture impossible.'}`)
              } finally {
                setBusy(false)
              }
            })()
          },
        },
      ],
    )
  }

  return (
    <View>
      <HButton
        label={busy ? 'OUVERTURE…' : 'ASSISTER CE COMPTE'}
        disabled={busy}
        onPress={confirmThenStart}
        style={{ borderColor: colors.violet }}
        textStyle={{ color: colors.violet }}
      />
      {msg ? <View style={{ marginTop: 8 }}><Message text={msg} /></View> : null}
    </View>
  )
}

function UserRow({ user, onChanged }: { user: AdminUser; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showActivity, setShowActivity] = useState(false)

  return (
    <Card>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
      >
        <Avatar user={user} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontFamily: font.bodySemiBold, fontSize: 13, color: colors.text }} numberOfLines={1}>
              {user.name ?? '—'}
            </Text>
            {user.is_admin ? (
              <View style={{ paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: colors.surf3 }}>
                <Text style={{ fontFamily: font.mono, fontSize: 8, letterSpacing: 0.7, color: colors.text3 }}>
                  ADMIN
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={{ fontFamily: font.mono, fontSize: 10, color: colors.text3 }} numberOfLines={1}>
            {user.email}
          </Text>
        </View>
        <Text style={{ fontFamily: font.mono, fontSize: 14, color: colors.text3 }}>
          {expanded ? '−' : '›'}
        </Text>
      </Pressable>

      <View style={{ marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
        <TierBadge tier={user.plan_tier} expires={user.plan_expires_at} />
        <View>
          <Text style={{ fontFamily: font.mono, fontSize: 9, color: colors.text3, textAlign: 'right' }}>
            Inscrit {fmtDate(user.joined_at)}
          </Text>
          <Text style={{ fontFamily: font.mono, fontSize: 9, color: colors.text3, textAlign: 'right' }}>
            Vu {fmtDateTime(user.last_seen)}
          </Text>
        </View>
      </View>

      {expanded ? (
        <View style={{ marginTop: 12, gap: 12 }}>
          <UserActions user={user} onDone={onChanged} />
          {!user.is_admin ? <AssistButton user={user} /> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
            <Pressable onPress={() => setShowHistory((v) => !v)} accessibilityRole="button">
              <Text style={{ fontFamily: font.mono, fontSize: 10, color: colors.text3 }}>
                {showHistory ? '▴ Masquer grants' : '▾ Voir grants'}
              </Text>
            </Pressable>
            <Pressable onPress={() => setShowActivity((v) => !v)} accessibilityRole="button">
              <Text style={{ fontFamily: font.mono, fontSize: 10, color: colors.text3 }}>
                {showActivity ? '▴ Masquer activité' : '▾ Voir activité'}
              </Text>
            </Pressable>
          </View>
          {showHistory ? <GrantHistory userId={user.id} /> : null}
          {showActivity ? <UserActivity userId={user.id} /> : null}
        </View>
      ) : null}
    </Card>
  )
}

export default function AdminUsersTab({ users, onChanged }: { users: AdminUser[]; onChanged: () => void }) {
  const [search, setSearch] = useState('')
  const [quickMsg, setQuickMsg] = useState('')
  const [quickBusy, setQuickBusy] = useState('')
  const feed = useAsync(() => getActivityFeed(60), [])

  const athletes = useMemo(() => users.filter((u) => !u.is_admin), [users])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) =>
      u.email.toLowerCase().includes(q) || (u.name ?? '').toLowerCase().includes(q))
  }, [users, search])

  async function quickGrant(user: AdminUser) {
    setQuickBusy(user.id); setQuickMsg('')
    try {
      await grantPro(user.id, 1, 'test')
      setQuickMsg(`✓ ${user.name ?? user.email} : +1 mois de test`)
      onChanged()
    } catch (err) {
      setQuickMsg(`Erreur : ${err instanceof Error ? err.message : 'inconnue'}`)
    } finally {
      setQuickBusy('')
    }
  }

  const feedList = feed.data ?? []

  return (
    <View style={{ gap: 14 }}>
      <Card>
        <CLabel>ACCÈS RAPIDE — TEST GLOBAL</CLabel>
        <Hint>Un appui accorde 1 mois de PRO avec la note « test ».</Hint>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {athletes.map((u) => (
            <HButton
              key={u.id}
              label={`${u.name ?? u.email.split('@')[0]} +1m`}
              disabled={quickBusy === u.id}
              onPress={() => void quickGrant(u)}
            />
          ))}
        </View>
        {quickMsg ? <View style={{ marginTop: 9 }}><Message text={quickMsg} /></View> : null}
      </Card>

      <Card>
        <CLabel>ACTIVITÉ RÉCENTE — TOUS LES USERS</CLabel>
        <Etat state={feed} />
        {feedList.length === 0 && !feed.loading ? (
          <Text style={{ fontFamily: font.mono, fontSize: 10, color: colors.text3 }}>
            Aucun événement pour l’instant
          </Text>
        ) : null}
        {feedList.slice(0, 12).map((ev) => <EventLine key={ev.event_id} ev={ev} showUser />)}
        {feedList.length > 12 ? (
          <View style={{ marginTop: 8 }}>
            <Collapsible
              header={
                <Text style={{ fontFamily: font.mono, fontSize: 10, color: colors.text3 }}>
                  {feedList.length - 12} événement{feedList.length - 12 > 1 ? 's' : ''} plus ancien{feedList.length - 12 > 1 ? 's' : ''}
                </Text>
              }
            >
              {feedList.slice(12).map((ev) => <EventLine key={ev.event_id} ev={ev} showUser />)}
            </Collapsible>
          </View>
        ) : null}
      </Card>

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Rechercher par email ou nom…"
        placeholderTextColor={colors.text3}
        autoCapitalize="none"
        style={{
          backgroundColor: colors.surf2, borderWidth: 1, borderColor: colors.line,
          borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10,
          color: colors.text, fontFamily: font.mono, fontSize: 12,
        }}
      />

      {filtered.length === 0 ? (
        <Text style={{
          fontFamily: font.mono, fontSize: 12, color: colors.text3,
          textAlign: 'center', paddingVertical: 24,
        }}>
          Aucun résultat
        </Text>
      ) : (
        filtered.map((u) => <UserRow key={u.id} user={u} onChanged={onChanged} />)
      )}
    </View>
  )
}
