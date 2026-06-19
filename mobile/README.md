# Vorcelab — app mobile (Expo / React Native)

App **native** iOS (puis Android) pour les coureurs trail/running. Même backend
Supabase que le web (mêmes données), UI native.

- **Stack** : Expo SDK 56, React Native, expo-router, TypeScript, Supabase JS.
- **Backend** : projet Supabase prod `runnerdata` par défaut (surchargeable par
  `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` pour viser le dev).

## Voir l'app sur ton iPhone (sans Mac)

1. Installe **Expo Go** depuis l'App Store.
2. Sur une machine avec Node : `cd mobile && npm install && npx expo start`.
3. Scanne le QR code avec l'appareil photo → l'app s'ouvre dans Expo Go.

## Structure

```
src/
  app/            écrans (expo-router) : _layout (auth gate), login, index (dashboard)
  components/     UI partagée (Logo…)
  lib/            supabase, auth (session), theme (tokens --vl-*), format
```

## Statut

Première brique : **login + Dashboard connecté** (km du mois, D+, dernières
sorties). À suivre : Activités, Coach, Course, renfo, cartes.

## Note dev

Aperçu rapide sans téléphone : `npx expo start --web` (rendu react-native-web).
Pour publier sur l'App Store : build cloud **EAS** (`eas build -p ios`) + compte
Apple Developer — aucun Mac requis.
