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
  ('farg-botten', 'Bottenfärg/utväxt klippning ingår ej, boka till om så önskas.', 90, 1000, 'Färgbehandling', 'klipp'),
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
grant select, update (status) on public.bookings to authenticated;
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

-- ---------- 6. Skapa bokning (all kontroll sker här, på servern) ----------
-- p_people: lista med 1–4 personer, t.ex.
--   [{"category":"Klippning","service_ids":["klipp-45"],"name":"Kalle"},
--    {"category":"Frans och/eller brynfärg","service_ids":["bryn"],"name":"Lisa"}]
-- Varje person: exakt en huvudtjänst (kind = klipp) + ev. tillägg i samma kategori.
-- Förnamn krävs för varje person när fler än en bokas.
-- Personerna klipps efter varandra (en frisör): person 2 börjar när person 1 är klar osv.
-- Allt eller inget: krockar någon del sparas ingenting.
drop function if exists public.create_booking(text[], timestamptz, text, text, text);

create or replace function public.create_booking(
  p_people    jsonb,
  p_starts_at timestamptz,
  p_name      text,
  p_phone     text,
  p_email     text
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
  v_rows      jsonb := '[]'::jsonb;
  v_local     timestamp;
  v_local_end timestamp;
  v_dow       integer;
  v_open      time;
  v_close     time;
  v_id        uuid;
  v_all_names text := '';
begin
  -- Kontaktuppgifter
  p_name  := btrim(coalesce(p_name, ''));
  p_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  p_email := btrim(coalesce(p_email, ''));
  if length(p_name) < 2 or length(p_name) > 100 then raise exception 'OGILTIGT_NAMN'; end if;
  if p_phone !~ '^0[0-9]{9}$' then raise exception 'OGILTIGT_TELEFON'; end if;
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 200 then raise exception 'OGILTIG_EPOST'; end if;

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
        (service_ids, service_names, price, starts_at, ends_at, customer_name, customer_phone, customer_email, person_name, group_id)
      values
        (v_ids, v_names, v_price, v_cursor, v_cursor + make_interval(mins => v_dur), p_name, p_phone, p_email, v_pname, v_group)
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
revoke all on function public.create_booking(jsonb, timestamptz, text, text, text) from public;
revoke all on function public.is_admin() from public;
grant execute on function public.get_busy(timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.create_booking(jsonb, timestamptz, text, text, text) to anon, authenticated;
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
