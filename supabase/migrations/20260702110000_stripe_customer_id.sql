-- Identifiant client Stripe — écrit par le webhook au premier checkout.
-- Permet de retrouver l'utilisateur sur les événements de renouvellement
-- (invoice.paid n'a pas de client_reference_id, seulement le customer).
-- Server-only : aucune politique RLS ne l'expose en écriture au client.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_stripe_customer_id_idx
  ON public.profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
