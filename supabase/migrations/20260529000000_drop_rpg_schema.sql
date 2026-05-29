-- Retire le schéma `rpg` du projet Supabase de Vorcelab.
--
-- Ce schéma appartenait à une autre application (jeu de rôle textuel) qui
-- partageait par erreur ce projet. Toutes ses tables étaient vides (0 ligne)
-- au moment du retrait — aucune donnée Vorcelab concernée.
--
-- La définition complète est sauvegardée dans
-- `supabase/_archive/rpg-schema-backup.sql` pour relancer ce jeu dans son
-- propre projet Supabase si besoin.
--
-- Principe : 1 projet Supabase = 1 application.

drop schema if exists rpg cascade;
