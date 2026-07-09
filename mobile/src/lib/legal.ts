// Liens légaux & support — exigés pour la publication App Store / Play Store.
// Les pages sont hébergées avec l'app web (domaine custom vorcelab.app) et
// servies statiquement (voir scripts/pages-postbuild.mjs).
import { Linking } from 'react-native'

export const LEGAL = {
  privacy: 'https://vorcelab.app/legal/confidentialite',
  terms: 'https://vorcelab.app/legal/cgu',
  supportEmail: 'hello@vorcelab.com',
} as const

/** Ouvre une URL légale dans le navigateur système. */
export function openLegal(url: string): void {
  Linking.openURL(url).catch(() => {})
}

/** Ouvre le client mail pré-rempli vers le support. */
export function openSupport(subject = 'Support Vorcelab'): void {
  Linking.openURL(`mailto:${LEGAL.supportEmail}?subject=${encodeURIComponent(subject)}`).catch(() => {})
}
