import { Image, Linking, Pressable, Text, View } from 'react-native'
import { stravaActivityUrl } from '../lib/stravaActivityUrl'

/** Orange officiel Strava — utilisé uniquement pour le lien retour, pas sur les assets. */
const STRAVA_ORANGE = '#FC4C02'

// Assets OFFICIELS Strava (packs « Connect with Strava Buttons » et « Strava API
// Logos »), servis tels quels. Les Brand Guidelines imposent l'asset fourni sur tout
// point d'entrée OAuth et interdisent de le modifier, le recolorer, l'animer ou de
// reconstruire un bouton maison aux couleurs de Strava.
const BTN_CONNECT = require('../../assets/images/strava/btn_strava_connect_with_orange@2x.png')
const LOGO_PWRD_WHITE = require('../../assets/images/strava/api_logo_pwrdBy_strava_horiz_white.png')
const LOGO_PWRD_ORANGE = require('../../assets/images/strava/api_logo_pwrdBy_strava_horiz_orange.png')

/** Ratio natif du bouton officiel (474 × 96) — proportions préservées à toute largeur. */
const BTN_ASPECT = 474 / 96

/**
 * Bouton officiel « Connect with Strava ».
 *
 * Le libellé n'est jamais surchargé : l'asset porte son propre texte. Le contexte
 * (autorisation supplémentaire, ouverture en cours) se met À CÔTÉ du bouton.
 */
export function ConnectWithStravaButton({
  onPress,
  disabled,
  accessibilityLabel = 'Se connecter avec Strava',
}: {
  onPress: () => void
  disabled?: boolean
  accessibilityLabel?: string
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{ width: '100%', aspectRatio: BTN_ASPECT, opacity: disabled ? 0.68 : 1 }}
    >
      <Image
        source={BTN_CONNECT}
        resizeMode="contain"
        style={{ width: '100%', height: '100%' }}
        accessibilityIgnoresInvertColors
      />
    </Pressable>
  )
}

/** Ratio natif du logo d'attribution (365 × 37). */
const LOGO_ASPECT = 365 / 37

/**
 * Attribution « Powered by Strava », logo officiel.
 *
 * Borné en largeur : les guidelines exigent qu'il reste distinct de l'identité de
 * l'application et jamais plus proéminent qu'elle.
 */
export function PoweredByStrava({ variant = 'white' }: { variant?: 'white' | 'orange' }) {
  return (
    <View style={{ alignItems: 'center', marginTop: 8 }}>
      <Image
        source={variant === 'orange' ? LOGO_PWRD_ORANGE : LOGO_PWRD_WHITE}
        resizeMode="contain"
        style={{ width: 88, aspectRatio: LOGO_ASPECT }}
        accessibilityLabel="Powered by Strava"
        accessibilityIgnoresInvertColors
      />
    </View>
  )
}

/**
 * Lien profond « Voir sur Strava » vers l'activité d'origine.
 *
 * Les Brand Guidelines exigent que toute donnée d'activité affichée hors de Strava
 * renvoie vers l'activité correspondante sur Strava. C'est aussi la définition d'une
 * expérience *complémentaire* : Vorcelab analyse, Strava reste le lieu de la sortie.
 *
 * L'identifiant n'est jamais converti en `number` — au-delà de 2^53 la conversion
 * perdrait des chiffres et pointerait vers l'activité d'un autre athlète.
 */
export function ViewOnStrava({
  stravaActivityId,
}: {
  stravaActivityId: number | string | null | undefined
}) {
  const href = stravaActivityUrl(stravaActivityId)
  if (!href) return null

  return (
    <Pressable
      onPress={() => { void Linking.openURL(href) }}
      accessibilityRole="link"
      accessibilityLabel="Voir cette activité sur Strava"
      style={{
        alignSelf: 'flex-start',
        paddingVertical: 5,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(252,76,2,0.45)',
        backgroundColor: 'rgba(252,76,2,0.12)',
      }}
    >
      <Text style={{ color: STRAVA_ORANGE, fontSize: 11, letterSpacing: 0.4 }}>
        Voir sur Strava ↗
      </Text>
    </Pressable>
  )
}
