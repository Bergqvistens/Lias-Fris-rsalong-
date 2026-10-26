-- =====================================================================
-- Lias Hantverkeri – bokningssystem för Supabase
-- Klistra in HELA filen i Supabase → SQL Editor → tryck "Run".
-- Det går bra att köra den igen; den skapar bara det som saknas.
-- =====================================================================

-- ---------- 1. Tjänster (pris och längd bestäms här, inte i webbsidan) ----------
create table if not exists public.services (
  id        text primary key,
  name      text    not null,
  duration  integer not null check (duration > 0),   -- minuter
  price     integer not null check (price >= 0)      -- kronor
);

insert into public.services (id, name, duration, price) values
  ('h-kort',    'Herr kort hår',      20, 395),
  ('h-medel',   'Herr medel hår',     30, 495),
  ('h-långt',   'Herr långt hår',     40, 595),
  ('h-färg',    'Färgning herr',      45, 349),
  ('h-skägg',   'Skäggtrim',          15, 149),
  ('h-style',   'Styling herr',       10,  99),
  ('d-kort',    'Dam kort hår',       30, 495),
  ('d-medel',   'Dam medel hår',      45, 595),
  ('d-långt',   'Dam långt hår',      60, 695),
  ('d-färg',    'Färgning dam',       45, 449),
  ('d-slingor', 'Slingor/highlights', 60, 549),
  ('d-style',   'Styling dam',        20, 149),
  ('d-fön',     'Fön',                15,  99),
  ('b-klipp',   'Barnklippning',      25, 295)
on conflict (id) do update
  set name = excluded.name, duration = excluded.duration, price = excluded.price;

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
create or replace function public.create_booking(
  p_service_ids text[],
  p_starts_at   timestamptz,
  p_name        text,
  p_phone       text,
  p_email       text
)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_ids      text[];
  v_count    integer;
  v_duration integer;
  v_price    integer;
  v_names    text;
  v_ends_at  timestamptz;
  v_local    timestamp;     -- starttid i svensk tid
  v_local_end timestamp;
  v_dow      integer;
  v_open     time;
  v_close    time;
  v_id       uuid;
begin
  -- Rensa och kontrollera uppgifter
  p_name  := btrim(coalesce(p_name, ''));
  p_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  p_email := btrim(coalesce(p_email, ''));

  if length(p_name) < 2 or length(p_name) > 100 then
    raise exception 'OGILTIGT_NAMN';
  end if;
  if p_phone !~ '^0[0-9]{9}$' then
    raise exception 'OGILTIGT_TELEFON';
  end if;
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 200 then
    raise exception 'OGILTIG_EPOST';
  end if;

  -- Tjänster: pris och längd hämtas från tabellen, inte från webbsidan
  select array_agg(distinct x) into v_ids from unnest(coalesce(p_service_ids, '{}')) x;
  if v_ids is null or cardinality(v_ids) = 0 or cardinality(v_ids) > 6 then
    raise exception 'OGILTIGA_TJANSTER';
  end if;
  select count(*), sum(duration), sum(price), string_agg(name, ', ' order by name)
    into v_count, v_duration, v_price, v_names
    from public.services where id = any(v_ids);
  if v_count <> cardinality(v_ids) then
    raise exception 'OGILTIGA_TJANSTER';
  end if;

  -- Tid: framåt i tiden, inom 60 dagar, på kvarten
  v_ends_at := p_starts_at + make_interval(mins => v_duration);
  if p_starts_at < now() + interval '30 minutes' or p_starts_at > now() + interval '60 days' then
    raise exception 'OGILTIG_TID';
  end if;
  if extract(second from p_starts_at) <> 0 or extract(minute from p_starts_at)::int % 15 <> 0 then
    raise exception 'OGILTIG_TID';
  end if;

  -- Öppettider (svensk tid). Söndag stängt.
  v_local     := p_starts_at at time zone 'Europe/Stockholm';
  v_local_end := v_ends_at   at time zone 'Europe/Stockholm';
  v_dow := extract(isodow from v_local);   -- 1 = måndag … 7 = söndag
  v_open  := case when v_dow = 6 then time '09:00' when v_dow = 7 then null else time '10:00' end;
  v_close := case when v_dow = 4 then time '20:00' when v_dow = 6 then time '15:00'
                  when v_dow = 7 then null else time '18:00' end;
  if v_open is null
     or v_local::time < v_open
     or v_local_end::date <> v_local::date
     or v_local_end::time > v_close then
    raise exception 'UTANFOR_OPPETTID';
  end if;

  -- Spara. Krockspärren i tabellen stoppar dubbelbokning.
  begin
    insert into public.bookings
      (service_ids, service_names, price, starts_at, ends_at,
       customer_name, customer_phone, customer_email)
    values
      (v_ids, v_names, v_price, p_starts_at, v_ends_at, p_name, p_phone, p_email)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'TIDEN_UPPTAGEN';
  end;

  return json_build_object(
    'id', v_id, 'starts_at', p_starts_at, 'ends_at', v_ends_at,
    'service_names', v_names, 'price', v_price, 'duration', v_duration);
end;
$$;

revoke all on function public.get_busy(timestamptz, timestamptz) from public;
revoke all on function public.create_booking(text[], timestamptz, text, text, text) from public;
revoke all on function public.is_admin() from public;
grant execute on function public.get_busy(timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.create_booking(text[], timestamptz, text, text, text) to anon, authenticated;
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
