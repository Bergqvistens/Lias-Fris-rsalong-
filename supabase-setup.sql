-- =====================================================================
-- Lias Hantverkeri – bokningssystem för Supabase
-- Klistra in HELA filen i Supabase → SQL Editor → tryck "Run".
-- Det går bra att köra den igen; den skapar bara det som saknas.
-- =====================================================================

-- ---------- 1. Tjänster (pris och längd bestäms här, inte i webbsidan) ----------
-- category: Lias kategorier (Klippning, Färgbehandling, Permanent, Styling, tvätt & föning, Hårbottenmassage, Frans och/eller brynfärg).
-- kind: 'klipp' = huvudtjänst (exakt en per person), 'tillagg' = valfritt tillägg (används inte just nu).
-- Priserna är Lias "från"-priser (från hennes bokningssida 28–29 okt 2026).
create table if not exists public.services (
  id        text primary key,
  name      text    not null,
  duration  integer not null check (duration > 0),   -- minuter
  price     integer not null check (price >= 0)      -- kronor
);
alter table public.services add column if not exists category text;
alter table public.services add column if not exists kind     text;

insert into public.services (id, name, duration, price, category, kind) values
  ('klipp-45', 'Klippning 45 min.', 45, 600, 'Klippning', 'klipp'),
  ('klipp-lyx', 'Klippning lyx', 60, 850, 'Klippning', 'klipp'),
  ('klipp-30', 'Klippning/Herrklippning 30 min', 30, 500, 'Klippning', 'klipp'),
  ('putsning', 'Putsning, kort hår med maskinklippn. sidor & nacke.', 15, 250, 'Klippning', 'klipp'),
  ('farg-botten', 'Bottenfärg/utväxt', 90, 1000, 'Färgbehandling', 'klipp'),
  ('farg-150', 'Färgbehandling 2.5 timmar Klippning ingår.', 150, 2000, 'Färgbehandling', 'klipp'),
  ('farg-180', 'Färgbehandling 3 timmar, klippning ingår.', 180, 2500, 'Färgbehandling', 'klipp'),
  ('klipp-farg-kort', 'Klipp & färg, kort hår. Som längst till nyckelbenen.', 135, 1350, 'Färgbehandling', 'klipp'),
  ('nyansering', 'Nyansering', 60, 1100, 'Färgbehandling', 'klipp'),
  ('perm-kort', 'Permanent inkl. klippning kort hår.', 120, 1650, 'Permanent', 'klipp'),
  ('perm-mellan', 'Permanent inkl. klippning mellanlångt hår.', 150, 1900, 'Permanent', 'klipp'),
  ('perm-lang', 'Permanent inkl. klippning långt hår.', 180, 3000, 'Permanent', 'klipp'),
  ('tvatt-fon', 'Tvätt & fön', 30, 400, 'Styling, tvätt & föning', 'klipp'),
  ('tvatt-fon-60', 'Tvätt & fön/ styling 1 timma', 60, 800, 'Styling, tvätt & föning', 'klipp'),
  ('harbotten', 'Hårbottenmassage', 45, 750, 'Hårbottenmassage', 'klipp'),
  ('bryn', 'Färg och form av bryn.', 30, 200, 'Frans och/eller brynfärg', 'klipp'),
  ('frans-bryn', 'Ögonfransfärgning & brynfärg + formning', 30, 250, 'Frans och/eller brynfärg', 'klipp')
on conflict (id) do update
  set name = excluded.name, duration = excluded.duration, price = excluded.price,
      category = excluded.category, kind = excluded.kind;
delete from public.services where id not in ('klipp-45', 'klipp-lyx', 'klipp-30', 'putsning', 'farg-botten', 'farg-150', 'farg-180', 'klipp-farg-kort', 'nyansering', 'perm-kort', 'perm-mellan', 'perm-lang', 'tvatt-fon', 'tvatt-fon-60', 'harbotten', 'bryn', 'frans-bryn');

-- ---------- 2. Bokningar ----------
create table if not exists public.bookings (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  service_ids    text[]      not null,
  service_names  text        not null,
  price          integer     not null,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  customer_name  text        not null,
  customer_phone text        not null,
  customer_email text        not null,
  status         text        not null default 'bokad' check (status in ('bokad', 'avbokad')),
  constraint tid_i_ordning check (ends_at > starts_at),
  -- Krockspärr: två aktiva bokningar kan aldrig överlappa, inte ens om två kunder bokar samtidigt.
  constraint ingen_krock exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&)
    where (status = 'bokad')
);

-- Flera personer i samma bokning: en rad per person, efter varandra, med samma group_id.
alter table public.bookings add column if not exists person_name text;   -- förnamn när flera personer bokas
alter table public.bookings add column if not exists group_id    uuid;
-- Lias meddelande till kunden vid avbokning (valfritt, 30 okt 2026). Skickas med i avbokningssms:et när sms-tjänsten kopplas in.
alter table public.bookings add column if not exists cancel_note text;
alter table public.bookings drop constraint if exists cancel_note_langd;
alter table public.bookings add constraint cancel_note_langd check (cancel_note is null or char_length(cancel_note) <= 160);
-- När Lia avbokade (30 okt 2026). Sätts av databasen själv (serverns klocka) och går inte att ändra i efterhand.
alter table public.bookings add column if not exists cancelled_at timestamptz;
-- Vilken version av avbokningsreglerna kunden godkände vid bokningen (tidpunkt = created_at), 1 nov 2026
alter table public.bookings add column if not exists rules_version text;
-- Kundens länk i sms:et (1 nov 2026): samma token för hela bokningen (alla personer). Kunden bekräftar, avbokar eller bokar om med den.
alter table public.bookings add column if not exists confirm_token uuid;
alter table public.bookings add column if not exists confirmed_at  timestamptz;
-- Vem avbokade: 'lia' (adminläget) eller 'kund' (själv via länken). ombokad_till = kundens nya starttid vid ombokning.
alter table public.bookings add column if not exists cancelled_by  text;
alter table public.bookings add column if not exists ombokad_till  timestamptz;
alter table public.bookings drop constraint if exists cancelled_by_varde;
alter table public.bookings add constraint cancelled_by_varde check (cancelled_by is null or cancelled_by in ('lia', 'kund'));
create index if not exists bookings_confirm_token on public.bookings (confirm_token);
create or replace function public.satt_avbokad_tid() returns trigger
language plpgsql as $$
begin
  if old.status = 'avbokad' then
    -- redan avbokad: tid och meddelande låses (bevis om en kund ifrågasätter)
    new.cancelled_at := old.cancelled_at;
    new.cancel_note  := old.cancel_note;
    new.cancelled_by := old.cancelled_by;
    new.ombokad_till := old.ombokad_till;
  elsif new.status = 'avbokad' then
    new.cancelled_at := now();
    new.cancelled_by := coalesce(new.cancelled_by, 'lia');   -- adminläget sätter inget = Lia
  else
    new.cancelled_at := null;
    new.cancelled_by := null;
    new.ombokad_till := null;
  end if;
  return new;
