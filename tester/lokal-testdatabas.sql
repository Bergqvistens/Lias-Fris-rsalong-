-- Lokal testdatabas för Lias Hantverkeri (PostgreSQL 16). Skapad med pg_dump 27 okt 2026 (flerpersonsbokning + bokningslås). Öppettider i create_booking ändrade 29 okt 2026 (tis–fre 9–17). Lias 17 tjänster och kategorikontroll mot services-tabellen 29 okt 2026.
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$;
--
-- PostgreSQL database dump
--

\restrict b7hea4Eh86XumgNeWtGpxo6bq3tfDSBooQyH2OlxMsnNJLEulXQpCRjke2L27B8

-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;


--
-- Name: create_booking(jsonb, timestamp with time zone, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_booking(p_people jsonb, p_starts_at timestamp with time zone, p_name text, p_phone text, p_email text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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

  -- Öppettider (svensk tid) för hela kedjan. Söndag stängt.
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
$_$;


--
-- Name: get_busy(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_busy(p_from timestamp with time zone, p_to timestamp with time zone) RETURNS TABLE(starts_at timestamp with time zone, ends_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select b.starts_at, b.ends_at
  from public.bookings b
  where b.status = 'bokad'
    and b.starts_at < p_to
    and b.ends_at   > p_from
    and p_to - p_from <= interval '62 days'
  order by b.starts_at;
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text
);


--
-- Name: admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admins (
    user_id uuid NOT NULL
);


--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    service_ids text[] NOT NULL,
    service_names text NOT NULL,
    price integer NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    customer_name text NOT NULL,
    customer_phone text NOT NULL,
    customer_email text NOT NULL,
    status text DEFAULT 'bokad'::text NOT NULL,
    person_name text,
    group_id uuid,
    CONSTRAINT bookings_status_check CHECK ((status = ANY (ARRAY['bokad'::text, 'avbokad'::text]))),
    CONSTRAINT tid_i_ordning CHECK ((ends_at > starts_at))
);


--
-- Name: services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.services (
    id text NOT NULL,
    name text NOT NULL,
    duration integer NOT NULL,
    price integer NOT NULL,
    category text,
    kind text,
    CONSTRAINT services_duration_check CHECK ((duration > 0)),
    CONSTRAINT services_price_check CHECK ((price >= 0))
);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: admins admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_pkey PRIMARY KEY (user_id);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: bookings ingen_krock; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT ingen_krock EXCLUDE USING gist (tstzrange(starts_at, ends_at, '[)'::text) WITH &&) WHERE ((status = 'bokad'::text));


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);


--
-- Name: bookings admin_avbokar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_avbokar ON public.bookings FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: bookings admin_laser_bokningar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_laser_bokningar ON public.bookings FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: admins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

--
-- Name: services alla_laser_tjanster; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY alla_laser_tjanster ON public.services FOR SELECT USING (true);


--
-- Name: bookings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

--
-- Name: services; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

--
-- Name: supabase_realtime; Type: PUBLICATION; Schema: -; Owner: -
--

CREATE PUBLICATION supabase_realtime WITH (publish = 'insert, update, delete, truncate');


--
-- Name: supabase_realtime bookings; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.bookings;


--
-- Name: SCHEMA auth; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA auth TO anon;
GRANT USAGE ON SCHEMA auth TO authenticated;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;


--
-- Name: FUNCTION uid(); Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON FUNCTION auth.uid() TO anon;
GRANT ALL ON FUNCTION auth.uid() TO authenticated;


--
-- Name: FUNCTION create_booking(p_people jsonb, p_starts_at timestamp with time zone, p_name text, p_phone text, p_email text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_booking(p_people jsonb, p_starts_at timestamp with time zone, p_name text, p_phone text, p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_booking(p_people jsonb, p_starts_at timestamp with time zone, p_name text, p_phone text, p_email text) TO anon;
GRANT ALL ON FUNCTION public.create_booking(p_people jsonb, p_starts_at timestamp with time zone, p_name text, p_phone text, p_email text) TO authenticated;


--
-- Name: FUNCTION get_busy(p_from timestamp with time zone, p_to timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_busy(p_from timestamp with time zone, p_to timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_busy(p_from timestamp with time zone, p_to timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.get_busy(p_from timestamp with time zone, p_to timestamp with time zone) TO authenticated;


--
-- Name: FUNCTION is_admin(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_admin() TO authenticated;


--
-- Name: TABLE bookings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.bookings TO authenticated;


--
-- Name: COLUMN bookings.status; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(status) ON TABLE public.bookings TO authenticated;


--
-- Name: TABLE services; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.services TO anon;
GRANT SELECT ON TABLE public.services TO authenticated;


--
-- PostgreSQL database dump complete
--

\unrestrict b7hea4Eh86XumgNeWtGpxo6bq3tfDSBooQyH2OlxMsnNJLEulXQpCRjke2L27B8

--
-- PostgreSQL database dump
--

\restrict YQUkaYBNRf5GrrDCj32RK4OMfY5yWVKPFTejBL8lxLTBK0PZwmudpjM8UT9zts5

-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: services; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.services (id, name, duration, price, category, kind) FROM stdin;
klipp-45	Klippning 45 min.	45	600	Klippning	klipp
klipp-lyx	Klippning lyx	60	850	Klippning	klipp
klipp-30	Klippning/Herrklippning 30 min	30	500	Klippning	klipp
putsning	Putsning, kort hår med maskinklippn. sidor & nacke.	15	250	Klippning	klipp
farg-botten	Bottenfärg/utväxt	90	1000	Färgbehandling	klipp
farg-150	Färgbehandling 2.5 timmar Klippning ingår.	150	2000	Färgbehandling	klipp
farg-180	Färgbehandling 3 timmar, klippning ingår.	180	2500	Färgbehandling	klipp
klipp-farg-kort	Klipp & färg, kort hår. Som längst till nyckelbenen.	135	1350	Färgbehandling	klipp
nyansering	Nyansering	60	1100	Färgbehandling	klipp
perm-kort	Permanent inkl. klippning kort hår.	120	1650	Permanent	klipp
perm-mellan	Permanent inkl. klippning mellanlångt hår.	150	1900	Permanent	klipp
perm-lang	Permanent inkl. klippning långt hår.	180	3000	Permanent	klipp
tvatt-fon	Tvätt & fön	30	400	Styling, tvätt & föning	klipp
tvatt-fon-60	Tvätt & fön/ styling 1 timma	60	800	Styling, tvätt & föning	klipp
harbotten	Hårbottenmassage	45	750	Hårbottenmassage	klipp
bryn	Färg och form av bryn.	30	200	Frans och/eller brynfärg	klipp
frans-bryn	Ögonfransfärgning & brynfärg + formning	30	250	Frans och/eller brynfärg	klipp
\.


--
-- PostgreSQL database dump complete
--

\unrestrict YQUkaYBNRf5GrrDCj32RK4OMfY5yWVKPFTejBL8lxLTBK0PZwmudpjM8UT9zts5


-- 30 okt 2026: avbokningsmeddelande (samma som supabase-setup.sql)
alter table public.bookings add column if not exists cancel_note text;
alter table public.bookings drop constraint if exists cancel_note_langd;
alter table public.bookings add constraint cancel_note_langd check (cancel_note is null or char_length(cancel_note) <= 160);
grant select, update (status, cancel_note) on public.bookings to authenticated;
