// Drapeaux des connexions sociales optionnelles.
// Apple est CÂBLÉ mais désactivé par défaut : on l'activera à la publication sur
// l'App Store (Apple impose « Sign in with Apple » dès qu'il y a d'autres logins
// sociaux dans une app iOS). Passer VITE_APPLE_ENABLED=true pour l'afficher, une
// fois le provider Apple configuré dans Supabase → Auth → Providers.
export const APPLE_ENABLED = (import.meta.env.VITE_APPLE_ENABLED as string | undefined) === 'true'