end $$;
drop trigger if exists avbokad_tid on public.bookings;
create trigger avbokad_tid before update on public.bookings
  for each row execute function public.satt_avbokad_tid();


-- ---------- 3. Vilka konton som är admin (Lia) ----------
create table if not exists public.admins (
  user_id uuid primary key
);

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------- 4. Behörigheter (Row Level Security) ----------
alter table public.services enable row level security;
alter table public.bookings enable row level security;
alter table public.admins   enable row level security;

revoke all on public.services from anon, authenticated;
revoke all on public.bookings from anon, authenticated;
revoke all on public.admins   from anon, authenticated;

-- Alla får läsa tjänstelistan.
grant select on public.services to anon, authenticated;
drop policy if exists "alla_laser_tjanster" on public.services;
create policy "alla_laser_tjanster" on public.services for select using (true);

-- Bara admin får läsa bokningar (namn, telefon, e-post) och ändra status.
grant select, update (status, cancel_note) on public.bookings to authenticated;
drop policy if exists "admin_laser_bokningar" on public.bookings;
create policy "admin_laser_bokningar" on public.bookings
  for select to authenticated using (public.is_admin());
drop policy if exists "admin_avbokar" on public.bookings;
create policy "admin_avbokar" on public.bookings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- 5. Upptagna tider (utan personuppgifter) ----------
create or replace function public.get_busy(p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer
set search_path = public
as $$
  select b.starts_at, b.ends_at
  from public.bookings b
  where b.status = 'bokad'
    and b.starts_at < p_to
    and b.ends_at   > p_from
    and p_to - p_from <= interval '62 days'
  order by b.starts_at;
$$;

-- ---------- Spärrade kunder (Lia 1 nov 2026) ----------
-- Lia kan spärra en kund (telefonnummer) som 3 gånger eller fler de senaste 12 månaderna kommit sent, avbokat/ombokat
-- för sent eller inte kommit. Spärrad kund kan inte boka frisörtider (och kurser när de finns i databasen) på nätet
-- förrän Lia häver spärren. Funktionerna sparra_kund/hav_sparr finns längre ner (efter tabellen uteblivna).
create table if not exists public.sparrade (
  customer_phone text primary key,
  customer_name  text not null,
  sparrad_at     timestamptz not null default now()
);
alter table public.sparrade enable row level security;
revoke all on public.sparrade from anon, authenticated;
grant select on public.sparrade to authenticated;
drop policy if exists "admin_laser_sparrade" on public.sparrade;
create policy "admin_laser_sparrade" on public.sparrade for select to authenticated using (public.is_admin());

-- ---------- 6. Skapa bokning (all kontroll sker här, på servern) ----------
-- p_people: lista med 1–4 personer, t.ex.
--   [{"category":"Klippning","service_ids":["klipp-45"],"name":"Kalle"},
--    {"category":"Frans och/eller brynfärg","service_ids":["bryn"],"name":"Lisa"}]
-- Varje person: exakt en huvudtjänst (kind = klipp) + ev. tillägg i samma kategori.
-- Förnamn krävs för varje person när fler än en bokas.
-- Personerna klipps efter varandra (en frisör): person 2 börjar när person 1 är klar osv.
-- Allt eller inget: krockar någon del sparas ingenting.
drop function if exists public.create_booking(text[], timestamptz, text, text, text);
drop function if exists public.create_booking(jsonb, timestamptz, text, text, text);   -- ersatt 1 nov 2026 (kräver godkända avbokningsregler)

create or replace function public.create_booking(
  p_people    jsonb,
  p_starts_at timestamptz,
  p_name      text,
  p_phone     text,
  p_email     text,
  p_rules     text default null   -- version av avbokningsreglerna som kunden godkände ('2026-11-01-v2')
)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_n         integer;
  v_person    jsonb;
  v_cat       text;
  v_pname     text;
  v_ids       text[];
  v_count     integer;
  v_cuts      integer;
  v_dur       integer;
  v_price     integer;
  v_names     text;
  v_cursor    timestamptz;
  v_end       timestamptz;
  v_total     integer := 0;
  v_total_dur integer := 0;
  v_group     uuid := gen_random_uuid();
  v_token     uuid := gen_random_uuid();   -- kundens länk i sms:et (en för hela bokningen)
  v_rows      jsonb := '[]'::jsonb;
  v_local     timestamp;
  v_local_end timestamp;
  v_dow       integer;
  v_open      time;
  v_close     time;
  v_id        uuid;
  v_all_names text := '';
  v_day_open  timestamptz;
  v_day_close timestamptz;
  v_prev      timestamptz;
  v_next      timestamptz;
begin
  -- Kontaktuppgifter
  p_name  := btrim(coalesce(p_name, ''));
  p_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  p_email := btrim(coalesce(p_email, ''));
  if length(p_name) < 2 or length(p_name) > 100 then raise exception 'OGILTIGT_NAMN'; end if;
  if p_phone !~ '^0[0-9]{9}$' then raise exception 'OGILTIGT_TELEFON'; end if;
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 200 then raise exception 'OGILTIG_EPOST'; end if;
  -- Spärrad från onlinebokning av Lia (1 nov 2026): måste prata med Lia först
  if exists (select 1 from public.sparrade where customer_phone = p_phone) then raise exception 'SPARRAD'; end if;
  -- Kunden måste ha godkänt gällande avbokningsregler (uteblivet besök kan debiteras), 1 nov 2026
  -- Gällande version: '2026-11-01-v2' (Tommys formulering, regeln först). Äldre bokningar behåller sin version.
  if p_rules is distinct from '2026-11-01-v2' then raise exception 'REGLER_EJ_GODKANDA'; end if;

  -- Personer
  if p_people is null or jsonb_typeof(p_people) <> 'array' then raise exception 'OGILTIGA_TJANSTER'; end if;
  v_n := jsonb_array_length(p_people);
  if v_n < 1 or v_n > 4 then raise exception 'OGILTIGT_ANTAL_PERSONER'; end if;

  -- Tid: framåt i tiden, inom 60 dagar, på kvarten
  if p_starts_at is null or p_starts_at < now() + interval '30 minutes' or p_starts_at > now() + interval '60 days' then
    raise exception 'OGILTIG_TID';
  end if;
  if extract(second from p_starts_at) <> 0 or extract(minute from p_starts_at)::int % 15 <> 0 then
    raise exception 'OGILTIG_TID';
  end if;

  -- Första genomgången: kontrollera varje person och räkna ut kedjan
  v_cursor := p_starts_at;
  for v_person in select value from jsonb_array_elements(p_people) loop
    v_cat   := v_person->>'category';
    v_pname := btrim(coalesce(v_person->>'name', ''));
    if v_cat is null or not exists (select 1 from public.services where category = v_cat) or jsonb_typeof(v_person->'service_ids') <> 'array' then
      raise exception 'OGILTIGA_TJANSTER';
    end if;
    select array_agg(distinct x) into v_ids from jsonb_array_elements_text(v_person->'service_ids') x;
    if v_ids is null or cardinality(v_ids) = 0 or cardinality(v_ids) > 5 then raise exception 'OGILTIGA_TJANSTER'; end if;
    select count(*), count(*) filter (where kind = 'klipp'), sum(duration), sum(price)
      into v_count, v_cuts, v_dur, v_price
      from public.services where id = any(v_ids) and category = v_cat;
    if v_count <> cardinality(v_ids) then raise exception 'OGILTIGA_TJANSTER'; end if;
    if v_cuts <> 1 then raise exception 'EN_KLIPPNING_PER_PERSON'; end if;
    if v_n > 1 and (length(v_pname) < 2 or length(v_pname) > 50) then raise exception 'OGILTIGT_PERSONNAMN'; end if;
    v_cursor := v_cursor + make_interval(mins => v_dur);
  end loop;
  v_end := v_cursor;

  -- Öppettider (svensk tid) för hela kedjan.
  v_local     := p_starts_at at time zone 'Europe/Stockholm';
  v_local_end := v_end       at time zone 'Europe/Stockholm';
  v_dow := extract(isodow from v_local);   -- 1 = måndag … 7 = söndag
  -- Tisdag–fredag 9–17. Måndag, lördag (öppet vid förfrågan) och söndag: ingen onlinebokning.
  v_open  := case when v_dow between 2 and 5 then time '09:00' else null end;
  v_close := case when v_dow between 2 and 5 then time '17:00' else null end;
  if v_open is null or v_local::time < v_open or v_local_end::date <> v_local::date or v_local_end::time > v_close then
    raise exception 'UTANFOR_OPPETTID';
  end if;

  -- Bokningar sparas en i taget (låset släpps när anropet är klart). Då kan två samtidiga
  -- bokningar aldrig låsa varandra; den som kommer sist får TIDEN_UPPTAGEN.
  perform pg_advisory_xact_lock(hashtext('lias_bokning'));

  -- Inga korta luckor i Lias schema (Lia 31 okt 2026): luckan före och efter måste vara 0 minuter
  -- (direkt i följd) eller minst 45 minuter. Tid före nu + 30 min räknas inte som lucka (kan ändå inte bokas).
  v_day_open  := (v_local::date + v_open)  at time zone 'Europe/Stockholm';
  v_day_close := (v_local::date + v_close) at time zone 'Europe/Stockholm';
  select greatest(v_day_open, coalesce(max(ends_at), v_day_open)) into v_prev
    from public.bookings where status = 'bokad' and ends_at <= p_starts_at and ends_at > v_day_open;
  select least(v_day_close, coalesce(min(starts_at), v_day_close)) into v_next
    from public.bookings where status = 'bokad' and starts_at >= v_end and starts_at < v_day_close;
  if v_prev >= now() + interval '30 minutes' and p_starts_at > v_prev and p_starts_at - v_prev < interval '45 minutes' then
    raise exception 'KORT_LUCKA';
  end if;
  if v_next > v_end and v_next - v_end < interval '45 minutes' then
    raise exception 'KORT_LUCKA';
  end if;

  -- Andra genomgången: spara en rad per person. Krockspärren stoppar dubbelbokning;
  -- ett fel avbryter hela anropet, så inga halva grupper sparas.
  v_cursor := p_starts_at;
  for v_person in select value from jsonb_array_elements(p_people) loop
    v_cat   := v_person->>'category';
    v_pname := nullif(btrim(coalesce(v_person->>'name', '')), '');
    if v_n = 1 then v_pname := null; end if;
    select array_agg(distinct x) into v_ids from jsonb_array_elements_text(v_person->'service_ids') x;
    select sum(duration), sum(price), string_agg(name, ', ' order by (kind <> 'klipp'), name)
      into v_dur, v_price, v_names
      from public.services where id = any(v_ids) and category = v_cat;
    begin
      insert into public.bookings
        (service_ids, service_names, price, starts_at, ends_at, customer_name, customer_phone, customer_email, person_name, group_id, rules_version, confirm_token)
      values
        (v_ids, v_names, v_price, v_cursor, v_cursor + make_interval(mins => v_dur), p_name, p_phone, p_email, v_pname, v_group, p_rules, v_token)
      returning id into v_id;
    exception when exclusion_violation then
      raise exception 'TIDEN_UPPTAGEN';
    end;
    v_rows := v_rows || jsonb_build_object('id', v_id, 'person_name', v_pname, 'service_names', v_names, 'price', v_price,
      'starts_at', v_cursor, 'ends_at', v_cursor + make_interval(mins => v_dur));
    v_all_names := v_all_names || case when v_all_names = '' then '' else '; ' end || coalesce(v_pname || ': ', '') || v_names;
    v_total := v_total + v_price;
    v_total_dur := v_total_dur + v_dur;
    v_cursor := v_cursor + make_interval(mins => v_dur);
  end loop;

  return json_build_object(
    'id', (v_rows->0->>'id')::uuid, 'group_id', v_group, 'starts_at', p_starts_at, 'ends_at', v_end,
    'service_names', v_all_names, 'price', v_total, 'duration', v_total_dur, 'items', v_rows);
end;
$$;

revoke all on function public.get_busy(timestamptz, timestamptz) from public;
revoke all on function public.create_booking(jsonb, timestamptz, text, text, text, text) from public;
revoke all on function public.is_admin() from public;
grant execute on function public.get_busy(timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.create_booking(jsonb, timestamptz, text, text, text, text) to anon, authenticated;
grant execute on function public.is_admin() to authenticated;

-- ---------- 7. Live-larm till admin-sidan ----------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bookings'
  ) then
    alter publication supabase_realtime add table public.bookings;
  end if;
end $$;

-- =====================================================================
-- KLART. Nästa steg (se checklistan):
-- 1. Skapa Lias användare under Authentication → Users → Add user.
-- 2. Kör raden nedan i SQL Editor, med Lias e-postadress, för att göra henne till admin:
--
--    insert into public.admins (user_id)
--    select id from auth.users where email = 'LIAS-EPOST@EXEMPEL.SE';
-- =====================================================================


-- ---------- Avbokningar sparas i 12 månader (Tommy 30 okt 2026) ----------
-- Raderar avbokade tider äldre än 12 månader (räknat från avbokningen; äldre utan avbokningstid: från den bokade tiden).
create or replace function public.rensa_gamla_avbokningar_kor() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.bookings
   where status = 'avbokad'
     and coalesce(cancelled_at, starts_at) < now() - interval '12 months';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.rensa_gamla_avbokningar_kor() from public, anon, authenticated;

-- Körs varje gång Lia öppnar admin (fungerar alltid), bara för admin.
create or replace function public.rensa_gamla_avbokningar() returns integer
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'EJ_ADMIN'; end if;
  return public.rensa_gamla_avbokningar_kor();
end $$;
revoke all on function public.rensa_gamla_avbokningar() from public, anon;
grant execute on function public.rensa_gamla_avbokningar() to authenticated;

-- Dessutom varje natt kl 03:17 om tillägget pg_cron finns (Supabase: Database → Extensions → pg_cron).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('rensa-avbokningar', '17 3 * * *', 'select public.rensa_gamla_avbokningar_kor()');
  else
    raise notice 'pg_cron finns inte: avbokningar rensas när Lia öppnar admin';
  end if;
exception when others then
  raise notice 'Kunde inte schemalägga rensningen (%). Avbokningar rensas ändå när Lia öppnar admin.', sqlerrm;
end $$;

-- ---------- Uteblivet besök och sen avbokning (Lia 1 nov 2026) ----------
-- Regeln: räknas per telefonnummer de senaste 12 månaderna. 1:a gången utan kostnad, 2:a och följande = hela
-- priset för den bokade behandlingen. "Kunden kom ändå" häver (räknas inte).
-- Ändrat 1 nov 2026 (Lia): räkningen börjar INTE om när kunden betalar. Allt de senaste 12 månaderna räknas,
-- även efterskänkta tillfällen (status 'efterskankt': ingen avgift den gången, men nästa gång blir det debitering).
-- En registrering gäller hela bokningen (alla personer i samma grupp).
alter table public.bookings add column if not exists arrived_at timestamptz;   -- Lia bekräftade att kunden kom

create table if not exists public.uteblivna (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  booking_id     uuid not null references public.bookings(id) on delete cascade,
  group_id       uuid,
  customer_name  text not null,
  customer_phone text not null,
  kind           text not null check (kind in ('uteblev', 'sen_avbokning')),
  nummer         integer not null check (nummer >= 1),
  belopp         integer not null check (belopp >= 0),
  status         text not null check (status in ('ingen_avgift', 'obetald', 'betald', 'havd')),
  andrad_at      timestamptz
);
alter table public.uteblivna drop constraint if exists uteblivna_status_check;
alter table public.uteblivna add constraint uteblivna_status_check check (status in ('ingen_avgift', 'obetald', 'betald', 'efterskankt', 'havd'));
create unique index if not exists uteblivna_en_per_bokning on public.uteblivna (coalesce(group_id, booking_id));
create index if not exists uteblivna_telefon on public.uteblivna (customer_phone, created_at);
alter table public.uteblivna enable row level security;
revoke all on public.uteblivna from anon, authenticated;
grant select on public.uteblivna to authenticated;
drop policy if exists "admin_laser_uteblivna" on public.uteblivna;
create policy "admin_laser_uteblivna" on public.uteblivna for select to authenticated using (public.is_admin());

-- Vilken gång i ordningen nästa registrering blir för ett telefonnummer
create or replace function public.uteblivet_nasta_nummer(p_phone text) returns integer
language sql stable security definer set search_path = public as $$
  select 1 + count(*)::integer from public.uteblivna u
   where u.customer_phone = p_phone
     and u.status in ('ingen_avgift', 'obetald', 'betald', 'efterskankt')   -- 'havd' = kunden kom ändå, räknas inte
     and u.created_at > now() - interval '12 months';
$$;
revoke all on function public.uteblivet_nasta_nummer(text) from public, anon, authenticated;

-- Själva registreringen (utan behörighetskontroll; bara databasen själv och funktionerna nedan får köra den)
create or replace function public.registrera_uteblivet_kor(p_booking uuid, p_kind text) returns json
language plpgsql security definer set search_path = public as $$
declare
  b       public.bookings%rowtype;
  v_hours integer;
  v_n     integer;
  v_sum   integer;
  v_start timestamptz;
  v_row   public.uteblivna%rowtype;
begin
  if p_kind not in ('uteblev', 'sen_avbokning', 'sen_ombokning', 'sen_ankomst') then raise exception 'OGILTIG_TYP'; end if;
  select * into b from public.bookings where id = p_booking;
  if not found then raise exception 'OGILTIG_BOKNING'; end if;
  -- Belopp och starttid räknas på de rader som gäller: aktiva rader (uteblev/sen ankomst), eller raderna som
  -- avbokades i samma ögonblick (sen avbokning/ombokning). En person som Lia avbokat tidigare räknas inte med (rättat 1 nov 2026).
  select min(starts_at), sum(price) into v_start, v_sum from public.bookings
   where ((b.group_id is not null and group_id = b.group_id) or id = b.id)
     and (case when p_kind in ('uteblev', 'sen_ankomst') then status = 'bokad'
               else status = 'avbokad' and cancelled_at = b.cancelled_at end);
  if p_kind = 'uteblev' then
    if b.status <> 'bokad' then raise exception 'OGILTIG_BOKNING'; end if;
    if v_start > now() then raise exception 'TIDEN_HAR_INTE_BORJAT'; end if;
    if b.arrived_at is not null then raise exception 'KUNDEN_HAR_KOMMIT'; end if;
  elsif p_kind = 'sen_ankomst' then
    -- Lia bedömer själv; tiden måste ha börjat för minst 5 minuter sedan (Lia 1 nov 2026)
    if b.status <> 'bokad' then raise exception 'OGILTIG_BOKNING'; end if;
    if v_start > now() - interval '5 minutes' then raise exception 'INTE_SEN_ANKOMST'; end if;
  else
    if b.status <> 'avbokad' or b.cancelled_at is null then raise exception 'OGILTIG_BOKNING'; end if;
    -- 48 timmar för färg och permanent, annars 24 (samma som appens avbokningsregler)
    select case when exists (select 1 from public.bookings x join public.services s on s.id = any(x.service_ids)
                              where ((b.group_id is not null and x.group_id = b.group_id) or x.id = b.id)
                                and x.status = 'avbokad' and x.cancelled_at = b.cancelled_at
                                and s.category in ('Färgbehandling', 'Permanent'))
                then 48 else 24 end into v_hours;
    if b.cancelled_at < v_start - make_interval(hours => v_hours) then raise exception 'INTE_SEN_AVBOKNING'; end if;
  end if;
  if exists (select 1 from public.uteblivna where coalesce(group_id, booking_id) = coalesce(b.group_id, b.id)) then
    raise exception 'REDAN_REGISTRERAD';
  end if;
  v_n := public.uteblivet_nasta_nummer(b.customer_phone);
  insert into public.uteblivna (booking_id, group_id, customer_name, customer_phone, kind, nummer, belopp, status)
  values (b.id, b.group_id, b.customer_name, b.customer_phone, p_kind, v_n,
          case when v_n = 1 then 0 else v_sum end, case when v_n = 1 then 'ingen_avgift' else 'obetald' end)
  returning * into v_row;
  return row_to_json(v_row);
end $$;

create or replace function public.registrera_uteblivet(p_booking uuid, p_kind text) returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'EJ_ADMIN'; end if;
  return public.registrera_uteblivet_kor(p_booking, p_kind);
end $$;
revoke all on function public.registrera_uteblivet_kor(uuid, text) from public, anon, authenticated;

-- Kunden kom (även för sent): bokningen markeras, och en registrering för den häves
create or replace function public.markera_kommit(p_booking uuid) returns json
language plpgsql security definer set search_path = public as $$
declare b public.bookings%rowtype;
begin
  if not public.is_admin() then raise exception 'EJ_ADMIN'; end if;
  select * into b from public.bookings where id = p_booking;
  if not found or b.status <> 'bokad' then raise exception 'OGILTIG_BOKNING'; end if;
  update public.bookings set arrived_at = coalesce(arrived_at, now())
   where (b.group_id is not null and group_id = b.group_id) or id = b.id;
  update public.uteblivna set status = 'havd', andrad_at = now()
   where coalesce(group_id, booking_id) = coalesce(b.group_id, b.id) and status in ('ingen_avgift', 'obetald');
  return json_build_object('arrived_at', (select arrived_at from public.bookings where id = p_booking));
end $$;

create or replace function public.uteblivet_andra(p_id uuid, p_status text) returns json
language plpgsql security definer set search_path = public as $$
declare v_row public.uteblivna%rowtype;
begin
  if not public.is_admin() then raise exception 'EJ_ADMIN'; end if;
  -- 'betald' = kunden har betalat, 'efterskankt' = Lia efterskänker (tillfället räknas ändå)
  if p_status not in ('betald', 'efterskankt') then raise exception 'OGILTIG_STATUS'; end if;
  update public.uteblivna set status = p_status, andrad_at = now()
   where id = p_id and status = case when p_status = 'betald' then 'obetald' else status end
     and status in ('ingen_avgift', 'obetald')
  returning * into v_row;
  if not found then raise exception 'OGILTIG_STATUS'; end if;
  return row_to_json(v_row);
end $$;

-- Hur många gånger ett nummer redan har (för Lias förhandsbesked i frågerutan)
create or replace function public.uteblivet_forhand(p_phone text) returns integer
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'EJ_ADMIN'; end if;
  return public.uteblivet_nasta_nummer(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'));
end $$;

revoke all on function public.registrera_uteblivet(uuid, text) from public, anon;
revoke all on function public.markera_kommit(uuid) from public, anon;
revoke all on function public.uteblivet_andra(uuid, text) from public, anon;
revoke all on function public.uteblivet_forhand(text) from public, anon;
grant execute on function public.registrera_uteblivet(uuid, text) to authenticated;
grant execute on function public.markera_kommit(uuid) to authenticated;
grant execute on function public.uteblivet_andra(uuid, text) to authenticated;
grant execute on function public.uteblivet_forhand(text) to authenticated;

-- Registreringar äldre än 12 månader raderas tillsammans med gamla avbokningar
create or replace function public.rensa_gamla_avbokningar_kor() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.uteblivna where created_at < now() - interval '12 months';
  delete from public.bookings
   where status = 'avbokad'
     and coalesce(cancelled_at, starts_at) < now() - interval '12 months';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.rensa_gamla_avbokningar_kor() from public, anon, authenticated;


-- Automatik (Lia 1 nov 2026): 15 minuter efter starttid registreras bokningar där Lia inte bekräftat att kunden kom
-- som uteblivna (och kunden får sms när sms-tjänsten är kopplad). Bara bokningar där kunden godkänt reglerna
-- (rules_version) och som började det senaste dygnet. En grupp räknas en gång.
create or replace function public.auto_uteblivna_kor() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  for r in
    select distinct on (coalesce(group_id, id)) id, coalesce(group_id, id) as k
      from public.bookings b
     where status = 'bokad' and arrived_at is null and rules_version is not null
     order by coalesce(group_id, id), starts_at
  loop
    if (select min(starts_at) from public.bookings where coalesce(group_id, id) = r.k) between now() - interval '24 hours' and now() - interval '15 minutes'
       and not exists (select 1 from public.uteblivna u where coalesce(u.group_id, u.booking_id) = r.k)
       and not exists (select 1 from public.bookings where coalesce(group_id, id) = r.k and arrived_at is not null) then
      perform public.registrera_uteblivet_kor(r.id, 'uteblev');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.auto_uteblivna_kor() from public, anon, authenticated;
create or replace function public.auto_uteblivna() returns integer
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'EJ_ADMIN'; end if;
  return public.auto_uteblivna_kor();
end $$;
revoke all on function public.auto_uteblivna() from public, anon;
grant execute on function public.auto_uteblivna() to authenticated;
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('auto-uteblivna', '*/5 * * * *', 'select public.auto_uteblivna_kor()');
  else
    raise notice 'pg_cron finns inte: uteblivna besök registreras när Lia har admin öppen';
  end if;
exception when others then
  raise notice 'Kunde inte schemalägga (%). Uteblivna besök registreras ändå när Lia har admin öppen.', sqlerrm;
end $$;


-- ---------- Varning eller debitering via knapp (Lia 1 nov 2026) ----------
-- Fler typer: sen ankomst (mer än 5 min, Lia avgör) och sen ombokning (kunden bokar om efter sista avbokningstid).
alter table public.uteblivna drop constraint if exists uteblivna_kind_check;
alter table public.uteblivna add constraint uteblivna_kind_check check (kind in ('uteblev', 'sen_avbokning', 'sen_ombokning', 'sen_ankomst'));
alter table public.uteblivna add column if not exists orsak text;                 -- det Lia valde i sms:et
alter table public.uteblivna add column if not exists skickat_at timestamptz;      -- när varning/debitering skickades
alter table public.uteblivna add column if not exists forfaller date;              -- sista betalningsdag (7 dagar)

-- Kunden kom: häver bara ett registrerat uteblivet besök (inte sen ankomst)
create or replace function public.markera_kommit(p_booking uuid) returns json
language plpgsql security definer set search_path = public as $$
declare b public.bookings%rowtype;
begin
  if not public.is_admin() then raise exception 'EJ_ADMIN'; end if;
  select * into b from public.bookings where id = p_booking;
  if not found or b.status <> 'bokad' then raise exception 'OGILTIG_BOKNING'; end if;
  update public.bookings set arrived_at = coalesce(arrived_at, now())
   where (b.group_id is not null and group_id = b.group_id) or id = b.id;
  update public.uteblivna set status = 'havd', andrad_at = now()
   where coalesce(group_id, booking_id) = coalesce(b.group_id, b.id) and kind = 'uteblev' and status in ('ingen_avgift', 'obetald');
  return json_build_object('arrived_at', (select arrived_at from public.bookings where id = p_booking));
end $$;

-- Lia trycker "Skicka": 1:a gången varning, annars debitering med 7 dagars betaltid. Kan skickas en gång.
-- p_utan_sms: Lia markerar en 1:a gång som hanterad utan att skicka varning (räknas fortfarande)
drop function if exists public.uteblivet_skicka(uuid, text);
create or replace function public.uteblivet_skicka(p_id uuid, p_orsak text, p_utan_sms boolean default false) returns json
language plpgsql security definer set search_path = public as $$
declare v_row public.uteblivna%rowtype;
begin
  if not public.is_admin() then raise exception 'EJ_ADMIN'; end if;
  if p_orsak not in ('sena ankomst', 'uteblivna bokning', 'sena avbokning', 'sena ombokning') then raise exception 'OGILTIG_ORSAK'; end if;
  select * into v_row from public.uteblivna where id = p_id;
  if not found or v_row.status not in ('ingen_avgift', 'obetald') then raise exception 'OGILTIG_STATUS'; end if;
  if v_row.skickat_at is not null then raise exception 'REDAN_SKICKAT'; end if;
  if p_utan_sms and v_row.status <> 'ingen_avgift' then raise exception 'OGILTIG_STATUS'; end if;
  update public.uteblivna
     set orsak = p_orsak, skickat_at = now(),
         forfaller = case when status = 'obetald' then (now() at time zone 'Europe/Stockholm')::date + 7 else null end
   where id = p_id
  returning * into v_row;
  return row_to_json(v_row);
end $$;
revoke all on function public.uteblivet_skicka(uuid, text, boolean) from public, anon;
grant execute on function public.uteblivet_skicka(uuid, text, boolean) to authenticated;

-- =====================================================================
-- Kundens länk i sms:et: bekräfta, avboka eller boka om (1 nov 2026)
-- Kunden når sin bokning bara med länkens token (slumpad uuid, en per bokning).
-- Sen avbokning/ombokning (senare än 24 tim, 48 tim för färg och permanent) registreras
-- automatiskt för Lia. Lia kan alltid efterskänka den i adminläget.
-- Kunden kan bara byta tid. Allt annat (tjänster, personer) tar kunden med Lia.
-- =====================================================================
create or replace function public.kund_token(p_token text) returns uuid
language plpgsql immutable as $$
begin
  if p_token is null or p_token !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'OGILTIG_LANK';
  end if;
  return p_token::uuid;
end $$;
revoke all on function public.kund_token(text) from public, anon, authenticated;

-- Avbokningsgräns i timmar för en bokning (aktiva rader): 48 för färg och permanent, annars 24
create or replace function public.kund_timmar(p_token uuid) returns integer
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from public.bookings x join public.services s on s.id = any(x.service_ids)
                            where x.confirm_token = p_token and x.status = 'bokad'
                              and s.category in ('Färgbehandling', 'Permanent'))
              then 48 else 24 end;
$$;
revoke all on function public.kund_timmar(uuid) from public, anon, authenticated;

-- Felkod när länken inte har några aktiva rader
create or replace function public.kund_kontroll(p_token uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.bookings where confirm_token = p_token) then raise exception 'OGILTIG_LANK'; end if;
  if not exists (select 1 from public.bookings where confirm_token = p_token and status = 'bokad') then
    if exists (select 1 from public.bookings where confirm_token = p_token and ombokad_till is not null) then raise exception 'BOKNING_OMBOKAD'; end if;
    raise exception 'BOKNING_AVBOKAD';
  end if;
end $$;
revoke all on function public.kund_kontroll(uuid) from public, anon, authenticated;

-- Kunden öppnar länken: tiden bekräftas (en gång) och bokningen visas
create or replace function public.confirm_booking(p_token text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_tok     uuid := public.kund_token(p_token);
  v_start   timestamptz;
  v_end     timestamptz;
  v_sum     integer;
  v_conf    timestamptz;
  v_hours   integer;
  v_already boolean;
begin
  perform public.kund_kontroll(v_tok);
  select min(starts_at), max(ends_at), sum(price), max(confirmed_at) into v_start, v_end, v_sum, v_conf
    from public.bookings where confirm_token = v_tok and status = 'bokad';
  if v_end <= now() then raise exception 'BOKNING_PASSERAD'; end if;
  v_hours := public.kund_timmar(v_tok);
  v_already := v_conf is not null;
  if not v_already then
    v_conf := now();
    update public.bookings set confirmed_at = v_conf where confirm_token = v_tok and status = 'bokad';
  end if;
  return json_build_object(
    'starts_at', v_start, 'ends_at', v_end, 'already', v_already, 'confirmed_at', v_conf,
    'customer_name', (select customer_name from public.bookings where confirm_token = v_tok and status = 'bokad' order by starts_at limit 1),
    'items', (select json_agg(json_build_object('person_name', person_name, 'service_ids', service_ids, 'service_names', service_names,
                                                'price', price, 'starts_at', starts_at, 'ends_at', ends_at) order by starts_at)
                from public.bookings where confirm_token = v_tok and status = 'bokad'),
    'price', v_sum, 'cancel_hours', v_hours, 'deadline', v_start - make_interval(hours => v_hours),
    'late', now() >= v_start - make_interval(hours => v_hours), 'can_change', v_start > now(),
    'sparrad', public.kund_ar_sparrad(v_tok));   -- spärrad kund: kan avboka men inte boka om (1 nov 2026)
end $$;

-- Kunden avbokar själv (hela bokningen, alla personer). Går fram till att tiden börjar.
create or replace function public.kund_avboka(p_token text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_tok   uuid := public.kund_token(p_token);
  v_first uuid;
  v_start timestamptz;
  v_hours integer;
  v_late  boolean;
  v_ute   json;
begin
  perform pg_advisory_xact_lock(hashtext('lias_bokning'));
  perform public.kund_kontroll(v_tok);
  perform 1 from public.bookings where confirm_token = v_tok and status = 'bokad' for update;
  select id, starts_at into v_first, v_start from public.bookings
   where confirm_token = v_tok and status = 'bokad' order by starts_at limit 1;
  if v_start <= now() then raise exception 'TIDEN_HAR_BORJAT'; end if;
  v_hours := public.kund_timmar(v_tok);
  v_late := now() >= v_start - make_interval(hours => v_hours);
  update public.bookings set status = 'avbokad', cancelled_by = 'kund' where confirm_token = v_tok and status = 'bokad';
  if v_late then v_ute := public.registrera_uteblivet_kor(v_first, 'sen_avbokning'); end if;
  return json_build_object('starts_at', v_start, 'late', v_late, 'cancel_hours', v_hours);
end $$;

-- Kunden bokar om: samma personer och tjänster, ny starttid. Allt eller inget: går den nya tiden
-- inte att boka ligger den gamla kvar. Den gamla avbokas automatiskt när den nya är sparad.
create or replace function public.kund_omboka(p_token text, p_starts_at timestamptz, p_rules text default null) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_tok    uuid := public.kund_token(p_token);
  v_first  public.bookings%rowtype;
  v_start  timestamptz;
  v_hours  integer;
  v_late   boolean;
  v_people jsonb;
  v_new    json;
  v_ntok   uuid;
  v_ute    json;
begin
  perform pg_advisory_xact_lock(hashtext('lias_bokning'));
  perform public.kund_kontroll(v_tok);
  perform 1 from public.bookings where confirm_token = v_tok and status = 'bokad' for update;
  select * into v_first from public.bookings where confirm_token = v_tok and status = 'bokad' order by starts_at limit 1;
  v_start := v_first.starts_at;
  if v_start <= now() then raise exception 'TIDEN_HAR_BORJAT'; end if;
  if p_starts_at is not null and p_starts_at = v_start then raise exception 'SAMMA_TID'; end if;
  if public.kund_ar_sparrad(v_tok) then raise exception 'SPARRAD'; end if;
  v_hours := public.kund_timmar(v_tok);
  v_late := now() >= v_start - make_interval(hours => v_hours);
  select jsonb_agg(jsonb_build_object('category', (select s.category from public.services s where s.id = b.service_ids[1]),
                                      'service_ids', to_jsonb(b.service_ids), 'name', coalesce(b.person_name, ''))
                   order by b.starts_at)
    into v_people from public.bookings b where b.confirm_token = v_tok and b.status = 'bokad';
  update public.bookings set status = 'avbokad', cancelled_by = 'kund', ombokad_till = p_starts_at
   where confirm_token = v_tok and status = 'bokad';
  -- Samma kontroller som en vanlig bokning (öppettider, krockar, luckor, regler). Fel = inget sparas.
  v_new := public.create_booking(v_people, p_starts_at, v_first.customer_name, v_first.customer_phone, v_first.customer_email, p_rules);
  update public.bookings set confirmed_at = now() where group_id = (v_new->>'group_id')::uuid;   -- kunden valde tiden själv
  select confirm_token into v_ntok from public.bookings where group_id = (v_new->>'group_id')::uuid limit 1;
  if v_late then v_ute := public.registrera_uteblivet_kor(v_first.id, 'sen_ombokning'); end if;
  return (v_new::jsonb || jsonb_build_object('late', v_late, 'old_starts_at', v_start, 'confirm_token', v_ntok, 'cancel_hours', v_hours))::json;
end $$;

revoke all on function public.confirm_booking(text) from public;
revoke all on function public.kund_avboka(text) from public;
revoke all on function public.kund_omboka(text, timestamptz, text) from public;
grant execute on function public.confirm_booking(text) to anon, authenticated;
grant execute on function public.kund_avboka(text) to anon, authenticated;
grant execute on function public.kund_omboka(text, timestamptz, text) to anon, authenticated;


-- =====================================================================
-- Spärr från onlinebokning (Lia 1 nov 2026)
-- =====================================================================
-- Spärrtext till kunden (avbokade tider och vid försök att boka): Tommy godkände 1 nov 2026
create or replace function public.sparr_text() returns text language sql immutable as $$
  select 'Du kan inte boka tid på nätet just nu. Kontakta Lia på 073-642 30 18 eller kom in till salongen så löser ni det tillsammans.'::text;
$$;

-- Lia spärrar: kräver minst 3 registreringar (som räknas) de senaste 12 månaderna.
-- Kundens kommande frisörtider avbokas automatiskt (av Lia, med spärrtexten som meddelande).
create or replace function public.sparra_kund(p_phone text) returns json
language plpgsql security definer set search_path = public as $$
declare v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'); v_n integer; v_name text; v_avb integer;
begin
  if not public.is_admin() then raise exception 'EJ_ADMIN'; end if;
  if v_phone !~ '^0[0-9]{9}$' then raise exception 'OGILTIGT_TELEFON'; end if;
  if exists (select 1 from public.sparrade where customer_phone = v_phone) then raise exception 'REDAN_SPARRAD'; end if;
  v_n := public.uteblivet_nasta_nummer(v_phone) - 1;
  if v_n < 3 then raise exception 'FOR_FA_GANGER'; end if;
  select customer_name into v_name from public.uteblivna where customer_phone = v_phone order by created_at desc limit 1;
  insert into public.sparrade (customer_phone, customer_name) values (v_phone, v_name);
  update public.bookings set status = 'avbokad', cancelled_by = 'lia', cancel_note = public.sparr_text()
   where customer_phone = v_phone and status = 'bokad' and starts_at > now();
  get diagnostics v_avb = row_count;
  return json_build_object('customer_phone', v_phone, 'customer_name', v_name, 'ganger', v_n, 'avbokade', v_avb);
end $$;

create or replace function public.hav_sparr(p_phone text) returns json
language plpgsql security definer set search_path = public as $$
declare v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if not public.is_admin() then raise exception 'EJ_ADMIN'; end if;
  delete from public.sparrade where customer_phone = v_phone;
  if not found then raise exception 'INTE_SPARRAD'; end if;
  return json_build_object('customer_phone', v_phone);
end $$;
revoke all on function public.sparra_kund(text) from public, anon;
revoke all on function public.hav_sparr(text) from public, anon;
grant execute on function public.sparra_kund(text) to authenticated;
grant execute on function public.hav_sparr(text) to authenticated;

-- Kundens länk: spärrad kund kan avboka men inte boka om
create or replace function public.kund_ar_sparrad(p_token uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.sparrade s join public.bookings b on b.customer_phone = s.customer_phone where b.confirm_token = p_token);
$$;
revoke all on function public.kund_ar_sparrad(uuid) from public, anon, authenticated;
