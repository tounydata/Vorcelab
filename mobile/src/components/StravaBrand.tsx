import { Image, Pressable, View } from 'react-native'

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
