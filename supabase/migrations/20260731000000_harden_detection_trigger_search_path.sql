-- Hygiène : figer le `search_path` du garde-fou de détection de courses.
--
-- L'advisor Supabase remonte `function_search_path_mutable` sur
-- `public.strava_activities_reject_detection_writes`.
--
-- Portée réelle : NON exploitable en l'état. La fonction ne référence AUCUNE table ni
-- fonction non qualifiée — elle ne lit que `current_user`, `tg_op` et `new`/`old`, tous
-- résolus par le moteur SQL sans passer par le `search_path`. Il n'y a donc rien à
-- masquer par un schéma injecté.
--
-- Elle est corrigée quand même, pour deux raisons : c'est un déclencheur de SÉCURITÉ
-- (il empêche un client d'écrire lui-même les colonnes `race_detection_*`), et une
-- évolution future qui y ajouterait une lecture de table hériterait silencieusement du
-- défaut. Figer le chemin maintenant coûte une ligne et supprime la classe entière.
--
-- Aucun changement de comportement : même corps, même déclencheur, `SECURITY INVOKER`
-- (défaut) conservé — `current_user` doit continuer de refléter le rôle réel de
-- l'appelant, c'est le pivot du garde-fou.

alter function public.strava_activities_reject_detection_writes()
  set search_path = public, pg_temp;
