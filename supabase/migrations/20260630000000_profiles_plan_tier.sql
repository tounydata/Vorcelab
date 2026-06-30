-- Niveau d'abonnement : 'free' (défaut) ou 'pro'.
-- Aucune politique RLS supplémentaire : lecture couverte par la politique existante
-- (select own row), mise à jour réservée à un futur webhook de paiement (pas de client update).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan_tier TEXT NOT NULL DEFAULT 'free'
    CHECK (plan_tier IN ('free', 'pro'));
