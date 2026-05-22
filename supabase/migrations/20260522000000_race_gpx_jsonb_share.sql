-- gpx_data TEXT → JSONB (les lignes existantes sont toutes NULL)
alter table race_calendar
  alter column gpx_data type jsonb
  using case
    when gpx_data is null then null
    when gpx_data ~ '^\s*\[' or gpx_data ~ '^\s*\{' then gpx_data::jsonb
    else null
  end;

-- Colonne share_token pour les liens publics
alter table race_calendar
  add column if not exists share_token text;

create unique index if not exists race_calendar_share_token_idx
  on race_calendar (share_token)
  where share_token is not null;

-- Lecture publique via share_token (anon + authenticated)
create policy "rc_select_public_share"
  on race_calendar
  for select
  using (share_token is not null);
